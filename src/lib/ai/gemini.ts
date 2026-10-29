/**
 * The only file that talks to the Vercel AI SDK. Every other module calls
 * these three functions, so upgrading the SDK (v6 → v7) or switching
 * provider means editing this file and nothing else.
 */
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

const usageTotals: Usage = { inputTokens: 0, outputTokens: 0 };
export function readUsage(): Usage {
  return { ...usageTotals };
}

function addUsage(u: { inputTokens?: number; outputTokens?: number } | undefined) {
  usageTotals.inputTokens += u?.inputTokens ?? 0;
  usageTotals.outputTokens += u?.outputTokens ?? 0;
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
    const result = await generateText({
      model: google(opts.role === "writer" ? models.writer : models.text),
      output: Output.object({ schema: opts.schema, name: opts.task }),
      system: opts.system,
      prompt: opts.prompt,
      maxRetries: 2,
    });
    addUsage(result.usage);
    return result.output as z.infer<S>;
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

  const host = new URL(opts.siteUrl).hostname;
  const maxPages = opts.maxPages ?? 3;

  const fetch_page = tool({
    description: `Read one page of the client's website (${host}) as plain text. Returns the page text and its links.`,
    inputSchema: z.object({ url: z.string().describe(`A full URL on ${host}`) }),
    execute: async ({ url }) => {
      if (pages.length >= maxPages) return { error: `Page limit of ${maxPages} reached. Stop and summarise.` };
      if (new URL(url, opts.siteUrl).hostname !== host) return { error: `Only pages on ${host} can be read.` };
      try {
        const page = await fetchPage(new URL(url, opts.siteUrl).toString());
        pages.push(page);
        return {
          title: page.title,
          text: page.text.slice(0, 6000),
          links: page.links.filter((l) => l.href.includes(host)).slice(0, 25),
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
      tools: { fetch_page },
      stopWhen: stepCountIs(maxPages + 2),
      system:
        "You research a client's website for a content writer. Start with the home page, then open at most two more pages that are most relevant to the topic (for example pricing, fairness or how-it-works pages). When done, reply with one line: which pages you read and why.",
      prompt: `Client site: ${opts.siteUrl}\nTopic: ${opts.topic}`,
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

function friendly(err: unknown, step: string): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { statusCode?: number }).statusCode;
  if (status === 402 || /prepay|credits are depleted/i.test(raw)) {
    return new Error(`Gemini says the prepaid credits are used up (${step}). Top up in Google AI Studio → Billing, or set MOCK_AI=1.`);
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
