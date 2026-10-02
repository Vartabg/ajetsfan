import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSnapshot } from "../src/lib/coverage";
import { filterRoster, playerHref } from "../src/lib/roster";

const coverage = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/coverage.json"), "utf8")) as CoverageSnapshot;
const player = coverage.roster.players[0];

test.beforeEach(async ({ page }) => {
  test.skip(!player, "This edition has no roster players for interaction checks.");
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("clear search keeps the selected player and other roster filters, then returns to the field", async ({ page }) => {
  const params = new URLSearchParams({ player: player.id, q: player.name, unit: player.group, position: player.position, status: player.status });
  await page.goto(`/team?${params}#roster`);
  const search = page.getByLabel("Find a player", { exact: true });
  await expect(search).toHaveValue(player.name);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(page.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
  const next = new URL(page.url()).searchParams;
  expect(next.has("q")).toBe(false);
  expect(new URL(page.url()).hash).toBe("#roster");
  expect(next.get("player")).toBe(player.id);
  expect(next.get("unit")).toBe(player.group);
  expect(next.get("position")).toBe(player.position);
  expect(next.get("status")).toBe(player.status);
  const expected = filterRoster(coverage.roster.players, { query: "", unit: player.group, position: player.position, status: player.status });
  await expect(page.getByRole("list", { name: "Roster players" }).locator("li")).toHaveCount(expected.length);
  await expect(page.getByRole("region", { name: player.name, exact: true })).toBeVisible();
});

test("Escape is scoped to the profile and returns to the selected card without losing history", async ({ page }) => {
  await page.goto("/team#roster");
  const card = page.getByRole("button", { name: `View ${player.name},`, exact: false });
  await card.click();
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(card).toContainText("Profile open");
  const search = page.getByLabel("Find a player", { exact: true });
  await search.focus();
  const before = await page.evaluate(() => window.scrollY);
  await search.press("Escape");
  await expect(page.getByRole("region", { name: player.name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await page.locator("#selected-player-heading").focus();
  await page.locator("#selected-player-heading").press("Escape");
  await expect(page.locator("#selected-player-heading")).toHaveCount(0);
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();
  await expect(card).toHaveAttribute("aria-expanded", "false");
  await expect(card).toContainText("View player");
  expect(new URL(page.url()).searchParams.has("player")).toBe(false);
  await page.goBack();
  await expect(page.getByRole("region", { name: player.name, exact: true })).toBeVisible();
  await expect(card).toHaveAttribute("aria-expanded", "true");
});

test("the profile footer returns a phone user to their player card with comfortable controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(playerHref(player.id));
  const profile = page.getByRole("region", { name: player.name, exact: true });
  for (const name of ["Close player", "Copy player link", "Back to roster"]) {
    const target = profile.getByRole("button", { name, exact: true });
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await profile.getByRole("button", { name: "Back to roster", exact: false }).click();
  const card = page.getByRole("button", { name: `View ${player.name},`, exact: false });
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();
  await expect(page.locator("#selected-player-heading")).toHaveCount(0);
});

for (const succeeds of [true, false]) {
  test(`copy player link gives ${succeeds ? "success" : "permalink fallback"} feedback`, async ({ page }) => {
    await page.addInitScript(({ succeeds }) => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async (text: string) => {
          if (!succeeds) throw new Error("Clipboard unavailable");
          sessionStorage.setItem("copied-player-link", text);
        },
      } });
    }, { succeeds });
    await page.goto(playerHref(player.id));
    const profile = page.getByRole("region", { name: player.name, exact: true });
    await profile.getByRole("button", { name: "Copy player link", exact: true }).click();
    const feedback = profile.getByRole("status", { name: "Player link copy status", exact: true });
    await expect(feedback).toHaveText(succeeds ? "Player link copied." : "Use the player permalink to share this selection.");
    if (succeeds) {
      await expect(profile.getByRole("button", { name: "Link copied", exact: true })).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem("copied-player-link"))).toBe(new URL(playerHref(player.id), page.url()).href);
    } else {
      await expect(profile.getByRole("link", { name: "Player permalink", exact: true })).toHaveAttribute("href", playerHref(player.id));
      await expect(profile.getByRole("button", { name: "Copy player link", exact: true })).toBeVisible();
    }
    await profile.getByRole("button", { name: "Close player", exact: true }).click();
    await page.getByRole("button", { name: `View ${player.name},`, exact: false }).click();
    await expect(profile.getByRole("button", { name: "Copy player link", exact: true })).toBeVisible();
    await expect(feedback).toBeEmpty();
  });
}
