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

test("news categories accompany original sourced headlines on both pages", async ({ page }) => {
  const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;
  const items = [...coverage.news.items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  for (const route of ["/", "/team"]) {
    await page.goto(route);
    const section = page.locator(route === "/" ? "#around-jets" : "#news");
    for (const item of items.slice(0, route === "/" ? 3 : 8)) {
      const link = section.getByRole("link", { name: item.title, exact: false });
      await expect(link.locator("h3")).toHaveText(item.title);
      await expect(link).toHaveAttribute("href", item.url);
      await expect(link).toContainText(newsCategory(item.title));
      await expect(link.locator(`time[datetime="${item.publishedAt}"]`)).toBeVisible();
    }
  }
});
