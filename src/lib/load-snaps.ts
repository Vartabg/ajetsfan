import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { cache } from "react";
import { loadPublishedGames } from "./load-published-pages";
import { parseSnapSeason, snapMatchesFixture } from "./snap-data";
import type { SnapGame } from "./snap-types";

const decompress = promisify(gunzip);
const seasons = new Map<number, { version: string; games: Promise<SnapGame[]> }>();

// Cache the expensive decompression and parsing across requests. An atomic season replacement
// invalidates this cache even while a local server is running. Publication eligibility stays live.
const loadSeason = cache(async (year: number): Promise<SnapGame[]> => {
  const filename = path.join(process.cwd(), "public", "data", "snaps", `${year}.json.gz`);
  try {
    const info = await stat(filename, { bigint: true });
    const version = `${info.ino}-${info.size}-${info.mtimeNs}`;
    const prior = seasons.get(year);
    if (prior?.version === version) return await prior.games;
    const games = readFile(filename).then((bytes) => decompress(bytes))
      .then((plain) => parseSnapSeason(plain.toString("utf8"), year));
    seasons.set(year, { version, games });
    return await games;
  } catch (error) {
    seasons.delete(year);
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`Snap season ${year} unavailable`, error);
    return [];
  }
});

export const loadSnapGame = cache(async (id: string): Promise<SnapGame | null> => {
  const fixture = (await loadPublishedGames()).find((entry) => entry.id === id);
  if (!fixture) return null;
  const game = (await loadSeason(fixture.season)).find((entry) => entry.id === id);
  return game && snapMatchesFixture(game, fixture) ? game : null;
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
