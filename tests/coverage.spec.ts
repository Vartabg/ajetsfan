import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSnapshot } from "../src/lib/coverage";
import { leaders } from "../src/lib/coverage";

const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;

test("official headlines keep their publication dates and source links across both views", async ({ page }) => {
  const items = [...coverage.news.items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  for (const route of ["/", "/team"]) {
    await page.goto(route);
    const section = page.locator(route === "/" ? "#around-jets" : "#news");
    for (const item of items.slice(0, route === "/" ? 3 : 8)) {
      const link = section.getByRole("link", { name: item.title, exact: false });
      await expect(link).toHaveAttribute("href", item.url);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(section.locator(`time[datetime="${item.publishedAt}"]`)).toBeVisible();
    }
    if (coverage.news.checkedAt) await expect(section.locator(`time[datetime="${coverage.news.checkedAt}"]`)).toBeVisible();
  }
});

test("player leaders match confirmed-game totals and link to roster profiles", async ({ page }) => {
  await page.goto("/team");
  const section = page.locator("#season-leaders");
  for (const kind of ["passing", "rushing", "receiving"] as const) {
    const top = leaders(coverage.stats, kind)[0];
    if (!top) continue;
    const card = section.locator("div").filter({ hasText: `${kind[0].toUpperCase()}${kind.slice(1)} leader` }).filter({ has: page.locator(`strong:has-text("${top[kind].yards.toLocaleString("en-US")}")`) }).last();
    await expect(card).toContainText(top.name);
    if (coverage.roster.players.some((player) => player.id === top.id)) {
      await expect(section.getByRole("link", { name: top.name, exact: false })).toHaveAttribute("href", `/team?player=${top.id}#roster`);
    }
  }
  await expect(section).toContainText("Ranked by yards in confirmed, completed regular-season games.");
});

test("each coverage source warns independently when a static edition is overdue", async ({ page }) => {
  const latestCheck = Math.max(...[coverage.news, coverage.roster, coverage.stats].map((feed) => Date.parse(feed.checkedAt ?? feed.attemptedAt)));
  await page.clock.install({ time: new Date(latestCheck + 3 * 24 * 60 * 60_000) });
  await page.goto("/team");
  for (const label of ["Official Jets news", "Player statistics", "Roster"]) {
    await expect(page.getByRole("status", { name: `${label} update status`, exact: true })).toBeVisible();
  }
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Official Jets news update status", exact: true })).toBeVisible();
  if (coverage.stats.status !== "unavailable" && leaders(coverage.stats, "receiving", 1).length) {
    await expect(page.getByRole("status", { name: "Player statistics update status", exact: true })).toBeVisible();
  }
});
