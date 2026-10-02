import { test, expect } from "@playwright/test";
import path from "node:path";

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test("season starts with games and reveals one chapter without losing its phase", async ({ page }) => {
  await page.goto("/seasons/2026?keep=context&phase=regular");
  await expect(page.locator("[data-season-chapter][open]")).toHaveCount(1);
  await expect(page.locator('[data-season-chapter="games"]')).toHaveAttribute("open", "");
  await expect(page.locator("[data-advanced-stats]")).not.toBeVisible();
  const tracking = page.locator('[data-season-chapter="tracking"] > summary');
  await tracking.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-advanced-stats]")).toBeVisible();
  await expect(page.locator("[data-season-chapter][open]")).toHaveCount(1);
  expect(new URL(page.url()).hash).toBe("#advanced-evidence");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("context");
  expect(new URL(page.url()).searchParams.get("phase")).toBe("regular");
  await expect(tracking).toBeFocused();
  await page.locator('[data-season-chapter="rankings"] > summary').click();
  await expect(page.locator("[data-season-rankings]")).toBeVisible();
  await expect(page.locator("[data-advanced-stats]")).not.toBeVisible();
  await page.goBack();
  await expect(page.locator("[data-advanced-stats]")).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-season-chapter="tracking"]')).toHaveAttribute("open", "");
});

test("definitions live on their own page and return to the exact ranking context", async ({ page }) => {
  await page.goto("/seasons/2010?keep=football&phase=regular&rank-view=players&rank-metric=passing-yards&rank-q=Sanchez#season-rankings");
  await expect(page.locator("[data-rank-search]")).toHaveValue("Sanchez");
  const before = new URL(page.url());
  const guide = page.locator('[data-season-rankings] footer a[href*="/guide"]');
  await page.evaluate(() => document.fonts.ready);
  await guide.scrollIntoViewIfNeeded();
  const originalScroll = await page.evaluate(() => window.scrollY);
  await guide.click();
  await expect(page.locator("[data-season-guide]")).toHaveAttribute("data-guide-phase", "regular");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The details.");
  const coverage = page.locator("[data-guide-coverage]");
  await expect(coverage).not.toHaveAttribute("open", "");
  await coverage.locator("summary").click();
  await expect(coverage).toContainText("League finals expected");
  await expect(coverage).toContainText("256");
  await page.locator('[data-season-return="context"]').first().click();
  await expect(page).toHaveURL(before.href);
  await expect(page.locator("[data-rank-search]")).toHaveValue("Sanchez");
  await expect(page.locator('[data-season-chapter="rankings"]')).toHaveAttribute("open", "");
  await expect(guide).toBeFocused();
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - originalScroll)).toBeLessThan(3);
});

test("search exposes matches in unopened chapters without changing the selected chapter", async ({ page }) => {
  await page.goto("/seasons/2000?phase=regular");
  await page.locator("[data-season-search]").fill("Elliott");
  await expect(page.locator('[data-season-chapter="games"]')).toHaveAttribute("open", "");
  await expect(page.locator('[data-season-chapter="games"] > summary')).toContainText("0 matches");
  const moments = page.locator('[data-season-chapter="moments"]');
  const count = await moments.locator("[data-season-fact]").count();
  expect(count).toBeGreaterThan(0);
  await expect(moments.locator("summary")).toContainText(`${count} ${count === 1 ? "match" : "matches"}`);
  await moments.locator("summary").click();
  await expect(moments.locator("[data-season-fact]").first()).toBeVisible();
});

test("memorable play study preserves the season context through the Film Room", async ({ page }) => {
  await page.goto("/seasons/2000?phase=regular#season-memories-heading");
  const study = page.locator('[data-season-fact] a[href^="/film-room"]').first();
  await expect(study).toBeVisible();
  const before = page.url();
  await study.click();
  await expect(page).toHaveURL(/\/film-room\?.*#jets-play:/);
  await expect(page.locator('[data-season-return="context"]')).toHaveText("← Back to 2000");
  await page.locator('[data-season-return="context"]').click();
  await expect(page).toHaveURL(before);
  await expect(study).toBeFocused();
});

test("game tape returns to the selected season, playoff search and game chapter", async ({ page }) => {
  await page.goto("/seasons/2010?phase=playoffs&q=NE#season-results-heading");
  const before = page.url();
  await page.locator('[data-season-case="2010_19_NYJ_NE"]').click();
  await expect(page.locator('[data-season-return="context"]')).toHaveText("← Back to 2010");
  await expect(page.getByText("Selected by Jets-oriented", { exact: false })).not.toBeVisible();
  await page.locator('[data-season-return="context"]').click();
  await expect(page).toHaveURL(before);
  await expect(page.locator("[data-season-search]")).toHaveValue("NE");
  await expect(page.locator("[data-season-game]")).toHaveCount(1);
});

test("return destinations cannot navigate outside the season archive", async ({ page }) => {
  for (const value of ["https://evil.example/seasons/2010", "//evil.example/seasons/2010", "/team", "/seasons/2026?phase=regular"]) {
    await page.goto(`/seasons/2010/guide?return=${encodeURIComponent(value)}`);
    await expect(page.locator('[data-season-return="fallback"]').first()).toHaveAttribute("href", "/seasons/2010");
  }
});

test("native chapter disclosures retain exploration without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? "3107"}/seasons/2010`);
  await expect(page.locator("[data-season-rankings]")).not.toBeVisible();
  await page.locator('[data-season-chapter="rankings"] > summary').click();
  await expect(page.locator("[data-season-rankings]")).toBeVisible();
  await expect(page.locator("[data-season-game]").first()).not.toBeVisible();
  await expect(page.locator('[data-season-chapter="rankings"] > summary').locator('[aria-hidden="true"]')).toHaveCSS("display", "grid");
  expect(await page.locator('[data-season-chapter="rankings"] > summary [aria-hidden="true"]').evaluate((element) => getComputedStyle(element, "::before").content)).toBe('"−"');
  expect(await page.locator('[data-season-chapter="games"] > summary [aria-hidden="true"]').evaluate((element) => getComputedStyle(element, "::before").content)).toBe('"+"');
  await context.close();
});

test("chapters and the guide remain readable and keyboard accessible with doubled text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/seasons/2026?phase=regular#advanced-evidence");
  await page.addStyleTag({ content: "html{font-size:200%!important}body{font-size:32px!important}" });
  await page.evaluate(() => document.fonts.ready);
  for (const target of await page.locator("[data-season-chapter] > summary").all()) expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (node: Document, options: unknown) => Promise<{ violations: unknown[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations);
  expect(violations).toEqual([]);
  await page.goto("/seasons/2026/guide?phase=regular#tracking");
  await page.addStyleTag({ content: "html{font-size:200%!important}body{font-size:32px!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
