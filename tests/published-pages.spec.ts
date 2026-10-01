import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { publishedGames, publishedPlayers } from "../src/lib/published-pages";
import { playerStatLines, statsForPlayer } from "../src/lib/roster";
import type { CoverageSnapshot } from "../src/lib/coverage";
import type { CurrentSnapshot } from "../src/lib/current";
import { selectLead } from "../src/lib/current";
import type { Game } from "../src/lib/games";

const games = JSON.parse(readFileSync("public/data/games.json", "utf8")) as Game[];
const current = JSON.parse(readFileSync("public/data/current.json", "utf8")) as CurrentSnapshot;
const coverage = JSON.parse(readFileSync("public/data/coverage.json", "utf8")) as CoverageSnapshot;
const classic = games.find((game) => game.id === "2002_18_IND_NYJ")!;
const latest = games.find((game) => current.schedule.some((fixture) => fixture.id === game.id && fixture.status === "final"))!;
const player = coverage.roster.players.find((entry) => entry.name === "Garrett Wilson")!;
const gamePath = `/games/${classic.id}`;
const playerPath = `/players/${player.id}`;

test("the front-page game story opens its published case before the optional interactive tape", async ({ page }) => {
  const lead = selectLead(games, current);
  const game = lead.analysisStatus === "ready" ? publishedGames(games, current).find((entry) => entry.id === lead.analysis?.id) : undefined;
  test.skip(!game, "This edition's lead is awaiting an eligible analysis.");
  if (!game) return;
  await page.goto("/");
  const link = page.locator("#postgame").getByRole("link", { name: "See how the game turned", exact: true });
  await expect(link).toHaveAttribute("href", `/games/${game.id}`);
  await link.click();
  await expect(page.getByLabel(`Final score: Jets ${game.jetsScore}, ${game.opponentDisplay} ${game.oppScore}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the interactive game tape", exact: true })).toHaveAttribute("href", new RegExp(`game=${game.id}`));
});

test("published games reject unreliable scores, probability, identities and duplicate records", () => {
  expect(publishedGames([classic], current)).toEqual([classic]);
  expect(publishedGames([classic, { ...classic }], current)).toEqual([]);
  const mutations: Partial<Game>[] = [
    { dataSuspect: true }, { swing: null }, { swing: Number.NaN }, { swing: 1.1 },
    { jetsScore: -1 }, { oppScore: 3.5 }, { outcome: "loss" }, { date: "2003-02-30" },
    { season: 2003 }, { atHome: false }, { week: 17 }, { opponent: "NE" },
  ];
  for (const mutation of mutations) expect(publishedGames([{ ...classic, ...mutation }], current)).toEqual([]);
  expect(publishedGames(games, current).some((game) => game.dataSuspect)).toBe(false);
  const oakland = games.find((game) => game.id === "2009_07_NYJ_OAK")!;
  expect(publishedGames([oakland], current)).toEqual([oakland]);
});

test("current game cases require agreement with one confirmed source fixture", () => {
  expect(publishedGames([latest], current)).toEqual([latest]);
  const fixture = current.schedule.find((entry) => entry.id === latest.id)!;
  const revised = (change: Partial<typeof fixture>): CurrentSnapshot => ({ ...current, schedule: [{ ...fixture, ...change }] });
  for (const change of [{ status: "scheduled" as const }, { jetsScore: fixture.jetsScore! + 1 }, { date: "2026-09-28" }]) {
    expect(publishedGames([latest], revised(change))).toEqual([]);
  }
  expect(publishedGames([latest], { ...current, schedule: [] })).toEqual([]);
  expect(publishedGames([latest], { ...current, schedule: [fixture, { ...fixture }] })).toEqual([]);
  expect(publishedGames([classic], { ...current, checkedAt: "invalid" })).toEqual([]);
});

test("player publishing keeps the current checked roster and withholds wrong seasons, unavailable feeds and duplicate IDs", () => {
  expect(publishedPlayers(coverage, current.season)).toContainEqual(player);
  expect(publishedPlayers(null, current.season)).toEqual([]);
  expect(publishedPlayers(coverage, current.season + 1)).toEqual([]);
  expect(publishedPlayers({ ...coverage, roster: { ...coverage.roster, status: "unavailable" } }, current.season)).toEqual([]);
  expect(publishedPlayers({ ...coverage, roster: { ...coverage.roster, status: "retained" } }, current.season)).toContainEqual(player);
  expect(publishedPlayers({ ...coverage, roster: { ...coverage.roster, players: [player, { ...player }] } }, current.season)).toEqual([]);
});

test("published case and player are readable with JavaScript disabled and retain specific share metadata", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto(gamePath);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("IND");
  await expect(page.locator('a[aria-current="page"][href="/morgue"]')).toHaveCount(1);
  await expect(page.getByLabel("Final score: Jets 41, IND 0", { exact: true })).toContainText("0");
  await expect(page.getByRole("heading", { name: "Forty-one to nothing", exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("2002 postseason");
  await expect(page.locator("main time").first()).toHaveAttribute("datetime", "2003-01-04");
  await expect(page).toHaveTitle(/Jets 41–0 IND/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Jets 41–0 IND/);
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /\/games\/2002_18_IND_NYJ\/opengraph-image/);
  await page.goto(playerPath);
  await expect(page.getByRole("heading", { level: 1, name: player.name })).toBeVisible();
  await expect(page.locator('a[aria-current="page"][href="/team"]')).toHaveCount(1);
  await expect(page.locator("main")).toContainText(player.college!);
  for (const line of playerStatLines(statsForPlayer(coverage.stats, player.id, current.season))) {
    await expect(page.locator("main")).toContainText(line.value);
  }
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Garrett Wilson/);
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /\/players\/00-0037740\/opengraph-image/);
  await expect(page.locator("main")).toContainText(/defensive.*kicking/i);
  await context.close();
});

test("unknown, flagged and invented historical profiles produce HTTP 404", async ({ request }) => {
  const flagged = games.find((game) => game.dataSuspect)!;
  for (const route of ["/games/1968_21_NYJ_BAL", `/games/${flagged.id}`, "/players/joe-namath", "/players/00-9999999"]) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
  }
});

test("every published game and player has a valid 1200×630 share image", async ({ request }) => {
  test.setTimeout(60_000);
  const routes = [
    ...publishedGames(games, current).map((game) => `/games/${game.id}/opengraph-image`),
    ...publishedPlayers(coverage, current.season).map((entry) => `/players/${entry.id}/opengraph-image`),
  ];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < routes.length) {
      const route = routes[next++];
      const response = await request.get(route);
      try {
        expect(response.status(), route).toBe(200);
        expect(response.headers()["content-type"], route).toBe("image/png");
        const bytes = await response.body();
        expect(bytes.length, route).toBeGreaterThan(24);
        expect(bytes.toString("hex", 0, 8), route).toBe("89504e470d0a1a0a");
        expect(bytes.readUInt32BE(16), route).toBe(1200);
        expect(bytes.readUInt32BE(20), route).toBe(630);
      } finally { await response.dispose(); }
    }
  }));
});

test("game and player pages lead back to their matching interactive details", async ({ page }) => {
  await page.goto(gamePath);
  const gameLink = page.getByRole("link", { name: "Open the interactive game tape", exact: true });
  await expect(gameLink).toHaveAttribute("href", `/morgue?game=${classic.id}&board=miracle#game-case-heading`);
  await gameLink.click();
  await expect(page.locator("#game-case-heading")).toContainText("IND");
  await page.goto(playerPath);
  await page.getByRole("link", { name: "Find Garrett in the roster", exact: true }).click();
  await expect(page.locator("#selected-player-heading")).toHaveText(player.name);
});

test("a source player without recorded offensive totals never acquires fabricated statistics", async ({ page }) => {
  const unrecorded = publishedPlayers(coverage, current.season).find((entry) => !playerStatLines(statsForPlayer(coverage.stats, entry.id, current.season)).length)!;
  await page.goto(`/players/${unrecorded.id}`);
  await expect(page.getByRole("heading", { level: 1, name: unrecorded.name })).toBeVisible();
  await expect(page.locator("main")).toContainText(/isn’t included|No passing/i);
  await expect(page.locator("main")).toContainText("An absent offensive line does not mean the player has not contributed.");
});

for (const enlarged of [false, true]) {
  test(`published game and player pages remain accessible at 320px${enlarged ? " with 200% text" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    for (const route of [gamePath, playerPath, `/players/${coverage.roster.players.find((entry) => entry.group === "defense")!.id}`]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), route).toBeLessThanOrEqual(1);
      await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
        return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
      });
      expect(violations, route).toEqual([]);
    }
  });
}
