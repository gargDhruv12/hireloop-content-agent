import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, htmlToText, isPrivateIp } from "../src/lib/web/fetch-page";
import { groundFacts, groundingProblem } from "../src/lib/content/grounding";
import { lintPack } from "../src/lib/content/lint";
import { approvedMarkdown } from "../src/lib/content/export";
import { hireloop } from "../src/clients/hireloop";
import { mockFixtures } from "../src/lib/ai/mock";
import type { ContentPack } from "../src/lib/content/schemas";
import type { Run } from "../src/lib/content/types";

// ── Page reader ──────────────────────────────────────────────────────

test("public hostnames that start like IPv6 prefixes are allowed (issue #1)", () => {
  for (const ok of [
    "https://fde-client-company-demos.aaryanptl.chatgpt.site/hireloop",
    "https://fda.gov",
    "https://fdic.gov/news",
    "https://fcbarcelona.com",
    "https://febreze.com",
  ]) {
    assert.doesNotThrow(() => assertPublicHttpUrl(ok), ok);
  }
});

test("private IPv6 literals are still refused", () => {
  for (const bad of ["http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/", "http://[::1]:3000/"]) {
    assert.throws(() => assertPublicHttpUrl(bad), Error, bad);
  }
  assert.equal(isPrivateIp("fda.gov"), false, "a hostname is never an IP");
  assert.equal(isPrivateIp("fd12::1"), true);
});

test("meta descriptions with an apostrophe are read in full (issue #9)", () => {
  const body = `<p>${"word ".repeat(60)}</p>`;
  const double = htmlToText(`<meta name="description" content="HireLoop's AI interviewer runs first rounds"><body>${body}</body>`, "https://a.com");
  assert.equal(double.description, "HireLoop's AI interviewer runs first rounds");
  const single = htmlToText(`<meta property="og:description" content='Say "hello" to faster hiring'><body>${body}</body>`, "https://a.com");
  assert.equal(single.description, 'Say "hello" to faster hiring');
});

// ── Grounding ────────────────────────────────────────────────────────

const page = `Support centres in India added 12,000 roles last quarter. Attrition stayed near 40% in voice
processes, according to the survey. Hiring teams said first rounds took “about two weeks”.`;

test("a fact whose quote is in the page is kept, despite formatting differences (issue #2)", () => {
  assert.equal(groundingProblem({ text: "Attrition was about 40% in voice roles.", quote: "Attrition stayed near 40% in voice processes" }, page), null);
  // Curly vs straight quotes and line breaks don't count as a mismatch.
  assert.equal(groundingProblem({ text: "First rounds took about two weeks.", quote: 'took "about two weeks"' }, page), null);
});

test("an invented quote is rejected, so its number can't be whitelisted (issue #2)", () => {
  const out = groundFacts(
    [
      { text: "Centres added 12,000 roles.", quote: "added 12,000 roles last quarter" },
      { text: "AI cut hiring time by 70%.", quote: "AI interviews cut hiring time by 70%" },
    ],
    () => page,
    () => "https://news.example.com/a",
  );
  assert.equal(out.kept.length, 1);
  assert.equal(out.rejected.length, 1);
  assert.match(out.rejected[0].reason, /isn't in the page/);
});

test("a fact that adds a number its quote doesn't have is rejected", () => {
  const problem = groundingProblem({ text: "Attrition hit 55% in voice roles.", quote: "Attrition stayed near 40% in voice processes" }, page);
  assert.match(problem ?? "", /55%/);
});

// ── Citations ────────────────────────────────────────────────────────

test("citing a fact id that doesn't exist blocks the piece (issue #4)", () => {
  const pack: ContentPack = structuredClone(mockFixtures.draft);
  pack.blog.factIds = ["C1", "C99"];
  const findings = lintPack(pack, { client: hireloop, facts: hireloop.facts });
  const hit = findings.find((f) => f.pieceId === "blog" && f.kind === "citation");
  assert.equal(hit?.severity, "block");
  assert.match(hit?.message ?? "", /C99/);
});

test("a piece with numbers but no citations gets a warning", () => {
  const pack: ContentPack = structuredClone(mockFixtures.draft);
  pack.linkedin.factIds = [];
  const hit = lintPack(pack, { client: hireloop, facts: hireloop.facts }).find((f) => f.pieceId === "linkedin" && f.kind === "citation");
  assert.equal(hit?.severity, "warn");
});

// ── Review record ────────────────────────────────────────────────────

test("the export lists the latest approval of each approved piece, with overrides (issue #11)", () => {
  const run = {
    client: "HireLoop",
    createdAt: "2026-10-30T10:00:00.000Z",
    input: { topic: "Faster first rounds" },
    plan: { angle: "Speed without losing fairness" },
    research: { facts: hireloop.facts.map((f) => ({ ...f, origin: "client", ref: f.where, relevant: true })) },
    pack: mockFixtures.draft,
    review: { blog: "approved", linkedin: "pending" },
    reviewLog: [
      { piece: "blog", status: "approved", at: "2026-10-30T10:05:00.000Z", blockingAtDecision: 0, textHash: "a".repeat(64) },
      { piece: "linkedin", status: "approved", at: "2026-10-30T10:06:00.000Z", blockingAtDecision: 1, textHash: "b".repeat(64) },
      { piece: "linkedin", status: "pending", at: "2026-10-30T10:07:00.000Z", blockingAtDecision: 1, textHash: "b".repeat(64) },
      { piece: "blog", status: "approved", at: "2026-10-30T10:08:00.000Z", blockingAtDecision: 2, textHash: "c".repeat(64) },
    ],
  } as unknown as Run;
  const md = approvedMarkdown(run, run.pack);
  assert.match(md, /## Review record/);
  assert.match(md, /\| blog \| .* \| 2 \| `cccccccccccc` \|/, "only the latest blog approval, showing the override");
  assert.doesNotMatch(md, /\| linkedin \|/, "a piece sent back to pending isn't listed");
});
