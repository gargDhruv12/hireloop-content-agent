import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mockFixtures } from "../src/lib/ai/mock";
import { createFileStore } from "../src/lib/store/file-store";
import { createSqlStore } from "../src/lib/store/sql-store";
import type { RunStore } from "../src/lib/store/types";
import type { Run } from "../src/lib/content/types";
import { pgliteClient } from "./pglite-client";

function sampleRun(id: string, createdAt: string): Run {
  return {
    id,
    createdAt,
    client: "HireLoop",
    input: { topic: `Topic for ${id}` },
    models: { text: "t", writer: "w", image: "i", mock: true },
    research: { topicSummary: "", facts: [], cautions: [], pagesRead: [] },
    plan: mockFixtures.plan,
    pack: mockFixtures.draft,
    findings: [],
    review: {},
    timings: {},
  } as Run;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One contract, two backends: whatever the app relies on must hold for both.
const backends: [string, () => { store: RunStore; cleanup: () => void }][] = [
  [
    "file store",
    () => {
      const dir = mkdtempSync(path.join(tmpdir(), "hl-store-"));
      return { store: createFileStore(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
    },
  ],
  ["postgres store (PGlite)", () => ({ store: createSqlStore(pgliteClient()), cleanup: () => {} })],
];

for (const [name, make] of backends) {
  describe(name, () => {
    test("saves, loads and overwrites a run", async () => {
      const { store, cleanup } = make();
      try {
        const run = sampleRun("first-run-a1", "2026-10-30T10:00:00.000Z");
        await store.saveRun(run);
        assert.deepEqual(await store.loadRun(run.id), run);
        await store.saveRun({ ...run, review: { blog: "approved" } });
        assert.equal((await store.loadRun(run.id))?.review.blog, "approved");
        assert.equal(await store.loadRun("missing-run-zz"), null);
        assert.equal(await store.loadRun("../../etc/passwd"), null);
      } finally {
        cleanup();
      }
    });

    test("lists newest first, limited, with only the summary fields", async () => {
      const { store, cleanup } = make();
      try {
        await store.saveRun(sampleRun("old-run-aa", "2026-10-28T10:00:00.000Z"));
        await store.saveRun(sampleRun("new-run-bb", "2026-10-30T10:00:00.000Z"));
        await store.saveRun(sampleRun("mid-run-cc", "2026-10-29T10:00:00.000Z"));
        const list = await store.listRuns(2);
        assert.deepEqual(list.map((r) => r.id), ["new-run-bb", "mid-run-cc"]);
        assert.deepEqual(Object.keys(list[0]).sort(), ["createdAt", "findings", "id", "input", "review"]);
        assert.equal(list[0].input.topic, "Topic for new-run-bb");
      } finally {
        cleanup();
      }
    });

    test("overlapping updates to one run both survive", async () => {
      const { store, cleanup } = make();
      try {
        const run = sampleRun("race-run-r1", "2026-10-30T10:00:00.000Z");
        await store.saveRun(run);
        // A slow rewrite and a quick approval at the same time: neither may overwrite the other.
        const slow = store.updateRun(run.id, async (latest) => {
          await delay(50);
          return { ...latest, review: { ...latest.review, linkedin: "pending" }, pack: { ...latest.pack, linkedin: { ...latest.pack.linkedin, body: "rewritten" } } };
        });
        const quick = store.updateRun(run.id, (latest) => ({ ...latest, review: { ...latest.review, x: "approved" } }));
        await Promise.all([slow, quick]);
        const saved = await store.loadRun(run.id);
        assert.equal(saved?.pack.linkedin.body, "rewritten");
        assert.equal(saved?.review.x, "approved");
        assert.equal(saved?.review.linkedin, "pending");
        assert.equal(await store.updateRun("missing-run-zz", (r) => r), null);
      } finally {
        cleanup();
      }
    });

    test("stores and serves image bytes unchanged", async () => {
      const { store, cleanup } = make();
      try {
        const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 10, 13]);
        const file = await store.saveImage("img-run-i1", bytes, "image/png");
        assert.match(file, /^img-run-i1-[a-z0-9]+\.png$/);
        assert.deepEqual(new Uint8Array((await store.readImage(file))!), bytes);
        assert.equal(await store.readImage("../secret.png"), null);
        assert.equal(await store.readImage("nope-zz.png"), null);
      } finally {
        cleanup();
      }
    });

    test("run slots: parallel starts can't slip past the limit, and keys are separate", async () => {
      const { store, cleanup } = make();
      try {
        const taken = await Promise.all(Array.from({ length: 6 }, () => store.takeRunSlot("addr-a", 3, 60_000)));
        assert.equal(taken.filter(Boolean).length, 3);
        assert.equal(await store.takeRunSlot("addr-b", 3, 60_000), true);
        await delay(30);
        // Starts older than the window no longer count.
        assert.equal(await store.takeRunSlot("addr-a", 3, 10), true);
      } finally {
        cleanup();
      }
    });
  });
}
