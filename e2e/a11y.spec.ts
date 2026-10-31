import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Automated accessibility checks (axe-core, WCAG 2.1 AA) on every page, in
 * both themes, plus reduced motion. This doesn't replace a screen-reader pass,
 * but it catches contrast, names, roles and structure on every change.
 */
const TOPIC = "Slow first-round interviews are costing BPOs their best applicants";

async function newPack(page: Page) {
  await page.goto("/");
  await page.getByLabel("Topic").fill(TOPIC);
  await page.getByRole("button", { name: "Write the content pack" }).click();
  await page.waitForURL(/\/runs\/[a-z0-9-]+/);
  return new URL(page.url()).pathname;
}

async function scan(page: Page, label: string) {
  // Let entrance animations finish: axe measures colours as they are on screen.
  await page.waitForTimeout(1200);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× e.g. ${v.nodes[0]?.target.join(" ")}`);
  expect(report, `${label}\n${report.join("\n")}`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("home, all packs and a pack's pages pass axe", async ({ page }) => {
      const pack = await newPack(page);
      await page.goto("/");
      await scan(page, `home (${scheme})`);
      await page.goto("/packs");
      await scan(page, `all packs (${scheme})`);
      for (const view of ["research", "blog", "google-1", "image"]) {
        await page.goto(`${pack}?view=${view}`);
        await scan(page, `pack view ${view} (${scheme})`);
      }
    });
  });
}

test("with reduced motion, nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pack = await newPack(page);
  for (const path of ["/", pack]) {
    await page.goto(path);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running, `animations running on ${path}`).toBe(0);
  }
});
