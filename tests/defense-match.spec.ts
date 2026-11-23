import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { withClevelandDriveLineups } from "../src/lib/cleveland-drive-lineups";
import { defenseCriteria, defenseMatchHref, defenseStudyPath, earlierDefenseMatches, featuredDefense, selectDefenseMatch } from "../src/lib/defense-match";
import { defenseMatchField } from "../src/lib/defense-match-field";
import { buildDriveRead } from "../src/lib/drive-read";
import { parseSnapSeason } from "../src/lib/snap-data";
import { parseParticipationSeason, withParticipation } from "../src/lib/snap-participation";
import type { Snap, SnapGame } from "../src/lib/snap-types";

function archived(id: string, key: string) {
  const year = Number(id.slice(0, 4));
  const pack = (folder: string) => gunzipSync(readFileSync("public/data/" + folder + "/" + year + ".json.gz")).toString();
  const raw = parseSnapSeason(pack("snaps"), year).find(game => game.id === id)!;
  const game = withClevelandDriveLineups(withParticipation(raw, parseParticipationSeason(pack("participation"), year)));
  return { game, play: game.plays.find(play => play.key === key)! };
}
const buffalo = { game: "2021_10_BUF_NYJ", play: "3510" };

test("only a charted earlier throw on the same side, down, distance, coverage and rush count qualifies", () => {
  const anchor = archived(featuredDefense.game, featuredDefense.play);
  const earlier = archived(buffalo.game, buffalo.play);
  const { play } = earlier;
  const chart = play.facts!.charting!;
  const replaceChart = (key: string, c: typeof chart): Snap => ({ ...play, key, facts: { ...play.facts, charting: c } });
  const wrongPlays: Snap[] = [
    { ...play, key: "1", possession: "opponent" }, { ...play, key: "2", down: 2 }, { ...play, key: "3", distance: 9 },
    replaceChart("4", { ...chart, coverage: "COVER_2" }), replaceChart("5", { ...chart, rushers: 5 }),
    replaceChart("6", { ...chart, coverage: undefined }), replaceChart("7", { ...chart, rushers: undefined }),
    { ...play, key: "8", facts: { ...play.facts, kind: "sack" } }, { ...play, key: "9", type: "no_play" },
    { ...play, key: "10", description: "Penalty, no play." },
  ];
  const otherGames: SnapGame[] = [
    { ...anchor.game, date: earlier.game.date, plays: [play] }, // Same game, even with a different supplied date.
    { ...earlier.game, date: anchor.game.date, plays: [play] }, { ...earlier.game, date: "2023-09-01", plays: [play] },
    { ...earlier.game, source: "espn", plays: [play] }, { ...earlier.game, plays: wrongPlays },
  ];
  expect(earlierDefenseMatches(anchor, otherGames)).toEqual([]);
  expect(earlierDefenseMatches({ ...anchor, play: { ...anchor.play, facts: {} } }, [earlier.game])).toEqual([]);
  const matches = earlierDefenseMatches(anchor, [anchor.game, earlier.game]);
  expect(matches.map(sample => sample.play.key)).toEqual(["3510", "480"]);
  expect(defenseCriteria(anchor.play)).toEqual({ side: "jets", down: 3, distance: 10, coverage: "COVER_6", rushers: 4 });
  const selected = selectDefenseMatch(anchor, matches)!;
  expect([selected.selected.game.id, selected.selected.play.key]).toEqual([buffalo.game, buffalo.play]);
  expect(selectDefenseMatch(anchor, matches, { game: anchor.game.id, play: buffalo.play })).toBeNull();
  expect(buildDriveRead(anchor.game, { play: "4199" })).not.toHaveProperty("defenseMatch");
  expect(buildDriveRead(anchor.game, { play: "4199", phase: "action" })?.defenseMatch).toBe(defenseMatchHref(anchor.game.id, "4199"));
});

test("documented personnel rank first and ties keep gamebook order, including corrected play IDs", () => {
  const anchor = archived(featuredDefense.game, featuredDefense.play), earlier = archived(buffalo.game, buffalo.play);
  const chart = earlier.play.facts!.charting!;
  const sample = (key: string, personnel?: string): Snap => ({ ...earlier.play, key, facts: {
    ...earlier.play.facts, charting: { ...chart, defensePersonnel: personnel },
  } });
  const older = { ...earlier.game, plays: [sample("9000", "5 DB, 4 DL, 2 LB"), sample("10", chart.defensePersonnel)] };
  const recent = { ...older, id: "2022_01_BAL_NYJ", date: "2022-09-11",
    plays: [sample("1", "3 DL, 3 LB, 5 DB"), sample("2", undefined)] };
  const matches = earlierDefenseMatches(anchor, [recent, older]);
  expect(matches.map(sample => sample.play.key)).toEqual(["9000", "10", "1", "2"]);
  const many = Array.from({ length: 13 }, (_, i) => ({ game: older, play: { ...earlier.play, key: String(i + 1) } }));
  expect(selectDefenseMatch(anchor, many, { game: older.id, play: "8" })).toMatchObject({ total: 13, shown: 8, next: null });
  expect(selectDefenseMatch(anchor, many, { game: older.id, play: "12" })).toMatchObject({
    position: 12, next: null, first: { game: older.id, play: "1" },
  });
});

test("the two projections preserve pre-snap scores and only reveal measured air yards and ball paths on request", () => {
  const anchor = archived(featuredDefense.game, featuredDefense.play), earlier = archived(buffalo.game, buffalo.play);
  for (const sample of [anchor, earlier]) {
    const snap = defenseMatchField(sample, "snap")!, action = defenseMatchField(sample, "action")!;
    expect(snap.result).toBeNull();
    expect(snap.board.players.filter(p => p.unit === "O")).toHaveLength(11);
    expect(snap.board.players.filter(p => p.unit === "X")).toHaveLength(11);
    expect(snap.board.players.every(p => !p.path.length && !p.assignment && !p.credit)).toBe(true);
    expect([snap.board.events, snap.board.paths]).toEqual([[], []]);
    expect(action.score).toEqual(snap.score);
    expect(action.board.paths.length).toBeGreaterThan(0);
  }
  expect(defenseMatchField(anchor, "action")).toMatchObject({ clock: 25, score: [24, 30], result: { airYards: 14, toGain: 10 } });
  expect(defenseMatchField(earlier, "action")).toMatchObject({ clock: 789, score: [3, 38], result: { airYards: 2, toGain: 10 } });
  const changed = { ...anchor.play, description: "Different play outcome.", after: [77, 70] as [number, number],
    facts: { ...anchor.play.facts, airYards: -7, kind: "interception" as const, charting: { ...anchor.play.facts?.charting, primaryRoute: "GO" } } };
  expect(defenseMatchField({ game: anchor.game, play: changed }, "snap")).toEqual(defenseMatchField(anchor, "snap"));
  const unmeasured = { ...earlier, play: { ...earlier.play, facts: { ...earlier.play.facts, airYards: undefined } } };
  expect(defenseMatchField(unmeasured, "action")).toMatchObject({ result: { airYards: null }, board: { paths: [], events: [] } });
});

test("the default document and Flight payload expose the matched criteria and two clean setup boards", async ({ page, request }) => {
  const reveals: string[] = [];
  page.on("request", req => {
    const url = new URL(req.url());
    if (url.pathname.endsWith("/frames") || (url.pathname === defenseStudyPath && url.searchParams.get("phase") === "action")) reveals.push(req.url());
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(defenseStudyPath);
  const selected = page.locator('[data-defense-board="selected"]'), earlier = page.locator('[data-defense-board="earlier"]');
  await expect(page.getByRole("heading", { name: "Third and 10 · Cover 6 · 4 rushers" })).toBeVisible();
  await expect(selected).toHaveAttribute("data-game", featuredDefense.game);
  await expect(earlier).toHaveAttribute("data-game", buffalo.game);
  await expect(earlier).toHaveAttribute("data-play", buffalo.play);
  for (const field of [selected, earlier]) {
    await expect(field.locator('svg[data-full-field="snap"] [data-unit="O"]')).toHaveCount(11);
    await expect(field.locator('svg[data-full-field="snap"] [data-unit="X"]')).toHaveCount(11);
    await expect(field.locator("svg [data-trail-for], svg [data-path]")).toHaveCount(0);
  }
  const [left, right] = await Promise.all([selected.boundingBox(), earlier.boundingBox()]);
  expect(left!.y).toBe(right!.y);
  expect(left!.x + left!.width).toBeLessThan(right!.x);
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const response = await request.get(defenseStudyPath, { headers });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(headers.RSC ? "text/x-component" : "text/html");
    const payload = (await response.text()).replaceAll('\\"', '"').replaceAll("&quot;", '"');
    expect(payload).toContain("Cover 6");
    expect(payload).not.toMatch(/15-yard touchdown|pass incomplete short right|14 air yards|2 air yards|"primaryRoute"\s*:|"airYards"\s*:|"afterCatch"\s*:|"credit"\s*:|data-trail-for=|data-path=/i);
  }
  await page.getByRole("button", { name: "Reveal both plays" }).hover();
  await page.waitForLoadState("networkidle");
  expect(reveals).toEqual([]);
  await page.getByRole("link", { name: "Next match" }).click();
  await expect(selected).toHaveAttribute("data-play", "4199");
  await expect(earlier).toHaveAttribute("data-game", "2021_09_NYJ_IND");
  await expect(earlier).toHaveAttribute("data-play", "533");
  await expect(page.locator("[data-defense-comparison]")).toHaveAttribute("data-defense-comparison", "snap");
});

test.describe("native phone comparison", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  test("stacks the fields and reveals and rewinds both throws with the keyboard", async ({ page }) => {
    await page.goto(defenseMatchHref(featuredDefense.game, featuredDefense.play, buffalo));
    const boards = page.locator("[data-defense-board]");
    const [top, bottom] = await Promise.all([boards.nth(0).boundingBox(), boards.nth(1).boundingBox()]);
    expect(top!.x).toBe(bottom!.x);
    expect(top!.y + top!.height).toBeLessThanOrEqual(bottom!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Reveal both plays" }).focus();
    await page.keyboard.press("Enter");
    await expect(boards.nth(0)).toContainText("14 air yards · 4 yards beyond the line to gain");
    await expect(boards.nth(0)).toContainText("15-yard touchdown");
    await expect(boards.nth(0)).toContainText("Jets 24 · Browns 30");
    await expect(boards.nth(0)).toContainText("0:25");
    await expect(boards.nth(1)).toContainText("2 air yards · 8 yards short of the line to gain");
    await expect(boards.nth(1)).toContainText("incomplete short right");
    await expect(boards.nth(1)).toContainText("Jets 3 · Bills 38");
    await expect(boards.nth(1)).toContainText("13:09");
    await expect(boards.nth(0).locator('svg [data-path="pass"]')).toHaveCount(1);
    await expect(boards.nth(1).locator('svg [data-path="incomplete"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Rewind both plays" }).focus();
    await page.keyboard.press("Enter");
    await expect(boards.locator('svg[data-full-field="snap"]')).toHaveCount(2);
    await expect(boards.locator("svg [data-trail-for], svg [data-path]")).toHaveCount(0);
    await expect(boards.nth(0)).not.toContainText("15-yard touchdown");
  });
});

test("uncharted and unmatched plays have distinct empty states and an invalid requested pair never falls back", async ({ request }) => {
  const uncharted = await request.get(defenseMatchHref("2017_01_NYJ_BUF", "102"));
  const empty = await request.get(defenseMatchHref("2018_01_NYJ_DET", "197"));
  expect(uncharted.status()).toBe(200);
  const unavailable = await uncharted.text();
  expect(unavailable).toContain("Comparison unavailable for this snap");
  expect(unavailable).toContain("missing coverage for this snap");
  expect(empty.status()).toBe(200);
  expect(await empty.text()).toContain("No earlier match");
  for (const url of [defenseMatchHref(featuredDefense.game, featuredDefense.play, featuredDefense),
    defenseMatchHref(featuredDefense.game, featuredDefense.play, { ...buffalo, play: "43" }),
    defenseStudyPath + "?game=" + featuredDefense.game,
    defenseStudyPath + "?game=" + featuredDefense.game + "&play=4199&matchGame=" + buffalo.game]) {
    expect((await request.get(url)).status(), url).toBe(404);
  }
});
