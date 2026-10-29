import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, htmlToText } from "../src/lib/web/fetch-page";
import { mergeFindings, refreshAfterEdit } from "../src/lib/content/findings";
import { hireloop } from "../src/clients/hireloop";
import { mockFixtures } from "../src/lib/ai/mock";
import { setField } from "../src/lib/content/pieces";
import type { Finding } from "../src/lib/content/types";

test("htmlToText keeps the article and drops scripts and navigation", () => {
  const html = `<!doctype html><html><head><title>Hiring news &amp; views</title>
    <meta name="description" content="A report on BPO hiring"></head>
    <body><nav>Home | About</nav><script>track()</script>
    <article><h1>BPO hiring picks up</h1><p>Support centres added roles in Q3.</p>
    <ul><li>Voice roles</li><li>Chat roles</li></ul><a href="/more">Read more</a></article>
    <footer>© News</footer></body></html>`;
  const page = htmlToText(html, "https://news.example.com/a");
  assert.equal(page.title, "Hiring news & views");
  assert.equal(page.description, "A report on BPO hiring");
  assert.match(page.text, /## BPO hiring picks up/);
  assert.match(page.text, /- Voice roles/);
  assert.doesNotMatch(page.text, /track\(\)|Home \| About|© News/);
  assert.deepEqual(page.links[0], { href: "https://news.example.com/more", label: "Read more" });
});

test("only public http(s) links can be fetched", () => {
  assert.ok(assertPublicHttpUrl("https://example.com/post"));
  for (const bad of ["http://localhost:3000", "http://127.0.0.1", "http://192.168.1.5/x", "file:///etc/passwd", "not a url", "http://10.0.0.2"]) {
    assert.throws(() => assertPublicHttpUrl(bad), Error, bad);
  }
});

const f = (over: Partial<Finding>): Finding => ({
  id: "x",
  pieceId: "linkedin",
  kind: "unsupported_claim",
  severity: "block",
  message: "m",
  by: "ai",
  ...over,
});

test("a reviewer finding that repeats a rules finding is dropped", () => {
  const rules = [f({ by: "rules", kind: "untraced_number", excerpt: "70%" })];
  const ai = [f({ excerpt: "70% of applicants" }), f({ pieceId: "blog", excerpt: "something else" })];
  const merged = mergeFindings(rules, ai);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].pieceId, "blog");
});

test("editing the flagged words away clears the reviewer finding", () => {
  const ai = mockFixtures.aiFindings.map((a, i) => f({ ...a, id: `a${i}`, pieceId: a.pieceId as Finding["pieceId"] }));
  const before = refreshAfterEdit(mockFixtures.draft, ai, hireloop, hireloop.facts);
  assert.ok(before.some((x) => x.by === "ai" && x.pieceId === "instagram"));

  const edited = setField(mockFixtures.draft, "instagram.caption", "Interview when it suits you. Even at 11 PM. Try a sample AI interview.");
  const after = refreshAfterEdit(edited, ai, hireloop, hireloop.facts);
  assert.ok(!after.some((x) => x.by === "ai" && x.pieceId === "instagram"));
});
