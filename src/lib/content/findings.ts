/**
 * Pure helpers for combining findings. No model calls, so this file is safe
 * to import in the browser (the review desk re-checks drafts as you type).
 */
import type { ClientProfile } from "@/clients/types";
import type { ContentPack } from "./schemas";
import type { Fact, Finding, PieceId } from "./types";
import { lintPack } from "./lint";
import { PIECE_ORDER, getPieces } from "./pieces";

/** Drop reviewer findings that repeat a rules finding on the same words. */
export function mergeFindings(rules: Finding[], ai: Finding[]): Finding[] {
  const overlaps = (a: Finding, b: Finding) =>
    a.pieceId === b.pieceId &&
    !!a.excerpt &&
    !!b.excerpt &&
    (a.excerpt.toLowerCase().includes(b.excerpt.toLowerCase()) || b.excerpt.toLowerCase().includes(a.excerpt.toLowerCase()));
  const unique = ai.filter((a) => !rules.some((r) => overlaps(a, r)));
  const severityRank = { block: 0, warn: 1 };
  return [...rules, ...unique]
    .sort(
      (a, b) =>
        PIECE_ORDER.indexOf(a.pieceId) - PIECE_ORDER.indexOf(b.pieceId) || severityRank[a.severity] - severityRank[b.severity],
    )
    // Fresh, unique ids every time findings are combined (they key the UI's marks and notes).
    .map((f, i) => ({ ...f, id: `${f.by === "ai" ? "a" : "r"}${i + 1}` }));
}

/**
 * After a person edits a draft: re-run the rules (free, instant) and keep a
 * reviewer finding only while the words it pointed at are still there.
 */
export function refreshAfterEdit(
  pack: ContentPack,
  previous: Finding[],
  client: Pick<ClientProfile, "bannedPhrases">,
  facts: Pick<Fact, "text">[],
): Finding[] {
  const rules = lintPack(pack, { client, facts });
  const pieces = getPieces(pack);
  const stillTrue = previous.filter((f) => {
    if (f.by !== "ai") return false;
    if (!f.excerpt) return true;
    const piece = pieces.find((p) => p.id === f.pieceId);
    return !!piece?.fields.some((fl) => fl.value.toLowerCase().includes(f.excerpt!.toLowerCase()));
  });
  return mergeFindings(rules, stillTrue);
}

export function blockingPieces(findings: Finding[]): PieceId[] {
  return PIECE_ORDER.filter((id) => findings.some((f) => f.pieceId === id && f.severity === "block"));
}
