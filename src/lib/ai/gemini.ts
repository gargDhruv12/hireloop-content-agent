/**
 * The only file that talks to the Vercel AI SDK. Every other module calls
 * these three functions, so upgrading the SDK (v6 → v7) or switching
 * provider means editing this file and nothing else.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { google } from "@ai-sdk/google";
import { Output, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { fetchPage, type PageText } from "@/lib/web/fetch-page";
import { assertConfigured, isMock, models } from "./models";
import { mockImage, mockStructured, type MockTask } from "./mock";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

// Process-wide total (the eval runner reports it) plus a per-run counter:
// trackUsage() gives each pipeline run its own, even when runs overlap.
const usageTotals: Usage = { inputTokens: 0, outputTokens: 0 };
const runUsage = new AsyncLocalStorage<Usage>();

export function readUsage(): Usage {
  return { ...usageTotals };
}

/** Run `fn` and count only the tokens its model calls use. */
export async function trackUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: Usage }> {
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const result = await runUsage.run(usage, fn);
  return { result, usage };
}

function addUsage(u: { inputTokens?: number; outputTokens?: number } | undefined) {
  for (const total of [usageTotals, runUsage.getStore()]) {
    if (!total) continue;
    total.inputTokens += u?.inputTokens ?? 0;
    total.outputTokens += u?.outputTokens ?? 0;
  }
}

/**
 * Call the main model; if it is overloaded or rate-limited and a fallback
 * model is configured, try the fallback once. A busy model shouldn't cost
 * the team a whole run.
 *
 * With a fallback ready the main model gets no retries, and after it reports
 * busy it is skipped for a few minutes: in a live run, retrying an overloaded
 * model before falling back added minutes to every step.
 */
const BUSY_MS = 3 * 60_000;
const busyUntil = new Map<string, number>();

async function withFallback<T>(primary: string, call: (modelId: string, maxRetries: number) => Promise<T>): Promise<T> {
  const chain = [primary, ...models.fallbacks.filter((m) => m !== primary)];
  if (chain.length === 1) return call(primary, 2);
  // Models that just said "busy" go to the back of the line, not out of it.
  const now = Date.now();
  const order = [...chain.filter((m) => (busyUntil.get(m) ?? 0) <= now), ...chain.filter((m) => (busyUntil.get(m) ?? 0) > now)];
  let lastErr: unknown;
  for (const [i, modelId] of order.entries()) {
    const last = i === order.length - 1;
    try {
      // Fail fast while there is another model to try; the last one gets the SDK's retries.
      return await call(modelId, last ? 2 : 0);
    } catch (err) {
      if (!isCapacityError(err)) throw err;
      lastErr = err;
      busyUntil.set(modelId, Date.now() + BUSY_MS);
      if (!last) console.warn(`[gemini] ${modelId} is busy, trying ${order[i + 1]}`);
    }
  }
  throw lastErr;
}

/** Gemini 3 and later take a thinking level; older models use a token budget and are left alone. */
function thinkingOptions(modelId: string) {
  if (!/^gemini-(?:[3-9]|\d{2,})/.test(modelId)) return undefined;
  return { google: { thinkingConfig: { thinkingLevel: models.thinking } } };
}

// ── 1. Structured output ─────────────────────────────────────────────

export async function generateStructured<S extends z.ZodType>(opts: {
  task: MockTask;
  schema: S;
  system: string;
  prompt: string;
  role?: "text" | "writer";
}): Promise<z.infer<S>> {
  if (isMock()) return mockStructured(opts.task, opts.prompt) as z.infer<S>;
  assertConfigured();
  try {
    return await withFallback(opts.role === "writer" ? models.writer : models.text, async (modelId, maxRetries) => {
      const result = await generateText({
        model: google(modelId),
        output: Output.object({ schema: opts.schema, name: opts.task }),
        system: opts.system,
        prompt: opts.prompt,
        maxRetries,
        providerOptions: thinkingOptions(modelId),
      });
      addUsage(result.usage);
      return result.output as z.infer<S>;
    });
  } catch (err) {
    throw friendly(err, opts.task);
  }
}

// ── 2. Agent loop: read the client's site with a fetch tool ──────────

/**
 * Gives the model one tool, fetch_page, limited to the client's own domain,
 * and lets it decide which pages are worth reading for this topic.
 */
export async function browseClientSite(opts: {
  siteUrl: string;
  topic: string;
  maxPages?: number;
}): Promise<{ pages: PageText[]; errors: { url: string; error: string }[] }> {
  const pages: PageText[] = [];
  const errors: { url: string; error: string }[] = [];
  if (isMock()) return { pages, errors };
  assertConfigured();

  const root = new URL(opts.siteUrl);
  const host = root.hostname;
  // The client may live under a path on a shared host (…/hireloop); stay inside it.
  const scope = root.pathname.replace(/\/+$/, "");
  const inScope = (u: URL) => u.hostname === host && (u.pathname === scope || u.pathname.startsWith(`${scope}/`) || !scope);
  const pageKey = (u: string) => u.replace(/#.*$/, "").replace(/\/+$/, "");
  const maxPages = opts.maxPages ?? 3;

  // Always read the home page directly, so the run reads the live site even if the model never calls the tool.
  let home: PageText;
  try {
    home = await fetchPage(root.toString());
    pages.push(home);
  } catch (err) {
    errors.push({ url: opts.siteUrl, error: (err as Error).message });
    return { pages, errors };
  }
  const subpages = [
    ...new Set(
      home.links
        .map((l) => new URL(l.href))
        .filter((u) => inScope(u) && pageKey(u.toString()) !== pageKey(root.toString()))
        .map((u) => pageKey(u.toString())),
    ),
  ];
  // A one-page site (links are only #anchors) needs no browsing loop.
  if (!subpages.length || maxPages <= 1) return { pages, errors };

  const fetch_page = tool({
    description: `Read one page of the client's website (${host}${scope}) as plain text. Returns the page text and its links.`,
    inputSchema: z.object({ url: z.string().describe(`A full URL under ${root.origin}${scope}`) }),
    execute: async ({ url }) => {
      if (pages.length >= maxPages) return { error: `Page limit of ${maxPages} reached. Stop and summarise.` };
      let target: URL;
      try {
        target = new URL(url, opts.siteUrl);
      } catch {
        return { error: `"${url}" isn't a valid URL.` };
      }
      if (!inScope(target)) return { error: `Only pages under ${host}${scope} can be read.` };
      if (pages.some((p) => pageKey(p.url) === pageKey(target.toString()))) return { error: "Already read that page." };
      try {
        const page = await fetchPage(target.toString());
        pages.push(page);
        return {
          title: page.title,
          text: page.text.slice(0, 6000),
          links: page.links.filter((l) => inScope(new URL(l.href))).slice(0, 25),
        };
      } catch (err) {
        errors.push({ url, error: (err as Error).message });
        return { error: (err as Error).message };
      }
    },
  });

  try {
    const result = await generateText({
      model: google(models.text),
      providerOptions: thinkingOptions(models.text),
      tools: { fetch_page },
      stopWhen: stepCountIs(maxPages + 1),
      system: `You research a client's website for a content writer. The home page is already read. Open at most ${maxPages - 1} more pages from the list that are most relevant to the topic (for example pricing, fairness or how-it-works pages). When done, reply with one line: which pages you read and why.`,
      prompt: `Client site: ${opts.siteUrl}\nTopic: ${opts.topic}\n\nPages you can open:\n${subpages.slice(0, 25).join("\n")}`,
    });
    addUsage(result.totalUsage ?? result.usage);
  } catch (err) {
    // Reading the site is a bonus: if it fails the client profile still applies.
    errors.push({ url: opts.siteUrl, error: friendly(err, "browse").message });
  }
  return { pages, errors };
}

// ── 3. Image generation ──────────────────────────────────────────────

export async function generateImage(opts: {
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "16:9";
}): Promise<{ bytes: Uint8Array; mediaType: string }> {
  if (isMock()) return mockImage(opts.aspectRatio);
  assertConfigured();
  try {
    // Gemini image models ("Nano Banana") answer through generateText with
    // IMAGE in the response modalities; the picture comes back in `files`.
    const result = await generateText({
      model: google(models.image),
      prompt: opts.prompt,
      providerOptions: {
        google: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: opts.aspectRatio },
        },
      },
    });
    addUsage(result.usage);
    const file = result.files.find((f) => f.mediaType.startsWith("image/"));
    if (!file) {
      throw new Error(
        `The image model answered with text instead of a picture${result.text ? `: "${result.text.slice(0, 160)}"` : ""}. Try regenerating, or simplify the brief.`,
      );
    }
    return { bytes: file.uint8Array, mediaType: file.mediaType };
  } catch (err) {
    throw friendly(err, "image");
  }
}

// ── errors people can act on ─────────────────────────────────────────

/** The SDK wraps the real failure in a RetryError after its retries; look inside it. */
function unwrap(err: unknown): unknown {
  const last = (err as { lastError?: unknown } | null)?.lastError;
  return last ?? err;
}

/** Overloaded, rate-limited or a dropped connection: worth one try on another model. */
export function isCapacityError(err: unknown): boolean {
  const inner = unwrap(err);
  const status = (inner as { statusCode?: number } | null)?.statusCode;
  const raw = inner instanceof Error ? inner.message : String(inner);
  return (
    status === 429 ||
    (status !== undefined && status >= 500) ||
    /overloaded|unavailable|high demand|resource_exhausted|ECONNRESET|socket hang up|fetch failed/i.test(raw)
  );
}

function friendly(outer: unknown, step: string): Error {
  const err = unwrap(outer);
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { statusCode?: number }).statusCode;
  if (status === 503 || /overloaded|unavailable|high demand/i.test(raw)) {
    return new Error(
      `Gemini is overloaded right now (${step}). Wait a minute and run again${models.fallbacks.length ? "" : ", or set FALLBACK_TEXT_MODEL in .env.local"}.`,
    );
  }
  if (/ECONNRESET|socket hang up|fetch failed/i.test(raw)) {
    return new Error(`The connection to Gemini dropped during ${step}. Run again; long outputs are the usual cause.`);
  }
  if (status === 402 || /prepay|credits are depleted/i.test(raw)) {
    return new Error(`Gemini says the prepaid credits are used up (${step}). Top up in Google AI Studio → Billing, or set MOCK_AI=1.`);
  }
  // A quota of 0 is not a rate limit: the model isn't available on the free tier at all.
  if (/limit:\s*0\b/i.test(raw)) {
    return new Error(`Gemini allows 0 requests for ${step} on this key's tier. Enable billing on the key in Google AI Studio, then try again.`);
  }
  // The free tier has a daily request cap (20 per model in October 2026); a full pack needs about 10 calls.
  if (/per day|requests_per_day|PerDay/i.test(raw)) {
    const wait = /retry in ([\dhms.]+?)(?:\.\d+)?s\b/i.exec(raw)?.[1];
    return new Error(
      `This key's daily Gemini quota is used up (${step})${wait ? `; it resets in about ${wait.replace(/(\d+m).*/, "$1")}` : ""}. Enable billing on the key in Google AI Studio for normal limits, or use MOCK_AI=1 meanwhile.`,
    );
  }
  if (status === 429 || /rate limit|resource_exhausted|quota/i.test(raw)) {
    return new Error(`Gemini rate limit hit during ${step}. Wait a minute and run again.`);
  }
  if (status === 401 || status === 403 || /api key/i.test(raw)) {
    return new Error(`Gemini rejected the API key during ${step}. Check GOOGLE_GENERATIVE_AI_API_KEY in .env.local.`);
  }
  if (status === 404 || /not found|is not supported/i.test(raw)) {
    return new Error(`Gemini doesn't recognise the model for ${step}. Check TEXT_MODEL / WRITER_MODEL / IMAGE_MODEL in .env.local. (${raw.slice(0, 160)})`);
  }
  return new Error(`${step} failed: ${raw.slice(0, 300)}`);
}
