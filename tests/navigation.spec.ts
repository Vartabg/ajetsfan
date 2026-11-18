import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSnapshot } from "../src/lib/coverage";
import { leaders } from "../src/lib/coverage";
import type { CurrentSnapshot } from "../src/lib/current";
import { SECTIONS } from "../src/lib/site-sections";

const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const imageFixture = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>';

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Navigation and geometry must not depend on the external photograph hosts.
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: imageFixture }));
});

async function expectTouchTargets(links: Locator) {
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box, `A visible hit area for ${await link.innerText()}`).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectBelowNavigation(page: Page, target: Locator) {
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => {
    const [content, navigation] = await Promise.all([
      target.boundingBox(), page.locator("[data-focus-page] > header").boundingBox(),
    ]);
    // Hash-target offsets can round to a fractional CSS pixel beneath the bar.
    return content && navigation ? Math.round(content.y - (navigation.y + navigation.height)) : -1;
  }).toBeGreaterThanOrEqual(0);
}

async function expectCurrentSection(page: Page, href: string) {
  const selected = page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute("href", href);
}

for (const width of [320, 390]) {
  test(`both navigation shortcuts stay available after scrolling and have 44px targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/history", { waitUntil: "domcontentloaded" });
    if (width === 320) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const navigation = page.getByRole("navigation", { name: "Site sections" });
    await expect(navigation.getByRole("link")).toHaveCount(SECTIONS.length);
    await expectTouchTargets(navigation.getByRole("link"));

    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(async () => (await page.locator("#fan-stand").boundingBox())!.y).toBeLessThan(0);
    const bar = page.locator("[data-focus-page] > header");
    await expect.poll(async () => (await bar.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await bar.boundingBox())!.y).toBeLessThanOrEqual(2);
    await expect(bar).toBeInViewport({ ratio: 1 });
    const browse = bar.getByRole("link", { name: "Browse sections", exact: true });
    const onThisPage = bar.getByRole("link", { name: "On this page", exact: true });
    await expectTouchTargets(bar.getByRole("link"));
    expect(await bar.getByRole("link").evaluateAll((links) => new Set(links.map((link) => link.getBoundingClientRect().top)).size)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const before = await page.evaluate(() => scrollY);
    // Click the fixed on-screen hit area without asking Playwright to scroll the sticky bar.
    const opener = (await browse.boundingBox())!;
    await page.mouse.click(opener.x + opener.width / 2, opener.y + opener.height / 2);
    const directory = page.getByRole("dialog", { name: "Browse sections" });
    await expect(directory).toBeVisible();
    await expect(browse).toHaveAttribute("aria-expanded", "true");
    const search = directory.getByRole("link", { name: "Find a game" });
    await expect(search).toBeInViewport({ ratio: 1 });
    await expectTouchTargets(search);
    const menuSections = directory.getByRole("navigation", { name: "All sections" }).getByRole("link");
    await expect(menuSections).toHaveCount(SECTIONS.length);
    await expect(menuSections.filter({ hasText: /^History/ })).toHaveAttribute("aria-current", "page");
    await expectTouchTargets(menuSections);
    await expectTouchTargets(directory.getByRole("button", { name: "Close", exact: true }));
    expect(await directory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(directory).toBeHidden();
    await expect(browse).toHaveAttribute("aria-expanded", "false");
    await expect(browse).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(before);

    await page.keyboard.press("Tab");
    await expect(onThisPage).toBeFocused();
    await page.keyboard.press("Enter");
    const index = page.getByRole("dialog", { name: "On this page" });
    const firstMoment = index.getByRole("navigation", { name: "On this page" }).getByRole("link").first();
    await expectTouchTargets(firstMoment);
    await firstMoment.press("Enter");
    await expect(index).toBeHidden();
    await expect(page).toHaveURL(/#fan-stand$/);
    await expect(page.locator("#fan-stand")).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(56);
  });
}

test("the desktop directory opens beside the page index and puts game search first", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/team/roster");
  const rail = page.locator("aside").filter({ has: page.getByRole("navigation", { name: "On this page" }) });
  await rail.getByRole("link", { name: "ajetsfan" }).focus();
  await page.keyboard.press("Tab");
  const browse = rail.getByRole("link", { name: "Browse sections" });
  await expect(browse).toBeFocused();
  await page.keyboard.press("Enter");
  const directory = page.getByRole("dialog", { name: "Browse sections" });
  await expect(directory.getByRole("link", { name: /^Team / })).toHaveAttribute("aria-current", "page");
  const close = directory.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  const search = directory.getByRole("link", { name: "Find a game" });
  await expect(search).toBeInViewport({ ratio: 1 });
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("href", "/find");
  await close.click();
  await expect(directory).toBeHidden();
  await expect(browse).toBeFocused();
  await page.keyboard.press("Enter");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/find$/);
  await expect(page.getByRole("searchbox", { name: "Search games" })).toBeVisible();
});

test("without JavaScript both phone shortcuts open their fragment destinations", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 }, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/history");
    await page.getByRole("link", { name: "On this page", exact: true }).click();
    await expect(page).toHaveURL(/#focus-page-index$/);
    const index = page.getByRole("navigation", { name: "On this page", exact: true });
    await expect(index).toBeVisible();
    await index.locator('a[href="#fan-stand"]').click();
    await expect(page).toHaveURL(/#fan-stand$/);
    await expect(index).toBeHidden();
    await page.getByRole("link", { name: "Browse sections" }).click();
    await expect(page).toHaveURL(/#more$/);
    const fallback = page.locator("#more");
    await expect(fallback.getByRole("link", { name: "Find a game" })).toHaveAttribute("href", "/find");
    await fallback.getByRole("link", { name: /^Game Day/ }).click();
    await expect(page).toHaveURL(/\/game-day$/);
  } finally {
    await context.close();
  }
});

test("site navigation updates the current section after route changes and browser back", async ({ page }) => {
  await page.goto("/history", { waitUntil: "domcontentloaded" });
  await expectCurrentSection(page, "/history");
  const navigation = page.getByRole("navigation", { name: "Site sections" });
  await navigation.locator('a[href="/history/trades"]').click();
  await expect(page).toHaveURL(/\/history\/trades$/);
  await expectCurrentSection(page, "/history/trades");
  await page.goBack();
  await expect(page).toHaveURL(/\/history$/);
  await expectCurrentSection(page, "/history");
  await navigation.locator('a[href="/team"]').click();
  await expect(page).toHaveURL(/\/team$/);
  await expectCurrentSection(page, "/team");
  await navigation.locator('a[href="/morgue"]').click();
  await expect(page).toHaveURL(/\/morgue$/);
  await expectCurrentSection(page, "/morgue");
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await expectCurrentSection(page, "/team");
  await page.goBack();
  await expectCurrentSection(page, "/history");
});

test("a destination opens at its heading and Back restores the home page's place", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const link = page.getByRole("navigation", { name: "Site sections" }).locator('a[href="/media"]');
  await link.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(500);
  await link.click();
  await expectCurrentSection(page, "/media");
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(link).toBeInViewport();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(30);
});

test("legacy Team bookmarks keep filters and lead to a focused page", async ({ page }) => {
  for (const [hash, destination, heading] of [
    ["#news", "/team/news", "#news-desk-heading"],
    ["#roster", "/team/roster", "#roster-heading"],
    ["#season-leaders", "/team/stats", "#leaders-heading"],
  ]) {
    await page.goto(`/team?keep=context${hash}`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(destination);
    expect(new URL(page.url()).searchParams.get("keep")).toBe("context");
    await expectBelowNavigation(page, page.locator(heading));
    await expectCurrentSection(page, "/team");
  }
});

test("native disclosures toggle visible and accessible labels with Space and Enter while keeping focus", async ({ page }) => {
  await page.goto("/game-day", { waitUntil: "domcontentloaded" });
  // The ticket form renders after hydration, ahead of the schedule: wait for it, then find each summary by its own label.
  await expect(page.getByText("Checking this fixture’s ticket window…")).toHaveCount(0);
  const closedLabels = (await page.locator("summary.disclosure").filter({ visible: true }).locator(".when-closed").allTextContents()).map((label) => label.trim());
  expect(closedLabels.length).toBeGreaterThanOrEqual(3);
  for (const closedLabel of closedLabels) {
    const summary = page.locator("summary.disclosure").filter({ hasText: closedLabel });
    const details = summary.locator("..");
    const closed = summary.locator(".when-closed");
    const open = summary.locator(".when-open");
    const content = details.locator(":scope > :not(summary)").first();
    const openLabel = (await open.textContent())!.trim();
    expect(closedLabel).not.toBe(openLabel);
    await expect(details).not.toHaveAttribute("open", "");
    await expect(closed).toBeVisible();
    await expect(open).toBeHidden();
    await expect(content).toBeHidden();
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(details).toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
    await expect(open).toBeVisible();
    await expect(closed).toBeHidden();
    await expect(content).toBeVisible();
    await expect(summary).toHaveAccessibleName(new RegExp(openLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
    await expect(closed).toBeVisible();
    await expect(open).toBeHidden();
    await expect(content).toBeHidden();
    await expect(summary).toHaveAccessibleName(new RegExp(closedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("a leader's name on the Team page opens the matching player page", async ({ page }) => {
  const featured = coverage.roster.season === current.season && coverage.roster.status !== "unavailable" && coverage.stats.season === current.season && coverage.stats.status !== "unavailable"
    ? (["passing", "rushing", "receiving"] as const).map((kind) => leaders(coverage.stats, kind)[0]).find((player) => player && coverage.roster.players.some((entry) => entry.id === player.id))
    : undefined;
  test.skip(!featured, "No current-season leader has a verified roster profile in this edition.");
  if (!featured) return;
  await page.goto("/team", { waitUntil: "domcontentloaded" });
  const link = page.locator("#leaders").getByRole("link", { name: featured.name, exact: true });
  await expect(link).toHaveAttribute("href", `/players/${featured.id}`);
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/players/${featured.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(featured.name);
  await expect(page.locator('[data-focus-page="player"]')).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("#top")).toHaveCount(0);
  await expectCurrentSection(page, "/team");
});
