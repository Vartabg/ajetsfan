import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCsv, parseSchedule, easternKickoff, inferSeason, mergeAnalysis, currentManifest, publishSnapshot, recoverPublication, withDataLock } from './data-refresh.mjs';
import { refreshData, extractSeason, PbpAvailabilityError } from './build-data.mjs';
import { buildAnalytics } from './season-analytics.mjs';
import { parseLeagueSchedule } from './data-refresh.mjs';
import { NEWS_SOURCE, rosterSource, playerStatsSource } from './coverage.mjs';

const HEADER = 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score';
const csv = (...rows) => [HEADER, ...rows].join('\n');
const CURRENT = '2026_01_BUF_NYJ,2026,REG,1,2026-09-13,13:00,BUF,10,NYJ,20';
const NEXT = '2026_02_NYJ_MIA,2026,REG,2,2026-09-20,20:20,NYJ,,MIA,';
const HISTORICAL = '2025_18_NYJ_BUF,2025,REG,18,2026-01-04,13:00,NYJ,8,BUF,35';
const OLD_ID = '2025_18_NYJ_BUF';
const NEW_ID = '2026_01_BUF_NYJ';
const now = new Date('2026-09-15T12:00:00Z');
const curve = [
  { playId: 1, meaningful: true, q: 3, t: 1500, wp: 0.2, d: 0.1, desc: 'Pass', type: 'pass' },
  { playId: 2, meaningful: true, q: 4, t: 10, wp: 0.99, d: 0.2, desc: 'Touchdown', type: 'pass' },
];
const game = (id = OLD_ID) => ({
  id, season: Number(id.slice(0, 4)), week: id === OLD_ID ? 18 : 1, date: id === OLD_ID ? '2026-01-04' : '2026-09-13',
  seasonType: 'REG', dataSuspect: false, jetsScore: id === OLD_ID ? 8 : 20, oppScore: id === OLD_ID ? 35 : 10,
  swing: 0.2, outcome: id === OLD_ID ? 'loss' : 'win', keyPlay: { playId: 2 },
});
const analysis = (g = game(NEW_ID), points = curve) => ({ games: [g], curves: new Map([[g.id, points]]), completeGameIds: new Set([g.id]) });

async function sandbox(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-refresh-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const out = path.join(root, 'data');
  await mkdir(path.join(out, 'curves'), { recursive: true });
  await writeFile(path.join(out, 'games.json'), JSON.stringify([game()]));
  await writeFile(path.join(out, 'curves', `${OLD_ID}.json`), JSON.stringify(curve));
  await writeFile(path.join(out, 'current.json'), JSON.stringify({ checkedAt: '2026-01-05T12:00:00Z', analysisUpdatedAt: '2026-01-05T12:00:00Z' }));
  return out;
}
const fetchSchedule = (value = csv(HISTORICAL, CURRENT, NEXT)) => async () => new Response(value);
const coverageFixtures = new Map([
  [NEWS_SOURCE, '<rss><channel><item><title>Fresh team report</title><link>https://www.newyorkjets.com/news/fresh-report</link><guid>fresh-report</guid><pubDate>Tue, 15 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>'],
  [rosterSource(2026), 'season,team,game_type,week,gsis_id,espn_id,full_name,position,jersey_number,status,headshot_url,height,weight,college,years_exp\n2026,NYJ,REG,1,00-0099999,,Fixture Player,RB,20,ACT,,72,210,,1'],
  [playerStatsSource(2026), 'player_id,player_display_name,position,headshot_url,season,week,season_type,game_id,team,opponent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,targets,receptions,receiving_yards,receiving_tds\n00-0099999,Fixture Player,RB,,2026,1,REG,2026_01_BUF_NYJ,NYJ,BUF,0,0,0,0,0,1,3,0,0,0,0,0'],
]);
const fetchWithCoverage = (pbp, schedule = csv(HISTORICAL, CURRENT, NEXT)) => async (url) => {
  if (url.endsWith('.parquet')) return pbp(url);
  if (coverageFixtures.has(url)) return new Response(coverageFixtures.get(url));
  if (url.endsWith('/games.csv')) return new Response(schedule);
  throw new Error(`Unexpected fixture request: ${url}`);
};

test('CSV parser handles quoted commas, embedded newline, escaped quotes and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"one, two","say ""yes""\nnow"\r\n'), [{ a: 'one, two', b: 'say "yes"\nnow' }]);
  assert.throws(() => parseCsv('a,b\n"unterminated,x'), /Unterminated/);
  assert.throws(() => parseCsv('a,b\nx'), /column count/);
});

test('schedule distinguishes a real zero score from an unplayed game and maps playoffs', () => {
  const games = parseSchedule(csv(CURRENT.replace(',10,NYJ,20', ',0,NYJ,0'), NEXT, '2025_19_NYJ_NE,2025,WC,19,2026-01-11,,NYJ,7,NE,14'));
  assert.equal(games[0].seasonType, 'POST');
  assert.equal(games[1].status, 'final');
  assert.equal(games[1].outcome, 'tie');
  assert.equal(games[2].status, 'scheduled');
  assert.equal(games[2].jetsScore, null);
});

test('schedule rejects schema changes, partial scores, duplicate identity and invalid dates', () => {
  assert.throws(() => parseSchedule(csv(CURRENT).replace('gameday', 'date')), /Missing schedule column/);
  assert.throws(() => parseSchedule(csv(CURRENT.replace(',10,NYJ,20', ',,NYJ,20'))), /Incomplete final/);
  assert.throws(() => parseSchedule(csv(CURRENT, CURRENT)), /duplicate schedule/);
  assert.throws(() => parseSchedule(csv(CURRENT.replace('2026-09-13', '2026-02-30'))), /Invalid schedule date/);
  assert.throws(() => parseSchedule(csv(CURRENT.replace(',2026,REG,1,', ',2026,REG,2,'))), /identity mismatch/);
});

test('Eastern kickoff conversion respects daylight saving and winter January dates', () => {
  assert.equal(easternKickoff('2026-09-13', '13:00'), '2026-09-13T17:00:00.000Z');
  assert.equal(easternKickoff('2026-01-04', '20:20'), '2026-01-05T01:20:00.000Z');
  assert.equal(easternKickoff('2026-09-13', ''), null);
  assert.throws(() => easternKickoff('2026-09-13', '25:00'), /Invalid kickoff/);
});

test('season inference handles January postseason, spring release and future rows', () => {
  const schedule = parseSchedule(csv(HISTORICAL, CURRENT, NEXT));
  assert.equal(inferSeason(schedule, new Date('2026-01-20T12:00:00Z')), 2025);
  assert.equal(inferSeason(schedule, new Date('2026-02-09T12:00:00Z')), 2025);
  assert.equal(inferSeason(schedule, new Date('2026-05-20T12:00:00Z')), 2026);
  assert.equal(inferSeason(schedule.filter((g) => g.season === 2025), new Date('2026-04-01T12:00:00Z')), 2025);
  assert.throws(() => inferSeason(schedule.filter((g) => g.season === 2025), now), /stale/);
});

test('pre-archive schedule rows do not prevent a current refresh', () => {
  const beforeArchive = '1998_01_NYJ_SF,1998,REG,1,1998-09-06,,NYJ,22,SF,36';
  assert.equal(parseSchedule(csv(beforeArchive, CURRENT)).length, 1);
});

test('incremental merge keeps history and admits only completed, reconciled analysis', () => {
  const schedule = parseSchedule(csv(HISTORICAL, CURRENT, NEXT));
  const result = mergeAnalysis([game()], [analysis()], schedule);
  assert.deepEqual(result.games.map((g) => g.id), [OLD_ID, NEW_ID]);
  assert.equal(result.curves.size, 1);
  assert.equal(mergeAnalysis([game()], [analysis({ ...game(NEW_ID), dataSuspect: true })], schedule).games.length, 1);
  assert.equal(mergeAnalysis([game()], [analysis({ ...game(NEW_ID), id: '2026_02_NYJ_MIA' })], schedule).games.length, 1);
  assert.equal(mergeAnalysis([game()], [{ ...analysis(), completeGameIds: new Set() }], schedule).games.length, 1);
  assert.throws(() => mergeAnalysis([game()], [analysis({ ...game(NEW_ID), jetsScore: 21 })], schedule), /final mismatch/);
  assert.throws(() => mergeAnalysis([game()], [analysis(game(NEW_ID), [{ ...curve[0], wp: 2 }, curve[1]])], schedule), /Invalid curve/);
});

test('manifest can show a newer confirmed result while analysis stays on an earlier game', () => {
  const schedule = parseSchedule(csv(HISTORICAL, CURRENT, NEXT.replace(',NYJ,,MIA,', ',NYJ,7,MIA,21')));
  const value = currentManifest({ season: 2026, schedule, games: [game(), game(NEW_ID)], now, previous: { analysisUpdatedAt: '2026-09-14T12:00:00Z' } });
  assert.equal(value.latestAnalyzedGameId, NEW_ID);
  assert.equal(value.schedule.at(-1).status, 'final');
  assert.equal(value.checkedAt, now.toISOString());
  assert.equal(value.analysisUpdatedAt, '2026-09-14T12:00:00Z');
});

test('default refresh requests one season and preserves historical curves byte-for-byte', async (t) => {
  const out = await sandbox(t);
  const historical = await readFile(path.join(out, 'curves', `${OLD_ID}.json`), 'utf8');
  const calls = [];
  const value = await refreshData({ out, now, fetcher: fetchSchedule(), extract: async (season) => { calls.push(season); return analysis(); } });
  assert.deepEqual(calls, [2026]);
  assert.equal(value.latestAnalyzedGameId, NEW_ID);
  assert.equal(value.analysisUpdatedAt, now.toISOString());
  assert.equal(await readFile(path.join(out, 'curves', `${OLD_ID}.json`), 'utf8'), historical);
  assert.equal(JSON.parse(await readFile(path.join(out, 'games.json'), 'utf8')).length, 2);
});

test('full rebuild is explicit and visits historical seasons while preserving absent current analysis', async (t) => {
  const out = await sandbox(t);
  const calls = [];
  const value = await refreshData({ out, now, full: true, fetcher: fetchSchedule(), extract: async (season) => {
    calls.push(season);
    return season === 2025 ? analysis(game()) : null;
  } });
  assert.deepEqual(calls, [2025, 2026]);
  assert.equal(value.latestAnalyzedGameId, null);
  assert.equal(JSON.parse(await readFile(path.join(out, 'games.json'), 'utf8')).length, 1);
});

test('spring rollover backfills a prior-season final missed while the updater was stopped', async (t) => {
  const out = await sandbox(t);
  const priorId = '2025_17_NE_NYJ';
  const prior = { ...game(), id: priorId, week: 17, date: '2025-12-28', jetsScore: 10, oppScore: 42 };
  await writeFile(path.join(out, 'games.json'), JSON.stringify([prior]));
  await writeFile(path.join(out, 'curves', `${priorId}.json`), JSON.stringify(curve));
  const calls = [];
  const schedule = csv(HISTORICAL, '2025_17_NE_NYJ,2025,REG,17,2025-12-28,13:00,NE,42,NYJ,10', NEXT);
  const value = await refreshData({ out, now: new Date('2026-05-20T12:00:00Z'), fetcher: fetchSchedule(schedule), extract: async (season) => {
    calls.push(season);
    return analysis(game()); // The absent final is January 4, 2026, in season 2025.
  } });
  assert.deepEqual(calls, [2025]); // Future 2026 games do not need PBP yet.
  assert.equal(value.season, 2026);
  assert.equal(value.latestAnalyzedGameId, null);
  assert.equal(JSON.parse(await readFile(path.join(out, 'games.json'), 'utf8')).some((g) => g.id === OLD_ID), true);
});

test('missing PBP publishes confirmed schedule with analysis pending and retains last analysis date', async (t) => {
  const out = await sandbox(t);
  const before = await readFile(path.join(out, 'games.json'), 'utf8');
  const value = await refreshData({ out, now, fetcher: async (url) => url.endsWith('.parquet') ? new Response('', { status: 404 }) : new Response(csv(HISTORICAL, CURRENT, NEXT)) });
  assert.equal(value.schedule[0].status, 'final');
  assert.equal(value.latestAnalyzedGameId, null);
  assert.equal(value.analysisUpdatedAt, '2026-01-05T12:00:00Z');
  assert.deepEqual(value.analysisCheck, { attemptedAt: now.toISOString(), checkedAt: null, status: 'unavailable', reason: 'not-published' });
  assert.equal(await readFile(path.join(out, 'games.json'), 'utf8'), before);
});

test('the refresher retains published analytics byte-for-byte across missing and failed PBP', async (t) => {
  const out = await sandbox(t);
  const league = parseLeagueSchedule(csv(CURRENT));
  const analytics = buildAnalytics({
    season: 2026, schedule: league, states: [{ ...league[0], complete: true, runningHome: 20, runningAway: 10 }],
    totals: [
      { id: NEW_ID, team: 'NYJ', plays: 1, epa: 1, successes: 1, passPlays: 1, passEpa: 1, rushPlays: 0, rushEpa: 0 },
      { id: NEW_ID, team: 'BUF', plays: 1, epa: -1, successes: 0, passPlays: 1, passEpa: -1, rushPlays: 0, rushEpa: 0 },
    ], now, sources: { schedule: 'https://example.test/games.csv', pbp: 'https://example.test/pbp.parquet', methodology: 'https://example.test/definitions' },
  });
  await refreshData({ out, now, fetcher: fetchSchedule(), extract: async () => ({ ...analysis(), analytics }) });
  const before = await readFile(path.join(out, 'analytics.json'), 'utf8');
  const later = new Date('2026-09-16T12:00:00Z');
  await refreshData({ out, now: later, fetcher: async (url) => url.endsWith('.parquet') ? new Response('', { status: 404 }) : new Response(csv(HISTORICAL, CURRENT, NEXT)) });
  assert.equal(await readFile(path.join(out, 'analytics.json'), 'utf8'), before);
  const value = await refreshData({ out, now: later, fetcher: async (url) => url.endsWith('.parquet') ? new Response('', { status: 503 }) : new Response(csv(HISTORICAL, CURRENT, NEXT)), onAnalysisError: () => {} });
  assert.equal(await readFile(path.join(out, 'analytics.json'), 'utf8'), before);
  assert.equal(value.checkedAt, later.toISOString());
  assert.deepEqual(value.analysisCheck, { attemptedAt: later.toISOString(), checkedAt: now.toISOString(), status: 'retained', reason: 'source-unavailable' });
  const nextFinal = csv(HISTORICAL, CURRENT, NEXT.replace(',NYJ,,MIA,', ',NYJ,7,MIA,21'));
  const afterGame = new Date('2026-09-21T12:00:00Z');
  await refreshData({ out, now: afterGame, fetcher: fetchWithCoverage(() => new Response('', { status: 503 }), nextFinal), onAnalysisError: () => {} });
  const retained = JSON.parse(await readFile(path.join(out, 'analytics.json'), 'utf8'));
  assert.deepEqual(retained, { ...JSON.parse(before), pendingGameIds: ['2026_02_NYJ_MIA'] });
  // A malformed regressed candidate must fail validation before retention can mask it.
  const currentBeforeInvalid = await readFile(path.join(out, 'current.json'), 'utf8');
  await assert.rejects(refreshData({ out, now: afterGame, fetcher: fetchWithCoverage(), extract: async () => ({
    ...analysis(), analytics: { ...analytics, analyzedGameIds: [] },
  }) }), /analytics/i);
  assert.equal(await readFile(path.join(out, 'current.json'), 'utf8'), currentBeforeInvalid);
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'analytics.json'), 'utf8')), retained);
});

test('schedule failures and rejected PBP data retain all prior bytes without advancing checkedAt', async (t) => {
  const out = await sandbox(t);
  const before = await readFile(path.join(out, 'current.json'), 'utf8');
  await assert.rejects(refreshData({ out, now, fetcher: async () => { throw new Error('offline'); } }), /offline/);
  await assert.rejects(refreshData({ out, now, fetcher: async (url) => url.endsWith('.parquet') ? new Response('', { status: 403 }) : new Response(csv(HISTORICAL, CURRENT)) }), /HTTP 403/);
  await assert.rejects(refreshData({ out, now, fetcher: fetchSchedule(), extract: async () => analysis({ ...game(NEW_ID), jetsScore: 99 }) }), /final mismatch/);
  assert.equal(await readFile(path.join(out, 'current.json'), 'utf8'), before);
});

test('unchanged analysis does not claim it was updated on a later check', async (t) => {
  const out = await sandbox(t);
  await refreshData({ out, now, fetcher: fetchSchedule(), extract: async () => analysis() });
  const tomorrow = new Date('2026-09-16T12:00:00Z');
  const value = await refreshData({ out, now: tomorrow, fetcher: fetchSchedule(), extract: async () => analysis() });
  assert.equal(value.checkedAt, tomorrow.toISOString());
  assert.equal(value.analysisUpdatedAt, now.toISOString());
  assert.deepEqual(value.analysisCheck, { attemptedAt: tomorrow.toISOString(), checkedAt: tomorrow.toISOString(), status: 'ready', reason: null });
});

test('a PBP 503 retains good analysis while new finals and all valid coverage feeds publish', async (t) => {
  const out = await sandbox(t);
  await refreshData({ out, now, fetcher: fetchWithCoverage(), extract: async () => analysis() });
  const before = await readFile(path.join(out, 'games.json'), 'utf8');
  const beforeCurve = await readFile(path.join(out, 'curves', `${NEW_ID}.json`), 'utf8');
  const later = new Date('2026-09-21T12:00:00Z');
  const schedule = csv(HISTORICAL, CURRENT, NEXT.replace(',NYJ,,MIA,', ',NYJ,7,MIA,21'));
  const warnings = [];
  const value = await refreshData({ out, now: later, fetcher: fetchWithCoverage(() => new Response('', { status: 503 }), schedule), onAnalysisError: (message) => warnings.push(message) });
  assert.equal(value.schedule.at(-1).status, 'final');
  assert.equal(value.schedule.at(-1).jetsScore, 7);
  assert.equal(value.latestAnalyzedGameId, NEW_ID);
  assert.equal(value.checkedAt, later.toISOString());
  assert.equal(value.analysisUpdatedAt, now.toISOString());
  assert.deepEqual(value.analysisCheck, { attemptedAt: later.toISOString(), checkedAt: now.toISOString(), status: 'retained', reason: 'source-unavailable' });
  assert.match(warnings[0], /HTTP 503/);
  assert.equal(await readFile(path.join(out, 'games.json'), 'utf8'), before);
  assert.equal(await readFile(path.join(out, 'curves', `${NEW_ID}.json`), 'utf8'), beforeCurve);
  const coverage = JSON.parse(await readFile(path.join(out, 'coverage.json'), 'utf8'));
  for (const feed of [coverage.news, coverage.roster, coverage.stats]) {
    assert.equal(feed.status, 'ready');
    assert.equal(feed.checkedAt, later.toISOString());
  }
  assert.equal(coverage.news.items[0].title, 'Fresh team report');
  assert.equal(coverage.roster.players[0].id, '00-0099999');
  assert.equal(coverage.stats.players[0].rushing.yards, 3);
  assert.deepEqual(coverage.stats.pendingGameIds, ['2026_02_NYJ_MIA']);
});

for (const [name, pbp] of [
  ['network rejection', async () => { throw new TypeError('fetch failed'); }],
  ['rate limiting', async () => new Response('', { status: 429 })],
  ['interrupted download', async () => ({ status: 200, ok: true, arrayBuffer: async () => { throw new Error('connection reset'); } })],
]) {
  test(`current PBP ${name} publishes independent feeds without claiming available analysis`, async (t) => {
    const out = await sandbox(t);
    const before = await readFile(path.join(out, 'games.json'), 'utf8');
    const value = await refreshData({ out, now, fetcher: fetchWithCoverage(pbp), onAnalysisError: () => {} });
    assert.equal(value.checkedAt, now.toISOString());
    assert.equal(value.analysisUpdatedAt, '2026-01-05T12:00:00Z');
    assert.equal(value.latestAnalyzedGameId, null);
    assert.deepEqual(value.analysisCheck, { attemptedAt: now.toISOString(), checkedAt: null, status: 'unavailable', reason: 'source-unavailable' });
    assert.equal(await readFile(path.join(out, 'games.json'), 'utf8'), before);
    const coverage = JSON.parse(await readFile(path.join(out, 'coverage.json'), 'utf8'));
    assert.equal(coverage.news.checkedAt, now.toISOString());
    assert.equal(coverage.stats.status, 'ready');
  });
}

for (const error of [new PbpAvailabilityError('PBP extractor temporarily unavailable'), new Error('Out of Memory Error: failed to allocate')]) {
  test(`current extraction availability is isolated: ${error.message}`, async (t) => {
    const out = await sandbox(t);
    const value = await refreshData({ out, now, fetcher: fetchWithCoverage(), extract: async () => { throw error; }, onAnalysisError: () => {} });
    assert.equal(value.analysisCheck.reason, 'source-unavailable');
    assert.equal(value.analysisCheck.checkedAt, null);
    assert.equal(JSON.parse(await readFile(path.join(out, 'coverage.json'), 'utf8')).news.status, 'ready');
  });
}

test('malformed returned analysis and ordinary extraction errors remain fatal and atomic', async (t) => {
  const out = await sandbox(t);
  const before = await readFile(path.join(out, 'current.json'), 'utf8');
  for (const extract of [
    async () => undefined,
    async () => { throw new Error('PBP schema mismatch'); },
    async () => analysis(game(NEW_ID), [{ ...curve[0], wp: 2 }, curve[1]]),
    async () => ({ ...analysis(), analytics: { season: 2026, schemaVersion: 99 } }),
  ]) {
    await assert.rejects(refreshData({ out, now, fetcher: fetchWithCoverage(), extract }), /Invalid|schema mismatch/);
    assert.equal(await readFile(path.join(out, 'current.json'), 'utf8'), before);
    await assert.rejects(readFile(path.join(out, 'coverage.json')), { code: 'ENOENT' });
  }
});

test('successfully downloaded corrupt Parquet is fatal rather than an availability fallback', async (t) => {
  const out = await sandbox(t);
  const before = await readFile(path.join(out, 'current.json'), 'utf8');
  await assert.rejects(refreshData({ out, now, fetcher: fetchWithCoverage(() => new Response('not a Parquet file')) }), /Parquet|parquet|magic bytes/);
  assert.equal(await readFile(path.join(out, 'current.json'), 'utf8'), before);
});

test('full rebuild historical outages fail before replacing any prior snapshot', async (t) => {
  const out = await sandbox(t);
  const before = await readFile(path.join(out, 'current.json'), 'utf8');
  await assert.rejects(refreshData({ out, now, full: true, fetcher: fetchWithCoverage(() => new Response('', { status: 503 })) }), /HTTP 503/);
  await assert.rejects(refreshData({ out, now, full: true, fetcher: fetchWithCoverage(), extract: async () => { throw new PbpAvailabilityError('historical extractor unavailable'); } }), /historical extractor unavailable/);
  assert.equal(await readFile(path.join(out, 'current.json'), 'utf8'), before);
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'games.json'), 'utf8')).map((g) => g.id), [OLD_ID]);
});

test('a failed directory promotion rolls back the old complete snapshot', async (t) => {
  const out = await sandbox(t);
  const before = await readFile(path.join(out, 'games.json'), 'utf8');
  await assert.rejects(publishSnapshot(out, { games: [game(), game(NEW_ID)], curves: analysis().curves, current: {} }, { beforePromote: () => { throw new Error('promotion failure'); } }), /promotion failure/);
  assert.equal(await readFile(path.join(out, 'games.json'), 'utf8'), before);
  await assert.rejects(readFile(path.join(out, 'curves', `${NEW_ID}.json`)), { code: 'ENOENT' });
});

test('validation failure cannot publish a game without its curve', async (t) => {
  const out = await sandbox(t);
  const before = await readFile(path.join(out, 'games.json'), 'utf8');
  await assert.rejects(publishSnapshot(out, { games: [game(), game(NEW_ID)], curves: new Map(), current: {} }), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(out, 'games.json'), 'utf8'), before);
});

test('crash recovery restores backup if promotion had not completed', async (t) => {
  const out = await sandbox(t);
  await rename(out, path.join(path.dirname(out), '.data-refresh-backup'));
  await mkdir(path.join(path.dirname(out), '.data-refresh-stage'));
  await recoverPublication(out);
  assert.equal(JSON.parse(await readFile(path.join(out, 'games.json'), 'utf8'))[0].id, OLD_ID);
  await assert.rejects(readFile(path.join(path.dirname(out), '.data-refresh-backup', 'games.json')), { code: 'ENOENT' });
});

test('crash recovery retains a completed promotion and removes its old backup', async (t) => {
  const out = await sandbox(t);
  const backup = path.join(path.dirname(out), '.data-refresh-backup');
  await mkdir(backup);
  await writeFile(path.join(backup, 'games.json'), JSON.stringify([]));
  await recoverPublication(out);
  assert.equal(JSON.parse(await readFile(path.join(out, 'games.json'), 'utf8'))[0].id, OLD_ID);
  await assert.rejects(readFile(path.join(backup, 'games.json')), { code: 'ENOENT' });
});

test('refresh lock rejects a second simultaneous publisher', async (t) => {
  const out = await sandbox(t);
  await withDataLock(out, async () => {
    await assert.rejects(withDataLock(out, async () => {}), /Another data refresh/);
  });
  await withDataLock(out, async () => {});
});

test('real DuckDB extraction keeps meaningful key-play identity consistent with its curve', async (t) => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const instance = await DuckDBInstance.create(':memory:');
  const db = await instance.connect();
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-parquet-test-'));
  t.after(() => { db.closeSync(); instance.closeSync(); return rm(root, { recursive: true, force: true }); });
  const file = path.join(root, 'fixture.parquet').replaceAll("'", "''");
  await db.run(`CREATE TABLE pbp AS SELECT '${NEW_ID}' AS game_id, id AS play_id, 1 AS week, 'REG' AS season_type,
    '2026-09-13' AS game_date, 4 AS qtr, CASE WHEN id=2 THEN 'No Play' ELSE 'Pass complete' END AS "desc",
    CASE WHEN id=2 THEN 'no_play' ELSE 'pass' END AS play_type, 60 AS half_seconds_remaining, 60 AS game_seconds_remaining,
    'NYJ' AS posteam, 'NYJ' AS home_team, 'BUF' AS away_team, 'outdoors' AS roof, 70 AS temp, 5 AS wind, 'MetLife' AS stadium,
    0.2+id*0.2 AS home_wp, 0.8-id*0.2 AS away_wp, CASE WHEN id=2 THEN 0.7 ELSE 0.1 END AS wpa,
    20 AS home_score, 10 AS away_score, 20 AS total_home_score, 10 AS total_away_score, 0 AS game_end FROM range(1,4) t(id)`);
  await db.run(`INSERT INTO pbp SELECT '${NEW_ID}', 4, 1, 'REG', '2026-09-13', 4, 'END GAME', NULL,
    0, 0, NULL, 'NYJ', 'BUF', 'outdoors', 70, 5, 'MetLife', NULL, NULL, NULL, 20, 10, 20, 10, 1`);
  await db.run(`COPY pbp TO '${file}' (FORMAT PARQUET)`);
  const result = await extractSeason(db, 2026, file);
  const key = result.games[0].keyPlay;
  assert.equal(key.playId, 1);
  assert.equal(result.curves.get(NEW_ID).find((p) => p.playId === key.playId).meaningful, true);
  assert.equal(result.curves.get(NEW_ID).find((p) => p.playId === 2).meaningful, false);
  assert.equal(result.completeGameIds.has(NEW_ID), true);
  await db.run('DELETE FROM pbp WHERE game_end=1');
  await db.run(`COPY pbp TO '${file}' (FORMAT PARQUET)`);
  const truncated = await extractSeason(db, 2026, file);
  assert.equal(truncated.games[0].dataSuspect, false); // Final score alone would have passed the old guard.
  assert.equal(truncated.completeGameIds.has(NEW_ID), false);
  assert.equal(mergeAnalysis([], [truncated], parseSchedule(csv(CURRENT))).games.length, 0);
});
