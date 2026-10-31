import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mockFixtures, MOCK_TOPIC } from "../src/lib/ai/mock";
import { runPipeline } from "../src/lib/pipeline/run";
import { setStore } from "../src/lib/store/runs";
import { createFileStore } from "../src/lib/store/file-store";
import type { RunEvent } from "../src/lib/content/types";

test("a piece the first rewrite leaves blocked gets a second pass, and only that piece", async () => {
  process.env.MOCK_AI = "1";
  const dir = mkdtempSync(path.join(tmpdir(), "hl-revise-"));
  setStore(createFileStore(dir));
  const fixed = mockFixtures.fixed as Record<string, { headlines?: string[] }>;
  const good = fixed["google-2"];
  // Like the live run: the first rewrite fixes the reported line but leaves a headline over 30 characters.
  let calls = 0;
  Object.defineProperty(fixed, "google-2", {
    configurable: true,
    enumerable: true,
    get: () => (++calls === 1 ? { ...good, headlines: ["Hire Support Staff Faster Every Week", ...good.headlines!.slice(1)] } : good),
  });
  try {
    const log: string[] = [];
    const run = await runPipeline({ topic: MOCK_TOPIC }, (e: RunEvent) => {
      if (e.type === "step" && e.step === "revise" && e.detail) log.push(e.detail);
    });
    assert.equal(calls, 2);
    assert.ok(log.includes("Second pass on google-2"), log.join(" | "));
    assert.equal(run.revision?.blockingAfter, 0);
    assert.ok(run.revision?.pieces.includes("google-2"));
  } finally {
    Object.defineProperty(fixed, "google-2", { value: good, configurable: true, enumerable: true, writable: true });
    setStore(null);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
