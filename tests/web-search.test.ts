import { test } from "node:test";
import assert from "node:assert/strict";
import { groundAcross } from "../src/lib/pipeline/research";
import { researchPrompt } from "../src/lib/pipeline/prompts";
import { hireloop } from "../src/clients/hireloop";
import type { PageText } from "../src/lib/web/fetch-page";

const page = (url: string, text: string): PageText => ({ url, title: url, description: "", text, links: [] });
const pages = [
  page("https://news.example/a", "Hiring in India's support sector rose 18% this quarter, a survey of 500 firms found."),
  page("https://gov.example/b", "The Digital Personal Data Protection Act applies to candidate data collected online."),
];

test("each fact from a search is credited to the page its quote is on", () => {
  const { kept, rejected } = groundAcross(
    [
      { text: "Support-sector hiring in India rose 18% this quarter.", quote: "rose 18% this quarter", url: "https://news.example/a" },
      // The model named the wrong page; the quote decides.
      { text: "The DPDP Act covers candidate data collected online.", quote: "applies to candidate data collected online", url: "https://news.example/a" },
    ],
    pages,
  );
  assert.equal(rejected.length, 0);
  assert.deepEqual(kept.map((f) => f.ref), ["https://news.example/a", "https://gov.example/b"]);
});

test("a search fact must still be on a page, with no added numbers", () => {
  const { kept, rejected } = groundAcross(
    [
      { text: "Hiring rose 25% this year.", quote: "hiring rose 25% this year" },
      { text: "Hiring rose 18% across 900 firms.", quote: "rose 18% this quarter" },
    ],
    pages,
  );
  assert.equal(kept.length, 0);
  assert.match(rejected[0].reason, /isn't in the page/);
  assert.match(rejected[1].reason, /adds "900"/);
});

test("with no pages read, every outside fact is dropped", () => {
  const { kept, rejected } = groundAcross([{ text: "x", quote: "anything at all here" }], []);
  assert.equal(kept.length, 0);
  assert.equal(rejected.length, 1);
});

test("the research prompt labels search results and lists every page", () => {
  const { prompt } = researchPrompt({ client: hireloop, run: { topic: "Hiring news" }, sources: pages, sourceKind: "search", clientPages: [] });
  assert.match(prompt, /Pages found by web search/);
  assert.ok(prompt.includes("https://news.example/a") && prompt.includes("https://gov.example/b"));
  const none = researchPrompt({ client: hireloop, run: { topic: "Hiring news" }, sources: [], sourceKind: "none", clientPages: [] });
  assert.match(none.prompt, /sourceFacts must be an empty list/);
});
