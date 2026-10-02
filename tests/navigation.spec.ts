import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSnapshot } from "../src/lib/coverage";
import { leaders } from "../src/lib/coverage";
import type { CurrentSnapshot } from "../src/lib/current";
import { playerHref } from "../src/lib/roster";

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
      target.boundingBox(), page.getByRole("navigation", { name: "Site sections" }).boundingBox(),
    ]);
    return content && navigation ? content.y - (navigation.y + navigation.height) : -1;
  }).toBeGreaterThanOrEqual(0);
}

async function expectCurrentSection(page: Page, href: string) {
  const selected = page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute("href", href);
}

for (const width of [320, 390]) {
  test(`site navigation stays available after scrolling and has 44px targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const navigation = page.getByRole("navigation", { name: "Site sections" });
    await expect(navigation.getByRole("link")).toHaveCount(6);
    await expectTouchTargets(navigation.getByRole("link"));
    await expectTouchTargets(page.getByRole("navigation", { name: "In this edition" }).getByRole("link"));

    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(async () => (await page.locator("#top").boundingBox())!.y).toBeLessThan(0);
    await expect.poll(async () => (await navigation.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await navigation.boundingBox())!.y).toBeLessThanOrEqual(2);
    await expect(navigation).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const backToTop = page.locator('footer a[href="#top"]');
    await expectTouchTargets(backToTop);
    await backToTop.click();
    await expect(page).toHaveURL(/#top$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator("#top")).toBeInViewport({ ratio: 1 });
  });
}

test("site navigation updates the current section after route changes and browser back", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectCurrentSection(page, "/");
  const navigation = page.getByRole("navigation", { name: "Site sections" });
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
  await expectCurrentSection(page, "/");
});

test("switching sections from a scrolled page reveals the new heading and browser back retains the section being read", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const navigation = page.getByRole("navigation", { name: "Site sections" });
  await page.getByRole("navigation", { name: "In this edition" }).locator('a[href="#season"]').click();
  const seasonHeading = page.locator("#season > div:first-child");
  await expectBelowNavigation(page, seasonHeading);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const homeUrl = page.url();
  await navigation.locator('a[href="/team"]').click();
  await expect(page).toHaveURL(/\/team$/);
  await expectCurrentSection(page, "/team");
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({ ratio: 1 });
  const newsHeading = page.locator("#news-desk-heading");
  await newsHeading.evaluate((heading) => heading.scrollIntoView({ block: "start", behavior: "instant" }));
  await expectBelowNavigation(page, newsHeading);
  await navigation.locator('a[href="/morgue"]').click();
  await expect(page).toHaveURL(/\/morgue$/);
  await expectCurrentSection(page, "/morgue");
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({ ratio: 1 });
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await expectCurrentSection(page, "/team");
  await expect(newsHeading).toBeInViewport({ ratio: 1 });
  await page.goBack();
  await expect(page).toHaveURL(homeUrl);
  await expectCurrentSection(page, "/");
  await expect(seasonHeading).toBeInViewport({ ratio: 1 });
});

test("front-page shortcuts land on the complete season header, news, and roster below the sticky navigation", async ({ page }) => {
  for (const destination of [
    { href: "#season", target: "#season > div:first-child", pathname: "/" },
    { href: "/team#news", target: "#news-desk-heading", pathname: "/team" },
    { href: "/team#roster", target: "#roster-heading", pathname: "/team" },
  ]) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("navigation", { name: "In this edition" }).locator(`a[href="${destination.href}"]`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(destination.pathname);
    await expect.poll(() => new URL(page.url()).hash).toBe(new URL(destination.href, "https://example.com").hash);
    await expectBelowNavigation(page, page.locator(destination.target));
    await expectCurrentSection(page, destination.pathname);
  }
});

test("team section jumps have clear destinations and leave their headings visible", async ({ page }) => {
  for (const destination of [
    { name: "Season leaders", href: "#season-leaders", heading: "#leaders-heading" },
    { name: "Players & roster", href: "#roster", heading: "#roster-heading" },
    { name: "Team news", href: "#news", heading: "#news-desk-heading" },
  ]) {
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    const navigation = page.getByRole("navigation", { name: "Team coverage sections" });
    await expectTouchTargets(navigation.getByRole("link"));
    const link = navigation.getByRole("link", { name: destination.name, exact: true });
    await expect(link).toHaveAttribute("href", destination.href);
    await link.click();
    await expect.poll(() => new URL(page.url()).hash).toBe(destination.href);
    await expectBelowNavigation(page, page.locator(destination.heading));
  }
});

test("native disclosures toggle visible and accessible labels with Space and Enter while keeping focus", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const summaries = await page.locator("summary.disclosure").filter({ visible: true }).all();
  expect(summaries.length).toBeGreaterThanOrEqual(3);
  for (const summary of summaries) {
    const details = summary.locator("..");
    const closed = summary.locator(".when-closed");
    const open = summary.locator(".when-open");
    const content = details.locator(":scope > :not(summary)").first();
    const closedLabel = (await closed.textContent())!.trim();
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

test("a featured player advertises its profile and opens the matching roster ID", async ({ page }) => {
  const featured = coverage.roster.season === current.season && coverage.roster.status !== "unavailable" && coverage.stats.season === current.season && coverage.stats.status !== "unavailable"
    ? (["passing", "rushing", "receiving"] as const).map((kind) => leaders(coverage.stats, kind)[0]).find((player) => player && coverage.roster.players.some((entry) => entry.id === player.id))
    : undefined;
  test.skip(!featured, "No current-season leader has a verified roster profile in this edition.");
  if (!featured) return;
  await page.goto("/team", { waitUntil: "domcontentloaded" });
  const link = page.locator("main > header").getByRole("link", { name: featured.name, exact: false });
  await expect(link).toHaveAttribute("href", playerHref(featured.id));
  await expect(link.getByText("View profile", { exact: false })).toBeVisible();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("player")).toBe(featured.id);
  await expect(page.getByRole("region", { name: featured.name, exact: true })).toBeVisible();
  await expect(page.locator("#selected-player-heading")).toHaveText(featured.name);
  await expectCurrentSection(page, "/team");
});
