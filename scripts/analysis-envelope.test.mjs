import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { analysisEnvelope, validateAnalysisEnvelope, validateAnalysisCurve } from '../src/lib/analysis-envelope.mjs';

const data = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const [current, games, analytics, rankings, nextgen] = await Promise.all(['current', 'games', 'analytics', 'season-rankings', 'nextgen-stats'].map(data));
const seasonGames = games.filter((game) => game.season === current.season);
const points = await data(`curves/${seasonGames[0].id}`);
const curvePath = `analysis/v1/curves/${createHash('sha256').update(JSON.stringify(points)).digest('hex')}.json`;
const start = new Date(Math.max(...[current.analysisCheck.attemptedAt, current.analysisUpdatedAt, analytics.analysisUpdatedAt,
  ...rankings.seasons.flatMap((entry) => [entry.checkedAt, entry.attemptedAt]), nextgen.checkedAt, nextgen.attemptedAt]
  .map((value) => Date.parse(value ?? '')).filter(Number.isFinite)) + 60_000), finish = new Date(start.getTime() + 2000);
const fields = () => ({ season: current.season,
  current: Object.fromEntries(['analysisCheck', 'analysisUpdatedAt', 'latestAnalyzedGameId'].map((name) => [name, current[name]])),
  games: structuredClone(seasonGames), analytics: structuredClone(analytics), curves: Object.fromEntries(seasonGames.map((game) => [game.id, curvePath])),
  rankings: structuredClone(rankings.seasons.find((season) => season.year === current.season)), nextgen: structuredClone(nextgen) });
const envelope = () => analysisEnvelope(fields(), { startedAt: start, completedAt: finish });

test('pure envelope validates owned current-season analyses, immutable paths and independently checked datasets', () => {
  const value = envelope();
  assert.equal(validateAnalysisEnvelope(value, current), value);
  assert.equal(value.durationMs, 2000); assert.match(value.revision, /^[a-f0-9]{64}$/);
  assert.equal(validateAnalysisCurve(points, seasonGames[0]), points);
});

test('metadata checks do not change the content revision while status, pending games and curve changes do', () => {
  const first = envelope(), modified = fields();
  modified.current.analysisCheck = { ...modified.current.analysisCheck, checkedAt: start.toISOString(), attemptedAt: start.toISOString() };
  modified.rankings.checkedAt = start.toISOString(); modified.rankings.attemptedAt = start.toISOString();
  modified.nextgen.checkedAt = start.toISOString(); modified.nextgen.attemptedAt = start.toISOString();
  modified.providerChecks = { pbp: { url: `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${current.season}.parquet`, etag: '"verified"', contentLength: 100, lastModified: null } };
  assert.equal(analysisEnvelope(modified, { startedAt: start, completedAt: finish }).revision, first.revision);
  modified.current.analysisCheck.status = 'retained';
  assert.notEqual(analysisEnvelope(modified, { startedAt: start, completedAt: finish }).revision, first.revision);
});

test('unknown, mutable, cross-season and inconsistent confirmed score references fail closed', () => {
  const first = envelope();
  const variants = [
    { ...first, curves: { ...first.curves, [first.games[0].id]: 'analysis/current.json' } },
    { ...first, games: [{ ...first.games[0], season: 2025 }] },
    { ...first, current: { ...first.current, latestAnalyzedGameId: '2026_99_NYJ_BUF' } },
    { ...first, current: { ...first.current, analysisCheck: { ...first.current.analysisCheck, status: 'unavailable' } } },
    { ...first, nextgen: { ...nextgen, checkedAt: 'invalid' } },
  ];
  for (const value of variants) assert.throws(() => validateAnalysisEnvelope(value), /Invalid/);
  const changed = structuredClone(current); changed.schedule.find((game) => game.id === first.games[0].id).jetsScore++;
  assert.throws(() => validateAnalysisEnvelope(first, changed), /Invalid/);
  assert.throws(() => validateAnalysisCurve([{ q: 3, t: 1, wp: 2, d: 0 }, { q: 4, t: 0, wp: 1, d: 0 }]), /Invalid/);
});

test('honest never-available nullable datasets are valid without fabricated check times', () => {
  const value = fields(); value.games = []; value.curves = {}; value.analytics = null; value.rankings = null; value.nextgen = null;
  value.current = { analysisCheck: { attemptedAt: start.toISOString(), checkedAt: null, status: 'unavailable', reason: 'not-published' }, analysisUpdatedAt: null, latestAnalyzedGameId: null };
  assert.equal(analysisEnvelope(value, { startedAt: start, completedAt: finish }).games.length, 0);
});
