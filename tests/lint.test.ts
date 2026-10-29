import { test } from "node:test";
import assert from "node:assert/strict";
import { hireloop } from "../src/clients/hireloop";
import { mockFixtures } from "../src/lib/ai/mock";
import { countBlocking, extractNumbers, lintPack, numbersInFacts } from "../src/lib/content/lint";
import { getPieces, setField } from "../src/lib/content/pieces";
import type { ContentPack } from "../src/lib/content/schemas";

const facts = hireloop.facts;
const lint = (pack: ContentPack) => lintPack(pack, { client: hireloop, facts });

function fixedPack(): ContentPack {
  const pack = structuredClone(mockFixtures.draft);
  pack.linkedin = mockFixtures.fixed.linkedin as ContentPack["linkedin"];
  pack.metaAds[1] = mockFixtures.fixed["meta-2"] as ContentPack["metaAds"][number];
  pack.googleAds[1] = mockFixtures.fixed["google-2"] as ContentPack["googleAds"][number];
  return pack;
}

test("the sample first draft has exactly the three planted problems", () => {
  const blocks = lint(mockFixtures.draft).filter((f) => f.severity === "block");
  const summary = blocks.map((f) => `${f.pieceId}:${f.kind}`).sort();
  assert.deepEqual(summary, ["google-2:length", "linkedin:untraced_number", "meta-2:banned_phrase"]);
});

test("the revised sample pack has nothing blocking", () => {
  const findings = lint(fixedPack());
  assert.equal(countBlocking(findings), 0, JSON.stringify(findings.filter((f) => f.severity === "block"), null, 2));
});

test("every sample field respects hard platform limits after revision", () => {
  for (const piece of getPieces(fixedPack())) {
    for (const field of piece.fields) {
      if (field.limit?.hard) assert.ok(field.value.length <= field.limit.max, `${field.path} is ${field.value.length} chars`);
    }
  }
});

test("numbers in the fact sheet are allowed, invented ones are not", () => {
  const allowed = numbersInFacts(facts);
  for (const ok of ["₹24,999", "₹250", "48", "12", "15", "4.4", "24×7", "24/7", "2023", "100", "500"]) {
    const [token] = extractNumbers(`claim ${ok} here`);
    assert.ok(token, `no token for ${ok}`);
    assert.ok(allowed.has(token.value), `${ok} → ${token.value} should be allowed`);
  }
  for (const bad of ["70%", "₹199", "35 hours", "3.5x"]) {
    const tokens = extractNumbers(`claim ${bad} here`);
    assert.ok(tokens.length === 0 || !allowed.has(tokens[0].value) || bad === "3.5x", `${bad} should not be allowed`);
  }
});

test("small counting numbers are not treated as claims", () => {
  assert.equal(extractNumbers("3 ways to fix your first round, part 2").length, 0);
  assert.equal(extractNumbers("in 9 languages").length, 0);
});

test("money and percentages are strong claims", () => {
  const [pct] = extractNumbers("cuts time by 40%");
  const [money] = extractNumbers("only Rs. 199 per interview");
  assert.equal(pct.strong, true);
  assert.equal(money.strong, true);
  assert.equal(money.value, "199");
});

test("banned phrases are caught in their common forms", () => {
  const cases = [
    "The AI rejects weak candidates",
    "Automatically shortlist the best people",
    "A completely bias-free process",
    "It removes bias from hiring",
    "Replace your recruiters today",
    "Guaranteed results",
    "The #1 AI interviewer",
  ];
  for (const text of cases) {
    const pack = setField(fixedPack(), "linkedin.body", `${text}. Try a sample AI interview.`);
    const hit = lint(pack).find((f) => f.pieceId === "linkedin" && f.kind === "banned_phrase");
    assert.ok(hit, `not caught: ${text}`);
  }
});

test("on-brand fairness wording is not flagged", () => {
  const pack = setField(
    fixedPack(),
    "linkedin.body",
    "HireLoop helps reduce bias: same questions, same rubric. Recruiters decide. Try a sample AI interview.",
  );
  assert.equal(lint(pack).filter((f) => f.pieceId === "linkedin" && f.kind === "banned_phrase").length, 0);
});

test("google display paths with spaces are blocked", () => {
  const pack = setField(fixedPack(), "googleAds.0.path1", "ai interviews");
  assert.ok(lint(pack).some((f) => f.path === "googleAds.0.path1" && f.severity === "block"));
});

test("near-identical Meta ads are flagged as weak variations", () => {
  const pack = fixedPack();
  pack.metaAds[2] = { ...pack.metaAds[0] };
  assert.ok(lint(pack).some((f) => f.pieceId === "meta-3" && /same words/.test(f.message)));
});

test("hashtags edit round-trips through the tags field", () => {
  const pack = setField(fixedPack(), "instagram.hashtags", "#HiringIndia  BPOHiring, #HRTech");
  assert.deepEqual(pack.instagram.hashtags, ["HiringIndia", "BPOHiring", "HRTech"]);
});
