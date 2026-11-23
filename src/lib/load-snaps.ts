import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { cache } from "react";
import { loadPublishedGames } from "./load-published-pages";
import { parseSnapSeason, snapMatchesFixture } from "./snap-data";
import { withClevelandDriveLineups } from "./cleveland-drive-lineups";
import { parseParticipationSeason, withParticipation } from "./snap-participation";
import type { SnapGame } from "./snap-types";

const decompress = promisify(gunzip);
// Cache verified bytes across requests. An atomic file replacement invalidates only that season.
function cachedPack<T>(filename: (year: number) => string, parse: (json: string, year: number) => T, empty: () => T) {
  const seasons = new Map<number, { version: string; result: Promise<T> }>();
  return cache(async (year: number): Promise<T> => {
    const file = filename(year);
    try {
      const info = await stat(file, { bigint: true });
      const version = `${info.ino}-${info.size}-${info.mtimeNs}`;
      const prior = seasons.get(year);
      if (prior?.version === version) return await prior.result;
      const result = readFile(file).then((bytes) => decompress(bytes)).then((plain) => parse(plain.toString("utf8"), year));
      seasons.set(year, { version, result });
      return await result;
    } catch (error) {
      seasons.delete(year);
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`Football data unavailable for ${file}`, error);
      return empty();
    }
  });
}

const loadSeason = cachedPack((year) => path.join(process.cwd(), "public", "data", "snaps", `${year}.json.gz`), parseSnapSeason, () => []);
const loadParticipation = cachedPack((year) => path.join(process.cwd(), "public", "data", "participation", `${year}.json.gz`),
  parseParticipationSeason, () => new Map());

export const loadSnapGame = cache(async (id: string): Promise<SnapGame | null> => {
  const fixture = (await loadPublishedGames()).find((entry) => entry.id === id);
  if (!fixture) return null;
  const game = (await loadSeason(fixture.season)).find((entry) => entry.id === id);
  return game && snapMatchesFixture(game, fixture) ? game : null;
});

/** Only pages presenting a single verified play need the participation derivative. */
export const loadChartedSnapGame = cache(async (id: string): Promise<SnapGame | null> => {
  const game = await loadSnapGame(id);
  if (!game) return null;
  const year = Number(id.split("_")[0]);
  return year < 2016 ? game : withClevelandDriveLineups(withParticipation(game, await loadParticipation(year)));
});

/** A study can request one verified season, optionally with the participation chart for its plays. */
export const loadStudySeason = cache(async (year: number, charted = false, regularOnly = false): Promise<SnapGame[]> => {
  const fixtures = (await loadPublishedGames()).filter(game => game.season === year && (!regularOnly || game.seasonType === "REG"));
  if (!fixtures.length) return [];
  const byId = new Map(fixtures.map(game => [game.id, game]));
  const [records, participation] = await Promise.all([loadSeason(year), charted && year >= 2016 ? loadParticipation(year) : null]);
  const verified = records.filter(game => snapMatchesFixture(game, byId.get(game.id)));
  return participation ? verified.map(game => withClevelandDriveLineups(withParticipation(game, participation))) : verified;
});

export const loadSnapArchive = cache(async (): Promise<SnapGame[]> => {
  const fixtures = await loadPublishedGames();
  const byId = new Map(fixtures.map((game) => [game.id, game]));
  const years = [...new Set(fixtures.map((game) => game.season))].sort((a, b) => a - b);
  const files = await Promise.all(years.map(loadSeason));
  return files.flat().filter((game) => snapMatchesFixture(game, byId.get(game.id)));
});

/** The selector needs only fixture identities. Open one season to verify which games can be replayed. */
export const loadReplayDirectory = cache(async (requestedSeason: number | null) => {
  const fixtures = await loadPublishedGames();
  const years = [...new Set(fixtures.map(game => game.season))].sort((a, b) => b - a);
  const opponents = [...new Set(fixtures.map(game => game.opponentDisplay))];
  const season = requestedSeason ?? years[0] ?? null;
  const scheduled = fixtures.filter(game => game.season === season);
  const records = season !== null && scheduled.length ? await loadSeason(season) : [];
  const byId = new Map(records.map(game => [game.id, game]));
  const games = scheduled.flatMap(fixture => {
    const game = byId.get(fixture.id);
    if (!game || !snapMatchesFixture(game, fixture)) return [];
    const { id, date, atHome, opponentDisplay, week, seasonType } = fixture;
    return [{ id, date, atHome, opponentDisplay, week, seasonType }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
  return { years, opponents, season, games, pending: scheduled.length - games.length };
});
