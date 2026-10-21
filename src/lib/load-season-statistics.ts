import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RankingsCollection, SeasonRankings } from './season-rankings';
import type { NextGenCollection } from './nextgen-stats';
import { isNextGenCollection, mergeNextGenCollections, nextGenSeasonCheck } from './nextgen-stats';
import { loadAnalysisState } from './load-analysis';

async function dataFile(name: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(path.join(process.cwd(), 'public/data', name), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function loadRankingsCollection(): Promise<RankingsCollection | null> {
  const runtime = (await loadAnalysisState()).edition;
  const value = await dataFile('season-rankings.json');
  if (!value) return null;
  const collection = value as RankingsCollection;
  if (collection.schemaVersion !== 1 || !Array.isArray(collection.seasons) || !Number.isFinite(Date.parse(collection.checkedAt))
    || new Set(collection.seasons.map((entry) => entry.year)).size !== collection.seasons.length) throw new Error('Invalid season rankings snapshot');
  const ranking = runtime?.rankings;
  if (!ranking) return collection;
  const old = collection.seasons.find((entry) => entry.year === ranking.year);
  if (old && Date.parse(old.checkedAt) > Date.parse(ranking.checkedAt)) return collection;
  return { ...collection, checkedAt: new Date(Math.max(Date.parse(collection.checkedAt), Date.parse(ranking.checkedAt))).toISOString(),
    seasons: [...collection.seasons.filter((entry) => entry.year !== ranking.year), ranking].sort((a, b) => b.year - a.year) };
}
export async function loadSeasonRankings(year: number): Promise<SeasonRankings | null> {
  return (await loadRankingsCollection())?.seasons.find((entry) => entry.year === year) ?? null;
}
export async function loadNextGenCollection(): Promise<NextGenCollection | null> {
  const runtime = (await loadAnalysisState()).edition;
  const value = await dataFile('nextgen-stats.json');
  if (!value) return runtime?.nextgen ?? null;
  if (!isNextGenCollection(value)) throw new Error('Invalid Next Gen snapshot');
  return mergeNextGenCollections(runtime?.nextgen, value);
}
export async function loadNextGenSeason(year: number) {
  const collection = await loadNextGenCollection();
  return nextGenSeasonCheck(collection, year);
}
