import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RankingsCollection, SeasonRankings } from './season-rankings';
import { isNextGenCollection, nextGenSeason } from './nextgen-stats';

async function dataFile(name: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(path.join(process.cwd(), 'public/data', name), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function loadSeasonRankings(year: number): Promise<SeasonRankings | null> {
  const value = await dataFile('season-rankings.json');
  if (!value) return null;
  const collection = value as RankingsCollection;
  if (collection.schemaVersion !== 1 || !Array.isArray(collection.seasons) || !Number.isFinite(Date.parse(collection.checkedAt))
    || new Set(collection.seasons.map((entry) => entry.year)).size !== collection.seasons.length) throw new Error('Invalid season rankings snapshot');
  return collection.seasons.find((entry) => entry.year === year) ?? null;
}
export async function loadNextGenSeason(year: number) {
  const value = await dataFile('nextgen-stats.json');
  if (!value) return { nextgen: null, checkedAt: null };
  if (!isNextGenCollection(value)) throw new Error('Invalid Next Gen snapshot');
  return { nextgen: nextGenSeason(value, year), checkedAt: value.checkedAt };
}
