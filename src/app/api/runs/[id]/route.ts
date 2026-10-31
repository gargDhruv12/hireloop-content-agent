import { hireloop } from "@/clients/hireloop";
import { ContentPackSchema } from "@/lib/content/schemas";
import { refreshAfterEdit } from "@/lib/content/findings";
import { PIECE_ORDER } from "@/lib/content/pieces";
import type { PieceId, ReviewStatus, Run } from "@/lib/content/types";
import { reviewEntry } from "@/lib/store/review-log";
import { loadRun, updateRun } from "@/lib/store/runs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const REVIEW_KEYS: string[] = [...PIECE_ORDER, "image"];
const STATUSES: ReviewStatus[] = ["pending", "approved", "changes"];

export async function GET(_req: Request, { params }: Ctx) {
  const run = await loadRun((await params).id).catch(() => null);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  return Response.json(run);
}

/** Save a reviewer's edits and approvals. Rules are re-checked on the server too. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { pack?: unknown; review?: Record<string, unknown> } | null;
  if (!body || typeof body !== "object") return Response.json({ error: "The request was empty or not JSON." }, { status: 400 });

  let pack: Run["pack"] | undefined;
  if (body.pack) {
    const parsed = ContentPackSchema.safeParse(body.pack);
    if (!parsed.success) return Response.json({ error: "The edited pack doesn't match the expected shape." }, { status: 400 });
    pack = parsed.data;
  }

  try {
    const next = await updateRun(id, (latest) => {
      const out: Run = { ...latest };
      if (pack) {
        out.pack = pack;
        out.findings = refreshAfterEdit(pack, latest.findings, hireloop, latest.research.facts);
      }
      if (body.review && typeof body.review === "object") {
        // Merge, so approving one piece never resets another saved at the same time.
        const changes = Object.fromEntries(
          Object.entries(body.review).filter(([k, v]) => REVIEW_KEYS.includes(k) && STATUSES.includes(v as ReviewStatus)),
        ) as Run["review"];
        out.review = { ...latest.review, ...changes };
        // Recorded against the text and findings as saved above, so an edit and its approval line up.
        out.reviewLog = [
          ...(latest.reviewLog ?? []),
          ...Object.entries(changes).map(([piece, status]) => reviewEntry(out, piece as PieceId | "image", status!)),
        ];
      }
      return out;
    });
    if (!next) return Response.json({ error: "Run not found." }, { status: 404 });
    return Response.json(next);
  } catch (err) {
    return Response.json({ error: `Couldn't save: ${(err as Error).message}` }, { status: 500 });
  }
}
