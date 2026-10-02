import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSnapshot, PlayerStats, RosterPlayer } from "../src/lib/coverage";
import { filterRoster, playerHref, playerInitials, playerStatLines, playerStatsMessage, rosterFilters, statsForPlayer } from "../src/lib/roster";

const rosterPlayer = (overrides: Partial<RosterPlayer> = {}): RosterPlayer => ({
  id: "00-test-qb", espnId: null, name: "Tyrod Taylor", position: "QB", jersey: "8",
  group: "offense", status: "ACT", statusLabel: "Active", headshot: null,
  height: null, weight: null, college: null, experience: null, profileUrl: null,
  ...overrides,
});
const playerStats = (overrides: Partial<PlayerStats> = {}): PlayerStats => ({
  id: "00-test-qb", name: "Tyrod Taylor", position: "QB", headshot: null, games: 0,
  passing: { completions: 0, attempts: 0, yards: 0, touchdowns: 0, interceptions: 0 },
  rushing: { carries: 0, yards: 0, touchdowns: 0 },
  receiving: { targets: 0, receptions: 0, yards: 0, touchdowns: 0 },
  ...overrides,
});
const filters = { query: "", unit: "all" as const, position: "all", status: "all" };
const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as { season: number };
const editionSeason = current.season;

function profilePlayer(): RosterPlayer | undefined {
  return coverage.roster.players.find((player) => playerStatLines(statsForPlayer(coverage.stats, player.id, editionSeason)).length > 0)
    ?? coverage.roster.players[0];
}

test("roster search matches exact jersey numbers and combines name, position, unit and status", () => {
  const players = [rosterPlayer(), rosterPlayer({ id: "00-test-wr", name: "Test Receiver", jersey: "18", position: "WR", status: "DEV", statusLabel: "Practice squad" })];
  expect(filterRoster(players, { ...filters, query: "#8" }).map((player) => player.id)).toEqual(["00-test-qb"]);
  expect(filterRoster(players, { ...filters, query: "taylor QB", position: "QB", unit: "offense", status: "ACT" }).map((player) => player.id)).toEqual(["00-test-qb"]);
  expect(filterRoster(players, { ...filters, position: "QB", unit: "defense" })).toEqual([]);
  expect(filterRoster(players, { ...filters, position: "WR", status: "ACT" })).toEqual([]);
});

test("name search handles accents and apostrophes, and player links keep stable IDs", () => {
  const player = rosterPlayer({ name: "José O’Connor" });
  expect(filterRoster([player], { ...filters, query: "jose oconnor" })).toEqual([player]);
  expect(playerInitials(player.name)).toBe("JO");
  const link = new URL(playerHref(player.id), "https://example.com");
  expect(link.searchParams.get("player")).toBe(player.id);
  expect(link.hash).toBe("#roster");
  expect(rosterFilters(new URLSearchParams({ unit: "invalid" })).unit).toBe("all");
});

test("stat lines preserve negative yards and never invent production from an empty row", () => {
  expect(playerStatLines(undefined)).toEqual([]);
  expect(playerStatLines(playerStats())).toEqual([]);
  const lines = playerStatLines(playerStats({ games: 2, passing: { completions: 20, attempts: 40, yards: 320, touchdowns: 2, interceptions: 1 }, rushing: { carries: 1, yards: -2, touchdowns: 0 } }));
  expect(lines).toContainEqual({ label: "Games recorded", value: "2" });
  expect(lines).toContainEqual({ label: "Passing", value: "20/40 · 320 yards · 2 TD · 1 INT" });
  expect(lines).toContainEqual({ label: "Rushing", value: "1 carry · -2 yards · 0 TD" });
  expect(lines.some((line) => line.label === "Receiving")).toBe(false);
});

test("previous-season and unavailable stats cannot supply a current player line", () => {
  const feed: CoverageSnapshot["stats"] = {
    checkedAt: "2026-09-29T20:00:00Z", attemptedAt: "2026-09-29T20:00:00Z", status: "retained",
    source: "https://example.com/stats", sourceUpdatedAt: null, season: 2025, throughWeek: 18,
    throughDate: "2026-01-04", analyzedGameIds: [], pendingGameIds: [], players: [playerStats({ games: 17 })],
  };
  expect(statsForPlayer(feed, "00-test-qb", 2026)).toBeUndefined();
  expect(statsForPlayer({ ...feed, season: 2026 }, "00-test-qb", 2026)?.games).toBe(17);
  expect(statsForPlayer({ ...feed, season: 2026, status: "unavailable" }, "00-test-qb", 2026)).toBeUndefined();
});

test("missing offensive totals, unsupported units and unavailable source seasons have distinct coverage messages", () => {
  const feed: CoverageSnapshot["stats"] = { ...coverage.stats, season: 2026, status: "ready", players: [] };
  const quarterback = rosterPlayer();
  const defender = rosterPlayer({ group: "defense", position: "DB" });
  expect(playerStatsMessage(feed, quarterback, 2026).empty).toContain("No passing, rushing or receiving totals are recorded");
  expect(playerStatsMessage(feed, defender, 2026).empty).toContain("Defensive and kicking production isn’t included");
  expect(playerStatsMessage(feed, defender, 2026).scope).toContain("Games recorded plus passing, rushing and receiving");
  const unavailable = playerStatsMessage({ ...feed, status: "unavailable" }, defender, 2026).empty;
  expect(unavailable).toContain("statistics are unavailable");
  expect(unavailable).toContain("not treated as zero");
  const previousSeason = playerStatsMessage({ ...feed, season: 2025 }, defender, 2026).empty;
  expect(previousSeason).toContain("The available source covers 2025");
  expect(previousSeason).not.toContain("No passing");
});

test("player deep links retain the exact profile, season statistics and browser history", async ({ page }) => {
  const player = profilePlayer();
  test.skip(!player, "This edition has no roster records for a selectable player profile.");
  if (!player) return;
  const second = coverage.roster.players.find((candidate) => candidate.id !== player.id);
  await page.goto(playerHref(player.id));
  const profile = page.getByRole("region", { name: player.name, exact: true });
  await expect(profile).toBeVisible();
  await expect(profile).toContainText(`Source roster status: ${player.statusLabel} (${player.status})`);
  await expect(profile).toContainText(`${editionSeason} regular-season stats`);
  if (player.college) await expect(profile).toContainText(player.college);
  if (player.height) await expect(profile).toContainText(player.height);
  const lines = playerStatLines(statsForPlayer(coverage.stats, player.id, editionSeason));
  for (const line of lines) await expect(profile).toContainText(line.value);
  await expect(profile.getByRole("link", { name: "Player permalink", exact: true })).toHaveAttribute("href", playerHref(player.id));
  if (lines.length) {
    await expect(profile.getByRole("link", { name: "Season stats source" })).toHaveAttribute("href", coverage.stats.source);
  } else {
    await expect(profile).toContainText(playerStatsMessage(coverage.stats, player, editionSeason).empty);
    await expect(profile.getByRole("link", { name: "Season stats source" })).toHaveCount(0);
  }
  if (second) {
    await page.getByRole("button", { name: `View ${second.name},`, exact: false }).click();
    await expect(page).toHaveURL(new RegExp(`player=${second.id}`));
  } else {
    await profile.getByRole("button", { name: "Close player", exact: false }).click();
    await expect(page).not.toHaveURL(/player=/);
  }
  await page.reload();
  if (second) await expect(page.getByRole("region", { name: second.name, exact: true })).toBeVisible();
  else await expect(page.locator("#selected-player-heading")).toHaveCount(0);
  await page.goBack();
  await expect(profile).toBeVisible();
});

test("roster filters combine unit, position, status and exact jersey search, with an honest reset", async ({ page }) => {
  const player = coverage.roster.players.find((candidate) => candidate.group === "offense" && candidate.jersey !== null) ?? coverage.roster.players[0];
  test.skip(!player, "This edition has no roster records to narrow with combined player filters.");
  if (!player) return;
  const unitLabel = { offense: "Offense", defense: "Defense", special: "Special teams", other: "Other" }[player.group];
  const query = player.jersey !== null ? `#${player.jersey}` : player.name;
  await page.goto(playerHref(player.id));
  await page.getByRole("group", { name: "Roster unit" }).getByRole("button", { name: new RegExp(`^${unitLabel}\\s*\\d+$`) }).click();
  await page.getByRole("combobox", { name: "Position", exact: true }).selectOption(player.position);
  await page.getByRole("combobox", { name: "Source roster status", exact: true }).selectOption(player.status);
  await page.getByLabel("Find a player", { exact: true }).fill(query);
  const expected = filterRoster(coverage.roster.players, { query, unit: player.group, position: player.position, status: player.status });
  await expect(page.getByRole("list", { name: "Roster players" }).locator("li")).toHaveCount(expected.length);
  await expect(page.getByRole("region", { name: player.name, exact: true })).toBeVisible();
  await page.getByLabel("Find a player", { exact: true }).fill("no-such-player-zzzz");
  await expect(page.getByRole("heading", { name: "No players match.", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/player=/);
  await page.getByRole("button", { name: "Reset filters", exact: true }).first().click();
  await expect(page.getByLabel("Find a player", { exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Position", exact: true })).toHaveValue("all");
  await expect(page.getByRole("combobox", { name: "Source roster status", exact: true })).toHaveValue("all");
  await expect(page.getByRole("list", { name: "Roster players" }).locator("li")).toHaveCount(coverage.roster.players.length);
});

test("keyboard selection focuses the inline profile and closing restores the player card", async ({ page }) => {
  const player = coverage.roster.players[0];
  test.skip(!player, "This edition has no player cards to select with the keyboard.");
  if (!player) return;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  const card = page.getByRole("button", { name: `View ${player.name},`, exact: false });
  await card.focus();
  await card.press("Enter");
  await expect(page.locator("#selected-player-heading")).toHaveText(player.name);
  await expect(page.locator("#selected-player-heading")).toBeFocused();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close player", exact: false }).click();
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await expect(page).not.toHaveURL(/player=/);
});

test("unrecorded players and unknown IDs show honest profile states", async ({ page }) => {
  const player = coverage.roster.players.find((candidate) => playerStatLines(statsForPlayer(coverage.stats, candidate.id, editionSeason)).length === 0);
  if (player) {
    await page.goto(playerHref(player.id));
    const profile = page.getByRole("region", { name: player.name, exact: true });
    await expect(profile).toContainText(playerStatsMessage(coverage.stats, player, editionSeason).empty);
    await expect(profile.getByRole("link", { name: "Season stats source" })).toHaveCount(0);
  }
  await page.goto(playerHref("00-not-in-this-roster"));
  await expect(page.getByText("That player is not listed in this roster edition. Search the roster below.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Roster players" }).locator("li")).toHaveCount(coverage.roster.players.length);
});

test("a defender profile names the statistical coverage gap rather than implying zero defensive production", async ({ page }) => {
  const player = coverage.roster.players.find((candidate) => candidate.group === "defense");
  test.skip(!player, "This edition has no defensive roster profile.");
  if (!player) return;
  await page.goto(playerHref(player.id));
  const profile = page.getByRole("region", { name: player.name, exact: true });
  await expect(profile).toContainText("Defensive and kicking production isn’t included in this edition.");
  await expect(profile).not.toContainText("No recorded regular-season stats in this edition.");
});

test("a missing or failed headshot shows accessible initials without losing profile details", async ({ page }) => {
  const player = coverage.roster.players.find((candidate) => candidate.headshot !== null) ?? coverage.roster.players[0];
  test.skip(!player, "This edition has no player profile requiring a portrait fallback.");
  if (!player) return;
  await page.route("**/_next/image?**", (route) => route.abort());
  await page.goto(playerHref(player.id));
  const fallback = page.getByRole("img", { name: `${player.name} initials`, exact: true });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveText(playerInitials(player.name));
  await expect(page.getByRole("heading", { name: player.name, exact: true })).toBeVisible();
});

test("overdue or unavailable roster and statistics each disclose their own source state", async ({ page }) => {
  const player = profilePlayer();
  const lastChecked = Math.max(...[coverage.roster, coverage.stats].map((feed) => Date.parse(feed.checkedAt ?? feed.attemptedAt)));
  await page.clock.install({ time: new Date(lastChecked + 26 * 60 * 60 * 1000) });
  await page.goto(player ? playerHref(player.id) : "/team#roster");
  await expect(page.getByRole("status", { name: "Roster update status", exact: true })).toBeVisible();
  const statsStatus = page.getByRole("status", { name: player ? "Selected player statistics update status" : "Player statistics update status", exact: true });
  await expect(statsStatus).toBeVisible();
  if (coverage.roster.status === "unavailable") await expect(page.getByRole("status", { name: "Roster update status", exact: true })).toContainText("This source is unavailable.");
  if (coverage.stats.status === "unavailable") await expect(statsStatus).toContainText("This source is unavailable.");
});

test("this edition shows its verified roster or a real unavailable-roster empty state", async ({ page }) => {
  await page.goto("/team#roster");
  const explorer = page.getByRole("region", { name: "Roster explorer", exact: true });
  await expect(explorer).toBeVisible();
  if (coverage.roster.players.length) {
    await expect(explorer.getByRole("list", { name: "Roster players" }).locator("li")).toHaveCount(coverage.roster.players.length);
  } else {
    await expect(explorer.getByRole("heading", { name: "No players match.", exact: true })).toBeVisible();
    await expect(explorer.getByText("Roster records are unavailable in this edition.", { exact: true })).toBeVisible();
    await expect(explorer.getByRole("list", { name: "Roster players" })).toHaveCount(0);
    await expect(explorer.getByLabel("Find a player", { exact: true })).toBeVisible();
  }
  if (coverage.roster.status === "unavailable") await expect(explorer.getByRole("status", { name: "Roster update status", exact: true })).toContainText("This source is unavailable.");
});

for (const width of [1280, 390, 320]) {
  test(`roster edition reflows and passes accessibility at ${width}px`, async ({ page }) => {
    const player = profilePlayer();
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(player ? playerHref(player.id) : "/team#roster");
    if (player) await expect(page.getByRole("region", { name: player.name, exact: true })).toBeVisible();
    else await expect(page.getByRole("heading", { name: "No players match.", exact: true })).toBeVisible();
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
