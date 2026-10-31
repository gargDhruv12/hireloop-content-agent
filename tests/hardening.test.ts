import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, htmlToText, isPrivateIp, pinnedRequest, safeLookup } from "../src/lib/web/fetch-page";
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

test("the socket connects only to the address that passed the check (no DNS rebinding)", async () => {
  // A local server stands in for an internal machine. The hostile DNS answers with its address.
  const { createServer } = await import("node:http");
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.end("internal secrets");
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  try {
    const rebinding = async () => [{ address: "127.0.0.1", family: 4 }];
    await assert.rejects(
      pinnedRequest(new URL(`http://public.example:${port}/`), new AbortController().signal, rebinding),
      /private or local/,
    );
    assert.equal(hits, 0);
  } finally {
    server.close();
  }
});

test("the checked lookup passes public addresses through, honouring the requested family", async () => {
  const lookup = safeLookup(async () => [
    { address: "93.184.215.14", family: 4 },
    { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
  ]);
  const one = await new Promise<[string, number]>((ok, fail) =>
    lookup("example.com", { family: 6 }, (err, address, family) => (err ? fail(err) : ok([address as string, family as number]))),
  );
  assert.deepEqual(one, ["2606:2800:21f:cb07:6820:80da:af6b:8b2c", 6]);
  const all = await new Promise<unknown>((ok, fail) =>
    lookup("example.com", { all: true }, (err, addresses) => (err ? fail(err) : ok(addresses))),
  );
  assert.equal((all as unknown[]).length, 2);
});

test("a true quote still matches when it leaves out footnotes or an acronym aside", () => {
  const page = "Internet-based recruitment is now widespread, including the use of artificial intelligence (AI). [ 1 ]\n\n## Process\n[ edit ]";
  const fact = { text: "AI is widely used in online recruitment.", quote: "Internet-based recruitment is now widespread, including the use of artificial intelligence." };
  assert.equal(groundingProblem(fact, page), null);
  // A meaningful aside is not dropped: the quote must not lose a "(not)".
  assert.match(groundingProblem({ text: "x", quote: "this approach is reliable for hiring" }, "this approach is (not) reliable for hiring") ?? "", /isn't in the page/);
  // And a number the page puts in an aside still can't be invented in the fact.
  assert.match(groundingProblem({ text: "Rules from 2023 apply to hiring", quote: "the data protection act applies" }, "the data protection act (2023) applies") ?? "", /adds "2023"/);
});

test("Wikipedia footnote links and [edit] buttons don't reach the model", () => {
  const html = `<main><h2>Process<span class="mw-editsection"><span>[</span><a href="/e">edit</a><span>]</span></span></h2><p>Recruiting is common.<sup class="reference"><a href="#c1">[1]</a></sup> More text here.</p></main>`;
  const { text } = htmlToText(html, "https://en.wikipedia.org/wiki/Recruitment");
  assert.ok(!/\[\s*1\s*\]/.test(text), text);
  assert.ok(!/edit/i.test(text), text);
  assert.match(text, /Recruiting is common\. More text here\./);
});

test("a blog that ignores the supplied article gets a warning", () => {
  const facts = [...hireloop.facts, { id: "S1", text: "Standardized tests support fair selection." }];
  const pack = structuredClone(mockFixtures.draft) as ContentPack;
  pack.blog.factIds = ["C8"];
  const warn = lintPack(pack, { client: hireloop, facts }).find((f) => f.pieceId === "blog" && f.kind === "citation");
  assert.equal(warn?.severity, "warn");
  pack.blog.factIds = ["C8", "S1"];
  assert.ok(!lintPack(pack, { client: hireloop, facts }).some((f) => f.pieceId === "blog" && /article you supplied/.test(f.message)));
});

test("a quote stitched with an ellipsis passes only when every part is on the page, in order", () => {
  const page = "In 2023 total technology industry revenue was US$282.6 billion, up 9%. The sector employed 5.8 million people.";
  const fact = { text: "The sector employed 5.8 million people on US$282.6 billion of revenue.", quote: "revenue was US$282.6 billion... The sector employed 5.8 million people." };
  assert.equal(groundingProblem(fact, page), null);
  // Parts out of order, or one part invented, still fail.
  assert.match(groundingProblem({ ...fact, quote: "The sector employed 5.8 million people ... revenue was US$282.6 billion" }, page) ?? "", /isn't in the page/);
  assert.match(groundingProblem({ ...fact, quote: "revenue was US$282.6 billion... employed 9 million people" }, page) ?? "", /isn't in the page/);
  // A tiny part can't carry a quote.
  assert.match(groundingProblem({ ...fact, quote: "revenue was US$282.6 billion... up 9%" }, page) ?? "", /too short/);
});
