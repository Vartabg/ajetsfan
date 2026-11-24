import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { homeGameRecap } from "../src/lib/home-game-recap";
import type { Snap, SnapGame, SnapScore } from "../src/lib/snap-types";

const archive: { games: SnapGame[] } = JSON.parse(gunzipSync(readFileSync("public/data/snaps/2026.json.gz")).toString());
const chargers = archive.games.find(game => game.id === "2026_11_NYJ_LAC")!;
const bills = archive.games.find(game => game.id === "2026_10_BUF_NYJ")!;

test("the Chargers recap follows the scoring and links Shepard's fourth-quarter touchdown", () => {
  const recap = homeGameRecap(chargers, [{ id: "00-0032385", name: "Sterling Shepard" }])!;
  expect(recap.periods).toEqual([[3, 3], [14, 7], [3, 0], [7, 14]]);
  expect(recap.text).toMatch(/17\s*[–-]\s*10/);
  expect(recap.text).toMatch(/\bhalf(?:time)?\b|\bthe break\b/i);
  expect(recap.text).toMatch(/(?:fourth|4th) quarter/i);
  expect(recap.text).toContain("Sterling Shepard");
  expect(recap.text).not.toMatch(/go-ahead|gave (?:the )?Jets the lead|put (?:the )?Jets ahead/i);
  expect(recap.playKey).toBe("3087");
});

test("the Buffalo recap gives the Bills' halftime lead, second-half margin and four Jets field goals", () => {
  const recap = homeGameRecap(bills)!;
  expect(recap.periods).toEqual([[0, 7], [6, 3], [6, 14], [0, 7]]);
  expect(recap.text).toMatch(/10\s*[–-]\s*6/);
  expect(recap.text).toMatch(/21\s*[–-]\s*6/);
  expect(recap.text).toMatch(/(?:four|4) field goals/i);
  const scoringPlay = bills.plays.find(play => play.key === recap.playKey);
  expect(scoringPlay?.before).toBeTruthy();
  expect(scoringPlay?.after).not.toEqual(scoringPlay?.before);
});

function snap(key: string, quarter: number, before: SnapScore | null, after: SnapScore | null, details: Partial<Snap> = {}): Snap {
  return {
    key, quarter, before, after,
    clock: 30, possession: null, down: null, distance: null, yardline: null,
    drive: null, wp: null, delta: null, type: null, description: "",
    ...details,
  };
}

function fieldGoal(key: string, quarter: number, before: SnapScore, after: SnapScore): Snap {
  return snap(key, quarter, before, after, {
    possession: before[0] < after[0] ? "jets" : "opponent",
    type: "field_goal",
    facts: { kick: { kind: "fieldGoal", outcome: "made" } },
  });
}

const regulationTie = [
  fieldGoal("jets-fg", 1, [0, 0], [3, 0]),
  fieldGoal("opponent-fg", 2, [3, 0], [3, 3]),
  snap("third-quarter", 3, [3, 3], [3, 3]),
  snap("fourth-quarter", 4, [3, 3], [3, 3]),
];

test("an overtime winner gets a fifth period and a scoring replay in overtime", () => {
  const overtimeKick = fieldGoal("overtime-fg", 5, [3, 3], [6, 3]);
  const recap = homeGameRecap({ ...chargers, final: [6, 3], plays: [...regulationTie, overtimeKick] })!;
  expect(recap.periods).toEqual([[3, 0], [0, 3], [0, 0], [0, 0], [3, 0]]);
  expect(recap.text).toMatch(/\bovertime\b|\bOT\b/i);
  expect(recap.playKey).toBe(overtimeKick.key);
});

test("a scoreless overtime remains a fifth period and the final remains a tie", () => {
  const overtime = snap("overtime", 5, [3, 3], [3, 3]);
  const recap = homeGameRecap({ ...chargers, final: [3, 3], plays: [...regulationTie, overtime] })!;
  expect(recap.periods).toEqual([[3, 0], [0, 3], [0, 0], [0, 0], [0, 0]]);
  expect(recap.text).toMatch(/\btie(?:d)?\b|\bdraw\b|\blevel\b/i);
  expect(recap.text).toMatch(/\bovertime\b|\bOT\b/i);
  expect(recap.text).not.toMatch(/\bwon\b|\bwinner\b/i);
});

test("a tying touchdown and the extra point that gives the Jets the lead are distinct events", () => {
  const plays = [
    fieldGoal("opponent-first-fg", 1, [0, 0], [0, 3]),
    fieldGoal("opponent-second-fg", 2, [0, 3], [0, 6]),
    snap("third-quarter", 3, [0, 6], [0, 6]),
    snap("tying-td", 4, [0, 6], [6, 6], { possession: "jets", type: "run", facts: { kind: "rush", touchdown: true } }),
    snap("go-ahead-pat", 4, [6, 6], [7, 6], {
      possession: "jets", type: "extra_point", facts: { kick: { kind: "extraPoint", outcome: "made" } },
    }),
  ];
  const recap = homeGameRecap({ ...chargers, final: [7, 6], plays })!;
  expect(recap.periods).toEqual([[0, 3], [0, 3], [0, 0], [7, 0]]);
  expect(recap.text).not.toMatch(/(?:go-ahead|winning|decisive) touchdown/i);
  expect(recap.text).toMatch(/extra point|\bPAT\b|conversion/i);
  expect(recap.playKey).toBe("go-ahead-pat");
});

const invalidHistories: { label: string; final: SnapScore; fourthQuarter: Snap }[] = [
  { label: "an unknown score", final: [3, 3], fourthQuarter: snap("unknown", 4, [3, 3], null) },
  { label: "a disconnected score", final: [6, 3], fourthQuarter: snap("disconnected", 4, [6, 3], [6, 3]) },
  { label: "a score regression", final: [0, 3], fourthQuarter: snap("regression", 4, [3, 3], [0, 3]) },
  { label: "a terminal score mismatch", final: [6, 3], fourthQuarter: regulationTie[3] },
];

for (const { label, final, fourthQuarter } of invalidHistories) {
  test(`the recap is omitted for ${label}`, () => {
    expect(homeGameRecap({ ...chargers, final, plays: [...regulationTie.slice(0, 3), fourthQuarter] })).toBeNull();
  });
}
