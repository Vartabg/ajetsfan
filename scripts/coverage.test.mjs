import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NEWS_SOURCE, rosterSource, playerStatsSource, parseNews, parseRoster, parsePlayerStats, safeCoverageUrl, refreshCoverage, validateCoverage } from './coverage.mjs';
import { publishSnapshot, readSnapshot } from './data-refresh.mjs';
import { refreshData } from './build-data.mjs';

const now = new Date('2026-09-29T21:00:00Z');
const oldCheck = '2026-09-28T21:00:00.000Z';
const photo = 'https://static.www.nfl.com/image/upload/f_auto,q_auto/league/athlete';
const id = '00-0030565';
const gameId = '2026_01_NYJ_TEN';
const secondId = '2026_02_GB_NYJ';
const final = { id: gameId, season: 2026, seasonType: 'REG', week: 1, date: '2026-09-13', opponent: 'TEN', status: 'final' };
const second = { ...final, id: secondId, week: 2, date: '2026-09-20', opponent: 'GB' };
const scheduled = { ...final, id: '2026_04_NYJ_CHI', week: 4, opponent: 'CHI', date: '2026-10-04', status: 'scheduled' };
const playoff = { ...final, id: '2026_19_NYJ_BUF', week: 19, seasonType: 'POST', date: '2027-01-10', opponent: 'BUF' };
const xmlItem = (suffix = 'roster-moves', date = 'Tue, 29 Sep 2026 20:00:00 GMT') => `<item><title><![CDATA[Jets & roster moves]]></title><link>https://www.newyorkjets.com/news/${suffix}</link><guid>jets-${suffix}</guid><pubDate>${date}</pubDate></item>`;
const rss = (...items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>New York Jets</title>${items.join('')}</channel></rss>`;
const csv = (rows) => {
  const keys = Object.keys(rows[0]);
  const field = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return [keys.join(','), ...rows.map((row) => keys.map((key) => field(row[key])).join(','))].join('\n');
};
const rosterRow = (changes = {}) => ({
  season: '2026', team: 'NYJ', game_type: 'REG', week: '4', gsis_id: id, espn_id: '15864', full_name: 'Geno Smith',
  position: 'QB', jersey_number: '7', status: 'ACT', headshot_url: photo, height: '75', weight: '221', college: 'West Virginia', years_exp: '13', ...changes,
});
const statsRow = (changes = {}) => ({
  player_id: id, player_display_name: 'Geno Smith', position: 'QB', headshot_url: photo, season: '2026', week: '1', season_type: 'REG', game_id: gameId, team: 'NYJ', opponent_team: 'TEN',
  completions: '19', attempts: '24', passing_yards: '215', passing_tds: '0', passing_interceptions: '0', carries: '6', rushing_yards: '7', rushing_tds: '1', targets: '0', receptions: '0', receiving_yards: '0', receiving_tds: '0', ...changes,
});
const receiverFor = (passer, changes = {}) => ({ ...passer,
  player_id: '00-0099999', player_display_name: 'Wilson, Garrett', position: 'WR',
  completions: '0', attempts: '0', passing_yards: '0', passing_tds: '0', passing_interceptions: '0',
  carries: '0', rushing_yards: '0', rushing_tds: '0', targets: passer.completions, receptions: passer.completions,
  receiving_yards: passer.passing_yards, receiving_tds: passer.passing_tds, ...changes,
});
const completeRows = (passers) => passers.flatMap((row) => [row, receiverFor(row)]);
const sources = new Map([
  [NEWS_SOURCE, rss(xmlItem())], [rosterSource(2026), csv([rosterRow()])],
  [playerStatsSource(2026), csv(completeRows([statsRow(), statsRow({ week: '2', game_id: secondId, opponent_team: 'GB', passing_yards: '300', passing_tds: '2', rushing_yards: '-2' })]))],
]);
const feedFetcher = (overrides = new Map()) => async (url) => {
  const body = overrides.has(url) ? overrides.get(url) : sources.get(url);
  if (body instanceof Error) throw body;
  if (body instanceof Response) return body;
  return new Response(body, { headers: { 'Last-Modified': 'Tue, 29 Sep 2026 18:00:00 GMT' } });
};
const getCoverage = (options = {}) => refreshCoverage({ season: 2026, schedule: [final, second, scheduled, playoff], now, fetcher: feedFetcher(), onError: () => {}, ...options });

test('proper RSS parsing preserves XML entities/CDATA and source publication times', () => {
  const parsed = parseNews(rss(xmlItem(), xmlItem('film', 'Mon, 28 Sep 2026 16:00:00 GMT')), now);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].title, 'Jets & roster moves');
  assert.equal(parsed.items[0].publishedAt, '2026-09-29T20:00:00.000Z');
  assert.equal(parseNews(rss(xmlItem().replace('<![CDATA[Jets & roster moves]]>', 'Jets &amp; roster moves')), now).items[0].title, 'Jets & roster moves');
});

test('news rejects malformed XML, duplicates, missing fields, unsafe links and future publication', () => {
  assert.throws(() => parseNews('<rss><channel>', now), /XML/);
  assert.throws(() => parseNews(rss(xmlItem(), xmlItem()), now), /Duplicate/);
  assert.throws(() => parseNews(rss(xmlItem().replace(/<pubDate>.*?<\/pubDate>/, '')), now), /publication/);
  assert.throws(() => parseNews(rss(xmlItem().replace('https://www.newyorkjets.com/news/', 'javascript:')), now), /Unsafe/);
  assert.throws(() => parseNews(rss(xmlItem('later', 'Wed, 30 Sep 2026 20:00:00 GMT')), now), /future/);
  assert.throws(() => parseNews('<!DOCTYPE rss [<!ENTITY x "bad">]>' + rss(xmlItem()), now), /XML/);
});

test('a scheduled RSS entry cannot block already published reporting or acquire a current date', () => {
  const parsed = parseNews(rss(xmlItem('published'), xmlItem('scheduled', 'Wed, 30 Sep 2026 20:00:00 GMT')), now);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].id, 'jets-published');
  assert.equal(parsed.items[0].publishedAt, '2026-09-29T20:00:00.000Z');
  assert.equal(parsed.withheldFutureItems, 1);
});

test('URL allowlists reject userinfo, lookalike hosts, scripts, traversal destinations and unverified image hosts', () => {
  assert.equal(safeCoverageUrl(photo, 'headshot'), photo);
  assert.equal(safeCoverageUrl('https://www.espn.com/nfl/player/_/id/15864', 'profile'), 'https://www.espn.com/nfl/player/_/id/15864');
  for (const url of ['http://www.newyorkjets.com/news/test', 'https://www.newyorkjets.com.evil.test/news/test', 'https://user@www.newyorkjets.com/news/test', 'https://www.newyorkjets.com/news/../other', 'https://www.newyorkjets.com:444/news/test', 'https://www.newyorkjets.com/news/test#script']) assert.throws(() => safeCoverageUrl(url, 'news'), /Unsafe/);
  assert.throws(() => safeCoverageUrl('https://evil.test/image/upload/headshot', 'headshot'), /Unsafe/);
  assert.throws(() => safeCoverageUrl('https://static.www.nfl.com/other/headshot', 'headshot'), /Unsafe/);
});

test('roster uses only latest NYJ REG week and describes source membership', () => {
  const parsed = parseRoster(csv([
    rosterRow({ week: '3', full_name: 'Old Name' }), rosterRow(),
    rosterRow({ gsis_id: '00-0039991', espn_id: '', status: 'DEV', position: 'WR', jersey_number: 'NA', height: 'NA', years_exp: 'NA', headshot_url: '' }),
    rosterRow({ gsis_id: '00-0039992', status: 'RES', position: 'CB' }),
    rosterRow({ team: 'BUF' }), rosterRow({ season: '2025' }), rosterRow({ game_type: 'PRE' }),
  ]), 2026);
  assert.equal(parsed.week, 4);
  assert.equal(parsed.players.length, 3);
  assert.equal(parsed.players.find((p) => p.id === id).height, '6\'3"');
  assert.equal(parsed.players.find((p) => p.id === id).profileUrl, 'https://www.espn.com/nfl/player/_/id/15864');
  assert.deepEqual(parsed.players.map((p) => p.statusLabel).sort(), ['Active roster', 'Practice squad', 'Reserve']);
  assert.equal(parsed.players.find((p) => p.status === 'DEV').headshot, null);
});

test('roster rejects wrong season/team, duplicate latest GSIS identities and bad/missing core rows', () => {
  assert.throws(() => parseRoster(csv([rosterRow({ season: '2025' })]), 2026), /no NYJ/);
  assert.throws(() => parseRoster(csv([rosterRow({ team: 'BUF' })]), 2026), /no NYJ/);
  assert.throws(() => parseRoster(csv([rosterRow(), rosterRow()]), 2026), /Duplicate/);
  for (const changes of [{ gsis_id: 'bad-gsis' }, { full_name: 'NA' }, { weight: 'heavy' }, { espn_id: '1<script>' }]) assert.throws(() => parseRoster(csv([rosterRow(changes)]), 2026), /Invalid|Unsafe/);
  assert.throws(() => parseRoster(csv([rosterRow()]).replace('gsis_id,', 'other,'), 2026), /Missing coverage column/);
});

test('roster supports a validated ESPN fallback and explicitly counts source rows lacking stable identifiers', () => {
  const parsed = parseRoster(csv([
    rosterRow(), rosterRow({ gsis_id: '', espn_id: '12345', full_name: 'New Player' }),
    rosterRow({ gsis_id: '', espn_id: '', full_name: 'Al-Jay Henderson', position: 'RB', status: 'DEV' }),
  ]), 2026);
  assert.equal(parsed.players.length, 2); assert.equal(parsed.excludedPlayers, 1);
  const newcomer = parsed.players.find((player) => player.name === 'New Player');
  assert.equal(newcomer.id, 'espn-12345'); assert.equal(newcomer.profileUrl, 'https://www.espn.com/nfl/player/_/id/12345');
  assert.throws(() => parseRoster(csv([rosterRow({ gsis_id: '', espn_id: '' })]), 2026), /no players with stable/);
  assert.throws(() => parseRoster(csv([rosterRow({ gsis_id: '', espn_id: '12345' }), rosterRow({ gsis_id: '', espn_id: '12345' })]), 2026), /Duplicate/);
  assert.throws(() => parseRoster(csv([rosterRow({ gsis_id: '', espn_id: '123bad' })]), 2026), /Invalid ESPN/);
});

test('official player totals include only exact confirmed NYJ REG games, preserve signed yards and expose pending finals', () => {
  const parsed = parsePlayerStats(csv(completeRows([
    statsRow(), statsRow({ week: '2', game_id: secondId, opponent_team: 'GB', passing_yards: '300', rushing_yards: '-2' }),
    statsRow({ week: '4', game_id: scheduled.id, opponent_team: 'CHI', passing_yards: '9000' }),
    statsRow({ week: '19', game_id: playoff.id, opponent_team: 'BUF', season_type: 'POST' }),
    statsRow({ team: 'BUF' }), statsRow({ season: '2025' }),
  ])), 2026, [final, second, scheduled, playoff, { ...final, id: '2026_03_NYJ_DET', week: 3, date: '2026-09-27', opponent: 'DET' }]);
  assert.deepEqual(parsed.analyzedGameIds, [gameId, secondId]);
  assert.deepEqual(parsed.pendingGameIds, ['2026_03_NYJ_DET']);
  assert.equal(parsed.throughWeek, 2); assert.equal(parsed.throughDate, '2026-09-20');
  assert.equal(parsed.players[0].games, 2);
  assert.equal(parsed.players[0].passing.yards, 515);
  assert.equal(parsed.players[0].rushing.yards, 5);
});

test('player stats reject duplicate player-game rows, wrong source season, mismatched opponents/weeks and malformed totals', () => {
  assert.throws(() => parsePlayerStats(csv([statsRow(), statsRow()]), 2026, [final]), /Duplicate/);
  assert.throws(() => parsePlayerStats(csv([statsRow({ season: '2025' })]), 2026, [final]), /no NYJ/);
  for (const changes of [{ week: '2' }, { opponent_team: 'BUF' }]) assert.throws(() => parsePlayerStats(csv([statsRow(changes)]), 2026, [final]), /identity mismatch/);
  for (const changes of [{ player_id: 'NA' }, { player_id: 'espn-12345' }, { attempts: '' }, { passing_tds: '-1' }, { rushing_yards: '1.5' }, { completions: '25' }]) assert.throws(() => parsePlayerStats(csv([statsRow(changes)]), 2026, [final]), /Invalid|Inconsistent|Unsafe/);
  assert.throws(() => parsePlayerStats(csv([statsRow()]).replace('passing_interceptions,', 'interceptions,'), 2026, [final]), /Missing coverage column/);
});

test('per-game passing and receiving totals reconcile completions, yards and touchdowns before promotion', () => {
  assert.throws(() => parsePlayerStats(csv([statsRow()]), 2026, [final]), /Incomplete player passing\/receiving/);
  for (const changes of [{ receptions: '18' }, { receiving_yards: '214' }, { receiving_tds: '1' }]) {
    assert.throws(() => parsePlayerStats(csv([statsRow(), receiverFor(statsRow(), changes)]), 2026, [final]), /Incomplete player passing\/receiving/);
  }
  assert.equal(parsePlayerStats(csv([statsRow(), receiverFor(statsRow())]), 2026, [final]).players.length, 2);
});

test('an incomplete first or newly completed game is unavailable/retained with honest pending coverage', async () => {
  const initial = await getCoverage({ schedule: [final], fetcher: feedFetcher(new Map([[playerStatsSource(2026), csv([statsRow()])]])) });
  assert.equal(initial.stats.status, 'unavailable'); assert.equal(initial.stats.checkedAt, null); assert.deepEqual(initial.stats.pendingGameIds, [gameId]);
  const previous = await getCoverage();
  const third = { ...final, id: '2026_03_NYJ_DET', week: 3, opponent: 'DET', date: '2026-09-27' };
  const replacement = [...completeRows([statsRow(), statsRow({ week: '2', game_id: secondId, opponent_team: 'GB' })]), statsRow({ week: '3', game_id: third.id, opponent_team: 'DET' })];
  const result = await getCoverage({ previous, schedule: [final, second, third], fetcher: feedFetcher(new Map([[playerStatsSource(2026), csv(replacement)]])) });
  assert.equal(result.stats.status, 'retained'); assert.equal(result.stats.checkedAt, previous.stats.checkedAt);
  assert.deepEqual(result.stats.players, previous.stats.players); assert.deepEqual(result.stats.pendingGameIds, [third.id]);
});

test('verified NFL private-path photos are accepted; unsupported optional images become null without losing core data', () => {
  const privatePhoto = 'https://static.www.nfl.com/image/private/f_auto,q_auto/league/nw8aiicw9bjhxaqwbeo9';
  assert.equal(safeCoverageUrl(privatePhoto, 'headshot'), privatePhoto);
  assert.equal(parseRoster(csv([rosterRow({ headshot_url: privatePhoto })]), 2026).players[0].headshot, privatePhoto);
  for (const value of ['javascript:alert(1)', 'https://evil.test/headshot.jpg', 'https://static.www.nfl.com/other/image.jpg', '']) {
    const roster = parseRoster(csv([rosterRow({ headshot_url: value })]), 2026);
    const stats = parsePlayerStats(csv(completeRows([statsRow({ headshot_url: value })])), 2026, [final]);
    assert.equal(roster.players[0].headshot, null); assert.equal(stats.players[0].headshot, null);
    assert.equal(roster.players[0].name, 'Geno Smith'); assert.equal(stats.players[0].passing.yards, 215);
  }
});

test('all feeds have independent successful-check timestamps and validated upstream Last-Modified', async () => {
  const coverage = await getCoverage();
  assert.equal(validateCoverage(coverage), coverage);
  for (const feed of [coverage.news, coverage.roster, coverage.stats]) {
    assert.equal(feed.status, 'ready'); assert.equal(feed.checkedAt, now.toISOString()); assert.equal(feed.attemptedAt, now.toISOString());
    assert.equal(feed.sourceUpdatedAt, '2026-09-29T18:00:00.000Z');
  }
});

test('one failed section keeps its last good data/check while other sections advance', async () => {
  const previous = await getCoverage({ now: new Date(oldCheck), fetcher: feedFetcher(new Map([[NEWS_SOURCE, new Response(rss(xmlItem('older', 'Mon, 28 Sep 2026 20:00:00 GMT')))], [rosterSource(2026), new Response(csv([rosterRow()]))], [playerStatsSource(2026), new Response(sources.get(playerStatsSource(2026)))]])) });
  const coverage = await getCoverage({ previous, fetcher: feedFetcher(new Map([[NEWS_SOURCE, new Response('', { status: 503 })]])) });
  assert.equal(coverage.news.status, 'retained'); assert.equal(coverage.news.checkedAt, oldCheck); assert.equal(coverage.news.attemptedAt, now.toISOString());
  assert.deepEqual(coverage.news.items, previous.news.items);
  assert.equal(coverage.roster.status, 'ready'); assert.equal(coverage.stats.status, 'ready');
  assert.equal(coverage.stats.checkedAt, now.toISOString());
});

test('missing sources are visibly unavailable and never fabricate successful checkedAt', async () => {
  const coverage = await getCoverage({ fetcher: async () => new Response('', { status: 404 }) });
  for (const feed of [coverage.news, coverage.roster, coverage.stats]) { assert.equal(feed.status, 'unavailable'); assert.equal(feed.checkedAt, null); assert.equal(feed.sourceUpdatedAt, null); }
  assert.deepEqual(coverage.stats.pendingGameIds, [gameId, secondId]);
  assert.deepEqual(coverage.news.items, []); assert.deepEqual(coverage.roster.players, []); assert.deepEqual(coverage.stats.players, []);
});

test('season rollover retains the actual prior source season while current season coverage is unavailable', async () => {
  const previous = await getCoverage();
  const coverage = await getCoverage({ season: 2027, now: new Date('2027-05-20T12:00:00Z'), previous, fetcher: async () => new Response('', { status: 404 }) });
  assert.equal(coverage.season, 2027); assert.equal(coverage.roster.season, 2026); assert.equal(coverage.stats.season, 2026);
  assert.equal(coverage.stats.source, playerStatsSource(2026)); assert.equal(coverage.stats.status, 'retained');
  assert.equal(coverage.stats.checkedAt, now.toISOString());
});

test('regressed roster and incomplete replacement stats retain previous game coverage', async () => {
  const previous = await getCoverage();
  const coverage = await getCoverage({ previous, now: new Date('2026-09-30T21:00:00Z'), fetcher: feedFetcher(new Map([[rosterSource(2026), csv([rosterRow({ week: '3' })])], [playerStatsSource(2026), csv([statsRow()])]])) });
  assert.equal(coverage.roster.status, 'retained'); assert.equal(coverage.roster.week, 4);
  assert.equal(coverage.stats.status, 'retained'); assert.deepEqual(coverage.stats.analyzedGameIds, [gameId, secondId]);
});

const receiverRow = (changes = {}) => receiverFor(statsRow(), { player_id: '00-0039991', player_display_name: 'Garrett Wilson', ...changes });

test('a QB-only replacement cannot erase a previously verified receiver from the same completed game', async () => {
  const previous = await getCoverage({ schedule: [final], fetcher: feedFetcher(new Map([[playerStatsSource(2026), csv([statsRow(), receiverRow()])]])) });
  assert.deepEqual(previous.stats.playerGameIds, { [id]: [gameId], '00-0039991': [gameId] });
  const coverage = await getCoverage({ previous, now: new Date('2026-09-30T21:00:00Z'), schedule: [final], fetcher: feedFetcher(new Map([[playerStatsSource(2026), csv([statsRow()])]])) });
  assert.equal(coverage.stats.status, 'retained'); assert.equal(coverage.stats.checkedAt, previous.stats.checkedAt);
  assert.deepEqual(coverage.stats.players, previous.stats.players); assert.deepEqual(coverage.stats.pendingGameIds, []);
  // Old snapshot compatibility still protects against lost players without new metadata.
  const legacy = structuredClone(previous); delete legacy.stats.playerGameIds;
  const legacyResult = await getCoverage({ previous: legacy, schedule: [final], fetcher: feedFetcher(new Map([[playerStatsSource(2026), csv([statsRow()])]])) });
  assert.equal(legacyResult.stats.status, 'retained');
});

test('new game rows cannot hide a missing earlier player-game behind unchanged aggregate game counts', async () => {
  const previous = await getCoverage({ schedule: [final, second], fetcher: feedFetcher(new Map([[playerStatsSource(2026), csv([
    statsRow(), statsRow({ week: '2', game_id: secondId, opponent_team: 'GB' }), receiverRow(), receiverRow({ week: '2', game_id: secondId, opponent_team: 'GB' }),
  ])]])) });
  const third = { ...final, id: '2026_03_NYJ_DET', week: 3, opponent: 'DET', date: '2026-09-27' };
  const coverage = await getCoverage({ previous, schedule: [final, second, third], now: new Date('2026-09-30T21:00:00Z'), fetcher: feedFetcher(new Map([[playerStatsSource(2026), csv([
    statsRow(), statsRow({ week: '2', game_id: secondId, opponent_team: 'GB' }), statsRow({ week: '3', game_id: third.id, opponent_team: 'DET' }),
    receiverFor(statsRow()), receiverRow({ week: '2', game_id: secondId, opponent_team: 'GB' }), receiverRow({ week: '3', game_id: third.id, opponent_team: 'DET' }),
  ])]])) });
  assert.equal(coverage.stats.status, 'retained'); assert.deepEqual(coverage.stats.playerGameIds, previous.stats.playerGameIds);
  assert.deepEqual(coverage.stats.players, previous.stats.players); assert.deepEqual(coverage.stats.pendingGameIds, [third.id]);
  assert.equal(coverage.stats.throughWeek, 2); assert.equal(coverage.stats.checkedAt, previous.stats.checkedAt);
});

test('failed same-season stats checks expose newly confirmed pending finals without changing successful-check or analysis cutoff', async () => {
  const previous = await getCoverage();
  const third = { ...final, id: '2026_03_NYJ_DET', week: 3, opponent: 'DET', date: '2026-09-27' };
  const coverage = await getCoverage({ previous, schedule: [final, second, third, scheduled, playoff], now: new Date('2026-09-30T21:00:00Z'), fetcher: feedFetcher(new Map([[playerStatsSource(2026), new Response('', { status: 503 })]])) });
  assert.equal(coverage.stats.status, 'retained'); assert.deepEqual(coverage.stats.pendingGameIds, [third.id]);
  assert.deepEqual(coverage.stats.analyzedGameIds, previous.stats.analyzedGameIds); assert.deepEqual(coverage.stats.players, previous.stats.players);
  assert.equal(coverage.stats.checkedAt, previous.stats.checkedAt); assert.equal(coverage.stats.sourceUpdatedAt, previous.stats.sourceUpdatedAt);
  assert.equal(coverage.stats.throughWeek, previous.stats.throughWeek); assert.equal(coverage.stats.throughDate, previous.stats.throughDate);
  assert.equal(coverage.stats.attemptedAt, '2026-09-30T21:00:00.000Z');
});

test('invalid future Last-Modified does not overwrite previously trusted coverage', async () => {
  const previous = await getCoverage();
  const coverage = await getCoverage({ previous, fetcher: async (url) => new Response(sources.get(url), { headers: { 'Last-Modified': 'Wed, 30 Sep 2026 18:00:00 GMT' } }) });
  for (const feed of [coverage.news, coverage.roster, coverage.stats]) { assert.equal(feed.status, 'retained'); assert.equal(feed.checkedAt, now.toISOString()); }
});

test('coverage validation blocks unsafe persisted links and inconsistent cutoffs before publication', async () => {
  const coverage = await getCoverage();
  assert.throws(() => validateCoverage({ ...coverage, roster: { ...coverage.roster, players: [{ ...coverage.roster.players[0], profileUrl: 'https://evil.test' }] } }), /profile/);
  assert.throws(() => validateCoverage({ ...coverage, stats: { ...coverage.stats, throughWeek: null } }), /cutoff/);
  assert.throws(() => validateCoverage({ ...coverage, stats: { ...coverage.stats, pendingGameIds: [gameId] } }), /duplicate/);
  assert.throws(() => validateCoverage({ ...coverage, stats: { ...coverage.stats, playerGameIds: { [id]: [gameId] } } }), /player-game/);
  assert.throws(() => validateCoverage({ ...coverage, stats: { ...coverage.stats, playerGameIds: { [id]: [gameId, gameId] } } }), /player-game/);
});

test('coverage and football files promote together and roll back together on publication failure', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-coverage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const out = path.join(directory, 'data'); await mkdir(out);
  const old = await getCoverage();
  await writeFile(path.join(out, 'coverage.json'), JSON.stringify(old)); await writeFile(path.join(out, 'games.json'), '[]'); await writeFile(path.join(out, 'current.json'), '{"checkedAt":"old"}');
  const replacement = await getCoverage({ now: new Date('2026-09-30T21:00:00Z') });
  await assert.rejects(publishSnapshot(out, { games: [], curves: new Map(), current: { checkedAt: 'new' }, coverage: replacement }, { beforePromote: () => { throw new Error('failed promotion'); } }), /failed promotion/);
  assert.equal(await readFile(path.join(out, 'coverage.json'), 'utf8'), JSON.stringify(old));
  assert.equal(await readFile(path.join(out, 'current.json'), 'utf8'), '{"checkedAt":"old"}');
  await publishSnapshot(out, { games: [], curves: new Map(), current: { checkedAt: 'new' }, coverage: replacement });
  assert.equal((await readSnapshot(out)).coverage.news.checkedAt, replacement.news.checkedAt);
});

test('the daily refresh publishes available coverage even when current PBP is pending', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-coverage-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const out = path.join(directory, 'data'); await mkdir(path.join(out, 'curves'), { recursive: true });
  const oldGame = { id: '2025_18_NYJ_BUF', season: 2025, jetsScore: 8, oppScore: 35 };
  await writeFile(path.join(out, 'games.json'), JSON.stringify([oldGame]));
  const oldCurve = '[{"q":4,"t":5,"wp":0.1,"d":0},{"q":4,"t":0,"wp":0,"d":-0.1}]';
  await writeFile(path.join(out, 'curves', `${oldGame.id}.json`), oldCurve);
  const schedule = 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score\n2025_18_NYJ_BUF,2025,REG,18,2026-01-04,13:00,NYJ,8,BUF,35\n2026_01_NYJ_TEN,2026,REG,1,2026-09-13,13:00,NYJ,23,TEN,10';
  const fetcher = async (url) => url.endsWith('/games.csv') ? new Response(schedule) : url.endsWith('.parquet') ? new Response('', { status: 404 }) : feedFetcher()(url);
  await refreshData({ out, now, fetcher });
  const snapshot = await readSnapshot(out);
  assert.equal(snapshot.current.latestAnalyzedGameId, null); assert.equal(snapshot.coverage.news.status, 'ready'); assert.equal(snapshot.coverage.stats.players[0].passing.yards, 215);
  assert.equal(await readFile(path.join(out, 'games.json'), 'utf8'), JSON.stringify([oldGame]));
  assert.equal(await readFile(path.join(out, 'curves', `${oldGame.id}.json`), 'utf8'), oldCurve);
});
