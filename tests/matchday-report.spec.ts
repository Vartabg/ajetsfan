import { test, expect } from "@playwright/test";
import type { ScheduledGame } from "../src/lib/current";
import { selectMatchdayReport } from "../src/lib/matchday-report";

const fixture = (overrides: Partial<ScheduledGame> = {}): ScheduledGame => ({
  id: "2026_04_NYJ_CHI", season: 2026, week: 4, seasonType: "REG",
  date: "2026-10-04", kickoff: "2026-10-04T17:00:00Z", opponent: "CHI",
  opponentDisplay: "CHI", atHome: false, jetsScore: null, oppScore: null,
  outcome: null, status: "scheduled", ...overrides,
});
const reviewed = Date.parse("2026-09-30T22:34:42.000Z");
const kickoff = Date.parse("2026-10-04T17:00:00.000Z");

test("reviewed game-day reporting is scoped to the exact scheduled Bears fixture", () => {
  const report = selectMatchdayReport(fixture(), reviewed);
  expect(report?.gameId).toBe("2026_04_NYJ_CHI");
  expect(report?.watch.venue).toBe("Soldier Field");
  expect(report?.availability).toHaveLength(2);
  expect(report?.availability.every((note) => Date.parse(note.publishedAt) <= reviewed)).toBe(true);

  for (const change of [
    { id: "2026_05_CLE_NYJ" }, { season: 2027 }, { week: 5 },
    { seasonType: "POST" as const }, { date: "2026-10-05" },
    { opponent: "DET" }, { atHome: true }, { status: "final" as const },
  ]) expect(selectMatchdayReport(fixture(change), reviewed)).toBeNull();
});

test("pregame reporting expires at kickoff and cannot appear before its review", () => {
  expect(selectMatchdayReport(fixture(), kickoff - 1)).not.toBeNull();
  expect(selectMatchdayReport(fixture(), kickoff)).toBeNull();
  expect(selectMatchdayReport(fixture(), kickoff + 1)).toBeNull();
  expect(selectMatchdayReport(fixture(), reviewed - 1)).toBeNull();
  expect(selectMatchdayReport(fixture(), NaN)).toBeNull();
});

test("an altered or unconfirmed kickoff requires another editorial review", () => {
  for (const value of [null, "invalid", "2026-10-04T16:00:00Z", "2026-10-04T20:25:00Z"]) {
    expect(selectMatchdayReport(fixture({ kickoff: value }), reviewed)).toBeNull();
  }
  // Equivalent ISO representations refer to the same verified instant.
  expect(selectMatchdayReport(fixture({ kickoff: "2026-10-04T13:00:00-04:00" }), reviewed)).not.toBeNull();
});
