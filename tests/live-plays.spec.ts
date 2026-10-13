import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { clockLine, editionClock, gamePlayed, parseEspnSummary, playsEvent } from "../src/lib/live-plays";
import type { LiveFootballFeed, LiveFootballGame } from "../src/lib/football-live";

// ESPN's summary of the Jets' 17–12 win over Cleveland, trimmed to the fields the parser reads.
const summary = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "espn-summary-2026_05_CLE_NYJ.json"), "utf8"));
const at = new Date("2026-10-11T20:15:00Z");

const game = { eventId: "401547999", gameId: "2026_06_CHI_NYJ", season: 2026, week: 6, seasonType: "REG", kickoff: "2026-10-13T19:00:00.000Z",
  opponent: "CHI", opponentDisplay: "CHI", atHome: true, state: "live", jetsScore: 14, oppScore: 17, period: 3, clock: "08:24",
  detail: "3rd quarter", provisional: true, players: [] } as LiveFootballGame;
const feed = (patch: Partial<LiveFootballGame> = {}, status: LiveFootballFeed["status"] = "ready") =>
  ({ status, featured: { ...game, ...patch } }) as LiveFootballFeed;

test("ESPN's final reads as the Jets' score and a play-by-play line from the Jets' side", () => {
  const plays = parseEspnSummary(summary, at);
  expect([plays.state, plays.us, plays.them, plays.detail]).toEqual(["post", 17, 12, "Final"]);
  expect(plays.line!.length).toBe(summary.winprobability.length);
  expect(plays.line![0]).toEqual([0.549, 1]);
  expect(plays.line!.at(-1)).toEqual([1, 4]);
  expect(plays.situation).toBeNull();
  expect(plays.lastPlay).toMatch(/kneels/);
});

test("in progress, the line flips for a road game and the latest play gives the down, distance and ball", () => {
  const away = structuredClone(summary);
  const competition = away.header.competitions[0];
  competition.status.type = { state: "in", shortDetail: "4:08 - 4th" };
  for (const team of competition.competitors) team.homeAway = team.homeAway === "home" ? "away" : "home";
  const plays = parseEspnSummary(away, at);
  expect(plays.state).toBe("in");
  expect(plays.line![0][0]).toBe(0.452);
  expect(plays.situation).toBeTruthy();
  expect(["jets", "them"]).toContain(plays.ball);
  expect(clockLine(plays.detail)).toBe("4:08 left in the 4th quarter");
});

test("a malformed or foreign summary is unavailable rather than guessed", () => {
  expect(parseEspnSummary(null, at).state).toBe("unavailable");
  const other = structuredClone(summary);
  for (const team of other.header.competitions[0].competitors) team.team.abbreviation = "XXX";
  expect(parseEspnSummary(other, at).state).toBe("unavailable");
});

test("only the game the edition shows as live can be asked about", () => {
  expect(playsEvent(feed(), "401547999")).toBe("401547999");
  expect(playsEvent(feed(), "401547998")).toBeNull();
  expect(playsEvent(feed(), "401547999&x=1")).toBeNull();
  expect(playsEvent(feed(), null)).toBeNull();
  expect(playsEvent(feed({ state: "final" }), "401547999")).toBeNull();
  expect(playsEvent(feed({}, "unavailable"), "401547999")).toBeNull();
  expect(playsEvent(null, "401547999")).toBeNull();
});

test("clocks read as words: ESPN's and the edition's", () => {
  expect(clockLine("12:00 - 1st")).toBe("12:00 left in the 1st quarter");
  expect(clockLine("Halftime")).toBe("Halftime");
  expect(editionClock(game)).toBe("Q3 · 8:24");
  expect(editionClock({ ...game, period: 5, clock: "10:00" })).toBe("Overtime · 10:00");
  expect(editionClock({ ...game, period: 0, clock: null })).toBe("3rd quarter");
});

test("the plays endpoint answers idle for any game that is not live, and lets the CDN share it", async ({ request }) => {
  const response = await request.get("/api/football/plays?event=401547999");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/s-maxage=\d+/);
  expect((await response.json()).state).toBe("idle");
});

test("the line covers as much of the width as ESPN's clock says is gone", () => {
  expect(gamePlayed("15:00 - 1st")).toBe(0);
  expect(gamePlayed("8:24 - 3rd")).toBeCloseTo(0.61, 2);
  expect(gamePlayed("0:00 - 4th")).toBe(1);
  expect(gamePlayed("Halftime")).toBe(0.5);
  expect(gamePlayed("Final")).toBe(1);
  expect(gamePlayed(undefined)).toBe(1);
});
