import { test, expect } from "@playwright/test";

const imageFixture = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: imageFixture }));
});

test("roster, stats and news keep the team tabs, and Overview opens the focus page at its top", async ({ page }) => {
  await page.goto("/team/roster");
  await expect(page.locator('[data-focus-page="team-roster"]')).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("#top")).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "Team sections", exact: true });
  for (const [label, href] of [["Overview", "/team"], ["Roster", "/team/roster"], ["Player stats", "/team/stats"], ["News", "/team/news"]]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  }
  await expect(navigation.getByRole("link", { name: "Roster", exact: true })).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("link", { name: "Overview", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/team");
  await expect(page.locator("#news, #season-leaders, #roster")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test("team navigation keeps the selected page and breadcrumb correct through browser history", async ({ page }) => {
  await page.goto("/team/news");
  const navigation = page.getByRole("navigation", { name: "Team sections", exact: true });
  for (const [label, path, heading, content] of [
    ["Roster", "/team/roster", "The roster.", "#roster"],
    ["Player stats", "/team/stats", "Player stats.", "#season-leaders"],
    ["News", "/team/news", "Team news.", "#news"],
  ]) {
    await navigation.getByRole("link", { name: label, exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator("[data-focus-page]")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("#top")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(page.locator(content)).toBeVisible();
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(label);
    await expect(page.getByRole("navigation", { name: "Breadcrumb", exact: true }).locator('[aria-current="page"]')).toHaveText(label);
    await expect(page.getByRole("navigation", { name: "Site sections", exact: true }).locator('[aria-current="page"]')).toHaveAttribute("href", "/team");
  }
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/team/stats");
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Player stats");
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/team/roster");
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Roster");
});

test("player pages use the same focus layout and retain particulars, statistics and sources", async ({ page }) => {
  await page.goto("/team/roster");
  await page.getByRole("list", { name: "Roster players" }).getByRole("button").first().click();
  const playerLink = page.getByRole("link", { name: "Read the player page", exact: false });
  test.skip(await playerLink.count() === 0, "This source roster has no published profile for its first player.");
  await playerLink.click();
  await expect(page.locator('[data-focus-page="player"]')).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("#top")).toHaveCount(0);
  await expect(page.locator("#profile-details-heading")).toHaveText("The particulars.");
  await expect(page.locator("#profile-stats-heading")).toContainText("on the record.");
  await expect(page.getByRole("navigation", { name: "Player sources and next steps" }).getByRole("link", { name: "Roster source" })).toHaveAttribute("target", "_blank");
  expect(await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id))).toEqual(["player", "profile-details", "profile-stats", "profile-sources", "more"]);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("team navigation remains usable on a 320px phone with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of ["/team/roster", "/team/stats", "/team/news"]) {
    await page.goto(path);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const navigation = page.getByRole("navigation", { name: "Team sections", exact: true });
    for (const link of await navigation.getByRole("link").all()) {
      const bounds = await link.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} fits without horizontal page scrolling`).toBe(true);
  }
});
