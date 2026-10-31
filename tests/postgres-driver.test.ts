import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mockFixtures } from "../src/lib/ai/mock";
import type { Run } from "../src/lib/content/types";

/**
 * The production path end to end: DATABASE_URL → the `postgres` driver →
 * the Postgres wire protocol, served here by PGlite. This caught a bug the
 * in-process tests couldn't: the driver stored each run as a jsonb *string*,
 * so the recent-packs list read null topics.
 */
const PORT = 54000 + Math.floor(Math.random() * 1000);
let db: PGlite;
let server: PGLiteSocketServer;
let store: typeof import("../src/lib/store/runs");

before(async () => {
  db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
  store = await import("../src/lib/store/runs");
});

after(async () => {
  await server.stop();
  await db.close();
  delete process.env.DATABASE_URL;
});

const run = {
  id: "wire-run-01",
  createdAt: "2026-10-31T09:00:00.000Z",
  client: "HireLoop",
  input: { topic: "Wire test" },
  models: { text: "t", writer: "w", image: "i", mock: true },
  research: { topicSummary: "", facts: [], cautions: [], pagesRead: [] },
  plan: mockFixtures.plan,
  pack: mockFixtures.draft,
  findings: [],
  review: {},
  timings: {},
} as Run;

test("runs are stored as jsonb objects and come back unchanged", async () => {
  await store.saveRun(run);
  const [row] = (await db.query<{ t: string }>("select jsonb_typeof(data) as t from hl_runs where id = $1", [run.id])).rows;
  assert.equal(row.t, "object");
  assert.deepStrictEqual(await store.loadRun(run.id), run);
  assert.deepEqual((await store.listRuns(5)).map((r) => [r.id, r.input.topic]), [[run.id, "Wire test"]]);
});

test("overlapping updates both survive through the driver's transactions", async () => {
  await Promise.all([
    store.updateRun(run.id, async (r) => {
      await new Promise((ok) => setTimeout(ok, 50));
      return { ...r, review: { ...r.review, blog: "approved" } };
    }),
    store.updateRun(run.id, (r) => ({ ...r, review: { ...r.review, x: "approved" } })),
  ]);
  assert.deepEqual((await store.loadRun(run.id))?.review, { blog: "approved", x: "approved" });
});

test("image bytes survive the bytea round trip", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 10]);
  const file = await store.saveImage(run.id, bytes, "image/png");
  assert.deepEqual(new Uint8Array((await store.readImage(file))!), bytes);
});

test("the run limit holds through the real driver", async () => {
  // Advisory lock, interval maths and count(*) coming back as a string.
  const taken = await Promise.all([1, 2, 3].map(() => store.takeRunSlot("wire", 2, 60_000)));
  assert.equal(taken.filter(Boolean).length, 2);
});
