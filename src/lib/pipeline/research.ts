import type { ClientProfile } from "@/clients/types";
import { ResearchSchema } from "@/lib/content/schemas";
import type { Fact, ResearchResult, RunInput } from "@/lib/content/types";
import { browseClientSite, generateStructured } from "@/lib/ai/gemini";
import { isMock } from "@/lib/ai/models";
import { groundFacts, normaliseForMatch } from "@/lib/content/grounding";
import { fetchPage, type PageText } from "@/lib/web/fetch-page";
import { researchPrompt } from "./prompts";

/**
 * Step 1 · Researcher
 * Reads the article (if any) and, when the client site is online, lets the
 * model browse it with a fetch tool. Then extracts facts with ids so every
 * later claim can be traced: C = client fact sheet, W = client page read
 * live, S = the supplied article.
 */
export async function research(run: RunInput, client: ClientProfile, log: (detail: string) => void): Promise<ResearchResult> {
  const pagesRead: ResearchResult["pagesRead"] = [];

  let source: PageText | undefined;
  if (run.sourceUrl) {
    log(`Reading ${hostOf(run.sourceUrl)}`);
    try {
      source = await fetchPage(run.sourceUrl);
      pagesRead.push({ url: source.url, title: source.title, chars: source.text.length, ok: true });
    } catch (err) {
      // A broken link shouldn't sink the run: continue from the topic alone and say so.
      pagesRead.push({ url: run.sourceUrl, title: "", chars: 0, ok: false, error: (err as Error).message });
      log(`Couldn't read the article, continuing from the topic: ${(err as Error).message}`);
    }
  }

  // Pasted article text (for pages that need a login or JavaScript) counts as the source.
  if (!source && run.notes && run.notes.length > 400) {
    source = { url: "Pasted by the team", title: "Pasted article text", description: "", text: run.notes, links: [] };
    log("Using the pasted text as the article");
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
  const { system, prompt } = researchPrompt({ client, run, source, clientPages });
  const out = await generateStructured({ task: "research", schema: ResearchSchema, system, prompt });

  // Keep only facts whose quote really is in what was read (see grounding.ts). A live-site
  // fact is credited to the page its quote was found on, whatever URL the model named.
  const pageWithQuote = (quote: string) => clientPages.find((p) => normaliseForMatch(p.text).includes(normaliseForMatch(quote)));
  const web = groundFacts(
    out.clientWebFacts,
    (f) => (clientPages.length ? (pageWithQuote(f.quote) ?? clientPages[0]).text : undefined),
    (f) => f.url,
  );
  const article = source ? groundFacts(out.sourceFacts, () => source.text, () => source.url) : { kept: [], rejected: [] };
  const rejectedFacts = [...web.rejected, ...article.rejected];
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
    ...web.kept.map((f, i) => ({
      id: `W${i + 1}`,
      text: f.text,
      quote: f.quote,
      origin: "client-web" as const,
      ref: pageWithQuote(f.quote)?.url ?? f.url,
      relevant: true,
    })),
    ...(source
      ? article.kept.map((f, i) => ({
          id: `S${i + 1}`,
          text: f.text,
          quote: f.quote,
          origin: "source" as const,
          ref: source.url,
          relevant: true,
        }))
      : []),
  ];

  return { topicSummary: out.topicSummary, facts, rejectedFacts, cautions: out.cautions, pagesRead, clientSite };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
