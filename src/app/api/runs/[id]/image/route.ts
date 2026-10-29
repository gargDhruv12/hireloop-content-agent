import { ImageBriefSchema } from "@/lib/content/schemas";
import { makeImage } from "@/lib/pipeline/image";
import { loadRun, readImage, saveRun } from "@/lib/store/runs";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** Serve the run's current image. */
export async function GET(_req: Request, { params }: Ctx) {
  const run = await loadRun((await params).id);
  if (!run?.image) return new Response("No image for this run.", { status: 404 });
  const bytes = await readImage(run.image.file);
  if (!bytes) return new Response("Image file is missing.", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": run.image.mediaType, "cache-control": "private, max-age=31536000, immutable" },
  });
}

/** Generate a new image, optionally from an edited brief. */
export async function POST(req: Request, { params }: Ctx) {
  const run = await loadRun((await params).id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { brief?: unknown };
  const parsed = body.brief ? ImageBriefSchema.safeParse(body.brief) : null;
  if (parsed && !parsed.success) return Response.json({ error: "The image brief is incomplete." }, { status: 400 });
  const brief = parsed?.data ?? run.pack.imageBrief;

  try {
    const image = await makeImage(run.id, brief);
    const next = {
      ...run,
      pack: { ...run.pack, imageBrief: brief },
      image,
      imageError: undefined,
      review: { ...run.review, image: "pending" as const },
    };
    await saveRun(next);
    return Response.json(next);
  } catch (err) {
    const next = { ...run, imageError: (err as Error).message };
    await saveRun(next);
    return Response.json({ error: next.imageError }, { status: 502 });
  }
}
