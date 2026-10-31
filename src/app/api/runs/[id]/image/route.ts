import { ImageBriefSchema } from "@/lib/content/schemas";
import { makeImage } from "@/lib/pipeline/image";
import { loadRun, readImage, updateRun } from "@/lib/store/runs";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** Serve the run's current image. `?download=1` saves it as a file instead of showing it. */
export async function GET(req: Request, { params }: Ctx) {
  const run = await loadRun((await params).id).catch(() => null);
  if (!run?.image) return new Response("No image for this run.", { status: 404 });
  const bytes = await readImage(run.image.file);
  if (!bytes) return new Response("Image file is missing.", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": run.image.mediaType,
    "cache-control": "private, max-age=31536000, immutable",
  };
  if (new URL(req.url).searchParams.has("download")) {
    headers["content-disposition"] = `attachment; filename="${run.image.file}"`;
  }
  return new Response(new Uint8Array(bytes), { headers });
}

/** Generate a new image, optionally from an edited brief. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const run = await loadRun(id).catch(() => null);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { brief?: unknown };
  const parsed = body?.brief ? ImageBriefSchema.safeParse(body.brief) : null;
  if (parsed && !parsed.success) return Response.json({ error: "The image brief is incomplete." }, { status: 400 });
  const brief = parsed?.data ?? run.pack.imageBrief;

  try {
    const image = await makeImage(run.id, brief);
    // Apply to the latest saved run: approvals made while the image was generating stay.
    const next = await updateRun(id, (latest) => ({
      ...latest,
      pack: { ...latest.pack, imageBrief: brief },
      image,
      imageError: undefined,
      review: { ...latest.review, image: "pending" },
    }));
    if (!next) return Response.json({ error: "Run not found." }, { status: 404 });
    return Response.json(next);
  } catch (err) {
    const message = (err as Error).message || "The image couldn't be generated.";
    await updateRun(id, (latest) => ({ ...latest, imageError: message })).catch(() => null);
    return Response.json({ error: message }, { status: 502 });
  }
}
