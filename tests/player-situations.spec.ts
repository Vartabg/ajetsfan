import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { findPlayerChoices, playerChoices, playerSituations, playerStudyHref } from "../src/lib/player-situations";
import type { Snap, SnapFacts, SnapGame } from "../src/lib/snap-types";

const allen = "00-0039794";
const other = "00-0000001";
const finder = "/replay/studies/player";
const attempt = (key: string, facts: SnapFacts, overrides: Partial<Snap> = {}): Snap => ({
  key, quarter: 3, clock: 60, possession: "jets", down: 3, distance: 2, yardline: 15,
  before: [7, 7], after: [7, 7], wp: null, delta: null, drive: 4, type: "run", description: "", facts, ...overrides,
});
const game = (plays: Snap[]): SnapGame => ({
  id: "2026_11_NYJ_LAC", date: "2026-11-22", opponent: "LAC", home: false, source: "nflverse", final: [27, 24], plays,
});

test("player credits distinguish identical names, roles, missing identities and unresolved outcomes", () => {
  const rush: SnapFacts = { kind: "rush", rusher: "B.Allen", rusherId: allen, thirdDownResult: "converted" };
  const recorded = game([
    attempt("1", rush),
    attempt("2", { ...rush, rusherId: other, thirdDownResult: "failed" }),
    attempt("3", { ...rush, rusherId: undefined }),
    attempt("4", { ...rush, thirdDownResult: undefined }),
    attempt("5", { ...rush, thirdDownResult: "no-attempt" }),
    attempt("6", rush, { possession: "opponent" }),
    attempt("7", rush, { distance: 3 }),
    attempt("8", { kind: "completion", passer: "J.Smith", passerId: other, target: "B.Allen", targetId: allen, touchdown: true }, { type: "pass" }),
    attempt("9", { kind: "kneel", rusher: "B.Allen" }),
  ]);
  const choices = playerChoices([recorded], null);
  expect(findPlayerChoices(choices, "b allen").map(p => p.id)).toEqual([other, allen]);
  expect(findPlayerChoices([{ id: allen, name: "Braelon Allen", position: "RB" },
    { id: other, name: "Brandon Allen", position: "QB" }], "B. Allen").map(p => p.id)).toEqual([allen, other]);
  const carries = playerSituations([recorded], allen, "carry", "third-short");
  expect(carries).toMatchObject({ eligible: 4, identified: 3, known: 1, converted: 1, stopped: 0 });
  expect(carries.clips.map(clip => [clip.play.key, clip.result])).toEqual([["1", true], ["4", null]]);
  expect(playerSituations([recorded], allen, "pass", "red-zone").clips).toEqual([]);
  expect(playerSituations([recorded], allen, "target", "red-zone")).toMatchObject({ known: 1, converted: 1 });
});

test("red-zone rates measure scoring on the play, preserving unknowns and the 20-yard boundary", () => {
  const rush: SnapFacts = { kind: "rush", rusher: "B.Allen", rusherId: allen };
  const sample = game([
    attempt("1", { ...rush, touchdown: true }, { yardline: 1 }),
    attempt("2", { ...rush, touchdown: false }, { yardline: 20 }),
    attempt("3", rush, { yardline: 19 }),
    ...[0, 21, null].map((yardline, i) => attempt("outside" + i, rush, { yardline })),
  ]);
  const results = playerSituations([sample], allen, "carry", "red-zone");
  expect(results).toMatchObject({ known: 2, converted: 1, stopped: 1, identified: 3 });
  expect(results.clips.map(clip => clip.result)).toEqual([true, false, null]);
});

test("Allen's six short-yardage carries through Week 11 reproduce the individual source credits", () => {
  const archive = JSON.parse(gunzipSync(readFileSync("public/data/snaps/2026.json.gz")).toString()) as { games: SnapGame[] };
  const sample = playerSituations(archive.games.filter(g => g.date <= "2026-11-22"), allen, "carry", "third-short");
  expect(sample).toMatchObject({ known: 6, converted: 4, stopped: 2 });
  expect(sample.clips.slice(0, 3).map(({ game, play, result }) =>
    [game.id, play.key, play.quarter, play.clock, play.facts?.yards, result])).toEqual([
    ["2026_11_NYJ_LAC", "2340", 3, 540, 2, true],
    ["2026_11_NYJ_LAC", "2406", 3, 419, 4, true],
    ["2026_11_NYJ_LAC", "2476", 3, 340, 6, true],
  ]);
});

test.describe("the finder without JavaScript", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  test("Allen's profile opens his carries and a stopped play opens at its exact result", async ({ page }) => {
    await page.goto("/players/" + allen);
    await page.getByRole("link", { name: /Study Braelon’s third-and-short carries/ }).click();
    await expect(page).toHaveURL(url => url.pathname === finder && url.searchParams.get("player") === allen);
    await expect(page.locator("#finder")).toContainText("Braelon Allen");
    await expect(page.locator("#finder")).toContainText("2 stopped short");
    await page.locator('#snaps a[href="/replay/2026_01_NYJ_TEN/read?play=1398&phase=action"]').click();
    await expect(page.locator("#drive-reader")).toContainText("B. Allen runs for no gain.");
  });
  test("Find leads to older player records with stable pagination, ambiguous names and an empty selection", async ({ page }) => {
    await page.goto("/find");
    await page.getByRole("link", { name: "Find a player by situation" }).click();
    const form = page.getByRole("form", { name: "Find player situations" });
    await form.getByLabel("Season").selectOption("2004");
    await form.getByLabel("Player", { exact: true }).fill("Curtis Martin");
    await form.getByRole("button", { name: "Find plays" }).click();
    await expect(page.locator("#finder")).toContainText("10 of 13 converted");
    await page.getByRole("link", { name: "More plays" }).click();
    await expect(page.locator("#snaps")).toContainText("Showing 13–13 of 13");
    await expect(page.locator("#snaps ol li")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(finder + "?season=2022&name=Wilson&situation=red-zone");
    await page.getByRole("link", { name: "Garrett Wilson · WR" }).click();
    await expect(page.locator("#finder")).toContainText("2 of 18 ended in a touchdown");
    await page.goto(playerStudyHref(allen, 2026, "pass", "third-down"));
    await expect(page.locator("#finder")).toContainText("No verified passes for Braelon Allen");
  });
});

test("malformed player keys, duplicate controls and invalid situation bookmarks are rejected", async ({ request }) => {
  for (const suffix of ["?player=B.Allen", "?season=1998", "?name=A&name=B", "?role=__proto__",
    "?situation=goal-line", "?season=2022&page=1000", "?player=" + allen + "&name=Allen"]) {
    expect((await request.get(finder + suffix)).status(), suffix).toBe(404);
  }
});
