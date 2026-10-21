import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeBakedDrivesEvidence, validateRuntimeDrives, validateRuntimeHistory } from '../src/lib/postgame-evidence.mjs';
import { analysisEnvelope, validateAnalysisEnvelope } from '../src/lib/analysis-envelope.mjs';
import { analysisSourceChecks } from '../src/lib/analysis-refresh-coordinator.mjs';
import { editionHealth } from '../src/lib/edition-health.ts';
import { beforeGame, footballAt } from './baked-snapshot.mjs';

const read = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const [bakedCurrent, bakedDrives, bakedHistory, analytics, bakedGames, rankings, nextgen, bakedCoverage] = await Promise.all(
  ['current', 'drives/2026', 'league-history', 'analytics', 'games', 'season-rankings', 'nextgen-stats', 'coverage'].map(read));
// The season before week 6, with no analysis newer than the compiled drive check, whatever the latest data refresh wrote.
const rewound = beforeGame({ current: bakedCurrent, coverage: bakedCoverage, drives: bakedDrives, history: bakedHistory, games: bakedGames }, '2026_06_NYJ_NE');
const { drives: rawDrives, history, games } = rewound, { current, coverage } = footballAt(rewound, rawDrives.checkedAt);
const at = new Date(Math.max(...[current.analysisCheck.attemptedAt, current.analysisUpdatedAt, analytics.analysisUpdatedAt,
  ...rankings.seasons.flatMap((entry) => [entry.checkedAt, entry.attemptedAt]), nextgen.checkedAt, nextgen.attemptedAt,
  history.checkedAt, history.attemptedAt, rawDrives.checkedAt].map((value) => Date.parse(value ?? '')).filter(Number.isFinite)) + 60_000).toISOString();
const clone = (value) => structuredClone(value);
const drives = () => makeBakedDrivesEvidence(clone(rawDrives), current, games);
function fields() {
  const seasonGames = games.filter((game) => game.season === current.season);
  const value = { season: current.season, current: Object.fromEntries(['analysisCheck', 'analysisUpdatedAt', 'latestAnalyzedGameId'].map((key) => [key, clone(current[key])])),
    games: clone(seasonGames), curves: Object.fromEntries(seasonGames.map((game) => [game.id, `analysis/v1/curves/${'a'.repeat(64)}.json`])),
    analytics: clone(analytics), rankings: clone(rankings.seasons.find((season) => season.year === current.season)), nextgen: clone(nextgen),
    history: { ...clone(history), status: 'ready', attemptedAt: history.checkedAt }, drives: drives() };
  value.sourceChecks = analysisSourceChecks(value);
  return value;
}
const envelope = (value) => analysisEnvelope(value, { startedAt: new Date(at), completedAt: new Date(Date.parse(at) + 1000) });

test('strict published evidence rejects malformed chart indices, wrong final witnesses and invented pending games', () => {
  assert.equal(validateRuntimeHistory(history), history);
  for (const alter of [
    (value) => { Object.values(value.games)[0][0][6] = 1.5; },
    (value) => { Object.values(value.finals)[0].jetsScore++; },
    (value) => { value.pendingGameIds.push('2026_06_NYJ_NE'); },
    (value) => { const id = Object.keys(value.games)[0]; delete value.games[id]; delete value.finals[id]; },
  ]) {
    const value = drives(); alter(value);
    assert.throws(() => validateRuntimeDrives(value, current), /Invalid/);
  }
  const unknownStarter = clone(history);
  const scheduled = unknownStarter.games.find((game) => game.status === 'scheduled');
  scheduled.qb = { id: '00-0030565', name: 'Projected starter' };
  assert.throws(() => validateRuntimeHistory(unknownStarter), /Invalid/);
});

test('enriched editions require both postgame sources and truthful independent checks', () => {
  const value = envelope(fields());
  assert.equal(validateAnalysisEnvelope(value, current), value);
  for (const alter of [
    (candidate) => { delete candidate.drives; },
    (candidate) => { delete candidate.sourceChecks.history; },
    (candidate) => { candidate.sourceChecks.drives.checkedAt = at; },
    (candidate) => { candidate.history.checkedAt = new Date(Date.parse(at) + 600_000).toISOString(); },
  ]) {
    const candidate = clone(value); alter(candidate);
    assert.throws(() => validateAnalysisEnvelope(candidate), /Invalid/);
  }
});

test('a corrected compiled score cannot relabel old legacy charts without matching postgame evidence', () => {
  const corrected = clone(current), id = current.latestAnalyzedGameId;
  const final = corrected.schedule.find((game) => game.id === id);
  final.jetsScore++;
  const chart = makeBakedDrivesEvidence(rawDrives, corrected, games);
  assert.equal(chart.games[id], undefined);
  assert.equal(chart.finals[id], undefined);
  assert.ok(chart.pendingGameIds.includes(id));
  const correctedGames = clone(games);
  correctedGames.find((game) => game.id === id).jetsScore = final.jetsScore;
  corrected.analysisCheck.checkedAt = new Date(Date.parse(rawDrives.checkedAt) + 60_000).toISOString();
  assert.equal(makeBakedDrivesEvidence(rawDrives, corrected, correctedGames).games[id], undefined);
  assert.equal(Object.keys(makeBakedDrivesEvidence(rawDrives, current).games).length, 0);
  const witnessed = drives();
  assert.equal(makeBakedDrivesEvidence(witnessed, corrected, correctedGames).finals[id].jetsScore, current.schedule.find((game) => game.id === id).jetsScore);
});

test('freshness-only checks keep the viewer revision stable while new starter and drive content change it', () => {
  const first = fields(), initial = envelope(first);
  const checked = clone(first);
  for (const key of ['history', 'drives']) Object.assign(checked[key], { checkedAt: at, attemptedAt: at });
  checked.drives.asset = { url: checked.drives.source, etag: '"new-signature"', lastModified: at, contentLength: 100 };
  checked.sourceChecks = analysisSourceChecks(checked);
  assert.equal(envelope(checked).revision, initial.revision);
  const qb = clone(first); qb.history.games.find((game) => game.qb).qb.name = 'Corrected starter';
  assert.notEqual(envelope(qb).revision, initial.revision);
  const chart = clone(first); Object.values(chart.drives.games)[0][0][3] = 41;
  assert.notEqual(envelope(chart).revision, initial.revision);
});

test('postgame health exposes source failures and the exact thirty-minute freshness boundary', () => {
  const now = Date.parse(at), checkedAt = new Date(now - 29 * 60_000).toISOString();
  const football = { edition: { current, coverage, scheduleCheck: { status: 'ready', checkedAt: at }, live: null }, active: false };
  const ready = { history: { status: 'ready', checkedAt }, drives: { status: 'retained', checkedAt } };
  const healthy = editionHealth(current, coverage, analytics, now, ready, football);
  assert.equal(healthy.feeds.history.status, 'ready');
  assert.equal(healthy.feeds.drives.status, 'retained');
  const later = editionHealth(current, coverage, analytics, now + 60_000, ready, football);
  assert.equal(later.feeds.history.status, 'overdue');
  assert.equal(later.feeds.drives.status, 'overdue');
  assert.equal(later.feeds.history.checkedAt, checkedAt);
  assert.equal(editionHealth(current, coverage, analytics, now, { history: { status: 'unavailable', checkedAt: null }, drives: ready.drives }, football).feeds.history.status, 'unavailable');
});
