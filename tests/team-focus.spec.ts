import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { leaders, type CoverageSnapshot, type PlayerStats } from "../src/lib/coverage";
import type { CurrentSnapshot } from "../src/lib/current";
import { buildTeamFocus, surname } from "../src/lib/team-focus";

const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const team = buildTeamFocus(coverage, current.season);
const statsReady = coverage.stats.season === current.season && coverage.stats.status !== "unavailable";
const headlines = coverage.news.items.toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));

const feed = { checkedAt: "2026-10-06T12:00:00Z", attemptedAt: "2026-10-06T12:00:00Z", status: "ready" as const, source: "https://example.com/stats", sourceUpdatedAt: null };
function player(id: string, name: string, position: string, yards: { passing?: number; rushing?: number; receiving?: number }): PlayerStats {
  return {
    id, name, position, headshot: null, games: 4,
    passing: { completions: yards.passing ? 20 : 0, attempts: yards.passing ? 30 : 0, yards: yards.passing ?? 0, touchdowns: 0, interceptions: 0 },
    rushing: { carries: yards.rushing ? 10 : 0, yards: yards.rushing ?? 0, touchdowns: 0 },
    receiving: { targets: yards.receiving ? 8 : 0, receptions: yards.receiving ? 5 : 0, yards: yards.receiving ?? 0, touchdowns: 0 },
  };
}
function snapshot(players: PlayerStats[], season = 2026): CoverageSnapshot {
  return {
    schemaVersion: 1, season,
    news: { ...feed, items: [] },
    roster: { ...feed, season, week: 4, players: [] },
    stats: { ...feed, season, throughWeek: 4, throughDate: "2026-10-04", analyzedGameIds: [], pendingGameIds: [], players },
  };
}

test("a sentence names a player by surname, without suffixes and with particles", () => {
  expect(["Geno Smith", "Marvin Harrison Jr.", "Kenneth Walker III", "Amon-Ra St. Brown", "Breece Hall"].map(surname)).toEqual(["Smith", "Harrison", "Walker", "St. Brown", "Hall"]);
});

test("the leaders sentence follows the recorded yards", () => {
  const twice = buildTeamFocus(snapshot([player("q", "Sam Darnold", "QB", { passing: 900, rushing: 120 }), player("r", "Ty Back", "RB", { rushing: 80 }), player("w", "Garrett Wilson", "WR", { receiving: 300 })]), 2026);
  expect(twice.stats.say).toBe("Darnold throws it and runs it, Wilson catches it.");
  const namesakes = buildTeamFocus(snapshot([player("q", "Geno Smith", "QB", { passing: 900 }), player("r", "Kyren Williams", "RB", { rushing: 300 }), player("w", "Mike Williams", "WR", { receiving: 400 })]), 2026);
  expect(namesakes.stats.say).toBe("Smith throws it, Kyren Williams runs it, Mike Williams catches it.");
  const kneels = buildTeamFocus(snapshot([player("q", "Geno Smith", "QB", { passing: 900, rushing: -3 }), player("r", "Breece Hall", "RB", { rushing: 163 })]), 2026);
  expect(kneels.stats.leaders.find((leader) => leader.kind === "rushing")).toMatchObject({ name: "Breece Hall", yards: 163, team: 160 });
  const lastYear = buildTeamFocus(snapshot([player("q", "Geno Smith", "QB", { passing: 900 })], 2025), 2026);
  expect(lastYear.stats).toMatchObject({ ready: false, leaders: [], say: null });
});

test.describe("the Team page", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("is a focus page: who has the ball, the roster by position, then the newest headline", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto("/team");
    await expect(page.locator("#top")).toHaveCount(0);
    const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
    expect(ids).toEqual(["leaders", "players", "headlines", "more"]);
    await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveCount(ids.length);
    await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/team");

    const expected = statsReady ? (["passing", "rushing", "receiving"] as const).flatMap((kind) => leaders(coverage.stats, kind, 1).map((leader) => ({ name: leader.name, yards: leader[kind].yards }))) : [];
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected.length ? team.stats.say! : "No player numbers yet.");
    const rows = page.locator("#leaders li");
    await expect(rows).toHaveCount(expected.length);
    for (const [index, leader] of expected.entries()) {
      await expect(rows.nth(index)).toContainText(leader.name);
      await expect(rows.nth(index)).toContainText(leader.yards.toLocaleString("en-US"));
    }
    if (statsReady) await expect(page.locator("#leaders").getByRole("link", { name: /^Every player’s numbers/ })).toHaveAttribute("href", "/team/stats");
  });

  test("shows every roster player once and opens a position's players", async ({ page }) => {
    test.skip(!team.roster, "This edition has no current-season roster.");
    if (!team.roster) return;
    await page.goto("/team");
    const roster = page.locator("#players");
    await expect(roster.locator("#players-heading")).toContainText(`${coverage.roster.players.length} players`);
    await expect(roster.locator("li i")).toHaveCount(coverage.roster.players.length);
    const counts = (await roster.locator("li a b").allTextContents()).map((text) => Number.parseInt(text, 10));
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(coverage.roster.players.length);

    const row = team.roster.units[0].rows[0];
    await roster.getByRole("link", { name: new RegExp(`^${row.label} ${row.count} player`) }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("position")).toBe(row.position);
    await expect(page.getByRole("list", { name: "Roster players" }).getByRole("listitem")).toHaveCount(row.count);
  });

  test("leads with the newest official headline and links to every headline", async ({ page }) => {
    await page.goto("/team");
    const news = page.locator("#headlines");
    if (!headlines.length) {
      await expect(news.locator("#headlines-heading")).toHaveText("No team news yet.");
      return;
    }
    await expect(news.locator("#headlines-heading")).toHaveText(headlines[0].title);
    const read = news.getByRole("link", { name: /^Read it/ });
    await expect(read).toHaveAttribute("href", headlines[0].url);
    await expect(read).toHaveAttribute("target", "_blank");
    await expect(read).toHaveAttribute("rel", /noreferrer/);
    await expect(news.getByRole("list", { name: "More headlines" }).getByRole("listitem")).toHaveCount(Math.min(3, headlines.length - 1));
    await expect(news.getByRole("link", { name: /^All team news/ })).toHaveAttribute("href", "/team/news");
  });

  for (const width of [1280, 390, 320]) {
    test(`passes automated accessibility and reflows at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/team");
      await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
        return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
      });
      expect(violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("reflows at 320px with 200% text", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/team");
    await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
