import { hireloop } from "@/clients/hireloop";
import { ContentPackSchema } from "@/lib/content/schemas";
import { refreshAfterEdit } from "@/lib/content/findings";
import type { ReviewStatus, Run } from "@/lib/content/types";
import { loadRun, saveRun } from "@/lib/store/runs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const run = await loadRun((await params).id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  return Response.json(run);
}

/** Save a reviewer's edits and approvals. Rules are re-checked on the server too. */
export async function PATCH(req: Request, { params }: Ctx) {
  const run = await loadRun((await params).id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });

  const body = (await req.json()) as { pack?: unknown; review?: Run["review"] };
  const next: Run = { ...run };

  if (body.pack) {
    const parsed = ContentPackSchema.safeParse(body.pack);
    if (!parsed.success) return Response.json({ error: "The edited pack doesn't match the expected shape." }, { status: 400 });
    next.pack = parsed.data;
    next.findings = refreshAfterEdit(parsed.data, run.findings, hireloop, run.research.facts);
  }
  if (body.review) {
    const allowed: ReviewStatus[] = ["pending", "approved", "changes"];
    next.review = Object.fromEntries(
      Object.entries(body.review).filter(([, v]) => allowed.includes(v as ReviewStatus)),
    ) as Run["review"];
  }

  await saveRun(next);
  return Response.json(next);
}
