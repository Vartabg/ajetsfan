import { test, expect } from "@playwright/test";
import { keyPlayIndex } from "../src/lib/curve";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/lib/games";

test("chart markers use the analyzed play even if another row has a larger rounded swing", () => {
  const points = [
    { playId: 12, q: 4, t: 120, desc: "No play. Penalty." },
    { playId: 13, q: 4, t: 110, desc: "Interception." },
  ];
  expect(keyPlayIndex(points, { playId: 13, qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(1);
  expect(keyPlayIndex(points, { playId: 99, qtr: 4, secondsLeft: 110, desc: "Interception.", wpa: -0.2 })).toBe(-1);
});

test("every published turning point identifies its curve point", () => {
  const data = path.join(process.cwd(), "public/data");
  const games = JSON.parse(readFileSync(path.join(data, "games.json"), "utf8")) as Game[];
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
});
