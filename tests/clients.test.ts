import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { brightpathSample } from "../src/clients/brightpath-sample";
import { hireloop } from "../src/clients/hireloop";
import { clientById } from "../src/clients";
import { checkPrompt, planPrompt, researchPrompt, revisePrompt, writePrompt } from "../src/lib/pipeline/prompts";
import { ContentPackSchema, PlanSchema, ResearchSchema } from "../src/lib/content/schemas";
import { lintPack } from "../src/lib/content/lint";
import { mockFixtures } from "../src/lib/ai/mock";
import { runPipeline, validateInput } from "../src/lib/pipeline/run";
import { setStore } from "../src/lib/store/runs";
import { createFileStore } from "../src/lib/store/file-store";
import type { Fact } from "../src/lib/content/types";

const factsOf = (c: typeof hireloop): Fact[] => c.facts.map((f) => ({ ...f, origin: "client", ref: "", relevant: true }));

test("every prompt for one client carries its facts and voice, and none of the other's", () => {
  const sample = brightpathSample;
  const facts = factsOf(sample);
  const run = { topic: "Board exam revision without the panic", clientId: sample.id };
  const plan = { audience: sample.audiences[0], angle: "Calm revision", keyMessage: "Small daily sessions", factIds: ["C1"], cta: "Book a free trial class" };
  const prompts = [
    researchPrompt({ client: sample, run, sources: [], sourceKind: "none", clientPages: [] }),
    planPrompt({ client: sample, run, topicSummary: "x", facts, cautions: [] }),
    writePrompt({ client: sample, run, plan, facts, cautions: [] }),
    checkPrompt({ client: sample, facts, draftText: "Draft text" }),
    revisePrompt({ client: sample, pieceId: "linkedin", pieceJson: "{}", findings: [], facts }),
  ];
  for (const { system, prompt } of prompts) {
    const all = system + "\n" + prompt;
    assert.ok(!/HireLoop/i.test(all), `HireLoop leaked into a sample-client prompt:\n${all.slice(0, 300)}`);
    assert.ok(all.includes("Brightpath"), "the sample client's name is missing");
  }
  // Its facts, not HireLoop's ("48 hours" is HireLoop's shortlist fact).
  const write = prompts[2].prompt;
  assert.ok(write.includes(sample.facts[0].text) && !write.includes("48 hours"));
  // Its voice.
  assert.ok(prompts[2].system.includes(sample.voice.summary));
});

test("the output schemas the model sees name no client", () => {
  for (const schema of [ResearchSchema, PlanSchema, ContentPackSchema]) {
    assert.ok(!/HireLoop/i.test(JSON.stringify(z.toJSONSchema(schema))));
  }
});

test("each client's own rules check its packs", () => {
  const pack = structuredClone(mockFixtures.draft);
  pack.linkedin.body = "We guarantee better marks. Book a free trial class.";
  const sample = lintPack(pack, { client: brightpathSample, facts: factsOf(brightpathSample) });
  assert.ok(sample.some((f) => f.pieceId === "linkedin" && f.kind === "banned_phrase"));
  pack.linkedin.body = "Our AI rejects weak candidates.";
  // HireLoop's rule about the AI deciding doesn't apply to the tutoring client.
  assert.ok(!lintPack(pack, { client: brightpathSample, facts: [] }).some((f) => f.pieceId === "linkedin" && f.kind === "banned_phrase"));
  assert.ok(lintPack(pack, { client: hireloop, facts: [] }).some((f) => f.pieceId === "linkedin" && f.kind === "banned_phrase"));
});

test("a run is for the client it names; unknown clients are refused; old runs are HireLoop's", async () => {
  assert.throws(() => validateInput({ topic: "Any topic here", clientId: "no-such-client" }), /isn't set up/);
  assert.equal(clientById(undefined).id, "hireloop");

  process.env.MOCK_AI = "1";
  const dir = mkdtempSync(path.join(tmpdir(), "hl-clients-"));
  setStore(createFileStore(dir));
  try {
    const run = await runPipeline(validateInput({ topic: "Board exam revision without the panic", clientId: brightpathSample.id }), () => {});
    assert.equal(run.client, brightpathSample.name);
    assert.equal(run.input.clientId, brightpathSample.id);
    // The fact sheet in the run is the sample client's, not HireLoop's.
    assert.deepEqual(
      run.research.facts.filter((f) => f.origin === "client").map((f) => f.text),
      brightpathSample.facts.map((f) => f.text),
    );
  } finally {
    setStore(null);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
