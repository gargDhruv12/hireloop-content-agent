/**
 * End-to-end check with no API key: runs the whole workflow in offline mode
 * through the real API route handlers, in a temporary folder.
 *
 *   npm run smoke
 *
 * If this passes, the plumbing works; any remaining problem is the model
 * or the key, not the app.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.MOCK_AI = "1";
const startDir = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "hireloop-smoke-"));
process.chdir(dir);

async function main() {
  const runs = await import("../src/app/api/runs/route");
  const one = await import("../src/app/api/runs/[id]/route");
  const piece = await import("../src/app/api/runs/[id]/pieces/[pieceId]/route");
  const image = await import("../src/app/api/runs/[id]/image/route");
  const exportRoute = await import("../src/app/api/runs/[id]/export/route");
  const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // 1. Bad input is rejected with a readable message.
  const bad = await runs.POST(new Request("http://x/api/runs", json({ topic: "hi" })));
  assert.equal(bad.status, 400);

  // 2. A full run streams progress and finishes.
  const res = await runs.POST(new Request("http://x/api/runs", json({ topic: "Slow first rounds cost BPOs good applicants" })));
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  const done = events.find((e) => e.type === "done");
  assert.ok(done, `run did not finish: ${JSON.stringify(events.at(-1))}`);
  const steps = events.filter((e) => e.type === "step" && e.status !== "running").map((e) => `${e.step}:${e.status}`);
  console.log("steps     ", steps.join("  "));

  const ctx = { params: Promise.resolve({ id: done.runId }) };
  let run = await (await one.GET(new Request("http://x"), ctx)).json();

  // 3. The checker caught the three planted problems and the agent fixed them.
  assert.deepEqual(run.revision.pieces, ["linkedin", "meta-2", "google-2"]);
  assert.equal(run.revision.blockingAfter, 0);
  assert.ok(run.findings.some((f: { pieceId: string; by: string }) => f.pieceId === "instagram" && f.by === "ai"), "tone note kept");
  console.log("revision  ", `${run.revision.blockingBefore} blocking → ${run.revision.blockingAfter}`);
  console.log("findings  ", run.findings.map((f: { pieceId: string; kind: string; severity: string }) => `${f.pieceId}/${f.kind}/${f.severity}`).join(", "));

  // 4. Image was generated and can be served.
  const img = await image.GET(new Request("http://x"), ctx);
  assert.equal(img.status, 200);
  console.log("image     ", img.headers.get("content-type"), (await img.arrayBuffer()).byteLength, "bytes");

  // 5. A reviewer edit that adds a banned phrase is re-checked on save.
  const edited = structuredClone(run.pack);
  edited.linkedin.body += "\n\nThe AI decides who is a good fit.";
  run = await (await one.PATCH(new Request("http://x", { ...json({ pack: edited }), method: "PATCH" }), ctx)).json();
  assert.ok(run.findings.some((f: { pieceId: string; kind: string }) => f.pieceId === "linkedin" && f.kind === "banned_phrase"));
  console.log("edit      ", "banned phrase caught after a manual edit");

  // 6. Approvals are saved.
  run = await (await one.PATCH(new Request("http://x", { ...json({ review: { blog: "approved", image: "approved" } }), method: "PATCH" }), ctx)).json();
  assert.equal(run.review.blog, "approved");

  // 7. Rewriting one piece works and sends it back to pending.
  const ctxPiece = { params: Promise.resolve({ id: done.runId, pieceId: "google-2" }) };
  const rw = await piece.POST(new Request("http://x", json({ note: "shorter" })), ctxPiece);
  assert.equal(rw.status, 200, await rw.clone().text());
  console.log("rewrite   ", "google-2 rewritten and re-checked");

  // 8. Regenerating the image with an edited brief.
  const brief = { ...run.pack.imageBrief, aspectRatio: "16:9" };
  const regen = await image.POST(new Request("http://x", json({ brief })), ctx);
  assert.equal(regen.status, 200);
  console.log("image     ", "regenerated at 16:9");

  // 9. An approval made while a rewrite is running is not lost.
  const slow = piece.POST(new Request("http://x", json({ note: "warmer" })), { params: Promise.resolve({ id: done.runId, pieceId: "linkedin" }) });
  await one.PATCH(new Request("http://x", { ...json({ review: { x: "approved" } }), method: "PATCH" }), ctx);
  assert.equal((await slow).status, 200);
  run = await (await one.GET(new Request("http://x"), ctx)).json();
  assert.equal(run.review.x, "approved", "approval made during a rewrite was kept");
  console.log("race      ", "approval during a rewrite kept");

  // 10. Download approved: a zip with the Markdown and the approved image.
  await one.PATCH(new Request("http://x", { ...json({ review: { image: "approved" } }), method: "PATCH" }), ctx);
  const zipRes = await exportRoute.GET(new Request("http://x"), ctx);
  assert.equal(zipRes.status, 200, await zipRes.clone().text());
  assert.match(zipRes.headers.get("content-disposition") ?? "", /approved-\d{12}\.zip/);
  const zip = Buffer.from(await zipRes.arrayBuffer());
  assert.equal(zip.subarray(0, 2).toString(), "PK");
  const zipText = zip.toString("latin1");
  assert.ok(zipText.includes("approved.md") && /image\.(svg|png|jpg|webp)/.test(zipText), "zip has the Markdown and the image");
  assert.ok(zipText.includes("![") && zipText.includes("## Blog post"), "Markdown links the image and has the blog");
  console.log("export    ", `zip ${zip.length} bytes with approved.md and the image`);
  const dl = await image.GET(new Request("http://x?download=1"), ctx);
  assert.match(dl.headers.get("content-disposition") ?? "", /^attachment/);
  console.log("image     ", "downloadable as a file");

  console.log("\nSmoke test passed. Run folder:", dir);
}

main()
  .catch((err) => {
    console.error("\nSmoke test FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Windows can't delete the folder the process is standing in.
    process.chdir(startDir);
    if (!process.exitCode) rmSync(dir, { recursive: true, force: true });
  });
