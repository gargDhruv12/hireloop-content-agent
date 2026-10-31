import { expect, test, type Page } from "@playwright/test";

const TOPIC = "Slow first-round interviews are costing BPOs their best applicants";

/** Make a pack from the home page form, the way a person would, and land on its review page. */
async function newPack(page: Page) {
  await page.goto("/");
  await page.getByLabel("Topic").fill(TOPIC);
  await page.getByRole("button", { name: "Write the content pack" }).click();
  await page.waitForURL(/\/runs\/[a-z0-9-]+/);
  await expect(page.getByRole("tablist", { name: "Pieces" })).toBeVisible();
}

test("a pack made from the home page opens on its research", async ({ page }) => {
  await newPack(page);
  await expect(page.getByRole("heading", { level: 1, name: "Research and plan" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Research and plan/ })).toHaveAttribute("aria-selected", "true");
});

test("tabs switch pieces by click and by arrow key, and the URL follows", async ({ page }) => {
  await newPack(page);
  await page.getByRole("tab", { name: /^Blog post/ }).click();
  await expect(page).toHaveURL(/view=blog/);
  await expect(page.getByRole("heading", { level: 1, name: "Blog post" })).toBeVisible();

  await page.getByRole("tab", { name: /^Blog post/ }).press("ArrowRight");
  await expect(page).toHaveURL(/view=linkedin/);
  await expect(page.getByRole("tab", { name: /^LinkedIn post/ })).toBeFocused();

  // Meta and Google ads both show as "Ad 1"; their full names tell them apart.
  await page.getByRole("tab", { name: /^Google ad 3/ }).click();
  await expect(page).toHaveURL(/view=google-3/);
});

test("approving a piece moves the counter and marks the tab", async ({ page }) => {
  await newPack(page);
  await expect(page.getByText("0 of 11", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Blog post/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Blog post, approved/ })).toBeVisible();
});

test("an edit is re-checked as you type", async ({ page }) => {
  await newPack(page);
  await page.getByRole("tab", { name: /^LinkedIn post/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const body = page.locator(".editor textarea").first();
  await body.fill("Our AI rejects weak candidates so you never have to. Try a 10-minute sample AI interview.");
  // The brand rule "the AI only recommends" fires before anything is saved.
  await expect(page.locator(".margin")).toContainText("breaks a brand rule");
  await page.getByRole("button", { name: "Discard edits" }).click();
  await expect(page.locator(".margin")).not.toContainText("breaks a brand rule");
});

test("the approved pieces download as a zip", async ({ page }) => {
  await newPack(page);
  await page.getByRole("tab", { name: /^Blog post/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download approved" }).click();
  expect((await download).suggestedFilename()).toMatch(/approved-\d{12}\.zip$/);
});

test("no page scrolls sideways", async ({ page }) => {
  await newPack(page);
  for (const path of ["/", page.url()]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `sideways overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test("after a rewrite the reviewer sees what changed and can go back", async ({ page }) => {
  await newPack(page);
  await page.getByRole("tab", { name: /^LinkedIn post/ }).click();
  const proof = page.locator(".sheet .proof").first();
  const original = await proof.innerText();

  await page.getByRole("button", { name: "Ask the agent to rewrite" }).click();
  await page.getByLabel(/What should change/).fill("Make it warmer");
  await page.getByRole("button", { name: "Rewrite this piece" }).click();
  const changes = page.getByRole("region", { name: "What the rewrite changed" });
  // Offline, the rewrite adds a labelled sentence; the panel shows it as added text.
  await expect(changes.locator("ins", { hasText: "Offline sample rewrite: Make it warmer" })).toBeVisible();
  await expect.poll(() => proof.innerText()).not.toBe(original);

  await changes.getByRole("button", { name: "Go back to the previous version" }).click();
  await expect(changes).toBeHidden();
  await expect.poll(() => proof.innerText()).toBe(original);
});

test("a piece fixed by self-revision can be compared with its first draft", async ({ page }) => {
  await newPack(page);
  await page.getByRole("tab", { name: /^LinkedIn post/ }).click();
  await page.getByRole("button", { name: /Compare with the first draft/ }).click();
  const changes = page.getByRole("region", { name: "What self-revision changed" });
  // The sample's first draft had an invented "70%"; self-revision removed it.
  await expect(changes.locator("del", { hasText: "70%" })).toBeVisible();
});

test("all packs: search finds a pack, archive hides it from the home page, restore brings it back", async ({ page }) => {
  await newPack(page);
  const packUrl = new URL(page.url()).pathname;

  await page.goto("/packs");
  await page.getByLabel("Search packs by topic").fill("first-round BPOs");
  const row = page.locator(".packrow").filter({ has: page.locator(`a[href="${packUrl}"]`) });
  await expect(row).toBeVisible();
  await page.getByLabel("Search packs by topic").fill("no such topic anywhere");
  await expect(page.getByText("No packs match.")).toBeVisible();
  await page.getByLabel("Search packs by topic").fill("");

  await row.getByRole("button", { name: "Archive" }).click();
  await expect(row).toBeHidden();
  await page.goto("/");
  await expect(page.locator(`#recent a[href="${packUrl}"]`)).toHaveCount(0);

  // An archived pack says so, and can be restored from its own page.
  await page.goto(packUrl);
  await expect(page.getByText("This pack is archived")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("This pack is archived")).toBeHidden();
  await page.goto("/");
  await expect(page.locator(`#recent a[href="${packUrl}"]`)).toHaveCount(1);
});

test("the theme toggle switches to dark and remembers it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bg()).not.toBe(light);
  // Applied before the first paint on the next load, not after.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
});
