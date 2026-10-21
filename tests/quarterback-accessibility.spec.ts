import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LeagueHistory } from "../src/lib/league-history";
import { buildCarousel } from "../src/lib/quarterbacks";

const history = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/league-history.json"), "utf8")) as LeagueHistory;
const carousel = buildCarousel(history.games)!;

// Two native fields cover the entire chart without adding hundreds of tab stops.
test("every quarterback game has a keyboard path and pointer previews preserve the selected game", async ({ page }) => {
  await page.goto("/history/quarterbacks");
  const season = page.getByRole("combobox", { name: "Season", exact: true });
  const game = page.getByRole("combobox", { name: "Game", exact: true });
  await expect(season).toHaveCount(1);
  await expect(game).toHaveCount(1);
  await expect(season.locator("option")).toHaveCount(carousel.seasons.length);

  // Native popup key conventions differ on macOS and Linux. Select the values
  // semantically, then verify their real tab path; native key use is also
  // checked in the macOS reader-path pass.
  const row = carousel.seasons[0];
  await season.selectOption(String(row.season));
  await expect(season).toHaveValue(String(row.season));
  await season.focus();
  await page.keyboard.press("Tab");
  await expect(game).toBeFocused();
  await game.selectOption("0");
  await expect(game).toHaveValue("0");
  const first = row.games[0];
  const readout = page.locator("#carousel [aria-live]");
  await expect(readout).toContainText(`${carousel.quarterbacks[first[0]].name} · ${row.season} week ${first[2]}`);
  await expect(readout).toContainText(first[3]);

  // A transient hover is separate from the game the keyboard reader chose.
  const another = carousel.seasons.at(-1)!;
  await page.locator("[data-focus-chart] > div").last().locator("i").last().hover();
  await expect(readout).toContainText(String(another.season));
  await season.hover();
  await expect(readout).toContainText(`${carousel.quarterbacks[first[0]].name} · ${row.season} week ${first[2]}`);
  await expect(game).toHaveValue("0");

  // Every season's full record is available as native option text, independently of colour.
  for (const row of carousel.seasons) {
    await season.selectOption(String(row.season));
    await expect(game.locator("option")).toHaveCount(row.games.length + 1);
    const labels = await game.locator("option").allTextContents();
    for (const [index, entry] of row.games.entries()) {
      expect(labels[index + 1]).toContain(carousel.quarterbacks[entry[0]].name);
      expect(labels[index + 1]).toContain(entry[3]);
      expect(labels[index + 1]).toContain(entry[1]);
    }
  }
  await page.getByRole("button", { name: "Show the names" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Hide the names" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(game).toBeFocused();
});

test("quarterback game fields retain focus and reflow in high contrast with reduced motion", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/history/quarterbacks");
  const game = page.getByRole("combobox", { name: "Game", exact: true });
  await game.focus();
  await expect(game).toBeFocused();
  expect(await game.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  for (const control of [page.getByRole("combobox", { name: "Season", exact: true }), game]) {
    const bounds = await control.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
