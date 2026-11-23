import { expect, test } from "@playwright/test";
import { clipId, percent, studyGroups, studyHref } from "../src/lib/replay-studies";
import type { Snap, SnapFacts, SnapGame } from "../src/lib/snap-types";

function play(key: string, facts: SnapFacts, situation: Partial<Snap> = {}): Snap {
  return { key, quarter: 2, clock: 128, possession: "jets", down: 3, distance: 8, yardline: 52,
    before: [7, 3], after: [7, 3], drive: 4, wp: null, delta: null, type: "pass", description: "Recorded throw", ...situation, facts };
}
function game(year: number, plays: Snap[], source: SnapGame["source"] = "nflverse"): SnapGame {
  return { id: year + "_03_NYJ_BUF", date: year + "-09-20", opponent: "BUF", home: false, source, plays, final: [14, 10] };
}

test("measured third-down targets use air yards at the line to gain and credited outcomes", () => {
  const attempt: SnapFacts = { kind: "completion", target: "M.Receiver", airYards: 3, firstDown: true, yards: 10, thirdDownResult: "converted" };
  const snaps = [
    play("1", attempt), // A short throw that converts after the catch.
    play("2", { ...attempt, kind: "incompletion", airYards: 8, firstDown: false, thirdDownResult: "failed" }),
    play("3", { ...attempt, airYards: 10, firstDown: undefined, touchdown: true }),
    play("4", { ...attempt, kind: "interception", airYards: -2, firstDown: false, thirdDownResult: "failed" }),
    play("5", { ...attempt, firstDown: undefined, touchdown: false, thirdDownResult: undefined }),
    play("6", { ...attempt, target: undefined }), play("7", { ...attempt, airYards: undefined }),
    play("8", attempt, { distance: null }), play("9", attempt, { down: 4 }),
    play("10", attempt, { possession: "opponent" }), play("11", { ...attempt, kind: "sack" }),
    play("12", { ...attempt, thirdDownResult: "no-attempt" }),
    play("13", { ...attempt, thirdDownResult: "failed" }),
  ];
  // The early archive records catch depth selectively. Including it inflates both groups.
  const legacy = play("1", { ...attempt, thirdDownResult: undefined });
  const [short, sticks] = studyGroups([game(2008, snaps), game(2022, snaps), game(2023, snaps, "espn"), game(2009, [legacy])], "throws", 3, 8);
  expect(short.samples.map(clipId)).toEqual(["2022_03_NYJ_BUF~1", "2022_03_NYJ_BUF~4", "2022_03_NYJ_BUF~13", "2009_03_NYJ_BUF~1"]);
  expect([short.converted, sticks.converted, sticks.samples.map(row => row.play.key)]).toEqual([2, 1, ["2", "3"]]);
});

test("pass rush matches possession, exact distance and exact rusher count; sacks count as opportunities", () => {
  const defense = { possession: "opponent" as const };
  const four: SnapFacts = { kind: "incompletion", firstDown: false, charting: { rushers: 4 } };
  const five: SnapFacts = { kind: "sack", firstDown: false, charting: { rushers: 5 } };
  const snaps = [
    play("1", four, defense), play("2", { ...four, kind: "completion", firstDown: true }, defense),
    play("3", five, defense), play("4", { ...five, kind: "completion", touchdown: true }, defense),
    play("5", { ...five, charting: { rushers: 6 } }, defense), play("6", { ...four, charting: undefined }, defense),
    play("7", four, { ...defense, distance: 7 }), play("8", four, { ...defense, down: 2 }),
    play("9", four), play("10", { ...four, kind: "rush" }, defense), play("11", { ...four, firstDown: undefined }, defense),
  ];
  const groups = studyGroups([game(2022, snaps), game(2015, snaps)], "pass-rush", 3, 8);
  expect(groups.map(({ id, converted, sacks, samples }) => [id, converted, sacks, samples.map(row => row.play.key)]))
    .toEqual([["four", 1, 0, ["1", "2"]], ["five", 1, 1, ["3", "4"]]]);
  const adjacent = studyGroups([game(2022, snaps)], "pass-rush", 3, 7);
  expect(adjacent[0].samples.map(row => row.play.key)).toEqual(["7"]);
  expect(percent(adjacent[1].sacks, adjacent[1].samples.length)).toBe("—");
  expect(percent(0, 2)).toBe("0%");
});

test("a bookmarked cutup keeps its situation and the selected snap when the list grows", () => {
  const url = new URL(studyHref("pass-rush", { season: 2022, down: 2, distance: 10, group: "five",
    page: 3, clip: "2022_03_NYJ_BUF~43" }, "#cutups"), "https://ajetsfan.com");
  expect(Object.fromEntries(url.searchParams)).toEqual({ season: "2022", down: "2", distance: "10", group: "five", clip: "2022_03_NYJ_BUF~43" });
  expect(url.hash).toBe("#cutups");
});
