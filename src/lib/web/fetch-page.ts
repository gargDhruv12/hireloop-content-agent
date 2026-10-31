/**
 * Reads a web page and turns it into plain text the model can use.
 * No headless browser: pages that need JavaScript to show their text will
 * come back thin, and the run says so instead of guessing.
 */

import { isIP } from "node:net";

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

const MAX_REDIRECTS = 5;

export async function fetchPage(rawUrl: string): Promise<PageText> {
  let url = assertPublicHttpUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  let html: string;
  try {
    // Follow redirects by hand so every hop is checked: a public link must
    // not be able to bounce the agent to a private or local address.
    for (let hop = 0; ; hop++) {
      await assertResolvesPublic(url);
      try {
        res = await fetch(url, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "user-agent": "HireLoopContentAgent/0.1 (+research bot for a student project)",
            accept: "text/html,application/xhtml+xml",
          },
        });
      } catch (err) {
        throw new FetchPageError(
          controller.signal.aborted
            ? `Timed out after ${TIMEOUT_MS / 1000}s reading ${url.hostname}.`
            : `Couldn't reach ${url.hostname}: ${(err as Error).message}`,
        );
      }
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) break;
      if (hop >= MAX_REDIRECTS) throw new FetchPageError(`${url.hostname} redirected too many times.`);
      url = assertPublicHttpUrl(new URL(location, url).toString());
    }

    if (!res.ok) throw new FetchPageError(`${url.hostname} answered ${res.status}. Check the link opens in a browser.`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) {
      throw new FetchPageError(`That link is a ${type || "non-HTML"} file, not a web page. Paste a link to an article.`);
    }
    try {
      html = await readCapped(res, MAX_BYTES);
    } catch (err) {
      throw new FetchPageError(
        controller.signal.aborted ? `Timed out after ${TIMEOUT_MS / 1000}s reading ${url.hostname}.` : `Couldn't read ${url.hostname}: ${(err as Error).message}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  const page = htmlToText(html, url.toString());
  if (page.text.length < 200) {
    throw new FetchPageError(
      `Only ${page.text.length} characters of text came back from ${url.hostname}. The page may need JavaScript or a login. Paste the article text into the notes box instead.`,
    );
  }
  return page;
}

/** Read at most `max` bytes of the body, so a huge or endless response can't fill memory. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(size, max));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return new TextDecoder().decode(bytes);
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
  // URL keeps IPv6 literals in brackets ("[::1]"); strip them so the IP checks see the address.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateIp(host);
  if (privateHost) throw new FetchPageError("Links to private or local addresses can't be read.");
  return url;
}

/**
 * True only for IP literals in a private, loopback or link-local range.
 * Hostnames are never IPs: testing them against the IPv6 prefixes blocked
 * real sites such as fda.gov and the client's own fde-….chatgpt.site.
 */
export function isPrivateIp(ip: string): boolean {
  if (!isIP(ip)) return false;
  // IPv4-mapped IPv6, in either the dotted form or the hex form URL normalises to (::ffff:7f00:1).
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  const v4 = hex
    ? [parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255, parseInt(hex[2], 16) >> 8, parseInt(hex[2], 16) & 255].join(".")
    : ip.replace(/^::ffff:/i, "");
  return (
    /^0\./.test(v4) ||
    /^127\./.test(v4) ||
    /^10\./.test(v4) ||
    /^192\.168\./.test(v4) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v4) ||
    /^169\.254\./.test(v4) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v4) ||
    ip === "::" ||
    ip === "::1" ||
    /^f[cd]/i.test(ip) ||
    /^fe[89ab]/i.test(ip)
  );
}

/** A public-looking name can still point at a private machine; check where it resolves. */
async function assertResolvesPublic(url: URL): Promise<void> {
  const { lookup } = await import("node:dns/promises");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new FetchPageError(`Couldn't find ${url.hostname}. Check the link is spelled right.`);
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new FetchPageError("Links to private or local addresses can't be read.");
  }
}

/** Small, dependency-free HTML → text. Good enough for articles and marketing pages. */
export function htmlToText(html: string, baseUrl: string): PageText {
  const title = decode(match(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "").trim();
  const description = decode(
    // Close on the same quote that opened the value, so "HireLoop's …" isn't cut at the apostrophe.
    match(html, /<meta[^>]+name=["']description["'][^>]*content=(["'])([\s\S]*?)\1/i, 2) ??
      match(html, /<meta[^>]+property=["']og:description["'][^>]*content=(["'])([\s\S]*?)\1/i, 2) ??
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

function match(s: string, re: RegExp, group = 1): string | undefined {
  return re.exec(s)?.[group];
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
