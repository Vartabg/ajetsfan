import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot, ScheduledGame } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import { mediaCollection } from "../src/lib/media-catalog";
import { buildSeasonArchive, phaseResults, seasonNumbers, type ArchiveSeason } from "../src/lib/season-archive";

const data = path.join(process.cwd(), "public/data");
const games = JSON.parse(readFileSync(path.join(data, "games.json"), "utf8")) as Game[];
const current = JSON.parse(readFileSync(path.join(data, "current.json"), "utf8")) as CurrentSnapshot;
const checkedAt = mediaCollection.checkedAt;
const archives = buildSeasonArchive(games, current, mediaCollection.items, checkedAt);
const cleveland = games.find((game) => game.id === "2022_02_NYJ_CLE")!;
const foxborough = games.find((game) => game.id === "2010_19_NYJ_NE")!;
const firstFinal = current.schedule.find((game) => game.status === "final" && game.season === current.season)!;
const firstAnalysis = games.find((game) => game.id === firstFinal.id)!;

function season(year: number, collection = archives): ArchiveSeason {
  const selected = collection.find((item) => item.year === year);
  expect(selected, `Missing season ${year}`).toBeDefined();
  return selected!;
}

test("the 2010 season keeps its 11–5 regular record and 2–1 January postseason distinct", () => {
  const selected = season(2010);
  const regular = phaseResults(selected, "regular"), playoffs = phaseResults(selected, "playoffs");
  expect(seasonNumbers(regular)).toMatchObject({ wins: 11, losses: 5, ties: 0, games: 16, scored: 367, allowed: 304 });
  expect(seasonNumbers(playoffs)).toMatchObject({ wins: 2, losses: 1, ties: 0, games: 3, scored: 64, allowed: 61 });
  expect(seasonNumbers(phaseResults(selected, "all"))).toMatchObject({ wins: 13, losses: 6, games: 19 });
  expect(playoffs.map((game) => [game.id, game.date])).toEqual([
    ["2010_18_NYJ_IND", "2011-01-08"], ["2010_19_NYJ_NE", "2011-01-16"], ["2010_20_NYJ_PIT", "2011-01-23"],
  ]);
  expect(regular.find((game) => game.id === "2010_17_BUF_NYJ")?.date).toBe("2011-01-02");
  expect(selected.results.every((game) => game.season === 2010)).toBe(true);
  expect(selected.heldAnalysis).toBe(0);
});

test("1968 has documented championship sources without invented season totals or analysis", () => {
  const selected = season(1968);
  expect(selected.results).toEqual([]);
  expect(selected.cases).toEqual([]);
  expect(selected.heldAnalysis).toBe(0);
  expect(selected.current).toBe(false);
  expect(seasonNumbers(selected.results)).toMatchObject({ games: 0, pointsPerGame: null, biggestWin: null });
  expect(selected.facts).toEqual([expect.objectContaining({
    id: "super-bowl-iii", season: 1968, phase: "playoffs",
    url: "https://www.newyorkjets.com/news/super-bowl-iii-jets-16-colts-7-2507141",
  })]);
  expect(selected.facts[0].text).toContain("January 12, 1969");
  expect(selected.facts[0].text).toContain("1968 football season");
  expect(selected.media).toEqual([]);
});

test("withheld or missing probability analysis cannot erase a valid final score", () => {
  for (const change of [{ dataSuspect: true }, { swing: null }, { swing: Number.NaN }]) {
    const selected = season(2022, buildSeasonArchive([{ ...cleveland, ...change }], null, [], checkedAt));
    expect(selected.results).toHaveLength(1);
    expect(selected.results[0]).toMatchObject({ id: cleveland.id, jetsScore: 31, oppScore: 30, outcome: "win" });
    expect(selected.cases).toEqual([]);
    expect(selected.heldAnalysis).toBe(1);
    expect(seasonNumbers(selected.results)).toMatchObject({ wins: 1, losses: 0, scored: 31, allowed: 30, differential: 1 });
  }
});

test("future, impossible-calendar and contradictory fixture identities enter neither scores nor analysis", () => {
  const changes: Partial<Game>[] = [
    { date: "2027-09-18" }, { date: "2022-02-30" }, { date: "2022-01-18" }, { date: "2022-05-18" },
    { season: 2050, id: "2050_02_NYJ_CLE" },
    // The day after the catalog was checked, so this stays a future game whenever the catalog is re-dated.
    { season: 2026, id: "2026_02_NYJ_CLE", date: new Date(Date.parse(checkedAt) + 86_400_000).toISOString().slice(0, 10) },
    { opponent: "BUF" }, { opponent: "NYJ", opponentDisplay: "NYJ", id: "2022_02_NYJ_NYJ" },
    { id: "2022_02_CLE_NYJ" }, { jetsScore: -1 }, { jetsScore: 31.5 }, { outcome: "loss" },
  ];
  for (const change of changes) {
    const changed = { ...cleveland, ...change };
    const collection = buildSeasonArchive([changed], null, [], checkedAt);
    expect(collection.flatMap((item) => item.results), JSON.stringify(change)).toEqual([]);
    expect(collection.flatMap((item) => item.cases), JSON.stringify(change)).toEqual([]);
    expect(collection.some((item) => item.year === 2050)).toBe(false);
  }
});

test("historical Oakland, San Diego and St. Louis fixture names retain their normalized franchise lineage", () => {
  const expected = { OAK: "LV", SD: "LAC", STL: "LA" };
  for (const [display, opponent] of Object.entries(expected)) {
    const fixture = games.find((game) => game.opponentDisplay === display)!;
    expect(fixture).toBeDefined();
    const selected = season(fixture.season, buildSeasonArchive([fixture], null, [], checkedAt));
    expect(selected.results).toHaveLength(1);
    expect(selected.results[0]).toMatchObject({ id: fixture.id, opponentDisplay: display, opponent });
    expect(selected.cases.map((game) => game.id)).toContain(fixture.id);
  }
});

test("duplicate archive records or current schedule fixtures cannot count twice or inherit analysis", () => {
  const duplicated = buildSeasonArchive([cleveland, { ...cleveland }], null, [], checkedAt);
  expect(duplicated.flatMap((item) => item.results)).toEqual([]);
  expect(duplicated.flatMap((item) => item.cases)).toEqual([]);
  const snapshot = structuredClone(current);
  snapshot.schedule.push(structuredClone(firstFinal));
  const selected = season(current.season, buildSeasonArchive([firstAnalysis], snapshot, [], checkedAt));
  expect(selected.results.some((game) => game.id === firstFinal.id)).toBe(false);
  expect(selected.cases.some((game) => game.id === firstFinal.id)).toBe(false);
  expect(new Set(selected.results.map((game) => game.id)).size).toBe(selected.results.length);
});

test("an unconfirmed current fixture cannot inherit an archive’s final score or tape", () => {
  const snapshot = structuredClone(current);
  snapshot.schedule = snapshot.schedule.map((game) => game.id === firstFinal.id ? {
    ...game, status: "scheduled", jetsScore: null, oppScore: null, outcome: null,
  } : game);
  const selected = season(current.season, buildSeasonArchive([firstAnalysis], snapshot, [], checkedAt));
  expect(selected.current).toBe(true);
  expect(selected.results.some((game) => game.id === firstFinal.id)).toBe(false);
  expect(selected.cases.some((game) => game.id === firstFinal.id)).toBe(false);
  const confirmed = snapshot.schedule.filter((game) => game.status === "final" && game.date <= snapshot.checkedAt.slice(0, 10));
  expect(selected.results.map((game) => game.id)).toEqual(confirmed.map((game) => game.id));
});

test("current schedule finals override disagreeing analysis while holding its game evidence", () => {
  const stale = { ...firstAnalysis, jetsScore: firstAnalysis.jetsScore + 9 };
  const selected = season(current.season, buildSeasonArchive([stale], current, [], checkedAt));
  expect(selected.results.find((game) => game.id === firstFinal.id)).toMatchObject({
    jetsScore: firstFinal.jetsScore, oppScore: firstFinal.oppScore, outcome: firstFinal.outcome,
  });
  expect(selected.cases).toEqual([]);
  expect(selected.heldAnalysis).toBe(selected.results.length);
  const confirmed = current.schedule.filter((game) => game.season === current.season && game.status === "final" && game.date <= current.checkedAt.slice(0, 10));
  expect(selected.results).toHaveLength(confirmed.length);
  expect(seasonNumbers(selected.results).scored).toBe(confirmed.reduce((sum, game) => sum + game.jetsScore!, 0));
});

test("out-of-season fixtures inside the current snapshot cannot overwrite or veto historical evidence", () => {
  const snapshot = structuredClone(current);
  snapshot.schedule.push({ ...foxborough, kickoff: null, status: "final", jetsScore: 14, oppScore: 10 } as ScheduledGame);
  const selected = season(2010, buildSeasonArchive([foxborough], snapshot, [], checkedAt));
  expect(selected.results).toHaveLength(1);
  expect(selected.results[0]).toMatchObject({ id: foxborough.id, jetsScore: 28, oppScore: 21 });
  expect(selected.cases.map((game) => game.id)).toEqual([foxborough.id]);
  expect(selected.heldAnalysis).toBe(0);
});

test("reporting follows tagged football seasons instead of article or replay publication years", () => {
  const postseason = season(2010);
  expect(postseason.media.find((item) => item.id === "nfl-2010-divisional-full-game")).toMatchObject({
    seasons: [2010], phase: "playoffs", publishedAt: "2016-12-23T22:00:03Z", context: "archive",
  });
  expect(postseason.media.find((item) => item.id === "espn-2010-divisional-rapid-reaction")).toMatchObject({
    seasons: [2010], phase: "playoffs", publishedAt: "2011-01-17T00:50:00Z",
  });
  expect(season(2016).media.some((item) => item.id === "nfl-2010-divisional-full-game")).toBe(false);
  expect(season(2011).media.some((item) => item.id === "espn-2010-divisional-rapid-reaction")).toBe(false);
  expect(postseason.facts.find((fact) => fact.id === foxborough.id)).toMatchObject({
    season: 2010, phase: "playoffs", href: `/games/${foxborough.id}`,
    url: "https://www.newyorkjets.com/news/how-sweet-it-is-jets-topple-patriots-28-21-3248694",
  });
});

test("editorial facts preserve primary provenance and corrected fixtures cannot inherit the old game account", () => {
  for (const selected of archives) for (const fact of selected.facts) {
    const url = new URL(fact.url);
    expect(url.protocol).toBe("https:");
    expect(["www.newyorkjets.com", "static.clubs.nfl.com"]).toContain(url.hostname);
    expect(fact.source.trim()).not.toBe("");
    expect(fact.season).toBe(selected.year);
    if (fact.href?.startsWith("/games/")) expect(selected.cases.map((game) => `/games/${game.id}`)).toContain(fact.href);
  }
  const corrected = season(2010, buildSeasonArchive([{ ...foxborough, jetsScore: 27 }], null, [], checkedAt));
  expect(corrected.results[0].jetsScore).toBe(27);
  expect(corrected.facts.some((fact) => fact.id === foxborough.id)).toBe(false);
});

test("building and aggregating seasons leaves the source game, schedule and media snapshots untouched", () => {
  const before = JSON.stringify({ games, current, media: mediaCollection });
  const collection = buildSeasonArchive(games, current, mediaCollection.items, checkedAt);
  expect(collection.map((item) => item.year)).toEqual([...collection.map((item) => item.year)].sort((a, b) => b - a));
  for (const selected of collection) {
    expect(selected.results.map((game) => game.date)).toEqual([...selected.results.map((game) => game.date)].sort());
    seasonNumbers(phaseResults(selected, "all"));
    seasonNumbers(phaseResults(selected, "regular"));
    seasonNumbers(phaseResults(selected, "playoffs"));
  }
  expect(JSON.stringify({ games, current, media: mediaCollection })).toBe(before);
});
