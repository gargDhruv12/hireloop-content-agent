/**
 * The rules checker: fast, free, deterministic checks that run on every
 * draft (on the server after writing, and in the browser while a reviewer
 * edits). It never calls a model, so it can't be talked out of a rule.
 */
import type { ClientProfile } from "@/clients/types";
import type { ContentPack } from "./schemas";
import type { Fact, Finding, PieceId } from "./types";
import { BLOG_WORDS, HASHTAGS, X_POSTS, getPieces, wordCount, type Piece } from "./pieces";

export interface LintOptions {
  client: Pick<ClientProfile, "bannedPhrases" | "ctaPattern" | "primaryCta">;
  /** Facts with ids also get their citations checked. */
  facts: (Pick<Fact, "text"> & Partial<Pick<Fact, "id">>)[];
}

export function lintPack(pack: ContentPack, opts: LintOptions): Finding[] {
  const findings: Omit<Finding, "id">[] = [];
  const allowedNumbers = numbersInFacts(opts.facts);
  const banned = opts.client.bannedPhrases.map((b) => ({ re: new RegExp(b.pattern, "gi"), reason: b.reason }));
  const knownIds = new Set(opts.facts.map((f) => f.id).filter((id): id is string => !!id));

  for (const piece of getPieces(pack)) {
    // 0. Citations: the margin shows the cited facts as the evidence, so they must exist.
    if (knownIds.size) {
      const unknown = piece.factIds.filter((id) => !knownIds.has(id));
      if (unknown.length) {
        findings.push({
          pieceId: piece.id,
          kind: "citation",
          severity: "block",
          message: `Cites ${unknown.join(", ")}, which ${unknown.length === 1 ? "isn't a fact" : "aren't facts"} from this run. Its claims can't be traced.`,
          by: "rules",
        });
      }
      if (piece.id === "blog" && [...knownIds].some((id) => id.startsWith("S")) && !piece.factIds.some((id) => id.startsWith("S"))) {
        findings.push({
          pieceId: piece.id,
          kind: "citation",
          severity: "warn",
          message: "Doesn't use the outside sources (the article you supplied, or pages found by web search). Cite at least one S fact.",
          by: "rules",
        });
      }
      const hasNumbers = piece.fields.some((f) => f.kind !== "choice" && extractNumbers(f.value).length > 0);
      if (!piece.factIds.length && hasNumbers) {
        findings.push({
          pieceId: piece.id,
          kind: "citation",
          severity: "warn",
          message: "Uses numbers but cites no facts. Check where each number comes from.",
          by: "rules",
        });
      }
    }

    for (const field of piece.fields) {
      // 1. Length
      if (field.limit && field.value.length > field.limit.max) {
        const over = field.value.length - field.limit.max;
        findings.push({
          pieceId: piece.id,
          path: field.path,
          kind: "length",
          severity: field.limit.hard ? "block" : "warn",
          message: field.limit.hard
            ? `${field.label} is ${field.value.length} characters. The limit is ${field.limit.max}, so cut ${over}.`
            : `${field.label} is ${field.value.length} characters. Past ${field.limit.max}, readers have to tap "See more".`,
          by: "rules",
        });
      }

      if (field.kind === "choice") continue;

      // 2. Banned phrases
      for (const { re, reason } of banned) {
        re.lastIndex = 0;
        for (const m of field.value.matchAll(re)) {
          findings.push({
            pieceId: piece.id,
            path: field.path,
            excerpt: m[0],
            kind: "banned_phrase",
            severity: "block",
            message: `"${m[0]}" breaks a brand rule. ${reason}`,
            by: "rules",
          });
        }
      }

      // 3. Numbers that don't appear in any fact
      for (const token of extractNumbers(field.value)) {
        if (allowedNumbers.has(token.value)) continue;
        findings.push({
          pieceId: piece.id,
          path: field.path,
          excerpt: token.raw,
          kind: "untraced_number",
          severity: token.strong ? "block" : "warn",
          message: `"${token.raw}" isn't in the fact sheet or the article. Remove it or add a source.`,
          by: "rules",
        });
      }
    }

    findings.push(...structureChecks(piece, pack, opts.client));
  }

  findings.push(...similarityChecks(pack));

  return dedupe(findings).map((f, i) => ({ ...f, id: `r${i + 1}` }));
}

// ── Structure checks per channel ─────────────────────────────────────

/** Each client has its own call to action ("Try a sample AI interview", "Book a free trial class"). */
function structureChecks(piece: Piece, pack: ContentPack, client: LintOptions["client"]): Omit<Finding, "id">[] {
  const ctaRe = new RegExp(client.ctaPattern, "i");
  const ctaWords = client.primaryCta.label.replace(/^\w/, (c) => c.toLowerCase());
  const out: Omit<Finding, "id">[] = [];
  const add = (f: Omit<Finding, "id" | "pieceId" | "by">) => out.push({ ...f, pieceId: piece.id, by: "rules" });

  switch (piece.id) {
    case "blog": {
      const words = wordCount(pack.blog.body);
      if (words < BLOG_WORDS.min || words > BLOG_WORDS.max) {
        add({
          path: "blog.body",
          kind: "length",
          severity: "warn",
          message:
            words < BLOG_WORDS.min
              ? `The article is ${words} words; the brief is 700–900. Add depth to the thinnest sections (about ${BLOG_WORDS.min - words}+ words), using only the facts given.`
              : `The article is ${words} words; the brief is 700–900. Tighten it.`,
        });
      }
      if (!/^##\s/m.test(pack.blog.body)) {
        add({ path: "blog.body", kind: "format", severity: "warn", message: "The article has no ## subheadings. Long posts are easier to skim with them." });
      }
      if (!ctaRe.test(pack.blog.body)) {
        add({ path: "blog.body", kind: "missing_cta", severity: "warn", message: `The article never asks readers to ${ctaWords}.` });
      }
      break;
    }
    case "linkedin":
      if (pack.linkedin.body.length > 1300) {
        add({ path: "linkedin.body", kind: "length", severity: "warn", message: `The post is ${pack.linkedin.body.length} characters. LinkedIn posts under 1,300 tend to get read to the end.` });
      }
      if (!ctaRe.test(pack.linkedin.body)) {
        add({ path: "linkedin.body", kind: "missing_cta", severity: "warn", message: "The post has no call to action." });
      }
      break;
    case "x": {
      const n = pack.xThread.posts.length;
      if (n < X_POSTS.min || n > X_POSTS.max) {
        add({ kind: "format", severity: "warn", message: `The thread has ${n} posts. Aim for ${X_POSTS.min}–${X_POSTS.max}.` });
      }
      break;
    }
    case "instagram": {
      const n = pack.instagram.hashtags.length;
      if (n > HASHTAGS.hard) {
        add({ path: "instagram.hashtags", kind: "format", severity: "block", message: `${n} hashtags. Instagram allows ${HASHTAGS.hard}.` });
      } else if (n > HASHTAGS.soft) {
        add({ path: "instagram.hashtags", kind: "format", severity: "warn", message: `${n} hashtags. 3–${HASHTAGS.soft} focused tags read better than a wall of them.` });
      }
      break;
    }
    default: {
      if (piece.channel === "google") {
        const i = Number(piece.id.split("-")[1]) - 1;
        const ad = pack.googleAds[i];
        if (ad.headlines.length !== 3) add({ kind: "format", severity: "warn", message: `This ad has ${ad.headlines.length} headlines; the pack asks for 3.` });
        if (ad.descriptions.length !== 2) add({ kind: "format", severity: "warn", message: `This ad has ${ad.descriptions.length} descriptions; the pack asks for 2.` });
        for (const key of ["path1", "path2"] as const) {
          if (/\s/.test(ad[key])) {
            add({ path: `googleAds.${i}.${key}`, kind: "format", severity: "block", message: `Display paths can't contain spaces ("${ad[key]}"). Use a hyphen.` });
          }
        }
        const seen = new Set<string>();
        ad.headlines.forEach((h, j) => {
          const k = normalise(h);
          if (seen.has(k)) add({ path: `googleAds.${i}.headlines.${j}`, kind: "format", severity: "warn", message: `Headline ${j + 1} repeats another headline in this ad.` });
          seen.add(k);
        });
      }
    }
  }
  return out;
}

/** Three ads that say the same thing aren't three variations. */
function similarityChecks(pack: ContentPack): Omit<Finding, "id">[] {
  const out: Omit<Finding, "id">[] = [];
  const ads = pack.metaAds.slice(0, 3);
  for (let a = 0; a < ads.length; a++) {
    for (let b = a + 1; b < ads.length; b++) {
      const sim = jaccard(ads[a].primaryText, ads[b].primaryText);
      if (sim > 0.6) {
        out.push({
          pieceId: `meta-${b + 1}` as PieceId,
          kind: "format",
          severity: "warn",
          message: `Meta ad ${b + 1} is ${Math.round(sim * 100)}% the same words as ad ${a + 1}. Variations should test different angles.`,
          by: "rules",
        });
      }
    }
  }
  return out;
}

// ── Number tracing ───────────────────────────────────────────────────

export interface NumberToken {
  raw: string;
  /**
   * Comparable form. Durations are converted to hours with an "h" suffix, so
   * "two days" and "48 hours" are both "48h". Lakh, crore and k are scaled
   * ("₹2.5 lakh" is "250000"), percentages end in "%".
   */
  value: string;
  /** Money, percentages and durations are the claims that hurt most when invented. */
  strong: boolean;
}

const NUMBER_RE =
  /(?:₹|rs\.?\s?|inr\s?)?\d+(?:,\d{2,3})*(?:\.\d+)?(?:\s?(?:×|x|\/)\s?7)?(?:\s?%|\s?(?:percent|lakh|crore|k)\b)?/gi;

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const WORD = Object.keys(WORDS).join("|");
const HOURS: Record<string, number> = { min: 1 / 60, hour: 1, hr: 1, day: 24, week: 168, month: 730, year: 8760 };

/**
 * "48 hours", "48-hour", "two days", "twenty-four hours", "10-minute". A number
 * word only counts next to a unit: "three ways" is counting, not a claim; and
 * "a week" is left alone because "15 hours a week" is a rate.
 */
const DURATION_RE = new RegExp(
  String.raw`\b(\d+(?:\.\d+)?|(?:${WORD})(?:[\s-](?:${WORD}))?)[\s-]?(min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?|years?)\b`,
  "gi",
);

function wordNumber(s: string): number {
  if (/^\d/.test(s)) return Number(s);
  return s
    .toLowerCase()
    .split(/[\s-]/)
    .reduce((n, w) => (w === "hundred" ? (n || 1) * 100 : n + (WORDS[w] ?? NaN)), 0);
}

function durationValue(amount: string, unit: string): string {
  const key = unit.toLowerCase().replace(/s$/, "").replace(/^minute$/, "min").replace(/^mins?$/, "min");
  const hours = wordNumber(amount) * (HOURS[key] ?? NaN);
  return Number.isFinite(hours) ? `${Math.round(hours * 10000) / 10000}h` : "";
}

/** Every number in the text, including small ones; `extractNumbers` decides which are claims. */
type Token = NumberToken & { small: boolean; start: number; plain?: string };

function numberTokens(text: string): Token[] {
  const out: Token[] = [];
  const spans: [number, number][] = [];

  for (const m of text.matchAll(DURATION_RE)) {
    const value = durationValue(m[1], m[2]);
    if (!value) continue;
    const start = m.index ?? 0;
    spans.push([start, start + m[0].length]);
    out.push({ raw: m[0], value, strong: true, small: false, start, plain: String(wordNumber(m[1])) });
  }

  for (const m of text.matchAll(NUMBER_RE)) {
    const start = m.index ?? 0;
    if (spans.some(([a, b]) => start >= a && start < b)) continue;
    const raw = m[0].trim();
    // Skip digits glued to letters (e.g. "B2B", "H1", "DPDP2023" is fine either way).
    if (/[A-Za-z]/.test(text[start - 1] ?? "")) continue;
    let value = normaliseNumber(raw);
    if (!value) continue;
    const isMoney = /₹|rs|inr|lakh|crore/i.test(raw);
    // In a range ("20–25%", "20 to 25 percent") the first number is a percentage too.
    const rangeOfPercent = /^\s?(?:–|—|-|to)\s?\d+(?:\.\d+)?\s?(?:%|percent)/i.test(text.slice(start + m[0].length));
    if (rangeOfPercent && !value.endsWith("%")) value += "%";
    const isPercent = /%|percent/i.test(raw) || rangeOfPercent;
    const n = Number(value.replace(/[^\d.]/g, ""));
    // Small counting numbers ("3 ways", "Post 2") are not claims.
    const small = !isMoney && !isPercent && !value.includes("x7") && n <= 10 && !value.includes(".");
    out.push({ raw, value, strong: isMoney || isPercent, small, start });
  }

  return out.sort((a, b) => a.start - b.start);
}

export function extractNumbers(text: string): NumberToken[] {
  return numberTokens(text)
    .filter((t) => !t.small)
    .map((t) => ({ raw: t.raw, value: t.value, strong: t.strong }));
}

export function normaliseNumber(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, "");
  if (/24(?:×|x|\/)7/.test(s)) return "24x7";
  const digits = s.replace(/₹|rs\.?|inr/g, "").replace(/,/g, "");
  const num = digits.match(/\d+(?:\.\d+)?/);
  if (!num) return "";
  const pct = /%|percent/.test(s) ? "%" : "";
  // "₹2.5 lakh" and "₹2,50,000" are the same amount; "2.5" on its own is not.
  const scale = /lakh/.test(s) ? 1e5 : /crore/.test(s) ? 1e7 : /\d(?:k)$/.test(s) ? 1e3 : 1;
  const value = scale === 1 ? num[0] : String(Math.round(Number(num[0]) * scale));
  return value + pct;
}

export function numbersInFacts(facts: Pick<Fact, "text">[]): Set<string> {
  const set = new Set<string>();
  for (const f of facts) {
    for (const t of numberTokens(f.text)) {
      set.add(t.value);
      // A unit-less "48" in a draft still traces to "48 hours"; "48 days" does not (durations compare in hours).
      if (t.plain) set.add(t.plain);
      if (t.value.endsWith("%")) set.add(t.value.slice(0, -1));
    }
  }
  return set;
}

// ── helpers ──────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9₹]+/g, " ").trim();
}

function jaccard(a: string, b: string): number {
  const A = new Set(normalise(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(normalise(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function dedupe(findings: Omit<Finding, "id">[]): Omit<Finding, "id">[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.pieceId}|${f.path}|${f.kind}|${f.excerpt ?? f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countBlocking(findings: Finding[]): number {
  return findings.filter((f) => f.severity === "block").length;
}
