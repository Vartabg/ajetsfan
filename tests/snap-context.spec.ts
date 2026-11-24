import { expect, test, type Locator } from "@playwright/test";
import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { fieldPosition, scoreContext, snapAccount, snapHeadline, snapSituation, swingRank } from "../src/lib/snap-context";
import type { Snap, SnapGame } from "../src/lib/snap-types";

const cleveland = "/plays/2022_02_NYJ_CLE/";
const buffaloGameId = "2026_10_BUF_NYJ";
const buffalo = `/plays/${buffaloGameId}/`;

function definition(section: Locator, label: string) {
  return section.getByText(label, { exact: true }).and(section.locator("dt")).locator("xpath=following-sibling::dd[1]");
}

test.use({ javaScriptEnabled: false });

test("Wilson ties the score, with each team's timeouts and the swing ranked only through the touchdown", async ({ page }) => {
  await page.goto(cleveland + "4199");
  const snap = page.locator("#snap"), evidence = page.locator("#evidence");
  await expect(snap).toContainText("New York Jets at Cleveland Browns");
  await expect(snap).toContainText(/Q4\s*0:25 left/);
  await expect(snap).toContainText("Jets ball · 3rd & 10 at the Browns 15");
  await expect(snap).toContainText("Browns led 30–24 before the play. Now tied.");
  await expect(snap.getByRole("group", { name: "Score after this play" }))
    .toContainText(/Jets\s*0 timeouts left\s*30\s*Browns\s*1 timeout left\s*30/);
  await expect(snap).toContainText("Joe Flacco finds Garrett Wilson over the middle for a 15-yard touchdown.");
  await expect(evidence.getByRole("figure", { name: "Field position" }).getByRole("definition"))
    .toHaveText(["CLE 15", "CLE 5", "CLE goal line"]);
  await expect(definition(evidence, "Jets EPA")).toContainText("+3.85");
  await expect(definition(evidence, "Jets win probability")).toContainText("26.1% → 57.3%");
  await expect(evidence).toContainText(/Cover 6 · zone.*4 rushers.*2.04 seconds/);
  await evidence.getByText("Charting and source editions", { exact: true }).click();
  await expect(evidence.locator("details[open]")).toContainText(/October 20, 2026 source edition.*\+3.93/);
  await expect(definition(evidence, "Dropback probability")).toContainText("98.6%");
  await expect(definition(evidence, "Completion probability")).toContainText("41.5%");
  // Davis later has a larger change. He must not alter Wilson's rank or its denominator.
  await expect(definition(evidence, "Jets win probability")).toContainText(/#1 by size of swing among 165 measured plays so far/);
});

test("Davis takes the ball away from the Cleveland offense without an invented offensive finish or catch", async ({ page }) => {
  await page.goto(cleveland + "4276");
  const snap = page.locator("#snap"), evidence = page.locator("#evidence");
  await expect(snap).toContainText(/Q4\s*0:13 left/);
  await expect(snap).toContainText("Browns ball · 1st & 10 at the Browns 46");
  await expect(snap).toContainText("14 yards to midfield. The Jets take possession.");
  const field = evidence.getByRole("figure", { name: "Field position" });
  await expect(field.getByRole("term")).toHaveText(["Ball at snap", "Line to gain"]);
  await expect(field.getByRole("definition")).toHaveText(["CLE 46", "NYJ 44"]);
  await expect(definition(evidence, "Browns EPA")).toContainText("-0.74");
  await expect(definition(evidence, "Completion probability")).toContainText("58.4%");
  await expect(evidence.getByRole("heading", { name: "Where the throw went" })).toBeVisible();
  await expect(evidence).toContainText("18 air yards");
  await expect(evidence).toContainText("The target was 8 yards beyond the line to gain.");
  await expect(evidence.getByRole("heading", { name: "Where the yards came from" })).toHaveCount(0);
});

test("the Buffalo catch crosses midfield and its observed yards are separate from the model estimates", async ({ page }) => {
  const key = "2511";
  // The current-season nflverse models can change when the archive is refreshed.
  const archive: { games: SnapGame[] } = JSON.parse(gunzipSync(readFileSync("public/data/snaps/2026.json.gz")).toString("utf8"));
  const play = archive.games.find(game => game.id === buffaloGameId)?.plays.find(snap => snap.key === key);
  const facts = play?.facts;
  ok(play?.wp != null && play.postWp != null && facts?.epa != null &&
    facts.dropbackProbability != null && facts.completionProbability != null, "Buffalo play 2511 has all archived estimates");
  const percentage = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  const epa = Number(facts.epa.toFixed(2));

  await page.goto(buffalo + key);
  const snap = page.locator("#snap"), evidence = page.locator("#evidence");
  await expect(snap).toContainText("Buffalo Bills at New York Jets");
  await expect(snap).toContainText(/Q3\s*9:54 left/);
  await expect(snap).toContainText("Bills ball · 1st & 10 at the Bills 38");
  await expect(snap).toContainText("first-and-goal at the Jets 8");
  await expect(snap.getByRole("group", { name: "Score after this play" }))
    .toContainText(/Jets\s*3 timeouts left\s*9\s*Bills\s*3 timeouts left\s*10/);
  await expect(evidence.getByRole("figure", { name: "Field position" }).getByRole("definition"))
    .toHaveText(["BUF 38", "BUF 48", "NYJ 8"]);
  await expect(evidence).toContainText(/21 air yards\s*33 after the catch/);
  await expect(evidence).toContainText("61% of the gain came after the catch.");
  await expect(definition(evidence, "Bills EPA").locator("b")).toHaveText(`${epa > 0 ? "+" : ""}${epa.toFixed(2)}`);
  await expect(definition(evidence, "Jets win probability")).toContainText(`${percentage(play.wp)} → ${percentage(play.postWp)}`);
  await expect(evidence.getByRole("heading", { name: "How Cleveland defended Wilson" })).toHaveCount(0);
  await expect(definition(evidence, "Dropback probability").locator("b")).toHaveText(percentage(facts.dropbackProbability));
  await expect(definition(evidence, "Completion probability").locator("b")).toHaveText(percentage(facts.completionProbability));
});

test("negative air yards and a recorded zero after the catch remain visible", async ({ page }) => {
  const evidence = page.locator("#evidence");
  await page.goto(cleveland + "336");
  await expect(evidence).toContainText(/-3 air yards\s*16 after the catch/);
  await expect(evidence).toContainText("9 yards short of the line to gain.");
  await expect(evidence).toContainText("3 yards behind the line of scrimmage.");
  await expect(evidence).not.toContainText(/% of the gain/);
  await page.goto(buffalo + "1079");
  await expect(evidence).toContainText(/8 air yards\s*0 after the catch/);
  // New York is at home here, and the teams have different remaining timeout counts.
  await expect(page.getByRole("group", { name: "Score after this play" }))
    .toContainText(/Jets\s*3 timeouts left\s*\d+\s*Bills\s*2 timeouts left/);
});

test("a scramble advances the Browns and a goal-to-go loss moves the Jets away from the goal", async ({ page }) => {
  const snap = page.locator("#snap"), evidence = page.locator("#evidence");
  const field = evidence.getByRole("figure", { name: "Field position" });
  await page.goto(cleveland + "4255");
  await expect(snap.getByRole("heading", { level: 1 })).toHaveText(/Brissett scrambles for 21 yards/);
  await expect(snap).toContainText("Browns ball · 1st & 10 at the Browns 25");
  await expect(field.getByRole("definition")).toHaveText(["CLE 25", "CLE 35", "CLE 46"]);
  await expect(definition(evidence, "Dropback probability")).toContainText("88.9%");
  await expect(definition(evidence, "Completion probability")).toHaveCount(0);
  await page.goto(cleveland + "885");
  await expect(snap).toContainText("Jets ball · 1st & goal at the Browns 6");
  await expect(snap).toContainText("That leaves 2nd & goal.");
  await expect(field.getByRole("term")).toHaveText(["Ball at snap", "Goal line", "Finish"]);
  await expect(field.getByRole("definition")).toHaveText(["CLE 6", "CLE goal line", "CLE 7"]);
});

test("the try, kickoff and nullified pass retain their own score, situation and source record", async ({ page }) => {
  const snap = page.locator("#snap"), evidence = page.locator("#evidence");
  for (const [key, headline, situation] of [
    ["4224", "The extra point is good.", "Jets extra-point attempt"],
    ["4240", "The kickoff goes for a touchback.", "Kickoff from the Jets 35"],
    ["776", "A penalty wipes out the play.", "Jets ball · 2nd & 10 at the Browns 37"],
  ]) {
    await page.goto(cleveland + key);
    await expect(snap.getByRole("heading", { level: 1 })).toHaveText(headline);
    await expect(snap).toContainText(situation);
    await expect(evidence.getByRole("figure", { name: "Field position" })).toHaveCount(0);
    await expect(evidence.locator("dt").filter({ hasText: /EPA|Dropback probability|Completion probability/ })).toHaveCount(0);
    if (key === "4224") await expect(snap).toContainText("Tied 30–30 before the play. Jets lead by 1.");
  }
  await snap.getByText("Read the play record", { exact: true }).click();
  await expect(snap.locator("details[open]")).toContainText(/pass short right.*7 yards.*PENALTY.*No Play/i);
});

const providerGame: SnapGame = {
  id: "2022_02_NYJ_CLE", date: "2022-09-18", opponent: "CLE", home: false,
  source: "espn", eventId: "401437635", final: [31, 30], plays: [],
};
const providerPlay: Snap = {
  key: "e-4014376354199", quarter: 4, clock: 22, possession: "jets", down: 3, distance: 10, yardline: 15,
  before: [24, 30], after: null, drive: 19, wp: null, delta: null, type: "Passing Touchdown",
  description: "Garrett Wilson Pass From Joe Flacco for 15 Yds, touchdown.",
};

test("an unconfirmed provider row and a legacy row preserve missing scores, field details and models", () => {
  expect(scoreContext(providerPlay.before, providerPlay.after, "Browns")).toMatch(/score after this play unavailable/i);
  expect(scoreContext(null, [0, 0], "Browns")).toBe("Tied at 0.");
  expect(snapAccount(providerGame, providerPlay)).toBe("Joe Flacco finds Garrett Wilson for a 15-yard touchdown.");
  expect(fieldPosition(providerGame, providerPlay)).toMatchObject({ start: 15, line: 5, finish: null });
  const legacy: Snap = { ...providerPlay, key: "100", type: "pass", description: "Pass incomplete.",
    possession: null, down: null, distance: null, yardline: null, before: null, after: null };
  const old: SnapGame = { ...providerGame, source: "nflverse", plays: [legacy] };
  expect(fieldPosition(old, legacy)).toBeNull();
  expect(snapSituation(old, legacy)).toBe("Pre-play situation unavailable");
  expect(snapHeadline(old, legacy)).toMatch(/incomplete/i);
  expect(swingRank(old.plays)).toBeNull();
});

// Use React's JSX transform for synthetic server-rendered cases. Playwright's JSX transform targets component tests.
function serverComponents() {
  const file = resolve("src/components/SnapGameState.tsx");
  const nodeRequire = createRequire(file);
  const exports = {} as Pick<typeof import("../src/components/SnapGameState"), "GameScoreboard" | "PlayAnalysis">;
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } });
  runInNewContext(outputText, { exports, require: (name: string) => name.endsWith(".module.css") ? { default: {} } :
    nodeRequire(name.startsWith("@/lib/") ? "../lib/" + name.slice(6) + ".ts" : name) });
  return exports;
}

test("an ESPN scoreboard gap uses only earlier evidence and labels its time", () => {
  const { GameScoreboard, PlayAnalysis } = serverComponents();
  const known: Snap = { ...providerPlay, key: "prior", clock: 30, after: [24, 30] };
  const gap: Snap = { ...providerPlay, before: null, after: null };
  const future: Snap = { ...providerPlay, key: "future", clock: 13, after: [31, 30] };
  const game = { ...providerGame, plays: [known, gap, future] };
  const board = (plays: Snap[]) => renderToStaticMarkup(createElement(GameScoreboard, { plays, game, nickname: "Browns" }));
  const fallback = board([known, gap]);
  expect(fallback).toContain('aria-label="Last recorded score · Q4 0:30"');
  expect(fallback).toContain("<strong>24</strong>");
  expect(fallback).toContain("Score after this play unavailable.");
  expect(fallback).toContain("0:22 · ESPN clock");
  expect(fallback).not.toContain("<strong>31</strong>");
  expect(board([known, providerPlay])).toContain('aria-label="Score entering this play"');
  expect(board([gap])).not.toContain('role="group"');
  expect(board([{ ...gap, facts: { timeouts: [0, 2] } }])).toContain("Timeouts remaining · Jets 0, Browns 2");
  expect(renderToStaticMarkup(createElement(PlayAnalysis, { game, plays: [known, gap] }))).toBe("");
});

test("an ordinary completion with a missing or inconsistent catch split shows only its supported models", () => {
  const { PlayAnalysis } = serverComponents();
  const play: Snap = { ...providerPlay, key: "100", type: "pass", description: "J. Flacco to G. Wilson for 12 yards.",
    facts: { kind: "completion", simpleAdvance: true, passer: "J.Flacco", target: "G.Wilson", yards: 12, airYards: 12, epa: 0 } };
  const game: SnapGame = { ...providerGame, source: "nflverse" };
  for (const facts of [play.facts, { ...play.facts, afterCatch: 3 }]) {
    const markup = renderToStaticMarkup(createElement(PlayAnalysis, { game, plays: [{ ...play, facts }] }));
    expect(markup).toContain("Jets EPA");
    expect(markup).toContain("0.00");
    expect(markup).not.toMatch(/Where the yards came from|Dropback probability|Completion probability/);
  }
});

test("swing magnitude uses competition ranks, source precision and measured observations", () => {
  const rank = (...deltas: (number | null)[]) => swingRank(deltas.map(delta => ({ ...providerPlay, delta })));
  expect(rank(.04, -.04, null, .02, .01, -.02)).toEqual({ rank: 3, tied: true, measured: 5 });
  expect(rank(.0201, -.0204)).toEqual({ rank: 1, tied: true, measured: 2 });
  expect(rank(0, .005)).toEqual({ rank: 1, tied: false, measured: 2 });
  expect(rank(.04, .004)).toBeNull();
  expect(rank(null, .03)).toBeNull();
  expect(rank(.04, null)).toBeNull();
});
