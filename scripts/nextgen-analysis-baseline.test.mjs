import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { refreshAnalysis } from './refresh-analysis.mjs';
import { PbpAvailabilityError } from './build-data.mjs';
import { analysisEnvelope } from '../src/lib/analysis-envelope.mjs';

const data = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const [current, coverage, games, analytics, rankingsCollection, nextgen] = await Promise.all(['current', 'coverage', 'games', 'analytics', 'season-rankings', 'nextgen-stats'].map(data));
const base = Math.max(...[current.checkedAt, current.analysisCheck?.checkedAt, rankingsCollection.checkedAt, nextgen.checkedAt,
  ...['news', 'roster', 'stats'].map((kind) => coverage[kind].checkedAt)].map(Date.parse).filter(Number.isFinite));
const at = (minutes) => new Date(base + minutes * 60_000).toISOString();

test('analysis seeds each Next Gen season from its newest verified data while preserving a later failed check', async () => {
  const compiled = structuredClone(nextgen);
  compiled.checkedAt = at(2); compiled.attemptedAt = at(2); compiled.status = 'ready';
  compiled.seasons = compiled.seasons.map((season) => {
    const ready = { ...season, checkedAt: at(2), attemptedAt: at(2), status: 'ready' };
    delete ready.retentionReason;
    return ready;
  });
  const fixed = compiled.seasons.find((season) => season.year === 2020);
  fixed.passing[0].metrics[0].value = 2.99;
  const runtime = structuredClone(compiled);
  runtime.checkedAt = at(3); runtime.attemptedAt = at(3); runtime.status = 'retained';
  runtime.seasons = runtime.seasons.map((season) => season.year === 2020 ? {
    ...nextgen.seasons.find((row) => row.year === 2020), checkedAt: nextgen.checkedAt, status: 'retained', attemptedAt: at(3), retentionReason: 'Historical passing source gap.',
  } : { ...season, checkedAt: at(3), attemptedAt: at(3) });
  const seasonGames = games.filter((game) => game.season === current.season);
  const points = new Map(await Promise.all(seasonGames.map(async (game) => [game.id, await data(`curves/${game.id}`)])));
  const curves = Object.fromEntries([...points].map(([id, value]) => [id, `analysis/v1/curves/${createHash('sha256').update(JSON.stringify(value)).digest('hex')}.json`]));
  const previous = analysisEnvelope({ season: current.season,
    current: Object.fromEntries(['analysisCheck', 'analysisUpdatedAt', 'latestAnalyzedGameId'].map((key) => [key, current[key]])),
    games: seasonGames, curves, analytics, rankings: rankingsCollection.seasons.find((season) => season.year === current.season), nextgen: runtime,
  }, { startedAt: new Date(at(3)), completedAt: new Date(at(3)) });
  const result = await refreshAnalysis({ baked: { current, coverage, games, analytics, rankingsCollection, nextgen: compiled },
    previous, football: { current, coverage }, now: new Date(at(4)), fetcher: async () => new Response('', { status: 503 }),
    extract: async () => { throw new PbpAvailabilityError('Source unavailable'); },
    readCurve: async (id) => points.get(id), writeCurve: async () => assert.fail('Existing immutable curves need no new writes'),
  });
  const historical = result.nextgen.seasons.find((season) => season.year === 2020);
  assert.equal(historical.passing[0].metrics[0].value, 2.99, 'a later current-season runtime check must not mask a newer compiled historical record');
  assert.equal(historical.checkedAt, at(2));
  assert.equal(historical.status, 'retained');
  assert.equal(result.nextgen.seasons.find((season) => season.year === current.season).checkedAt, at(3));
});
