import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import { filterArchive, gameSearchMatcher } from "../src/lib/explorer";
import { searchGameReports } from "../src/lib/game-discovery";
import type { Game } from "../src/lib/games";
import type { CurvePoint } from "../src/lib/load-games";
import { publishedGames } from "../src/lib/published-pages";

const read = <T,>(name: string): T => JSON.parse(readFileSync(path.join(process.cwd(), "public/data", name), "utf8")) as T;
const games = read<Game[]>("games.json");
const published = publishedGames(games, read<CurrentSnapshot>("current.json"));
const cleveland = "2022_02_NYJ_CLE";
const flagged = games.find((game) => game.dataSuspect)!;
const curves = Object.fromEntries([cleveland, "2000_08_MIA_NYJ", "2012_12_NE_NYJ"].map((id) => [id, read<CurvePoint[]>(`curves/${id}.json`)]));
const reports = (query: string) => searchGameReports(published, [], curves, query);

test("the archive searches names and source codes while retaining its board and era filters", () => {
  for (const query of ["Cleveland", "Browns", "CLE", "new york jets vs cleveland browns", cleveland, "A.Davis"]) {
    const filters = { season: "2022", opponent: "CLE", query, sort: "swing" } as const;
    expect(filterArchive(games, "miracle", filters).map((game) => game.id), query).toEqual([cleveland]);
    expect(filterArchive(games, "heartbreak", filters), query).toEqual([]);
  }

  const oakland = games.find((game) => game.opponentDisplay === "OAK")!;
  expect(gameSearchMatcher("Oakland Raiders")(oakland)).toBe(true);
  expect(gameSearchMatcher("OAK")(oakland)).toBe(true);
  expect(gameSearchMatcher("LV")(oakland)).toBe(true);
  expect(gameSearchMatcher("Las Vegas Raiders")(oakland)).toBe(false);
  const saintLouis = games.find((game) => game.opponentDisplay === "STL")!;
  expect(gameSearchMatcher("St Louis Rams")(saintLouis)).toBe(true);
  expect(gameSearchMatcher("Los Angeles Rams")(saintLouis)).toBe(false);
  expect(gameSearchMatcher("LA Rams")(saintLouis)).toBe(false);
  expect(gameSearchMatcher("LA")(saintLouis)).toBe(true);
  const rams = games.find((game) => game.opponentDisplay === "LA")!;
  const chargers = games.find((game) => game.opponentDisplay === "LAC")!;
  const sanDiego = games.find((game) => game.opponentDisplay === "SD")!;
  expect(gameSearchMatcher("LA Rams")(rams)).toBe(true);
  expect(gameSearchMatcher("LA Chargers")(chargers)).toBe(true);
  expect(gameSearchMatcher("LA Chargers")(sanDiego)).toBe(false);
  expect(gameSearchMatcher("LAC")(sanDiego)).toBe(true);
  const washington = games.find((game) => game.opponentDisplay === "WAS" && game.season >= 2022)!;
  const oldWashington = games.find((game) => game.opponentDisplay === "WAS" && game.season <= 2019)!;
  expect(gameSearchMatcher("Washington Commanders")(washington)).toBe(true);
  expect(gameSearchMatcher("Washington Commanders")(oldWashington)).toBe(false);
  expect(gameSearchMatcher("Washington Redskins")(oldWashington)).toBe(true);
  expect(gameSearchMatcher("Washington Redskins")(washington)).toBe(false);
});

test("published name search connects the exact game to available material", () => {
  const browns = reports("Browns").map(({ game }) => game.id);
  expect(reports("Cleveland").map(({ game }) => game.id)).toEqual(browns);
  expect(reports("CLE").map(({ game }) => game.id)).toEqual(browns);
  expect(new Set(reports("Browns").map(({ game }) => game.outcome))).toEqual(new Set(["win", "loss"]));
  expect(reports(flagged.id)).toEqual([]);

  expect(reports("Garrett Wilson").find(({ game }) => game.id === cleveland)?.material.map((link) => link.href)).toEqual([
    `/stories?story=${cleveland}#visual-story`,
    "/film-room?play=wilson-cleveland#film-room",
    "/film-room/replay/wilson-cleveland",
  ]);
  expect(reports("Monday Night Miracle").map(({ game }) => game.id)).toEqual(["2000_08_MIA_NYJ"]);
  expect(reports("Butt Fumble").map(({ game }) => game.id)).toEqual(["2012_12_NE_NYJ"]);
  const unavailable = searchGameReports(published, [], {}, "2022 Browns");
  expect(unavailable.map(({ game, material }) => [game.id, material])).toEqual([[cleveland, []]]);
  const wrongPlay = curves[cleveland].map((point) => point.t === 25 && /G\.Wilson for 15 yards/.test(point.desc ?? "") ? { ...point, playId: 123 } : point);
  const mismatched = searchGameReports(published, [], { [cleveland]: wrongPlay }, "2022 Browns");
  expect(mismatched[0].material.some((link) => link.href.includes("/replay/"))).toBe(false);
});

test("the search submits as a GET and opens the report and related material", async ({ page }) => {
  await page.goto("/find");
  await expect(page.getByRole("heading", { level: 1, name: "Find a game." })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search games" });
  await expect(search).toHaveValue("");
  await expect(page.getByRole("list", { name: "Matching games" })).toHaveCount(0);
  await search.fill("2022 Browns");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/find\?q=2022\+Browns$/);
  const result = page.getByRole("list", { name: "Matching games" }).getByRole("listitem");
  await expect(result).toContainText("Won 31–30");
  await expect(result.getByRole("link", { name: /^Wilson’s touchdown in 3D/ })).toHaveAttribute("href", "/film-room/replay/wilson-cleveland");

  await result.getByRole("link", { name: /^Game report/ }).click();
  await expect(page).toHaveURL(new RegExp(`/games/${cleveland}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Won 31–30");
  await page.goBack();
  await page.getByRole("link", { name: /^Visual story for Jets at Cleveland Browns/ }).click();
  await expect(page.locator("#visual-story")).toHaveAttribute("data-story", cleveland);
  await page.goBack();
  await page.getByRole("link", { name: /^Film Room · Wilson’s winning touchdown/ }).click();
  await expect(page).toHaveURL(/\/film-room\?play=wilson-cleveland#film-room$/, { timeout: 15_000 });
  await expect(page.locator("#film-room")).toHaveAttribute("data-film", "wilson-cleveland");
});

test("server search keeps broad results bounded and pages and empty states usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto("/find");
    await page.getByRole("searchbox", { name: "Search games" }).fill("Jets");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const results = page.getByRole("list", { name: "Matching games" }).getByRole("listitem");
    await expect(results).toHaveCount(20);
    const firstReport = await results.first().getByRole("link", { name: /^Game report/ }).getAttribute("href");
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(page).toHaveURL(/q=Jets&page=2#search-results$/);
    await expect(page.getByText(/Showing 21–40 of \d+ games/)).toBeVisible();
    await expect(results).toHaveCount(20);
    await expect(results.first().getByRole("link", { name: /^Game report/ })).not.toHaveAttribute("href", firstReport!);
    await page.getByRole("link", { name: "Previous page" }).click();
    await expect(results.first().getByRole("link", { name: /^Game report/ })).toHaveAttribute("href", firstReport!);
    await page.goto("/find?q=Jets&page=9999");
    await expect(page.getByRole("link", { name: "Next page" })).toHaveCount(0);
    await page.goto("/find?q=zzzz-no-matching-game");
    await expect(page.getByRole("heading", { name: "No games match." })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search games" })).toHaveValue("zzzz-no-matching-game");
  } finally {
    await context.close();
  }
});

test("search results reflow and pass accessibility checks at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/find?q=2022+Browns");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});
