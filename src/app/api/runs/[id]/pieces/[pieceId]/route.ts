import { clientById } from "@/clients";
import { mergeFindings, refreshAfterEdit } from "@/lib/content/findings";
import { PIECE_ORDER, withPiece } from "@/lib/content/pieces";
import type { PieceId } from "@/lib/content/types";
import { aiReview } from "@/lib/pipeline/check";
import { rewritePiece } from "@/lib/pipeline/write";
import { loadRun, updateRun } from "@/lib/store/runs";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; pieceId: string }> };

/** Rewrite one piece, optionally with a note from the reviewer, then re-check it. */
export async function POST(req: Request, { params }: Ctx) {
  const { id, pieceId } = await params;
  if (!(PIECE_ORDER as string[]).includes(pieceId)) return Response.json({ error: "Unknown piece." }, { status: 404 });
  const run = await loadRun(id).catch(() => null);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
  const note = typeof body?.note === "string" ? body.note.slice(0, 1000) : undefined;
  const piece = pieceId as PieceId;
  const client = clientById(run.input.clientId);

  try {
    const rewritten = await rewritePiece({
      client,
      pack: run.pack,
      pieceId: piece,
      findings: run.findings.filter((f) => f.pieceId === piece),
      facts: run.research.facts,
      reviewerNote: note,
    });
    const fresh = await aiReview(rewritten, client, run.research.facts, [piece]);

    // The model calls take a while: put only this piece into the latest saved
    // run, so edits and approvals made meanwhile on other pieces stay.
    const next = await updateRun(id, (latest) => {
      const pack = withPiece(latest.pack, rewritten, piece);
      const others = refreshAfterEdit(pack, latest.findings.filter((f) => f.pieceId !== piece), client, latest.research.facts);
      const findings = mergeFindings(others.filter((f) => f.by === "rules"), [...others.filter((f) => f.by === "ai"), ...fresh]);
      return { ...latest, pack, findings, review: { ...latest.review, [piece]: "pending" } };
    });
    if (!next) return Response.json({ error: "Run not found." }, { status: 404 });
    return Response.json(next);
  } catch (err) {
    return Response.json({ error: (err as Error).message || "The rewrite failed." }, { status: 502 });
  }
}
