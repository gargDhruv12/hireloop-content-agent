import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, formatInr, runCost } from "../src/lib/ai/pricing";

const base = { textModel: "gemini-3.8-flash", imageModel: "gemini-nano-banana-2.1", hadImage: true };

test("each model is priced at its own rate, on the run's date", () => {
  const usage = {
    inputTokens: 21_000,
    outputTokens: 7_300,
    images: 1,
    byModel: {
      "gemini-3.8-flash": { inputTokens: 20_000, outputTokens: 6_000 },
      "gemini-nano-banana-2.1": { inputTokens: 1_000, outputTokens: 1_300 },
    },
  };
  const oct = costOf(usage, { ...base, day: "2026-10-31" });
  // Flash: 20k × $0.75/M + 6k × $3.75/M = $0.0375. Image: max(1k × $1.50/M + 1.3k × $30/M, 1 × $0.0336) = $0.0405.
  assert.ok(Math.abs(oct.usd - 0.078) < 0.0001, String(oct.usd));
  assert.deepEqual(oct.unpriced, []);
  // Flash doubles on 1 January 2027; a January run pays the new price.
  const jan = costOf(usage, { ...base, day: "2027-01-02" });
  assert.ok(Math.abs(jan.usd - (0.075 + 0.0405)) < 0.0001, String(jan.usd));
});

test("a model with no price on file is named, not guessed", () => {
  const usage = { inputTokens: 10, outputTokens: 10, byModel: { "gemini-3.7-flash": { inputTokens: 10, outputTokens: 10 } } };
  const c = costOf(usage, { ...base, day: "2026-10-31", hadImage: false });
  assert.equal(c.usd, 0);
  assert.deepEqual(c.unpriced, ["gemini-3.7-flash"]);
});

test("older runs without per-model counts are estimated from totals", () => {
  const c = costOf({ inputTokens: 1_000_000, outputTokens: 0 }, { ...base, day: "2026-10-31" });
  assert.equal(c.estimatedFromTotals, true);
  assert.ok(Math.abs(c.usd - (0.75 + 0.0336)) < 1e-9);
});

test("the rupee rate comes from USD_INR", () => {
  process.env.USD_INR = "90";
  try {
    const c = costOf({ inputTokens: 1_000_000, outputTokens: 0, byModel: { "gemini-3.8-flash": { inputTokens: 1_000_000, outputTokens: 0 } } }, { ...base, day: "2026-10-31", hadImage: false });
    assert.equal(c.rate, 90);
    assert.equal(formatInr(c.inr), "₹68"); // $0.75 × 90 = ₹67.50
  } finally {
    delete process.env.USD_INR;
  }
});

test("offline sample runs cost nothing", () => {
  assert.equal(runCost({ createdAt: "2026-10-31", usage: { inputTokens: 5, outputTokens: 5 }, models: { text: "t", image: "i", mock: true } }), null);
});
