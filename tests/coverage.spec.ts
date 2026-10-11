import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSnapshot } from "../src/lib/coverage";
import { leaders } from "../src/lib/coverage";
import { playerHref } from "../src/lib/roster";

const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;

test("official headlines expand in place and retain dates and original sources on the news page and legacy shortcut", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const items = [...coverage.news.items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  for (const route of ["/team/news", "/#around-jets"]) {
    await page.goto(route);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/team/news");
    const address = page.url();
    const pages = page.context().pages().length;
    const section = page.locator("#news");
    for (const item of items) {
      const story = section.locator(`[data-inline-news="${item.id}"]`);
      const trigger = story.locator(":scope > summary");
      await expect(trigger.locator("h3")).toHaveText(item.title);
      await expect(trigger.locator(`time[datetime="${item.publishedAt}"]`)).toBeVisible();
      const original = story.getByRole("link", { name: /^Read the full article/ });
      await expect(original).toBeHidden();
      await trigger.scrollIntoViewIfNeeded();
      const position = (await trigger.boundingBox())!;
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await trigger.click();
      await expect(story.locator(`[data-news-details="${item.id}"]`)).toBeVisible();
      expect(Math.abs((await trigger.boundingBox())!.y - position.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore)).toBeLessThanOrEqual(2);
      expect(page.url()).toBe(address);
      expect(page.context().pages()).toHaveLength(pages);
      await expect(original).toBeHidden();
      await story.locator("[data-news-details] > details > summary").click();
      await expect(original).toBeVisible();
      await expect(original).toHaveAttribute("href", item.url);
      await expect(original).toHaveAttribute("target", "_blank");
      await expect(original).toHaveAttribute("rel", /noreferrer/);
      await trigger.click();
      await expect(story.locator("[data-news-details]")).toBeHidden();
    }
    if (coverage.news.checkedAt) await expect(section.locator(`time[datetime="${coverage.news.checkedAt}"]`)).toBeVisible();
  }
});

test("player leaders match confirmed-game totals and link to roster profiles", async ({ page }) => {
  await page.goto("/team/stats");
  const section = page.locator("#season-leaders");
  for (const kind of ["passing", "rushing", "receiving"] as const) {
    const top = leaders(coverage.stats, kind)[0];
    if (!top) continue;
    const card = section.locator("div").filter({ hasText: `${kind[0].toUpperCase()}${kind.slice(1)} leader` }).filter({ has: page.locator(`strong:has-text("${top[kind].yards.toLocaleString("en-US")}")`) }).last();
    await expect(card).toContainText(top.name);
    if (coverage.roster.players.some((player) => player.id === top.id)) {
      await expect(section.getByRole("link", { name: top.name, exact: false })).toHaveAttribute("href", playerHref(top.id));
    }
  }
  await expect(section).toContainText("Ranked by yards in confirmed, completed regular-season games.");
});

test("each coverage source warns independently when a static edition is overdue", async ({ page }) => {
  const latestCheck = Math.max(...[coverage.news, coverage.roster, coverage.stats].map((feed) => Date.parse(feed.checkedAt ?? feed.attemptedAt)));
  await page.clock.install({ time: new Date(latestCheck + 3 * 24 * 60 * 60_000) });
  for (const [route, label] of [["/team/news", "Official Jets news"], ["/team/stats", "Player statistics"], ["/team/roster", "Roster"]]) {
    await page.goto(route);
    await expect(page.getByRole("status", { name: `${label} update status`, exact: true })).toBeVisible();
  }
  await page.goto("/#around-jets");
  await expect(page.getByRole("status", { name: "Official Jets news update status", exact: true })).toBeVisible();
});
