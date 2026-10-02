import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { refreshNextGen, refreshSeasonRankings } from './refresh-season-rankings.mjs';
import { buildSeasonRankings, seasonPlayerSource, seasonTeamSource } from './season-rankings.mjs';
import { buildNextGenCollection, NEXTGEN_SOURCES } from './nextgen-stats.mjs';
import { parseLeagueSchedule, SCHEDULE_SOURCE } from './data-refresh.mjs';

const now = new Date('2026-10-02T20:00:00Z');
const oldCheckedAt = '2026-09-29T12:00:00.000Z';
const scheduleHeader = 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score';
const scheduleCsv = (years = [2026]) => [scheduleHeader, ...years.map((year) => `${year}_01_BUF_NYJ,${year},REG,1,${year}-09-13,13:00,BUF,10,NYJ,20`)].join('\n');
const statFields = ['attempts', 'passing_yards', 'passing_tds', 'sack_yards_lost', 'carries', 'rushing_yards', 'rushing_tds', 'receptions', 'receiving_yards', 'receiving_tds', 'targets', 'def_sacks', 'def_interceptions', 'fg_made', 'fg_att'];
const quote = (value) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
const csv = (rows, template = rows[0]) => {
  const headers = Object.keys(template);
  return [headers.join(','), ...rows.map((row) => headers.map((key) => quote(row[key] ?? '')).join(','))].join('\n');
};
function stats(year, kind) {
  const rows = ['BUF', 'NYJ'].map((team, index) => ({ season: String(year), week: '1', season_type: 'REG', game_id: `${year}_01_BUF_NYJ`, team,
    opponent_team: team === 'NYJ' ? 'BUF' : 'NYJ', ...Object.fromEntries(statFields.map((field) => [field, '0'])),
    attempts: '1', passing_yards: '10', sack_yards_lost: '-1', carries: '1', rushing_yards: '5', receptions: '1', receiving_yards: '10', targets: '1',
    ...(kind === 'player' ? { player_id: `00-000000${index + 1}`, player_name: `P${index}`, player_display_name: `Fixture, Player ${index}`, position: 'QB' } : {}) }));
  return csv(rows);
}
const rankingRecord = (year, checkedAt = oldCheckedAt) => buildSeasonRankings({ year, checkedAt, schedule: parseLeagueSchedule(scheduleCsv([year])), teamCsv: stats(year, 'team'), playerCsv: stats(year, 'player') });

async function sandbox(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-rank-runner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outDir = path.join(root, 'data');
  await mkdir(outDir);
  return { root, outDir };
}
function rankingsFetcher({ years = [2026], fail = () => false, corrupt = false } = {}) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url === SCHEDULE_SOURCE) return new Response(scheduleCsv(years));
    if (fail(url)) return new Response('Unavailable', { status: 503 });
    const match = /stats_(team|player)_week_(\d{4})\.csv\.gz$/.exec(url);
    if (!match) throw new Error(`Unexpected test source: ${url}`);
    return new Response(corrupt ? Buffer.from('not gzip') : gzipSync(stats(Number(match[2]), match[1])));
  };
  return { fetcher, calls };
}

const common = { season: '2024', season_type: 'REG', week: '0', player_gsis_id: '00-0000010', player_display_name: 'Fixture Player', player_position: 'WR', team_abbr: 'NYJ' };
const nextgenRows = {
  passing: { ...common, player_position: 'QB', attempts: '100', avg_time_to_throw: '2.5' },
  receiving: { ...common, targets: '80', avg_separation: '2.4' },
  rushing: { ...common, player_position: 'RB', rush_attempts: '120', rush_yards_over_expected_per_att: '-0.1' },
};
const ngsInputs = () => Object.fromEntries(Object.entries(nextgenRows).map(([kind, row]) => [`${kind}Csv`, csv([row])]));
const nextgenRecord = () => buildNextGenCollection({ ...ngsInputs(), checkedAt: oldCheckedAt });
function nextgenFetcher({ empty = false, fail = false, corrupt = false, missingKind = null } = {}) {
  return async (url) => {
    const kind = Object.entries(NEXTGEN_SOURCES).find(([, source]) => source === url)?.[0];
    if (!kind) return new Response('optional metadata unavailable', { status: 404 });
    if (fail) return new Response('Unavailable', { status: 503 });
    const data = empty || kind === missingKind ? csv([], nextgenRows[kind]) : csv([nextgenRows[kind]]);
    return new Response(corrupt ? Buffer.from('not gzip') : gzipSync(data));
  };
}

test('rankings refresh decodes actual gzip CSV and atomically publishes a complete snapshot', async (t) => {
  const { outDir } = await sandbox(t);
  const { fetcher, calls } = rankingsFetcher();
  const result = await refreshSeasonRankings({ outDir, now, fetcher });
  assert.deepEqual(calls.filter((url) => url !== SCHEDULE_SOURCE).sort(), [`${seasonPlayerSource(2026)}.gz`, `${seasonTeamSource(2026)}.gz`].sort());
  assert.equal(result.seasons[0].phases.regular.teamGames, 1);
  assert.equal(result.seasons[0].phases.regular.playerGames, 1);
  assert.equal(result.seasons[0].phases.regular.individual.find((metric) => metric.id === 'passing-yards').players[0].name, 'Fixture, Player 1');
  assert.deepEqual(JSON.parse(await readFile(path.join(outDir, 'season-rankings.json'), 'utf8')), result);
  assert.deepEqual(await readdir(outDir), ['season-rankings.json']);
});

test('cached uncompressed statistics are reused while schedule authority is still fetched', async (t) => {
  const { root, outDir } = await sandbox(t);
  const cacheDir = path.join(root, 'cache');
  await mkdir(cacheDir);
  for (const [kind, source] of [['team', seasonTeamSource(2026)], ['player', seasonPlayerSource(2026)]]) await writeFile(path.join(cacheDir, new URL(source).pathname.split('/').at(-1)), stats(2026, kind));
  const calls = [];
  const fetcher = async (url) => { calls.push(url); if (url !== SCHEDULE_SOURCE) throw new Error('Statistics cache was bypassed'); return new Response(scheduleCsv()); };
  const result = await refreshSeasonRankings({ outDir, cacheDir, now, fetcher });
  assert.deepEqual(calls, [SCHEDULE_SOURCE]);
  assert.equal(result.seasons[0].phases.regular.team.length, 8);
});

test('an existing season keeps its original checkedAt and data during an upstream outage', async (t) => {
  const { outDir } = await sandbox(t);
  const previous = { schemaVersion: 1, checkedAt: oldCheckedAt, seasons: [rankingRecord(2026)] };
  await writeFile(path.join(outDir, 'season-rankings.json'), JSON.stringify(previous));
  const errors = [];
  const { fetcher } = rankingsFetcher({ fail: () => true });
  const result = await refreshSeasonRankings({ outDir, now, fetcher, onError: (message) => errors.push(message) });
  assert.equal(result.checkedAt, now.toISOString());
  assert.deepEqual(result.seasons[0], previous.seasons[0]);
  assert.equal(result.seasons[0].checkedAt, oldCheckedAt);
  assert.match(errors[0], /retaining rankings checked 2026-09-29/);
});

test('a missing new season aborts publication after earlier successful work and preserves prior bytes', async (t) => {
  const { outDir } = await sandbox(t);
  const previousBytes = JSON.stringify({ schemaVersion: 1, checkedAt: oldCheckedAt, seasons: [rankingRecord(2010)] });
  const file = path.join(outDir, 'season-rankings.json');
  await writeFile(file, previousBytes);
  const { fetcher } = rankingsFetcher({ years: [2010, 2026], fail: (url) => url.includes('_2026.csv.gz') });
  await assert.rejects(refreshSeasonRankings({ outDir, now, full: true, fetcher }), /2026 rankings unavailable/);
  assert.equal(await readFile(file, 'utf8'), previousBytes);
});

test('first-run invalid compressed statistics do not leave a partial public snapshot', async (t) => {
  const { outDir } = await sandbox(t);
  const { fetcher } = rankingsFetcher({ corrupt: true });
  await assert.rejects(refreshSeasonRankings({ outDir, now, fetcher }), /2026 rankings unavailable/);
  await assert.rejects(readFile(path.join(outDir, 'season-rankings.json')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(outDir), []);
});

test('NextGen refresh decodes three compressed feeds and publishes measured values', async (t) => {
  const { outDir } = await sandbox(t);
  const result = await refreshNextGen({ outDir, now, fetcher: nextgenFetcher() });
  assert.equal(result.checkedAt, now.toISOString());
  assert.equal(result.seasons[0].receiving[0].metrics[0].value, 2.4);
  assert.equal(result.seasons[0].rushing[0].metrics[0].value, -0.1);
  assert.deepEqual(JSON.parse(await readFile(path.join(outDir, 'nextgen-stats.json'), 'utf8')), result);
});

test('NextGen outage, corrupt or empty feeds retain prior measurements without false freshness', async (t) => {
  const { outDir } = await sandbox(t);
  const previous = nextgenRecord();
  const file = path.join(outDir, 'nextgen-stats.json');
  const previousBytes = JSON.stringify(previous);
  await writeFile(file, previousBytes);
  for (const options of [{ fail: true }, { corrupt: true }, { empty: true }, { missingKind: 'receiving' }]) {
    const errors = [];
    const result = await refreshNextGen({ outDir, now, fetcher: nextgenFetcher(options), onError: (message) => errors.push(message) });
    assert.deepEqual(result, previous);
    assert.equal(result.checkedAt, oldCheckedAt);
    assert.equal(await readFile(file, 'utf8'), previousBytes);
    assert.match(errors[0], /Retaining Next Gen measurements checked/);
  }
});

test('first-run empty NextGen season collection fails without publishing an empty artifact', async (t) => {
  const { outDir } = await sandbox(t);
  await assert.rejects(refreshNextGen({ outDir, now, fetcher: nextgenFetcher({ empty: true }) }), /Empty Next Gen season collection/);
  await assert.rejects(readFile(path.join(outDir, 'nextgen-stats.json')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(outDir), []);
});
