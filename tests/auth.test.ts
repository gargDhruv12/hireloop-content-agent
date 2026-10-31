import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { parseUsers, proxy } from "../src/proxy";
import { approvedMarkdown } from "../src/lib/content/export";
import { reviewEntry } from "../src/lib/store/review-log";
import { mockFixtures } from "../src/lib/ai/mock";
import type { Run } from "../src/lib/content/types";

const basic = (name: string, password: string) => `Basic ${Buffer.from(`${name}:${password}`).toString("base64")}`;

/** Call the sign-in check; return the status and the reviewer the app would see. */
function call(env: { APP_USERS?: string; APP_PASSWORD?: string }, headers: Record<string, string> = {}) {
  const saved = { u: process.env.APP_USERS, p: process.env.APP_PASSWORD };
  process.env.APP_USERS = env.APP_USERS ?? "";
  process.env.APP_PASSWORD = env.APP_PASSWORD ?? "";
  try {
    const res = proxy(new NextRequest("http://desk.test/", { headers }));
    // NextResponse.next({ request: { headers } }) forwards request headers with this prefix.
    const name = res.headers.get("x-middleware-request-x-hl-reviewer");
    return {
      status: res.status,
      reviewer: name ? decodeURIComponent(name) : null,
      verified: res.headers.get("x-middleware-request-x-hl-reviewer-verified") === "1",
    };
  } finally {
    process.env.APP_USERS = saved.u;
    process.env.APP_PASSWORD = saved.p;
  }
}

test("named users sign in with their own password, and the app sees a verified name", () => {
  const env = { APP_USERS: `Asha:tea-garden-9, Ravi:sha256:${createHash("sha256").update("monsoon-42").digest("hex")}` };
  assert.deepEqual(call(env, { authorization: basic("asha", "tea-garden-9") }), { status: 200, reviewer: "Asha", verified: true });
  assert.deepEqual(call(env, { authorization: basic("Ravi", "monsoon-42") }), { status: 200, reviewer: "Ravi", verified: true });
  assert.equal(call(env, { authorization: basic("Asha", "wrong") }).status, 401);
  assert.equal(call(env, { authorization: basic("Mallory", "tea-garden-9") }).status, 401);
  assert.equal(call(env).status, 401);
});

test("the shared password lets any name in, recorded as unverified", () => {
  const env = { APP_PASSWORD: "team-secret" };
  assert.deepEqual(call(env, { authorization: basic("Priya", "team-secret") }), { status: 200, reviewer: "Priya", verified: false });
  assert.equal(call(env, { authorization: basic("Priya", "nope") }).status, 401);
  // A named user's own password wins over the shared one for that name.
  const both = { APP_USERS: "Asha:own-pass", APP_PASSWORD: "team-secret" };
  assert.equal(call(both, { authorization: basic("Asha", "team-secret") }).status, 401);
});

test("a reviewer name sent from outside is never trusted", () => {
  const spoof = { "x-hl-reviewer": "CEO", "x-hl-reviewer-verified": "1" };
  // With sign-in off, the header is stripped.
  assert.deepEqual(call({}, spoof), { status: 200, reviewer: null, verified: false });
  // With sign-in on, the verified name replaces it.
  assert.deepEqual(call({ APP_USERS: "Asha:pw" }, { ...spoof, authorization: basic("Asha", "pw") }), { status: 200, reviewer: "Asha", verified: true });
});

test("users are parsed from APP_USERS, ignoring malformed entries", () => {
  assert.deepEqual(parseUsers(" Asha : one ,bad, :x, Ravi:two:with-colon"), [
    { name: "Asha", secret: "one" },
    { name: "Ravi", secret: "two:with-colon" },
  ]);
});

test("approvals record who made them, and the export shows it", () => {
  const run = {
    id: "who-run-01",
    createdAt: "2026-10-31T09:00:00.000Z",
    client: "HireLoop",
    input: { topic: "Who approved" },
    models: { text: "t", writer: "w", image: "i", mock: true },
    research: { topicSummary: "", facts: [], cautions: [], pagesRead: [] },
    plan: mockFixtures.plan,
    pack: mockFixtures.draft,
    findings: [],
    review: { blog: "approved", linkedin: "approved" },
    timings: {},
  } as Run;
  run.reviewLog = [
    reviewEntry(run, "blog", "approved", { name: "Asha", verified: true }),
    reviewEntry(run, "linkedin", "approved", { name: "priya", verified: false }),
  ];
  assert.equal(run.reviewLog[0].by, "Asha");
  const md = approvedMarkdown(run, run.pack);
  assert.match(md, /\| Piece \| Approved \| By \|/);
  assert.match(md, /\| blog \| .* \| Asha \|/);
  assert.match(md, /\| linkedin \| .* \| priya \(unverified\) \|/);
});
