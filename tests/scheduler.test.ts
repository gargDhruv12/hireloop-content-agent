import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { runPipeline } from "../src/lib/pipeline/run";
import { setStore, loadRun } from "../src/lib/store/runs";
import { createFileStore } from "../src/lib/store/file-store";
import { approvedMarkdown } from "../src/lib/content/export";
import * as sendRoute from "../src/app/api/runs/[id]/pieces/[pieceId]/send/route";
import * as runRoute from "../src/app/api/runs/[id]/route";

/** A stand-in scheduler (what Zapier or Make would be): records what it receives. */
let server: Server;
let url = "";
let answer = 200;
const received: { body: string; signature?: string }[] = [];
let dir = "";
let runId = "";

before(async () => {
  process.env.MOCK_AI = "1";
  dir = mkdtempSync(path.join(tmpdir(), "hl-sched-"));
  setStore(createFileStore(dir));
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ body, signature: req.headers["x-hireloop-signature"] as string | undefined });
      res.statusCode = answer;
      res.end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/hook`;
  runId = (await runPipeline({ topic: "Slow first-round interviews are costing BPOs their best applicants" }, () => {})).id;
});

after(() => {
  server.close();
  setStore(null);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  for (const k of ["SCHEDULER_WEBHOOK_URL", "SCHEDULER_WEBHOOK_SECRET", "SCHEDULER_NAME"]) delete process.env[k];
});

const send = (piece: string, headers: Record<string, string> = {}) =>
  sendRoute.POST(new Request("http://x", { method: "POST", headers }), { params: Promise.resolve({ id: runId, pieceId: piece }) });
const approve = (piece: string, headers: Record<string, string> = {}) =>
  runRoute.PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ review: { [piece]: "approved" } }) }), {
    params: Promise.resolve({ id: runId }),
  });

test("without a scheduler set up, nothing can be sent", async () => {
  delete process.env.SCHEDULER_WEBHOOK_URL;
  assert.equal((await send("linkedin")).status, 503);
});

test("only approved social posts go, and they go as signed drafts", async () => {
  process.env.SCHEDULER_WEBHOOK_URL = url;
  process.env.SCHEDULER_WEBHOOK_SECRET = "hook-secret";
  process.env.SCHEDULER_NAME = "Buffer";

  assert.equal((await send("linkedin")).status, 409, "not approved yet");
  assert.equal((await send("blog")).status, 400, "the blog isn't a social post");
  assert.equal(received.length, 0);

  await approve("linkedin", { "x-hl-reviewer": "Asha", "x-hl-reviewer-verified": "1" });
  const res = await send("linkedin", { "x-hl-reviewer": "Asha", "x-hl-reviewer-verified": "1" });
  assert.equal(res.status, 200);
  assert.equal(received.length, 1);

  const payload = JSON.parse(received[0].body);
  const run = (await loadRun(runId))!;
  assert.equal(payload.status, "draft");
  assert.equal(payload.channel, "linkedin");
  assert.equal(payload.text, run.pack.linkedin.body);
  assert.equal(payload.approvedBy, "Asha");
  assert.equal(payload.image, undefined, "the image isn't approved, so it stays behind");
  // The receiver can check the request came from the desk.
  assert.equal(received[0].signature, `sha256=${createHmac("sha256", "hook-secret").update(received[0].body).digest("hex")}`);

  assert.deepEqual(
    run.sendLog?.map((e) => ({ piece: e.piece, to: e.to, ok: e.ok, by: e.by })),
    [{ piece: "linkedin", to: "Buffer", ok: true, by: "Asha" }],
  );
  assert.match(approvedMarkdown(run, run.pack), /## Sent to the scheduler \(as drafts\)[\s\S]*\| linkedin \| .* \| Buffer \| Asha \| draft created \|/);
});

test("an X thread goes as its posts; a failed send is recorded, not hidden", async () => {
  process.env.SCHEDULER_WEBHOOK_URL = url;
  await approve("x");
  answer = 500;
  const res = await send("x");
  assert.equal(res.status, 502);
  const run = (await loadRun(runId))!;
  const last = run.sendLog!.at(-1)!;
  assert.equal(last.ok, false);
  assert.match(last.error ?? "", /answered 500/);
  const payload = JSON.parse(received.at(-1)!.body);
  assert.deepEqual(payload.thread, run.pack.xThread.posts);
  answer = 200;
});
