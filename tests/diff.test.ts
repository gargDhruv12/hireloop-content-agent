import { test } from "node:test";
import assert from "node:assert/strict";
import { changed, wordDiff } from "../src/lib/content/diff";

const join = (parts: ReturnType<typeof wordDiff>, keep: "before" | "after") =>
  parts
    .filter((p) => p.kind === "same" || p.kind === (keep === "before" ? "removed" : "added"))
    .map((p) => p.text)
    .join("");

test("a changed word shows as removed and added, the rest stays", () => {
  const parts = wordDiff("Shortlists in 48 hours, guaranteed.", "Shortlists in 48 hours, usually.");
  assert.deepEqual(parts, [
    { kind: "same", text: "Shortlists in 48 hours, " },
    { kind: "removed", text: "guaranteed." },
    { kind: "added", text: "usually." },
  ]);
});

test("the new version rebuilds exactly; the old one apart from spacing", () => {
  const before = "Line one.\n\nLine  two has   spaces.\n- a list";
  const after = "Line one, changed.\n\nLine two has spaces.\n- a list\n- and more";
  const parts = wordDiff(before, after);
  assert.equal(join(parts, "after"), after);
  const words = (s: string) => s.split(/\s+/).filter(Boolean);
  assert.deepEqual(words(join(parts, "before")), words(before));
  // A spacing-only difference is not a change.
  assert.equal(changed(wordDiff("Line  two", "Line two")), false);
});

test("identical text has no changes", () => {
  assert.equal(changed(wordDiff("Same text here.", "Same text here.")), false);
  assert.deepEqual(wordDiff("", ""), []);
});

test("very long fields fall back to whole-field replaced", () => {
  const long = (w: string) => Array.from({ length: 2500 }, (_, i) => `${w}${i}`).join(" ");
  const parts = wordDiff(long("a"), long("b"));
  assert.deepEqual(
    parts.map((p) => p.kind),
    ["removed", "added"],
  );
});
