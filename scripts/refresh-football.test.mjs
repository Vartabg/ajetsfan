import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { refreshFootball, validateFootballEdition, footballActiveWindow } from './refresh-football.mjs';
import { SCHEDULE_SOURCE } from './data-refresh.mjs';
import { footballScheduleSource } from './football-live.mjs';

const bakedCurrent = JSON.parse(await readFile(new URL('../public/data/current.json', import.meta.url), 'utf8'));
const bakedCoverage = JSON.parse(await readFile(new URL('../public/data/coverage.json', import.meta.url), 'utf8'));
const gameId = '2026_06_NYJ_NE', kickoff = '2026-10-18T17:00:00.000Z';
const checked = '2026-10-18T17:00:00.000Z', now = new Date('2026-10-18T17:01:00.000Z');
const clone = (value) => structuredClone(value);
function live(at = checked, state = 'scheduled', scores = [null, null]) {
  const match = bakedCurrent.schedule.find((game) => game.id === gameId);
  const game = { eventId: '401999001', gameId, season: 2026, week: 6, seasonType: 'REG', kickoff,
    opponent: match.opponent, opponentDisplay: match.opponentDisplay, atHome: false, state,
    jetsScore: scores[0], oppScore: scores[1], period: state === 'scheduled' ? 0 : 4, clock: state === 'live' ? '12:00' : null,
    detail: state === 'final' ? 'Final' : state === 'live' ? '4th quarter' : 'Scheduled', provisional: state === 'live', players: [] };
  return { schemaVersion: 1, season: 2026, source: footballScheduleSource(2026), checkedAt: at, attemptedAt: at, status: 'ready', games: [game], featured: game };
}
function edition(at = checked) {
  const coverage = clone(bakedCoverage);
  for (const name of ['news', 'roster', 'stats']) Object.assign(coverage[name], { checkedAt: at, attemptedAt: at, status: 'ready' });
  return validateFootballEdition({ schemaVersion: 1, current: { ...clone(bakedCurrent), checkedAt: at }, coverage, live: live(at),
    scheduleCheck: { source: SCHEDULE_SOURCE, status: 'ready', checkedAt: at, attemptedAt: at } });
}
function csv(schedule = bakedCurrent.schedule) {
  return 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score\n' + schedule.map((game) => {
    const [, , away, home] = game.id.split('_');
    return [game.id, game.season, game.seasonType, game.week, game.date, '13:00', away,
      game.atHome ? game.oppScore ?? '' : game.jetsScore ?? '', home, game.atHome ? game.jetsScore ?? '' : game.oppScore ?? ''].join(',');
  }).join('\n');
}
function refresh(previous, options = {}) {
  return refreshFootball({ previous, now, refreshLive: async ({ now }) => live(now.toISOString()),
    fetcher: async (url) => url === SCHEDULE_SOURCE ? new Response(csv()) : new Response('', { status: 503 }), ...options });
}

test('live partial scores remain separate from final records and delayed PBP metadata', async () => {
  const previous = edition();
  const result = await refresh(previous, { refreshLive: async () => live(now.toISOString(), 'live', [10, 14]) });
  const game = result.current.schedule.find((entry) => entry.id === gameId);
  assert.equal(game.status, 'scheduled'); assert.equal(game.jetsScore, null); assert.equal(game.outcome, null);
  assert.equal(result.live.featured.jetsScore, 10); assert.equal(result.live.featured.provisional, true);
  assert.deepEqual(result.current.analysisCheck, previous.current.analysisCheck);
  assert.equal(result.current.analysisUpdatedAt, previous.current.analysisUpdatedAt);
  assert.equal(result.current.latestAnalyzedGameId, previous.current.latestAnalyzedGameId);
});

test('only an identity-matched, completed provider game publishes a new confirmed result', async () => {
  const previous = edition();
  const result = await refresh(previous, { refreshLive: async () => live(now.toISOString(), 'final', [27, 24]) });
  const game = result.current.schedule.find((entry) => entry.id === gameId);
  assert.equal(game.status, 'final'); assert.equal(game.jetsScore, 27); assert.equal(game.outcome, 'win');
  assert.equal(game.scoreSource, result.live.source); assert.equal(game.scoreCheckedAt, now.toISOString());
  assert.ok(result.coverage.stats.pendingGameIds.includes(gameId));
  assert.equal(result.coverage.stats.checkedAt, previous.coverage.stats.checkedAt);
  assert.equal(result.current.analysisCheck.checkedAt, previous.current.analysisCheck.checkedAt);
});

test('an unrelated valid ESPN final cannot change the Jets schedule', async () => {
  const match = live(now.toISOString(), 'final', [27, 24]);
  match.games[0] = { ...match.games[0], gameId: '2026_06_NYJ_BUF', opponent: 'BUF', opponentDisplay: 'Buffalo Bills' };
  match.featured = match.games[0];
  const result = await refresh(edition(), { refreshLive: async () => match });
  assert.equal(result.current.schedule.find((entry) => entry.id === gameId).status, 'scheduled');
});

test('a previous confirmed ESPN final never regresses when NFLverse is still scheduled or ESPN is partial', async () => {
  const first = await refresh(edition(), { refreshLive: async () => live(now.toISOString(), 'final', [27, 24]) });
  const later = new Date(now.getTime() + 5 * 60_000);
  const next = await refresh(first, { now: later, refreshLive: async () => live(later.toISOString(), 'live', [20, 17]) });
  const final = next.current.schedule.find((entry) => entry.id === gameId);
  assert.equal(final.status, 'final'); assert.equal(final.jetsScore, 27); assert.equal(final.oppScore, 24);
  assert.equal(final.scoreSource, first.live.source); assert.equal(final.scoreCheckedAt, first.live.checkedAt);
});

test('confirmed NFLverse final scores take precedence over a conflicting provider overlay', async () => {
  const schedule = clone(bakedCurrent.schedule);
  Object.assign(schedule.find((game) => game.id === gameId), { status: 'final', jetsScore: 20, oppScore: 17, outcome: 'win' });
  const previous = edition('2026-10-18T16:50:00.000Z');
  const result = await refresh(previous, { fetcher: async (url) => url === SCHEDULE_SOURCE ? new Response(csv(schedule)) : new Response('', { status: 503 }),
    refreshLive: async () => live(now.toISOString(), 'final', [27, 24]) });
  const final = result.current.schedule.find((game) => game.id === gameId);
  assert.equal(final.jetsScore, 20); assert.equal(final.scoreSource, SCHEDULE_SOURCE);
});

test('schedule failures retain their old success date while live checks advance independently', async () => {
  const previous = edition('2026-10-18T16:50:00.000Z');
  const result = await refresh(previous, { fetcher: async () => new Response('', { status: 503 }) });
  assert.equal(result.scheduleCheck.status, 'retained'); assert.equal(result.scheduleCheck.checkedAt, previous.scheduleCheck.checkedAt);
  assert.equal(result.scheduleCheck.attemptedAt, now.toISOString()); assert.equal(result.current.checkedAt, now.toISOString());
  assert.deepEqual(result.current.analysisCheck, previous.current.analysisCheck);
  assert.equal(result.coverage.stats.status, 'retained'); assert.equal(result.coverage.stats.checkedAt, previous.coverage.stats.checkedAt);
});

test('healthy NFLverse and coverage sources are reused while live checks run each minute', async () => {
  const previous = edition(), requests = []; let liveCalls = 0;
  const result = await refresh(previous, { fetcher: async (url) => { requests.push(url); throw new Error('not due'); },
    refreshLive: async ({ now }) => { liveCalls++; return live(now.toISOString(), 'live', [3, 7]); } });
  assert.equal(liveCalls, 1); assert.deepEqual(requests, []);
  assert.deepEqual(result.scheduleCheck, previous.scheduleCheck);
  for (const name of ['news', 'roster', 'stats']) {
    assert.equal(result.coverage[name].checkedAt, previous.coverage[name].checkedAt);
    assert.equal(result.coverage[name].attemptedAt, previous.coverage[name].attemptedAt);
  }
});

test('a one-minute clock with small jitter still refreshes active scores after forty seconds', async () => {
  let calls = 0;
  const result = await refresh(edition(), { now: new Date('2026-10-18T17:00:59.900Z'),
    refreshLive: async ({ now }) => { calls++; return live(now.toISOString(), 'live', [3, 7]); } });
  assert.equal(calls, 1); assert.equal(result.live.checkedAt, '2026-10-18T17:00:59.900Z');
});

test('coverage retries failed sources without refetching healthy roster or fabricating success dates', async () => {
  const previous = edition(), requests = [];
  previous.coverage.stats.status = 'retained';
  const result = await refresh(previous, { fetcher: async (url) => { requests.push(url); return new Response('', { status: 503 }); } });
  assert.deepEqual(requests, [previous.coverage.stats.source]);
  assert.equal(result.coverage.stats.checkedAt, previous.coverage.stats.checkedAt);
  assert.equal(result.coverage.stats.attemptedAt, now.toISOString());
  assert.deepEqual(result.coverage.roster, previous.coverage.roster);
});

test('the fast window includes the hour before kickoff through six hours after, and respects rescheduling', () => {
  const schedule = [{ ...bakedCurrent.schedule.find((game) => game.id === gameId) }];
  for (const [at, active] of [['2026-10-18T15:59:59.999Z', false], ['2026-10-18T16:00:00.000Z', true],
    ['2026-10-18T20:30:00.000Z', true], ['2026-10-18T23:00:00.000Z', true], ['2026-10-18T23:00:00.001Z', false]]) {
    assert.equal(footballActiveWindow(schedule, new Date(at)), active, at);
  }
  schedule[0].kickoff = '2026-10-19T17:00:00.000Z';
  assert.equal(footballActiveWindow(schedule, now), false);
  assert.equal(footballActiveWindow(schedule, new Date('2026-10-19T16:00:00.000Z')), true);
});

test('an older season or dropped confirmed game cannot replace the known schedule', async () => {
  const previous = edition('2026-10-18T16:50:00.000Z');
  for (const body of [csv().replaceAll('2026', '2025'), csv(bakedCurrent.schedule.filter((game) => game.id !== bakedCurrent.latestAnalyzedGameId))]) {
    const result = await refresh(previous, { fetcher: async (url) => url === SCHEDULE_SOURCE ? new Response(body) : new Response('', { status: 503 }) });
    assert.equal(result.current.season, 2026); assert.equal(result.scheduleCheck.status, 'retained');
    assert.equal(result.current.latestAnalyzedGameId, previous.current.latestAnalyzedGameId);
  }
});

test('invalid editions fail before any publication and malformed provider payloads cannot become scores', async () => {
  const invalid = edition(); invalid.current.schedule[0].status = 'live';
  assert.throws(() => validateFootballEdition(invalid), /Invalid football edition/);
  await assert.rejects(refresh(invalid), /Invalid football edition/);
  await assert.rejects(refresh(edition(), { refreshLive: async () => ({ ...live(now.toISOString()), checkedAt: 'invalid' }) }), /Invalid live football/);
});
