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
  client: Pick<ClientProfile, "bannedPhrases">;
  facts: Pick<Fact, "text">[];
}

export function lintPack(pack: ContentPack, opts: LintOptions): Finding[] {
  const findings: Omit<Finding, "id">[] = [];
  const allowedNumbers = numbersInFacts(opts.facts);
  const banned = opts.client.bannedPhrases.map((b) => ({ re: new RegExp(b.pattern, "gi"), reason: b.reason }));

  for (const piece of getPieces(pack)) {
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

    findings.push(...structureChecks(piece, pack));
  }

  findings.push(...similarityChecks(pack));

  return dedupe(findings).map((f, i) => ({ ...f, id: `r${i + 1}` }));
}

// ── Structure checks per channel ─────────────────────────────────────

const CTA_RE = /\b(?:sample (?:ai )?interview|try (?:a |the )?sample|book a demo|talk to sales)\b/i;

function structureChecks(piece: Piece, pack: ContentPack): Omit<Finding, "id">[] {
  const out: Omit<Finding, "id">[] = [];
  const add = (f: Omit<Finding, "id" | "pieceId" | "by">) => out.push({ ...f, pieceId: piece.id, by: "rules" });

  switch (piece.id) {
    case "blog": {
      const words = wordCount(pack.blog.body);
      if (words < BLOG_WORDS.min || words > BLOG_WORDS.max) {
        add({
          path: "blog.body",
          kind: "format",
          severity: "warn",
          message: `The article is ${words} words. Aim for ${BLOG_WORDS.min}–${BLOG_WORDS.max}.`,
        });
      }
      if (!/^##\s/m.test(pack.blog.body)) {
        add({ path: "blog.body", kind: "format", severity: "warn", message: "The article has no ## subheadings. Long posts are easier to skim with them." });
      }
      if (!CTA_RE.test(pack.blog.body)) {
        add({ path: "blog.body", kind: "missing_cta", severity: "warn", message: "The article never invites readers to try the sample AI interview." });
      }
      break;
    }
    case "linkedin":
      if (pack.linkedin.body.length > 1300) {
        add({ path: "linkedin.body", kind: "length", severity: "warn", message: `The post is ${pack.linkedin.body.length} characters. LinkedIn posts under 1,300 tend to get read to the end.` });
      }
      if (!CTA_RE.test(pack.linkedin.body)) {
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
  value: string;
  /** Money, percentages and time savings are the claims that hurt most when invented. */
  strong: boolean;
}

const NUMBER_RE =
  /(?:₹|rs\.?\s?|inr\s?)?\d+(?:,\d{2,3})*(?:\.\d+)?(?:\s?(?:×|x|\/)\s?7)?(?:\s?%|\s?(?:percent|lakh|crore|k)\b)?/gi;

export function extractNumbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[0].trim();
    const start = m.index ?? 0;
    // Skip digits glued to letters (e.g. "B2B", "H1", "DPDP2023" is fine either way).
    const before = text[start - 1] ?? "";
    if (/[A-Za-z]/.test(before)) continue;
    const value = normaliseNumber(raw);
    if (!value) continue;
    const isMoney = /₹|rs|inr|lakh|crore/i.test(raw);
    const isPercent = /%|percent/i.test(raw);
    const n = Number(value.replace(/[^\d.]/g, ""));
    // Small counting numbers ("3 ways", "Post 2") are not claims.
    if (!isMoney && !isPercent && !value.includes("x7") && n <= 10 && !value.includes(".")) continue;
    tokens.push({ raw, value, strong: isMoney || isPercent });
  }
  return tokens;
}

export function normaliseNumber(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, "");
  if (/24(?:×|x|\/)7/.test(s)) return "24x7";
  const digits = s.replace(/₹|rs\.?|inr/g, "").replace(/,/g, "");
  const num = digits.match(/\d+(?:\.\d+)?/);
  if (!num) return "";
  const pct = /%|percent/.test(s) ? "%" : "";
  return num[0] + pct;
}

export function numbersInFacts(facts: Pick<Fact, "text">[]): Set<string> {
  const set = new Set<string>();
  for (const f of facts) {
    for (const m of f.text.matchAll(NUMBER_RE)) {
      const v = normaliseNumber(m[0]);
      if (!v) continue;
      set.add(v);
      set.add(v.replace("%", ""));
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
