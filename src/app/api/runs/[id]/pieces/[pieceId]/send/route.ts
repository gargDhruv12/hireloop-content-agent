import { reviewerFrom } from "@/lib/auth/reviewer";
import type { PieceId, SendLogEntry } from "@/lib/content/types";
import { SENDABLE, buildDraft, schedulerConfig, sendDraft } from "@/lib/scheduler";
import { loadRun, readImage, updateRun } from "@/lib/store/runs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; pieceId: string }> };

/**
 * Send one approved social post to the team's scheduler as a draft. Only
 * approved pieces go; every attempt, failed or not, is recorded on the run.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id, pieceId } = await params;
  const config = schedulerConfig();
  if (!config) return Response.json({ error: "No scheduler is set up. Set SCHEDULER_WEBHOOK_URL." }, { status: 503 });
  if (!(SENDABLE as string[]).includes(pieceId)) {
    return Response.json({ error: "Only LinkedIn, X and Instagram posts can be sent to a scheduler." }, { status: 400 });
  }
  const piece = pieceId as PieceId;
  const run = await loadRun(id).catch(() => null);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  if (run.review[piece] !== "approved") {
    return Response.json({ error: "Approve this piece before sending it." }, { status: 409 });
  }

  // The image goes along only when it's approved too.
  const imageBytes = run.image && run.review.image === "approved" ? await readImage(run.image.file) : null;
  const image = imageBytes && run.image ? { bytes: imageBytes, mediaType: run.image.mediaType } : undefined;
  const result = await sendDraft(config, buildDraft(run, piece, image));

  const reviewer = reviewerFrom(req.headers);
  const entry: SendLogEntry = {
    piece,
    to: config.name,
    at: new Date().toISOString(),
    ok: result.ok,
    ...(result.ok ? {} : { error: result.error }),
    ...(reviewer ? { by: reviewer.name, byVerified: reviewer.verified } : {}),
  };
  const next = await updateRun(id, (latest) => ({ ...latest, sendLog: [...(latest.sendLog ?? []), entry] }));
  if (!next) return Response.json({ error: "Run not found." }, { status: 404 });
  if (!result.ok) return Response.json({ error: `Not sent: ${result.error}`, run: next }, { status: 502 });
  return Response.json(next);
}
