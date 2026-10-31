import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNumbers, numbersInFacts } from "../src/lib/content/lint";

/** Numbers in `draft` that no fact supports, the way the checker sees them. */
function untraced(draft: string, ...facts: string[]): string[] {
  const allowed = numbersInFacts(facts.map((text) => ({ text })));
  return extractNumbers(draft)
    .filter((n) => !allowed.has(n.value))
    .map((n) => n.raw);
}

const SHORTLIST = "HireLoop takes teams from applicant to shortlist in 48 hours.";

test("a duration in other words still traces to the fact", () => {
  assert.deepEqual(untraced("Get a shortlist in two days.", SHORTLIST), []);
  assert.deepEqual(untraced("A shortlist within 2 days.", SHORTLIST), []);
  assert.deepEqual(untraced("A 48-hour shortlist.", SHORTLIST), []);
  assert.deepEqual(untraced("Shortlists in twenty-four hours.", "Results arrive in 1 day."), []);
});

test("a different duration is still caught, even a small one", () => {
  assert.deepEqual(untraced("A shortlist in 24 hours.", SHORTLIST), ["24 hours"]);
  assert.deepEqual(untraced("A shortlist in one day.", SHORTLIST), ["one day"]);
  assert.deepEqual(untraced("Shortlists in 48 days.", SHORTLIST), ["48 days"]);
  // 15 minutes is not 15 hours, even though both say 15.
  assert.deepEqual(untraced("Skip the 15-minute calls.", "Saves about 15 hours per recruiter every week."), ["15-minute"]);
});

test("durations are strong claims, so an invented one blocks", () => {
  assert.equal(extractNumbers("in 3 days")[0]?.strong, true);
});

test("counting words and rates are not claims", () => {
  assert.deepEqual(extractNumbers("Three ways to hire faster"), []);
  assert.deepEqual(untraced("Save 15 hours a week.", "Saves about 15 hours per recruiter every week."), []);
});

test("lakh, crore and k compare as amounts, not as bare digits", () => {
  assert.deepEqual(untraced("Plans from ₹2.5 lakh a year.", "The plan costs ₹2,50,000 a year."), []);
  assert.deepEqual(untraced("Plans from ₹25k.", "Starter costs ₹24,999 a month."), ["₹25k"]);
  // Before, "₹2.5 lakh" was read as 2.5 and matched any fact containing 2.5.
  assert.deepEqual(untraced("Only ₹2.5 lakh.", "Rated 2.5 by users."), ["₹2.5 lakh"]);
  assert.deepEqual(untraced("A ₹1 crore business.", "Revenue of ₹1,00,00,000."), []);
});

test("percent and ratings in different forms match", () => {
  assert.deepEqual(untraced("15 percent fewer no-shows", "No-shows fell 15%."), []);
  assert.deepEqual(untraced("Rated 4.4 out of 5", "Candidates rate it 4.4/5."), []);
});

test("a unit-less number can still trace to a duration fact", () => {
  assert.deepEqual(untraced("From 12 to 48: that's the change.", "Down to 48 hours from 12 days."), []);
});
