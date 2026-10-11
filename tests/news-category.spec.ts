import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSnapshot } from "../src/lib/coverage";
import { newsCategory } from "../src/lib/news-category";

test("news labels recognize explicit transaction and game-availability headlines", () => {
  expect(newsCategory("Jets Sign K Jason Sanders to Active Roster, Add Two OL to Practice Squad")).toBe("Roster move");
  expect(newsCategory("Jets Re-Sign a Veteran Defensive Lineman")).toBe("Roster move");
  expect(newsCategory("Jets Signed a Veteran Defensive Lineman")).toBe("Roster move");
  expect(newsCategory("Jets Place a Player on Injured Reserve")).toBe("Roster move");
  expect(newsCategory("Jets List 7 Inactives for Road Matchup Against Detroit Lions")).toBe("Availability");
  expect(newsCategory("Jets Injury Report | Week 4")).toBe("Availability");
  expect(newsCategory("Injury Update | Head Coach Addresses Practice Availability")).toBe("Availability");
});

test("news labels identify explicit film, recap, and viewing guides", () => {
  expect(newsCategory("Film Breakdown | A Look at the Jets’ Explosive Pass Game")).toBe("Film breakdown");
  expect(newsCategory("Jets-Lions Game Recap | Green & White Fall to Lions")).toBe("Game recap");
  expect(newsCategory("Jets at Bears | How to Watch and Listen")).toBe("Game-day guide");
  expect(newsCategory("  ways  to watch | Jets at Bears  ")).toBe("Game-day guide");
});

test("player features and statistics do not imply transactions or availability", () => {
  for (const title of [
    "Jets Edge Joseph Ossai Reflects on Season Debut vs. Lions",
    "Garrett Wilson Returns to Form in Detroit",
    "Breece Hall on Recovery from an Injury",
    "The Jets Show Signs of Life",
    "3 Stats to Know | One More Facet to Kenyon Sadiq’s Diamond Day",
    "3 Takeaways | HC Aaron Glenn Praises Jets Late-Game Resiliency",
    "Geno Smith Signs Autographs for Fans",
    "Jets Sign Autographs for Fans",
    "Jets Release Their 2026 Schedule",
    "Jets Release New Uniforms",
    "Jets Place Third in a National Poll",
    "",
  ]) expect(newsCategory(title)).toBe("Team story");
});

test("news categories accompany original sourced headlines on the dedicated news page", async ({ page }) => {
  const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;
  const items = [...coverage.news.items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  await page.goto("/team/news");
  const section = page.locator("#news");
  for (const item of items) {
    const story = section.locator(`[data-inline-news="${item.id}"]`);
    const trigger = story.locator(":scope > summary");
    await expect(trigger.locator("h3")).toHaveText(item.title);
    await expect(trigger).toContainText(newsCategory(item.title));
    await expect(trigger.locator(`time[datetime="${item.publishedAt}"]`)).toBeVisible();
    await expect(story.getByRole("link", { name: /^Read the full article/ })).toBeHidden();
  }
});

test("an official headline expands beside its title without opening another page", async ({ page }) => {
  const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;
  const item = coverage.news.items.toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id))[0];
  test.skip(!item, "This edition has no official headline.");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/team/news");
  const address = page.url();
  let popups = 0;
  page.on("popup", () => { popups += 1; });
  const story = page.locator(`[data-inline-news="${item.id}"]`);
  const trigger = story.locator(":scope > summary");
  await trigger.focus();
  await trigger.press("Enter");
  await expect(story).toHaveAttribute("open", "");
  await expect(story.locator(`[data-news-details="${item.id}"]`)).toBeVisible();
  await expect(story).toContainText("The team wire supplies this headline and publication date.");
  const original = story.getByRole("link", { name: /^Read the full article/ });
  await expect(original).toBeHidden();
  await story.locator("[data-news-details] > details > summary").click();
  await expect(original).toBeVisible();
  await expect(original).toHaveAttribute("href", item.url);
  await expect(original).toHaveAttribute("target", "_blank");
  expect(page.url()).toBe(address);
  expect(popups).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await trigger.press("Space");
  await expect(story).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
});
