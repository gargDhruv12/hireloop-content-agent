import { hireloop } from "@/clients/hireloop";
import { refreshAfterEdit } from "@/lib/content/findings";
import { PIECE_ORDER } from "@/lib/content/pieces";
import type { PieceId } from "@/lib/content/types";
import { aiReview } from "@/lib/pipeline/check";
import { mergeFindings } from "@/lib/content/findings";
import { rewritePiece } from "@/lib/pipeline/write";
import { loadRun, saveRun } from "@/lib/store/runs";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; pieceId: string }> };

/** Rewrite one piece, optionally with a note from the reviewer, then re-check it. */
export async function POST(req: Request, { params }: Ctx) {
  const { id, pieceId } = await params;
  if (!(PIECE_ORDER as string[]).includes(pieceId)) return Response.json({ error: "Unknown piece." }, { status: 404 });
  const run = await loadRun(id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });

  const { note } = (await req.json().catch(() => ({}))) as { note?: string };
  const piece = pieceId as PieceId;

  try {
    const pack = await rewritePiece({
      client: hireloop,
      pack: run.pack,
      pieceId: piece,
      findings: run.findings.filter((f) => f.pieceId === piece),
      facts: run.research.facts,
      reviewerNote: note?.slice(0, 1000),
    });
    // Rules for everything; a fresh AI review for this piece only.
    const others = refreshAfterEdit(pack, run.findings.filter((f) => f.pieceId !== piece), hireloop, run.research.facts);
    const fresh = (await aiReview(pack, hireloop, run.research.facts)).filter((f) => f.pieceId === piece);
    const findings = mergeFindings(others.filter((f) => f.by === "rules"), [...others.filter((f) => f.by === "ai"), ...fresh]);

    const next = { ...run, pack, findings, review: { ...run.review, [piece]: "pending" as const } };
    await saveRun(next);
    return Response.json(next);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
