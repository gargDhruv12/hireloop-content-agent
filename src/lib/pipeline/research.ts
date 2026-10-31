import type { ClientProfile } from "@/clients/types";
import { ResearchSchema } from "@/lib/content/schemas";
import type { Fact, ResearchResult, RunInput } from "@/lib/content/types";
import { browseClientSite, generateStructured, searchWeb } from "@/lib/ai/gemini";
import { isMock } from "@/lib/ai/models";
import { groundFacts, normaliseForMatch, type RejectedFact } from "@/lib/content/grounding";
import { fetchPage, type PageText } from "@/lib/web/fetch-page";
import { researchPrompt } from "./prompts";

/** Pages read from a web search when the brief has no link. */
const SEARCH_PAGES = 3;

/**
 * Step 1 · Researcher
 * Reads the article (if any) and, when the client site is online, lets the
 * model browse it with a fetch tool. Without an article it searches the web
 * for a few pages instead. Then extracts facts with ids so every later claim
 * can be traced: C = client fact sheet, W = client page read live, S = an
 * outside source (the supplied article, or a page found by search).
 */
export async function research(run: RunInput, client: ClientProfile, log: (detail: string) => void): Promise<ResearchResult> {
  const pagesRead: ResearchResult["pagesRead"] = [];
  let sources: PageText[] = [];
  let sourceKind: NonNullable<ResearchResult["sourceKind"]> = "none";

  if (run.sourceUrl) {
    log(`Reading ${hostOf(run.sourceUrl)}`);
    try {
      const page = await fetchPage(run.sourceUrl);
      sources = [page];
      sourceKind = "link";
      pagesRead.push({ url: page.url, title: page.title, chars: page.text.length, ok: true });
    } catch (err) {
      // A broken link shouldn't sink the run: continue from the topic alone and say so.
      pagesRead.push({ url: run.sourceUrl, title: "", chars: 0, ok: false, error: (err as Error).message });
      log(`Couldn't read the article, continuing from the topic: ${(err as Error).message}`);
    }
  }

  // Pasted article text (for pages that need a login or JavaScript) counts as the source.
  if (!sources.length && run.notes && run.notes.length > 400) {
    sources = [{ url: "Pasted by the team", title: "Pasted article text", description: "", text: run.notes, links: [] }];
    sourceKind = "pasted";
    log("Using the pasted text as the article");
  }

  // No article at all: look for a few pages on the web (WEB_SEARCH=off turns this off).
  if (!sources.length && !run.sourceUrl && webSearchOn()) {
    log("Searching the web for sources");
    try {
      const found = await searchWeb({ topic: run.topic, audience: run.audience || client.audiences[0], max: SEARCH_PAGES });
      for (const hit of found) {
        if (sources.length >= SEARCH_PAGES) break;
        try {
          const page = await fetchPage(hit.url);
          // The client is never its own outside source; its site is read separately below.
          if (client.siteUrl && sameSite(page.url, client.siteUrl)) continue;
          sources.push(page);
          pagesRead.push({ url: page.url, title: page.title, chars: page.text.length, ok: true });
        } catch (err) {
          pagesRead.push({ url: hit.url, title: hit.title ?? "", chars: 0, ok: false, error: (err as Error).message });
        }
      }
      if (sources.length) sourceKind = "search";
      log(sources.length ? `Read ${sources.length} page(s) from the web search` : "The web search found no readable pages; using the fact sheet");
    } catch (err) {
      // Searching is a bonus: without it the pack is written from the fact sheet, as before.
      log(`Web search failed, using the fact sheet: ${(err as Error).message}`);
    }
  }

  let clientPages: PageText[] = [];
  let clientSite: ResearchResult["clientSite"] = { status: "off" };
  // The offline sample makes no network calls, so it never browses.
  if (client.siteUrl && !isMock()) {
    log(`Browsing ${hostOf(client.siteUrl)} for relevant pages`);
    const browsed = await browseClientSite({ siteUrl: client.siteUrl, topic: run.topic });
    clientPages = browsed.pages;
    for (const p of browsed.pages) pagesRead.push({ url: p.url, title: p.title, chars: p.text.length, ok: true });
    for (const e of browsed.errors) pagesRead.push({ url: e.url, title: "", chars: 0, ok: false, error: e.error });
    // Say plainly whether the live site was read, instead of quietly falling back to the fact sheet.
    clientSite = clientPages.length
      ? { status: "read", url: client.siteUrl, pages: clientPages.length }
      : { status: "failed", url: client.siteUrl, error: browsed.errors[0]?.error ?? "No pages were read." };
    if (!clientPages.length) log(`Couldn't read ${hostOf(client.siteUrl)}; using the verified fact sheet only`);
  }

  log("Extracting facts");
  const { system, prompt } = researchPrompt({ client, run, sources, sourceKind, clientPages });
  const out = await generateStructured({ task: "research", schema: ResearchSchema, system, prompt });

  // Keep only facts whose quote really is in what was read (see grounding.ts).
  const web = groundAcross(out.clientWebFacts, clientPages);
  const outside = groundAcross(out.sourceFacts, sources);
  const rejectedFacts = [...web.rejected, ...outside.rejected];
  if (rejectedFacts.length) log(`Dropped ${rejectedFacts.length} fact(s) the pages don't support`);

  const relevant = new Set(out.relevantClientFactIds);
  const facts: Fact[] = [
    ...client.facts.map((f) => ({
      id: f.id,
      text: f.text,
      origin: "client" as const,
      ref: `${client.name} site · ${f.where}`,
      relevant: relevant.has(f.id),
    })),
    ...web.kept.map((f, i) => ({ id: `W${i + 1}`, text: f.text, quote: f.quote, origin: "client-web" as const, ref: f.ref, relevant: true })),
    ...outside.kept.map((f, i) => ({ id: `S${i + 1}`, text: f.text, quote: f.quote, origin: "source" as const, ref: f.ref, relevant: true })),
  ];

  return { topicSummary: out.topicSummary, facts, rejectedFacts, cautions: out.cautions, pagesRead, clientSite, sourceKind };
}

/**
 * Check facts against the pages that were read. A fact is credited to the page
 * its quote was found on, whatever URL the model named. With no pages, every
 * fact is rejected.
 */
export function groundAcross<T extends { text: string; quote: string; url?: string }>(
  candidates: T[],
  pages: PageText[],
): { kept: (T & { ref: string })[]; rejected: RejectedFact[] } {
  // For a quote stitched with "...", its first part says which page it's from.
  const pageWithQuote = (quote: string) => {
    const first = normaliseForMatch(quote).split("...")[0].trim();
    return pages.find((p) => normaliseForMatch(p.text).includes(first));
  };
  const refFor = (f: T) => pageWithQuote(f.quote)?.url ?? f.url ?? pages[0]?.url ?? "";
  const { kept, rejected } = groundFacts(candidates, (f) => (pages.length ? (pageWithQuote(f.quote) ?? pages[0]).text : undefined), refFor);
  return { kept: kept.map((f) => ({ ...f, ref: refFor(f) })), rejected };
}

function webSearchOn(): boolean {
  return !isMock() && (process.env.WEB_SEARCH ?? "").toLowerCase() !== "off";
}

function sameSite(a: string, b: string): boolean {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    return x.hostname === y.hostname && x.pathname.startsWith(y.pathname);
  } catch {
    return false;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
