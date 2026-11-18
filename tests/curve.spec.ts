import { test, expect } from "@playwright/test";
import { keyPlayIndex } from "../src/lib/curve";
import { readFileSync } from "node:fs";
import path from "node:path";
import { clockLabel, type Game } from "../src/lib/games";
import { wpaLabel } from "../src/lib/analytics-context";
import { buildFocus } from "../src/lib/focus";
import type { CurrentSnapshot } from "../src/lib/current";
import type { CurvePoint } from "../src/lib/load-games";

const data = path.join(process.cwd(), "public/data");
const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(data, file), "utf8")) as T;

test("chart markers use the analyzed play even if another row has a larger rounded swing", () => {
  const points = [
    { playId: 12, q: 4, t: 120, desc: "No play. Penalty." },
    { playId: 13, q: 4, t: 110, desc: "Interception." },
  ];
  expect(keyPlayIndex(points, { playId: 13, qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(1);
  expect(keyPlayIndex(points, { playId: 99, qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(-1);
  expect(keyPlayIndex(points, { qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(-1);
  expect(keyPlayIndex([...points, { ...points[0], playId: 13 }], { playId: 13, qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(-1);
});

test("every published turning point identifies its curve point", () => {
  const games = read<Game[]>("games.json");
  for (const game of games.filter((game) => !game.dataSuspect && game.keyPlay.desc)) {
    const points = JSON.parse(readFileSync(path.join(data, "curves", `${game.id}.json`), "utf8"));
    const index = keyPlayIndex(points, game.keyPlay);
    expect(index, game.id).toBeGreaterThanOrEqual(0);
    expect(points[index].desc, game.id).toBe(game.keyPlay.desc);
    if (points[index].meaningful !== undefined) expect(points[index].meaningful, game.id).toBe(true);
  }
});

test("legacy curves match description, period and clock without inventing a marker", () => {
  const points = [
    { q: 3, t: 110, desc: "Interception." },
    { q: 4, t: 110, desc: "Interception." },
  ];
  expect(keyPlayIndex(points, { qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(1);
  expect(keyPlayIndex(points, { qtr: 4, secondsLeft: 100, desc: "Interception.", wpa: -0.2 })).toBe(-1);
  expect(keyPlayIndex([...points, points[1]], { qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(-1);
});

const buffalo = read<Game[]>("games.json").find((game) => game.id === "2026_10_BUF_NYJ")!;
const buffaloCurve = read<CurvePoint[]>(`curves/${buffalo.id}.json`);
const buffaloSnapshot: CurrentSnapshot = {
  schemaVersion: 1, season: buffalo.season, checkedAt: "2026-11-17T17:43:04.906Z",
  analysisUpdatedAt: null, latestAnalyzedGameId: buffalo.id, sources: { schedule: "", pbp: "" },
  schedule: [{ ...buffalo, seasonType: "REG", status: "final", kickoff: null }],
};
const emptyMedia = { checkedAt: buffaloSnapshot.checkedAt, items: [], outlets: [] };

test("Home plots Buffalo's published play using the same filtered points as the line", () => {
  const focus = buildFocus({
    games: [buffalo], snapshot: buffaloSnapshot, media: emptyMedia,
    curve: [{ ...buffaloCurve[0], wp: -1 }, ...buffaloCurve],
  });
  const turningPoint = focus.last!.turningPoint!;
  // Official corrections can move the selected play or revise its estimated change.
  const plotted = buffaloCurve.filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1);
  const index = plotted.findIndex((point) => point.playId === buffalo.keyPlay.playId);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(turningPoint).toEqual({
    index,
    description: buffalo.keyPlay.desc,
    clock: clockLabel(buffalo.keyPlay.qtr, buffalo.keyPlay.secondsLeft),
    change: wpaLabel(buffalo.keyPlay.wpa),
    href: "/games/2026_10_BUF_NYJ#play",
  });
  expect(focus.last!.line[turningPoint.index]).toEqual([Math.round(plotted[index].wp * 1000) / 1000, plotted[index].q]);
});

test("Home keeps a readable fallback when the turning point is unavailable", () => {
  const featured = buffaloCurve.find((point) => point.playId === buffalo.keyPlay.playId)!;
  const build = (curve: CurvePoint[], games = [buffalo]) => buildFocus({ games, snapshot: buffaloSnapshot, curve, media: emptyMedia }).last!;
  for (const curve of [
    [],
    buffaloCurve.filter((point) => point !== featured),
    [...buffaloCurve, featured],
    buffaloCurve.map((point) => point === featured ? { ...point, meaningful: false } : point),
  ]) {
    expect(build(curve).turningPoint).toBeNull();
  }
  const unavailableChange = build(buffaloCurve, [{ ...buffalo, keyPlay: { ...buffalo.keyPlay, wpa: null } }]);
  expect(unavailableChange.turningPoint).toBeNull();
  expect(unavailableChange.line.length).toBeGreaterThan(1);
  const unpublished = build(buffaloCurve, [buffalo, buffalo]);
  expect(unpublished.turningPoint).toBeNull();
  expect(unpublished.hrefLabel).toBe("Season results");
});
