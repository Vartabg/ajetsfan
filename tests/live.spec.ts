import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findJetsEvent, inLiveWindow, liveCandidate, LIVE_AFTER_MS, LIVE_BEFORE_MS, parseEspnSummary } from "../src/lib/live";

// ESPN's summary of the Jets' 17–12 win over Cleveland, trimmed to the fields the parser reads.
const summary = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "espn-summary-2026_05_CLE_NYJ.json"), "utf8"));
const at = new Date("2026-10-11T20:15:00Z");

test("ESPN's final reads as the Jets' score, a play-by-play line from the Jets' side and the Gamecast link", () => {
  const live = parseEspnSummary(summary, at);
  expect([live.state, live.us, live.them, live.detail]).toEqual(["post", 17, 12, "Final"]);
  expect(live.line!.length).toBe(summary.winprobability.length);
  expect(live.line![0]).toEqual([0.549, 1]);
  expect(live.line!.at(-1)).toEqual([1, 4]);
  expect(live.situation).toBeNull();
  expect(live.lastPlay).toMatch(/kneels/);
  expect(live.link).toMatch(/^https:\/\/www\.espn\.com\/nfl\/game\/_\/gameId\/401872983/);
});

test("in progress, the line flips for a road game and the latest play gives the down, distance and ball", () => {
  const away = structuredClone(summary);
  const competition = away.header.competitions[0];
  competition.status.type = { state: "in", shortDetail: "4:08 - 4th" };
  for (const team of competition.competitors) team.homeAway = team.homeAway === "home" ? "away" : "home";
  const live = parseEspnSummary(away, at);
  expect(live.state).toBe("in");
  expect(live.line![0][0]).toBe(0.452);
  expect(live.situation).toBeTruthy();
  expect(["jets", "them"]).toContain(live.ball);
});

test("a malformed or foreign summary is unavailable rather than guessed", () => {
  expect(parseEspnSummary(null, at).state).toBe("unavailable");
  const other = structuredClone(summary);
  for (const team of other.header.competitions[0].competitors) team.team.abbreviation = "XXX";
  expect(parseEspnSummary(other, at).state).toBe("unavailable");
  const link = structuredClone(summary);
  link.header.links[0].href = "https://example.com/espn";
  expect(parseEspnSummary(link, at).link).toBeNull();
});

test("the live window opens half an hour before kickoff and closes six hours after; finals are never live", () => {
  const kickoff = "2026-10-18T17:00:00.000Z", start = Date.parse(kickoff);
  expect(inLiveWindow(kickoff, start - LIVE_BEFORE_MS - 1)).toBe(false);
  expect(inLiveWindow(kickoff, start - LIVE_BEFORE_MS)).toBe(true);
  expect(inLiveWindow(kickoff, start + LIVE_AFTER_MS)).toBe(true);
  expect(inLiveWindow(kickoff, start + LIVE_AFTER_MS + 1)).toBe(false);
  expect(inLiveWindow(null, start)).toBe(false);
  const games = [{ id: "a", kickoff, status: "final", season: 2026 }, { id: "b", kickoff, status: "scheduled", season: 2026 }];
  expect(liveCandidate(games, 2026, start)?.id).toBe("b");
  expect(liveCandidate(games, 2026, start + LIVE_AFTER_MS + 1)).toBeNull();
  expect(findJetsEvent({ events: [{ id: "1", competitions: [{ competitors: [{ team: { abbreviation: "NE" } }] }] }, { id: "401873001", competitions: [{ competitors: [{ team: { abbreviation: "NYJ" } }] }] }] })).toBe("401873001");
});

test("the live endpoint serves only current Jets games and caches its answer", async ({ request }) => {
  expect((await request.get("/api/live?game=1999_01_NE_NYJ")).status()).toBe(404);
  const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "current.json"), "utf8"));
  const game = snapshot.schedule.find((entry: { season: number; status: string }) => entry.season === snapshot.season && entry.status === "scheduled");
  test.skip(!game, "No scheduled game in this edition");
  const response = await request.get(`/api/live?game=${game.id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/s-maxage=\d+/);
  expect(["idle", "pre", "in", "post", "unavailable"]).toContain((await response.json()).state);
});
