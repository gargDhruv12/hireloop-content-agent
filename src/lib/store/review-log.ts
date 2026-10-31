import { createHash } from "node:crypto";
import { getPieces, pieceText } from "@/lib/content/pieces";
import type { PieceId, ReviewLogEntry, ReviewStatus, Run } from "@/lib/content/types";
import type { Reviewer } from "@/lib/auth/reviewer";

/**
 * One review decision as the server saw it. Approving a piece with blocking
 * findings is allowed (the checker can be wrong), but it is recorded as an
 * override, and the hash pins down exactly which text was signed off.
 */
export function reviewEntry(run: Run, piece: PieceId | "image", status: ReviewStatus, reviewer?: Reviewer | null): ReviewLogEntry {
  const text =
    piece === "image"
      ? `${run.image?.file ?? ""}\n${run.pack.imageBrief.altText}`
      : pieceText(getPieces(run.pack).find((p) => p.id === piece)!);
  return {
    piece,
    status,
    at: new Date().toISOString(),
    blockingAtDecision: run.findings.filter((f) => f.pieceId === piece && f.severity === "block").length,
    textHash: createHash("sha256").update(text).digest("hex"),
    ...(reviewer ? { by: reviewer.name, byVerified: reviewer.verified } : {}),
  };
}
