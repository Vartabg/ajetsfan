import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/lib/games";
import { archiveFilters, filterArchive, gameHref } from "../src/lib/explorer";
import { keyPlayIndex } from "../src/lib/curve";

const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as { latestAnalyzedGameId: string | null };
const gb = games.find((game) => game.id === "2018_16_GB_NYJ")!;
const mia = games.find((game) => game.id === "2017_07_NYJ_MIA")!;
const points = JSON.parse(readFileSync(path.join(process.cwd(), `public/data/curves/${gb.id}.json`), "utf8")) as { playId?: number; q: number; t: number | null; wp: number; desc: string | null }[];

test("keyboard pagination moves into the revealed games and announces the displayed count without changing the URL", async ({ page }) => {
  const ranked = filterArchive(games, "heartbreak", archiveFilters(new URLSearchParams()));
  test.skip(ranked.length <= 48, "This archive has fewer than two full result batches.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/morgue");
  const originalUrl = page.url();
  const list = page.getByRole("list", { name: "Matching games", exact: true });
  await expect(list.locator("li")).toHaveCount(24);
  const summary = page.locator("#archive-results");
  await expect(summary).toContainText("24 shown.");
  await expect(summary).toHaveAttribute("aria-live", "polite");
  await expect(summary).toHaveAttribute("aria-atomic", "true");
  const more = page.getByRole("button", { name: "Show 24 more games", exact: true });
  await more.focus();
  await more.press("Enter");
  await expect(list.locator("li")).toHaveCount(48);
  const firstAdded = page.locator(`#archive-game-${ranked[24].id}`);
  await expect(firstAdded).toBeFocused();
  await expect(firstAdded).toBeInViewport();
  await expect(summary).toContainText("48 shown.");
  await page.keyboard.press("Tab");
  await expect(page.locator(`#archive-game-${ranked[25].id}`)).toBeFocused();
  await expect(page).toHaveURL(originalUrl);
});

for (const query of ["", "sort=oldest&q=NYJ"]) {
  test(`returning from a game beyond the first result batch reveals and focuses its row${query ? " while retaining search and sorting" : ""}`, async ({ page }) => {
    const params = new URLSearchParams(query);
    const latest = games.find((game) => game.id === current.latestAnalyzedGameId);
    const board = latest?.outcome === "win" ? "miracle" : "heartbreak";
    const ranked = filterArchive(games, board, archiveFilters(params));
    const selected = latest && ranked.findIndex((game) => game.id === latest.id) >= 24 ? latest : ranked[24];
    test.skip(!selected, "This archive selection fits in the first result batch.");
    if (!selected) return;
    params.set("game", selected.id);
    params.set("board", board);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/morgue?${params}`);
    const originalUrl = page.url();
    const row = page.locator(`#archive-game-${selected.id}`);
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: "Back to results", exact: true }).click();
    await expect(row).toBeFocused();
    await expect(row).toBeInViewport();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(row).toContainText("Open now");
    const shown = Math.min(ranked.length, Math.ceil((ranked.findIndex((game) => game.id === selected.id) + 1) / 24) * 24);
    await expect(page.getByRole("list", { name: "Matching games", exact: true }).locator("li")).toHaveCount(shown);
    await expect(page.locator("#archive-results")).toContainText(`${shown} shown.`);
    await expect(page.getByLabel("Search games", { exact: true })).toHaveValue(params.get("q") ?? "");
    await expect(page.getByRole("combobox", { name: "Sort by", exact: true })).toHaveValue(params.get("sort") ?? "swing");
    await expect(page).toHaveURL(originalUrl);
  });
}

test("find-game and return-to-results controls preserve the URL and restore useful focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(gameHref(gb.id, "heartbreak"));
  const originalUrl = page.url();
  await page.getByRole("button", { name: "Find a game", exact: true }).click();
  await expect(page.getByLabel("Search games", { exact: true })).toBeFocused();
  await expect(page).toHaveURL(originalUrl);
  const row = page.getByRole("button", { name: new RegExp(`^Select ${mia.date} `) });
  await row.click();
  await expect(page.locator("#game-case-heading")).toBeFocused();
  await expect(row).toContainText("Open now");
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("list", { name: "Matching games" }).locator('button[aria-pressed="true"]')).toHaveCount(1);
  const selectedUrl = page.url();
  await page.getByRole("button", { name: "Back to results", exact: true }).click();
  await expect(row).toBeFocused();
  await expect(page).toHaveURL(selectedUrl);
});

test("clearing an empty search retains season, opponent and sorting without resetting the board", async ({ page }) => {
  await page.goto(gameHref(gb.id, "heartbreak"));
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption("2018");
  await page.getByRole("combobox", { name: "Opponent", exact: true }).selectOption("GB");
  await page.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("oldest");
  const search = page.getByLabel("Search games", { exact: true });
  await search.fill("GB");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`game=${gb.id}`));
  await search.fill("no-such-play-zzzz");
  await expect(page.getByRole("heading", { name: "No games match.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Season", exact: true })).toHaveValue("2018");
  await expect(page.getByRole("combobox", { name: "Opponent", exact: true })).toHaveValue("GB");
  await expect(page.getByRole("combobox", { name: "Sort by", exact: true })).toHaveValue("oldest");
  await expect(page).toHaveURL(/board=heartbreak/);
  await expect(page).not.toHaveURL(/q=/);
  await expect(page.getByRole("figure", { name: `Game analysis: ${gb.date} ${gb.opponentDisplay}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
});

test("copying a canonical game link shows confirmation tied to that selection, including history", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (link: string) => {
      (window as unknown as { copiedArchiveLink: string }).copiedArchiveLink = link;
    } } });
  });
  await page.goto(gameHref(gb.id, "heartbreak"));
  const copied = page.getByRole("status", { name: "Game link sharing", exact: true });
  const copyButton = page.getByRole("button", { name: "Copy game link", exact: true });
  await copyButton.click();
  await expect(copied).toHaveText("Game link copied.");
  await expect(page.getByRole("button", { name: "Game link copied", exact: true })).toHaveText("Copied");
  await expect(copyButton).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { copiedArchiveLink: string }).copiedArchiveLink)).toBe(new URL(gameHref(gb.id, "heartbreak"), page.url()).href);
  await page.getByRole("button", { name: new RegExp(`^Select ${mia.date} `) }).click();
  await expect(copied).toBeEmpty();
  await copyButton.click();
  await expect(copied).toHaveText("Game link copied.");
  await expect(page.getByRole("button", { name: "Game link copied", exact: true })).toHaveText("Copied");
  await page.goBack();
  await expect(page.getByRole("figure", { name: `Game analysis: ${gb.date} ${gb.opponentDisplay}` })).toBeVisible();
  await expect(copied).toBeEmpty();
  await expect(copyButton).toHaveText("Copy game link");
});

test("clipboard failure offers the real permalink instead of a success state", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard unavailable"); } } });
  });
  await page.goto(gameHref(gb.id, "heartbreak"));
  await page.getByRole("button", { name: "Copy game link", exact: true }).click();
  await expect(page.getByRole("status", { name: "Game link sharing", exact: true })).toHaveText("Copy failed. Use the game permalink to share this game.");
  await expect(page.getByRole("link", { name: "Game permalink", exact: true })).toHaveAttribute("href", gameHref(gb.id, "heartbreak"));
  await expect(page.getByRole("button", { name: "Copy game link", exact: true })).toHaveText("Copy game link");
});

test("previous and next play controls respect the curve endpoints and published key marker", async ({ page }) => {
  await page.goto(gameHref(gb.id, "heartbreak"));
  const slider = page.getByRole("slider", { name: "Play sequence", exact: true });
  const previous = page.getByRole("button", { name: "Previous play", exact: true });
  const next = page.getByRole("button", { name: "Next play", exact: true });
  const readout = page.getByRole("status", { name: "Selected play", exact: true });
  await expect(slider).toHaveAttribute("max", String(points.length));
  await slider.focus();
  await slider.press("Home");
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(slider).toHaveValue("2");
  await expect(readout).toContainText(`${(points[1].wp * 100).toFixed(1)}%`);
  if (points[1].desc) await expect(readout).toContainText(points[1].desc);
  await slider.focus();
  await slider.press("End");
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(slider).toHaveValue(String(points.length - 1));
  await expect(readout).toContainText(`${(points.at(-2)!.wp * 100).toFixed(1)}%`);
  await page.getByRole("button", { name: "Jump to key play", exact: true }).click();
  const key = keyPlayIndex(points, gb.keyPlay);
  await expect(slider).toHaveValue(String(key + 1));
  await expect(page.locator("circle[data-key-play]")).toHaveAttribute("data-key-play", String(points[key].playId ?? key));
});

test("archive navigation and play controls have comfortable touch targets and reflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`${gameHref(gb.id, "heartbreak")}&q=GB`);
  for (const name of ["Find a game", "Back to results", "Clear search", "Copy game link", "Previous play", "Next play", "Jump to key play"]) {
    const control = page.getByRole("button", { name, exact: true });
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
  }
  expect((await page.getByRole("slider", { name: "Play sequence", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});
