import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import { completedGames, currentSeasonSummary, nextScheduledGame } from "../src/lib/current";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];

test("the front page follows the latest confirmed final and current season", async ({ page }) => {
  await page.goto("/");
  const latest = completedGames(snapshot).filter((game) => game.season === snapshot.season).at(-1);
  if (latest) {
    const article = page.locator("#latest-game");
    await expect(article).toContainText(`Latest final · Week ${latest.week}`);
    await expect(article).toContainText(`Jets ${latest.jetsScore}, ${latest.opponentDisplay} ${latest.oppScore}`);
    await expect(article.getByLabel(`Final score: Jets ${latest.jetsScore}, ${latest.opponentDisplay} ${latest.oppScore}`, { exact: true }).locator(`time[datetime="${latest.date}"]`)).toBeVisible();
  } else {
    await expect(page.locator("main")).toContainText("From the archive");
  }
  const summary = currentSeasonSummary(snapshot);
  const season = page.getByRole("region", { name: `The ${snapshot.season} season` });
  await expect(season).toContainText(`${summary.wins}–${summary.losses}${summary.ties ? `–${summary.ties}` : ""}`);
  const next = nextScheduledGame(snapshot);
  if (next) await expect(season).toContainText(`Jets ${next.game.atHome ? "vs" : "at"} ${next.game.opponentDisplay}`);
  await expect(page.getByRole("region", { name: "Data freshness" }).locator("time")).toHaveAttribute("datetime", snapshot.checkedAt);
  await expect(page.getByRole("contentinfo")).toContainText(`holds ${games.length} games`);
});

for (const width of [1280, 390, 320]) {
  test(`current front page reflows and passes automated accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("main")).toHaveCount(1);
  });
}

test("the front page keeps deeper analysis available through keyboard disclosures", async ({ page }) => {
  await page.goto("/");
  const trend = page.locator('[data-home-disclosure="season-trend"]');
  await expect(trend).not.toHaveAttribute("open", "");
  await expect(page.getByText("The season in margins.", { exact: true })).toBeHidden();
  await trend.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("The season in margins.", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(trend).not.toHaveAttribute("open", "");
  const film = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Open league and unit comparisons" }) });
  await expect(film).not.toHaveAttribute("open", "");
  await film.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(film).toHaveAttribute("open", "");
  await expect(film.getByRole("region", { name: "Where the Jets sit." })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(film).not.toHaveAttribute("open", "");
});

test("the first visit offers clear exploration doors with the heavier sections closed", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#latest-game h1")).toBeVisible();
  const doors = page.getByRole("region", { name: "Explore Jets reporting and seasons" });
  expect(await doors.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(["/media", "/seasons", "/film-room#playbook-lab", "/morgue"]);
  for (const disclosure of await page.locator("[data-home-disclosure]").all()) {
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(disclosure.locator(":scope > summary")).toBeVisible();
  }
  await expect(page.locator("#postgame h2")).toBeHidden();
  await expect(page.locator("#visual-story-heading")).toBeHidden();
  await expect(page.locator("#fan-stand-heading")).toBeHidden();
});

test("direct links open the requested section without losing unrelated URL state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const id of ["postgame", "sunday-briefing", "game-evidence", "visual-story", "fan-stand"]) {
    await page.goto(`/?keep=orientation#${id}`);
    await expect(page.locator(`[data-home-disclosure="${id}"]`)).toHaveAttribute("open", "");
    await expect(page.locator(`#${id}`)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("keep")).toBe("orientation");
    expect(new URL(page.url()).hash).toBe(`#${id}`);
  }
});

test("homepage disclosure targets stay usable at 320px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const disclosure of await page.locator("[data-home-disclosure]").all()) {
    const summary = disclosure.locator(":scope > summary");
    await summary.focus();
    await summary.press("Enter");
    await expect(disclosure).toHaveAttribute("open", "");
    const rect = await summary.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await summary.press("Space");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
  }
});

test("native exploration still works with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  const breakdown = page.locator('[data-home-disclosure="postgame"]');
  await expect(breakdown).not.toHaveAttribute("open", "");
  await breakdown.locator(":scope > summary").click();
  await expect(page.locator("#postgame h2")).toBeVisible();
  await expect(page.locator("#postgame").getByRole("link", { name: "Read the game case", exact: true })).toHaveAttribute("href", /^\/games\//);
  await context.close();
});

test("a stale static edition warns the reader after the updater stops", async ({ page }) => {
  await page.clock.install({ time: new Date(Date.parse(snapshot.checkedAt) + 3 * 24 * 60 * 60_000) });
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Results update status" })).toContainText("Update overdue.");
  await expect(page.getByRole("status", { name: "Results update status" })).toContainText("newer results may be missing");
});
