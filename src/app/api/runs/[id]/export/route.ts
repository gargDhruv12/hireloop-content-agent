import { approvedMarkdown } from "@/lib/content/export";
import { makeZip, type ZipEntry } from "@/lib/content/zip";
import { loadRun, readImage } from "@/lib/store/runs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The approved pack as a .zip: the Markdown plus the image file when the image
 * is approved. Built from the saved run, so it always matches the latest
 * approvals and edits. The file name carries the time so downloads don't
 * overwrite each other.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const run = await loadRun((await params).id).catch(() => null);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });

  const approved = Object.values(run.review).filter((s) => s === "approved").length;
  if (approved === 0) return Response.json({ error: "Approve at least one piece before downloading." }, { status: 400 });

  const entries: ZipEntry[] = [];
  let imageFile: string | undefined;
  if (run.review.image === "approved" && run.image) {
    const bytes = await readImage(run.image.file);
    if (!bytes) return Response.json({ error: "The approved image file is missing. Generate it again, then approve it." }, { status: 409 });
    imageFile = `image.${run.image.file.split(".").pop()}`;
    entries.push({ name: imageFile, data: new Uint8Array(bytes) });
  }
  const markdown = approvedMarkdown(run, run.pack, imageFile);
  entries.unshift({ name: "approved.md", data: new TextEncoder().encode(markdown) });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  const zip = makeZip(entries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${run.id}-approved-${stamp}.zip"`,
      "cache-control": "no-store",
    },
  });
}
