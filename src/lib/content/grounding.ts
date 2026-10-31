/**
 * Grounding for researched facts. The model says each fact comes with an
 * exact quote; this checks the quote really is in the text that was read,
 * and that the fact doesn't add a number its quote doesn't have. A fact
 * that fails is dropped before the writer or the checker ever sees it, so
 * an invented fact can't whitelist an invented number.
 */
import { extractNumbers, numbersInFacts } from "./lint";

export interface Candidate {
  text: string;
  quote: string;
}

export interface RejectedFact {
  text: string;
  quote: string;
  ref: string;
  reason: string;
}

/** Lowercase, straight quotes, plain dashes, single spaces: formatting differences aren't lies. */
export function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/×/g, "x")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why a candidate fact isn't supported by `pageText`, or null when it is. */
export function groundingProblem(fact: Candidate, pageText: string): string | null {
  const quote = normaliseForMatch(fact.quote).replace(/^["']|["']$/g, "");
  if (quote.length < 8) return "The quote is too short to check.";
  if (!normaliseForMatch(pageText).includes(quote)) return "The quote isn't in the page that was read.";
  const inQuote = numbersInFacts([{ text: fact.quote }]);
  const added = extractNumbers(fact.text).filter((n) => !inQuote.has(n.value));
  if (added.length) return `The fact adds ${added.map((n) => `"${n.raw}"`).join(", ")}, which its quote doesn't say.`;
  return null;
}

/** Split candidates into the ones backed by their page and the ones that aren't. */
export function groundFacts<T extends Candidate>(
  candidates: T[],
  textFor: (c: T) => string | undefined,
  refFor: (c: T) => string,
): { kept: T[]; rejected: RejectedFact[] } {
  const kept: T[] = [];
  const rejected: RejectedFact[] = [];
  for (const c of candidates) {
    const text = textFor(c);
    const reason = text === undefined ? "It names a page that wasn't read." : groundingProblem(c, text);
    if (reason) rejected.push({ text: c.text, quote: c.quote, ref: refFor(c), reason });
    else kept.push(c);
  }
  return { kept, rejected };
}
