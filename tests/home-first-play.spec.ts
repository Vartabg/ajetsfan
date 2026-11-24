import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { homePlay } from "../src/lib/home-play";
import type { SnapGame } from "../src/lib/snap-types";

const archive: { games: SnapGame[] } = JSON.parse(gunzipSync(readFileSync("public/data/snaps/2026.json.gz")).toString());
const chargers = archive.games.find(game => game.id === "2026_11_NYJ_LAC")!;
const hall = chargers.plays.find(play => play.key === "3038")!;
const bills = archive.games.find(game => game.id === "2026_10_BUF_NYJ")!;
const allen = bills.plays.find(play => play.key === "2511")!;

test("the recorded Jets carry connects the score at the snap to the field and its replay", () => {
  const play = homePlay(chargers, hall, [{ id: "00-0038120", name: "Breece Hall" }]);
  expect(play).toMatchObject({
    time: "4th quarter · 11:12 left", score: "Jets led 20–17", situation: "Jets ball · 2nd & 10 at the Chargers 42",
    account: "Breece Hall ran 26 yards for a first down with 16 yards to the end zone.",
    hasDiagram: true, replay: "/replay/2026_11_NYJ_LAC/read?play=3038&phase=action",
    field: { start: 42, finish: 16, startLabel: "LAC 42", finishLabel: "LAC 16", offense: "NYJ", defense: "LAC" },
  });
  expect(hall.facts?.rusher).toBe("B.Hall");
  expect(homePlay(chargers, hall, [{ id: "a-different-player", name: "Breece Hall" }]).account).toContain("B. Hall ran");
});

test("an opponent completion shows its possession, direction and lead from the same instant", () => {
  const play = homePlay(bills, allen);
  expect(play).toMatchObject({
    time: "3rd quarter · 9:54 left", score: "Bills led 10–9", situation: "Bills ball · 1st & 10 at the Bills 38",
    hasDiagram: true, replay: "/replay/2026_10_BUF_NYJ/read?play=2511&phase=action",
    field: { start: 62, finish: 8, startLabel: "BUF 38", finishLabel: "NYJ 8", offense: "BUF", defense: "NYJ" },
  });
  expect(play.account).toContain("Josh Allen finds Dalton Kincaid");
});

test("only verified movement gets a line, and a recorded loss moves toward the offense's end zone", () => {
  const loss = { ...hall, description: "B.Hall left end for -3 yards.", facts: { ...hall.facts, yards: -3, firstDown: false } };
  expect(homePlay(chargers, loss).field).toMatchObject({ start: 42, finish: 45, finishLabel: "LAC 45" });
  for (const change of [{ yardline: null }, { possession: null }, { facts: { ...hall.facts, simpleAdvance: false } },
    { facts: { ...hall.facts, yards: 0 } }, { description: "The ruling was overturned on review." }]) {
    expect(homePlay(chargers, { ...hall, ...change }).field).toBeNull();
  }
});

test("a tie or a missing gamebook detail never becomes an inferred score, clock or diagram", () => {
  expect(homePlay(chargers, { ...hall, before: [0, 0] }).score).toBe("Tied 0–0");
  const older = { ...hall, quarter: 5, clock: null, before: null, facts: undefined, description: "Timeout #1 by NYJ.", type: "timeout" };
  expect(homePlay(chargers, older)).toMatchObject({ time: "OT", score: null, field: null, hasDiagram: false, situation: "Jets timeout" });
});
