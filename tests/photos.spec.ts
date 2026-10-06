import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import { publishedGames } from "../src/lib/published-pages";
import { gameEditorialPhoto, playerActionPhoto } from "../src/lib/editorial-photos";

const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
// Game photographs render on the game report page, not the home page. The first test verifies this game's photograph.
const photoGameId = "2026_03_NYJ_DET";
const photoGame = publishedGames(games, current).find((game) => game.id === photoGameId);
const gamePhoto = gameEditorialPhoto(photoGameId);

// Intercept only the optimizer requests for editorial club photographs. Roster
// portraits, local assets, and ordinary page requests keep their normal behavior.
function officialClubImage(url: URL): boolean {
  if (url.pathname !== "/_next/image") return false;
  const source = url.searchParams.get("url");
  if (!source) return false;
  try {
    return new URL(source).hostname === "static.clubs.nfl.com";
  } catch {
    return false;
  }
}

const imageFixture = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>';

test("a verified game photograph cannot follow a different fixture or season", () => {
  const photo = gameEditorialPhoto("2026_03_NYJ_DET");
  expect(photo).not.toBeNull();
  expect(photo?.caption).toContain("At Detroit");
  expect(photo?.caption).toContain("Sep 27, 2026");
  expect(photo?.sourceHref).toBe("https://www.newyorkjets.com/photos/game-photos-jets-vs-lions-week-3-09-27-2026");

  for (const id of ["2026_04_NYJ_CHI", "2026_04_NYJ_DET", "2026_03_DET_NYJ", "2025_03_NYJ_DET", "2027_03_NYJ_DET", ""]) {
    expect(gameEditorialPhoto(id), `No Detroit photograph for ${id || "an absent game"}`).toBeNull();
  }
});

test("player photographs expire with their edition and keep practice context", () => {
  for (const playerId of ["00-0030565", "00-0038120", "00-0037740"]) {
    expect(playerActionPhoto(playerId, 2026)?.playerId).toBe(playerId);
    for (const season of [2025, 2027]) expect(playerActionPhoto(playerId, season)).toBeNull();
  }
  expect(playerActionPhoto("00-unknown-player", 2026)).toBeNull();
  expect(playerActionPhoto("00-0038120", 2026)?.caption).toContain("Practice");
});

for (const view of [
  { route: `/games/${photoGameId}`, container: 'section[aria-labelledby="game-report-heading"]', photo: gamePhoto },
]) {
  test(`${view.route} keeps the photograph's descriptive alt, context, and official source`, async ({ page }) => {
    test.skip(!view.photo, "This edition has no verified editorial photograph for this view.");
    if (!view.photo) return;
    await page.route(officialClubImage, (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: imageFixture }));
    const response = await page.goto(view.route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${view.route} is a published page`).toBe(200);

    const figure = page.locator(`${view.container} figure`).filter({ has: page.getByRole("img", { name: view.photo.alt, exact: true }) });
    const image = figure.getByRole("img", { name: view.photo.alt, exact: true });
    // The game report's photograph sits below the header and loads lazily.
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("alt", view.photo.alt);
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(figure.locator("figcaption")).toContainText(view.photo.caption);
    const source = figure.locator("figcaption").getByRole("link", { name: view.photo.credit, exact: false });
    await expect(source).toHaveAttribute("href", view.photo.sourceHref);
    await expect(source).toHaveAttribute("target", "_blank");
    await expect(source).toHaveAttribute("rel", /noreferrer/);
  });
}

test("a failed official game image leaves its source and final score usable on mobile", async ({ page }) => {
  if (!photoGame || !gamePhoto) throw new Error(`${photoGameId} needs a verified photograph and a published game report.`);
  await page.setViewportSize({ width: 390, height: 844 });
  let failedRequests = 0;
  await page.route(officialClubImage, async (route) => {
    failedRequests += 1;
    await route.abort("failed");
  });
  await page.goto(`/games/${photoGame.id}`, { waitUntil: "domcontentloaded" });

  const report = page.locator('section[aria-labelledby="game-report-heading"]');
  const figure = report.locator("figure").filter({ has: page.locator("figcaption").filter({ hasText: gamePhoto.caption }) });
  // The photograph loads lazily, so it only requests (and fails) once it nears the viewport.
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.getByText("Photograph unavailable", { exact: true })).toBeVisible();
  expect(failedRequests).toBeGreaterThan(0);
  await expect(figure.getByRole("img", { name: gamePhoto.alt, exact: true })).toHaveCount(0);
  const original = figure.getByRole("link", { name: "View the original Jets coverage", exact: false });
  await expect(original).toBeVisible();
  await expect(original).toHaveAttribute("href", gamePhoto.sourceHref);
  await original.focus();
  await expect(original).toBeFocused();
  await expect(figure.locator("figcaption")).toContainText(gamePhoto.caption);
  await expect(report.locator("#game-report-heading")).toBeVisible();

  const scoreboard = page.getByLabel(`Final score: Jets ${photoGame.jetsScore}, ${photoGame.opponentDisplay} ${photoGame.oppScore}`, { exact: true });
  await expect(scoreboard).toBeVisible();
  await expect(scoreboard.locator("strong")).toHaveText([String(photoGame.jetsScore), String(photoGame.oppScore)]);
  await expect(page.locator(`article > header time[datetime="${photoGame.date}"]`)).toBeVisible();
});
