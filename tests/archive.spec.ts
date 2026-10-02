import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/lib/games";
import { archiveBoard, archiveFilters, filterArchive, gameHref } from "../src/lib/explorer";
import { keyPlayIndex } from "../src/lib/curve";

const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
const gb = games.find((game) => game.id === "2018_16_GB_NYJ")!;
const cle = games.find((game) => game.id === "2022_02_NYJ_CLE")!;
const baseFilters = { season: "all", opponent: "all", query: "", sort: "swing" as const };

test("archive filters combine season, opponent and search while keeping board integrity", () => {
  const filters = { ...baseFilters, season: "2022", opponent: "CLE", query: "2022 CLE" };
  expect(filterArchive(games, "miracle", filters).map((game) => game.id)).toEqual([cle.id]);
  expect(filterArchive(games, "heartbreak", filters)).toEqual([]);
  const recent = filterArchive(games, "heartbreak", { ...baseFilters, sort: "recent" });
  expect(recent.every((game, index) => index === 0 || recent[index - 1].date >= game.date)).toBe(true);
  expect(recent.some((game) => game.dataSuspect)).toBe(false);
});

test("game links retain a valid board and infer it for older links", () => {
  const params = new URLSearchParams(gameHref(cle.id, "miracle").split("?")[1]);
  expect(params.get("game")).toBe(cle.id);
  expect(archiveBoard(params, games)).toBe("miracle");
  expect(archiveBoard(new URLSearchParams({ game: cle.id }), games)).toBe("miracle");
  expect(archiveFilters(new URLSearchParams({ sort: "invalid" })).sort).toBe("swing");
});

test("deep-linked selections survive a reload and browser history", async ({ page }) => {
  await page.goto(gameHref(gb.id, "heartbreak"));
  await expect(page.getByRole("figure", { name: `Game analysis: ${gb.date} ${gb.opponentDisplay}` })).toBeVisible();
  await page.getByRole("button", { name: /^Select 2017-10-22 / }).click();
  await expect(page).toHaveURL(/game=2017_07_NYJ_MIA/);
  await page.reload();
  await expect(page.getByRole("figure", { name: "Game analysis: 2017-10-22 MIA" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("figure", { name: `Game analysis: ${gb.date} ${gb.opponentDisplay}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Game permalink" })).toHaveAttribute("href", gameHref(gb.id, "heartbreak"));
});

test("filters show an honest empty state and reset to the current board", async ({ page }) => {
  await page.goto(gameHref(cle.id, "miracle"));
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption("2022");
  await page.getByRole("combobox", { name: "Opponent", exact: true }).selectOption("CLE");
  await expect(page.getByRole("list", { name: "Matching games" }).locator("li")).toHaveCount(1);
  await page.getByLabel("Search games", { exact: true }).fill("no-such-play-zzzz");
  await expect(page.getByRole("heading", { name: "No games match." })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters", exact: true }).first().click();
  await expect(page.getByRole("combobox", { name: "Season", exact: true })).toHaveValue("all");
  await expect(page.getByRole("combobox", { name: "Opponent", exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Search games", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: /^Miracles/ })).toHaveAttribute("aria-pressed", "true");
});

test("sorting and selecting a game update the shareable URL", async ({ page }) => {
  await page.goto("/morgue");
  await page.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("recent");
  const newest = filterArchive(games, "heartbreak", { ...baseFilters, sort: "recent" })[0];
  const row = page.getByRole("list", { name: "Matching games" }).locator("li").first().getByRole("button");
  await expect(row).toHaveAttribute("aria-label", new RegExp(newest.date));
  await row.click();
  await expect(page).toHaveURL(new RegExp(`game=${newest.id}`));
  await expect(page).toHaveURL(/sort=recent/);
});

test("opening a game focuses its case file while filtering keeps focus in the controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(gameHref(gb.id, "heartbreak"));
  const row = page.getByRole("button", { name: /^Select 2017-10-22 / });
  await row.focus();
  await row.press("Enter");
  await expect(page).toHaveURL(/game=2017_07_NYJ_MIA/);
  await expect(page.locator("#game-case-heading")).toBeFocused();
  const search = page.getByLabel("Search games", { exact: true });
  await search.fill("GB");
  await expect(search).toBeFocused();
  await expect(page).not.toHaveURL(/game=2017_07_NYJ_MIA/);
  await expect(page.getByRole("figure", { name: `Game analysis: ${gb.date} ${gb.opponentDisplay}` })).toBeVisible();
});

test("matching filters and sorting preserve a selected game while excluding filters choose a valid fallback", async ({ page }) => {
  const det = games.find((game) => game.id === "2026_03_NYJ_DET")!;
  const greenBay = games.find((game) => game.id === "2026_02_GB_NYJ")!;
  const selectedDetroit = page.getByRole("figure", { name: `Game analysis: ${det.date} ${det.opponentDisplay}` });
  await page.goto(gameHref(det.id, "heartbreak"));
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption("2026");
  await expect(selectedDetroit).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`game=${det.id}`));
  await page.getByRole("combobox", { name: "Opponent", exact: true }).selectOption("GB");
  await expect(page).not.toHaveURL(/game=/);
  await expect(page.getByRole("figure", { name: `Game analysis: ${greenBay.date} ${greenBay.opponentDisplay}` })).toBeVisible();
  await page.getByRole("combobox", { name: "Opponent", exact: true }).selectOption("all");
  await page.getByRole("button", { name: new RegExp(`^Select ${det.date} `) }).click();
  await page.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("oldest");
  await expect(selectedDetroit).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`game=${det.id}`));
  await expect(page).toHaveURL(/sort=oldest/);
  await page.getByLabel("Search games", { exact: true }).fill("DET");
  await expect(selectedDetroit).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`game=${det.id}`));
});

test("keyboard play scrubbing shows the matching probability, clock and description", async ({ page }) => {
  const points = JSON.parse(readFileSync(path.join(process.cwd(), `public/data/curves/${gb.id}.json`), "utf8")) as { playId?: number; q: number; t: number; wp: number; desc: string }[];
  const key = keyPlayIndex(points, gb.keyPlay);
  await page.goto(gameHref(gb.id, "heartbreak"));
  const slider = page.getByRole("slider", { name: "Play sequence" });
  const readout = page.getByRole("status", { name: "Selected play" });
  await expect(slider).toHaveValue(String(key + 1));
  await expect(page.locator("circle[data-key-play]")).toHaveAttribute("data-key-play", String(points[key].playId ?? key));
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue(String(key + 2));
  await expect(readout).toContainText(`${(points[key + 1].wp * 100).toFixed(1)}%`);
  await expect(readout).toContainText(points[key + 1].desc);
  await slider.press("Home");
  await expect(slider).toHaveValue("1");
  await expect(readout).toContainText(`${(points[0].wp * 100).toFixed(1)}%`);
  await slider.press("End");
  await expect(slider).toHaveValue(String(points.length));
  await page.getByRole("button", { name: "Jump to key play" }).click();
  await expect(slider).toHaveValue(String(key + 1));
});

for (const width of [1280, 390, 320]) {
  test(`game explorer reflows and passes accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(gameHref(gb.id, "heartbreak"));
    await expect(page.getByRole("slider", { name: "Play sequence" })).toBeVisible();
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });
}
