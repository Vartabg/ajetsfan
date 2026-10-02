import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/lib/games";
import type { CurvePoint } from "../src/lib/load-games";
import {
  buildFilmCases, coverageCounts, coverageLessons, filmGameIds, parseFilmSelection, pressureLabels, pressureOptions,
  type CoverageId, type FilmCase, type PressureId,
} from "../src/lib/film-room";

const data = path.join(process.cwd(), "public/data");
const games = JSON.parse(readFileSync(path.join(data, "games.json"), "utf8")) as Game[];
const curves: Record<string, CurvePoint[]> = Object.fromEntries(filmGameIds.map((id) => [id,
  JSON.parse(readFileSync(path.join(data, "curves", `${id}.json`), "utf8")) as CurvePoint[],
]));
const cases = buildFilmCases(games, curves);
const expectedCases = ["wilson-cleveland", "elliott-miami", "hall-miami", "sanchez-thanksgiving"];
const pointChange = (film: FilmCase, change: Partial<CurvePoint>) => ({
  ...curves, [film.game.id]: curves[film.game.id].map((point, index) => index === film.playIndex ? { ...point, ...change } : point),
});

test("the four cases reference the original uniquely identified source rows", () => {
  expect(cases.map((film) => film.id)).toEqual(expectedCases);
  expect(cases.map((film) => film.playIndex)).toEqual([165, 190, 212, 57]);
  expect(cases.map((film) => [film.play.q, film.play.t, film.play.type])).toEqual([[4, 25, "pass"], [4, 80, "pass"], [5, 493, "field_goal"], [2, 2350, "run"]]);
  expect(cases.map((film) => film.category)).toEqual(["great", "great", "great", "painful"]);
  for (const film of cases) {
    expect(film.play).toBe(curves[film.game.id][film.playIndex]);
    expect(film.game).toBe(games.find((game) => game.id === film.game.id));
    expect(film.scene).toBeUndefined();
  }
  expect(cases[0].play.desc).toContain("17-G.Wilson for 15 yards, TOUCHDOWN");
  expect(cases[1].play.desc).toContain("#76 Elliott reports eligible");
  expect(cases[2].play.desc).toContain("Center-B.Banta, Holder-T.Tupa");
  expect(cases[3].play.desc).toContain("RECOVERED by NE-28-S.Gregory");
});

test("pre-play estimates and reported changes stay separate from confirmed results", () => {
  expect(cases.map((film) => [film.play.wp, film.play.d])).toEqual([[.261, .312], [.268, .151], [.786, .214], [.176, -.061]]);
  expect(cases[2].play.wp).toBeLessThan(1);
  expect(cases[2].recordedFacts.find((fact) => fact.label === "Confirmed final")?.value).toContain("Jets 40, Miami 37");
  for (const film of cases) {
    const nullable = buildFilmCases(games, pointChange(film, { d: null })).find((item) => item.id === film.id)!;
    expect(nullable.play.d).toBeNull();
    expect(nullable.play.wp).toBe(film.play.wp);
    expect(nullable.play).not.toHaveProperty("afterWp");
  }
});

test("the repeated Elliott clock and independently sourced overtime clock are explicit", () => {
  const elliott = cases[1];
  expect(elliott.play.t).toBe(80);
  expect(elliott.clockNote).toContain("exact snap clock is uncertain");
  expect(elliott.clockNote).toContain("repeat 1:20 from the preceding play");
  expect(elliott.recordedFacts.find((fact) => fact.label === "Scoring clock")?.value).toContain(":42 after the touchdown");
  expect(elliott.recordedFacts.map((fact) => fact.value).join(" ")).not.toContain("1:20");
  expect(cases[2].clockNote).toContain("8:13 in overtime");
  expect(cases[2].recordedFacts.find((fact) => fact.label === "Gamebook clock")?.value).toContain("OT 8:13");
  expect(cases[0].recordedFacts.find((fact) => fact.label === "Game clock")?.value).toContain(":25 before the play");
  expect(cases[3].recordedFacts.find((fact) => fact.label === "Before the snap")?.value).toContain("Q2 9:10");
});

test("source packages identify primary evidence and leave unverified assignments unresolved", () => {
  for (const film of cases) {
    expect(film.video.youtubeId).toMatch(/^[\w-]{11}$/);
    expect(film.watchFor.length).toBeGreaterThan(0);
    expect(film.unresolved.join(" ")).toContain("actual coverage, rush count and protection");
    expect(film.unresolved.join(" ")).toContain("verified video offsets");
    for (const fact of [...film.recordedFacts, ...film.sourceNotes]) {
      expect(new URL(fact.source.url).protocol).toBe("https:");
      expect(fact.source.label.trim()).toBeTruthy();
      expect(["static.www.nfl.com", "static.clubs.nfl.com", "www.newyorkjets.com", "www.patriots.com"]).toContain(new URL(fact.source.url).hostname);
    }
    for (const replay of film.replays) expect(["www.nfl.com", "www.newyorkjets.com", "www.youtube.com"]).toContain(new URL(replay.url).hostname);
  }
  expect(cases[0].sourceNotes[0].text).toContain("slant");
  expect(cases[3].sourceNotes[0].text).toContain("Sanchez said");
  expect(cases[3].unresolved.join(" ")).toContain("Moore’s blocking assignment has not been established");
});

test("conflicting, suspect or corrupted fixtures cannot inherit a curated account", () => {
  for (const id of filmGameIds) {
    const game = games.find((item) => item.id === id)!;
    const changes: Partial<Game>[] = [
      { dataSuspect: true }, { seasonType: "POST" }, { date: "2026-10-01" }, { season: game.season + 1 },
      { week: game.week + 1 }, { atHome: !game.atHome }, { opponent: "BUF" }, { opponentDisplay: "BUF" },
      { jetsScore: game.jetsScore + 1 }, { oppScore: game.oppScore + 1 }, { outcome: "tie" }, { wentToOt: !game.wentToOt },
      { swing: null }, { swing: Number.NaN }, { peakH2Wp: Number.POSITIVE_INFINITY }, { troughH2Wp: -.01 },
      { troughH2Wp: 1.01 }, { peakH2Wp: 0 },
    ];
    for (const change of changes) {
      const changed = games.map((item) => item.id === id ? { ...item, ...change } : item);
      expect(buildFilmCases(changed, curves).some((film) => film.game.id === id), JSON.stringify(change)).toBe(false);
    }
    expect(buildFilmCases([...games, { ...game }], curves).some((film) => film.game.id === id)).toBe(false);
    expect(buildFilmCases([...games, { ...game, jetsScore: 999 }], curves).some((film) => film.game.id === id)).toBe(false);
  }
  expect(buildFilmCases([], curves)).toEqual([]);
  expect(buildFilmCases(games, {})).toEqual([]);
});

test("missing, corrupt, reversed or ambiguous plays are withheld without a neighboring substitute", () => {
  for (const film of cases) {
    const changes: Partial<CurvePoint>[] = [
      { wp: Number.NaN }, { wp: Number.POSITIVE_INFINITY }, { wp: -.01 }, { wp: 1.01 },
      { wp: "0.5" as unknown as number }, { d: Number.NaN }, { d: Number.POSITIVE_INFINITY }, { d: -1.01 }, { d: 1.01 },
      { q: film.play.q + 1 }, { t: null }, { t: film.play.t! + 1 }, { t: -1 }, { type: "no_play" },
      { desc: null }, { desc: `${film.play.desc} REVERSED.` }, { desc: `${film.play.desc} No Play.` },
    ];
    for (const change of changes) expect(buildFilmCases(games, pointChange(film, change)).some((item) => item.id === film.id), JSON.stringify(change)).toBe(false);
    const points = curves[film.game.id];
    const duplicate = [...points.slice(0, film.playIndex), film.play, ...points.slice(film.playIndex)];
    expect(buildFilmCases(games, { ...curves, [film.game.id]: duplicate }).some((item) => item.id === film.id)).toBe(false);
    // An invalid duplicate is still ambiguous evidence; filtering it first must not make a named case look unique.
    duplicate[film.playIndex] = { ...film.play, wp: Number.NaN };
    expect(buildFilmCases(games, { ...curves, [film.game.id]: duplicate }).some((item) => item.id === film.id)).toBe(false);
  }
  const changedName = pointChange(cases[0], { desc: cases[0].play.desc!.replace("17-G.Wilson", "5-G.Wilson") });
  expect(buildFilmCases(games, changedName).map((film) => film.id)).not.toContain("wilson-cleveland");
  const changedClock = pointChange(cases[3], { desc: cases[3].play.desc!.replace("(9:10)", "(9:00)") });
  expect(buildFilmCases(games, changedClock).map((film) => film.id)).not.toContain("sanchez-thanksgiving");
});

test("each supported teaching package assigns exactly eleven defenders once", () => {
  const expected: Record<CoverageId, Partial<Record<PressureId, number[]>>> = {
    "cover-0": { six: [6, 0, 0, 5] },
    "cover-1": { four: [4, 1, 1, 5], five: [5, 1, 0, 5] },
    "cover-2": { four: [4, 2, 5, 0] },
    "cover-3": { four: [4, 3, 4, 0], five: [5, 3, 3, 0], simulated: [4, 3, 4, 0] },
    "cover-4": { four: [4, 4, 3, 0] },
  };
  const pressures: PressureId[] = ["four", "five", "six", "simulated"];
  expect(coverageLessons.map((lesson) => lesson.id)).toEqual(Object.keys(expected));
  for (const lesson of coverageLessons) {
    expect(pressureOptions(lesson.id)).toEqual(Object.keys(expected[lesson.id]));
    expect(lesson.source.url).toMatch(/^https:/);
    for (const pressure of pressures) {
      const counts = coverageCounts(lesson.id, pressure);
      const roles = expected[lesson.id][pressure];
      if (!roles) { expect(counts).toBeNull(); continue; }
      expect([counts!.rushers, counts!.deep, counts!.underneath, counts!.man]).toEqual(roles);
      expect(roles.reduce((sum, role) => sum + role, 0)).toBe(counts!.total);
      expect(counts!.total).toBe(11);
    }
  }
  expect(pressureLabels.simulated).toContain("four rushers");
  expect(coverageCounts("cover-3", "simulated")!.rushers).toBe(4);
  expect(coverageCounts("cover-1", "six")).toBeNull();
});

test("URL selection validates film and scheme combinations and maps one-based steps", () => {
  expect(parseFilmSelection("", cases)).toEqual({ film: cases[0], coverage: "cover-3", pressure: "four", step: 0 });
  expect(parseFilmSelection("?play=sanchez-thanksgiving&coverage=cover-0&pressure=six&step=3", cases)).toEqual({ film: cases[3], coverage: "cover-0", pressure: "six", step: 2 });
  expect(parseFilmSelection("play=hall-miami&coverage=cover-3&pressure=simulated&step=2", cases)).toEqual({ film: cases[2], coverage: "cover-3", pressure: "simulated", step: 1 });
  expect(parseFilmSelection("play=not-published&coverage=invalid&pressure=six&step=3", cases)).toEqual({ film: cases[0], coverage: "cover-3", pressure: "four", step: 2 });
  expect(parseFilmSelection("coverage=cover-0&pressure=four", cases)?.pressure).toBe("six");
  expect(parseFilmSelection("coverage=cover-1&pressure=six", cases)?.pressure).toBe("four");
  expect(parseFilmSelection("coverage=cover-4&pressure=simulated", cases)?.pressure).toBe("four");
  expect(parseFilmSelection("step=999", cases)?.step).toBe(2);
  expect(parseFilmSelection("step=-2", cases)?.step).toBe(0);
  expect(parseFilmSelection("step=0", cases)?.step).toBe(0);
  for (const step of ["1.5", "1e1", "Infinity", "NaN", "01", "2x", "9007199254740992"]) expect(parseFilmSelection(`step=${step}`, cases)?.step).toBe(0);
  expect(parseFilmSelection("play=elliott-miami", [cases[0]])?.film).toBe(cases[0]);
  expect(parseFilmSelection("", [])).toBeNull();
});

test("builders and teaching helpers do not mutate snapshots or shared metadata", () => {
  const before = JSON.stringify({ games, curves });
  const first = buildFilmCases(games, curves);
  first[0].recordedFacts[0].value = "changed by caller";
  first[0].sourceNotes[0].source.label = "changed by caller";
  first[0].watchFor.push("changed by caller");
  const second = buildFilmCases(games, curves);
  expect(second[0].recordedFacts[0].value).not.toBe("changed by caller");
  expect(second[0].sourceNotes[0].source.label).not.toBe("changed by caller");
  expect(second[0].watchFor).not.toContain("changed by caller");
  const counts = coverageCounts("cover-3", "four")!;
  counts.rushers = 99;
  expect(coverageCounts("cover-3", "four")!.rushers).toBe(4);
  const search = "?play=hall-miami&coverage=cover-3&pressure=five&step=2&other=kept";
  parseFilmSelection(search, second);
  expect(search).toContain("other=kept");
  expect(JSON.stringify({ games, curves })).toBe(before);
});
