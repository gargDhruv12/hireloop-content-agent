/**
 * Reads a web page and turns it into plain text the model can use.
 * No headless browser: pages that need JavaScript to show their text will
 * come back thin, and the run says so instead of guessing.
 */

export interface PageText {
  url: string;
  title: string;
  description: string;
  text: string;
  links: { href: string; label: string }[];
}

const MAX_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 20_000;
const TIMEOUT_MS = 12_000;

export class FetchPageError extends Error {}

export async function fetchPage(rawUrl: string): Promise<PageText> {
  const url = assertPublicHttpUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "HireLoopContentAgent/0.1 (+research bot for a student project)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    throw new FetchPageError(
      controller.signal.aborted ? `Timed out after ${TIMEOUT_MS / 1000}s reading ${url.hostname}.` : `Couldn't reach ${url.hostname}: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new FetchPageError(`${url.hostname} answered ${res.status}. Check the link opens in a browser.`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html") && !type.includes("text")) {
    throw new FetchPageError(`That link is a ${type || "non-HTML"} file, not a web page. Paste a link to an article.`);
  }

  const html = (await res.text()).slice(0, MAX_BYTES);
  const page = htmlToText(html, res.url || url.toString());
  if (page.text.length < 200) {
    throw new FetchPageError(
      `Only ${page.text.length} characters of text came back from ${url.hostname}. The page may need JavaScript or a login. Paste the article text into the notes box instead.`,
    );
  }
  return page;
}

/** Allow only public http(s) URLs, so the agent can't be pointed at internal machines. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchPageError(`"${raw}" isn't a valid link. It should start with https://`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FetchPageError("Only http and https links can be read.");
  }
  const host = url.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "0.0.0.0" ||
    host.startsWith("[");
  if (privateHost) throw new FetchPageError("Links to private or local addresses can't be read.");
  return url;
}

/** Small, dependency-free HTML → text. Good enough for articles and marketing pages. */
export function htmlToText(html: string, baseUrl: string): PageText {
  const title = decode(match(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "").trim();
  const description = decode(
    match(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ??
      match(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i) ??
      "",
  ).trim();

  // Prefer <article> or <main> when the page has one.
  const body =
    match(html, /<article[\s\S]*?>([\s\S]*?)<\/article>/i) ??
    match(html, /<main[\s\S]*?>([\s\S]*?)<\/main>/i) ??
    match(html, /<body[\s\S]*?>([\s\S]*?)<\/body>/i) ??
    html;

  const links: PageText["links"] = [];
  for (const m of body.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = new URL(m[1], baseUrl).toString();
      const label = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (label && links.length < 60) links.push({ href, label });
    } catch {
      /* ignore bad hrefs */
    }
  }

  const text = decode(
    body
      .replace(/<(script|style|noscript|svg|nav|footer|form|iframe|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(h[1-6])[^>]*>/gi, "\n\n## ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  return { url: baseUrl, title, description, text, links };
}

function match(s: string, re: RegExp): string | undefined {
  return re.exec(s)?.[1];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  times: "×",
  rupee: "₹",
};

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
