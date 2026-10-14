import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bigPlays, namePattern, refreshPlayers, seasonPlayers, validatePlayers, weekSource } from './player-pages.mjs';

const header = 'player_id,player_name,player_display_name,position,season,week,season_type,game_id,team,opponent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,def_tackles_solo,def_tackle_assists,def_sacks,def_interceptions,def_pass_defended,def_fumbles_forced';
const row = (fields) => Object.values({ player_id: '00-0037740', player_name: 'G.Wilson', player_display_name: 'Garrett Wilson', position: 'WR', season: '2026', week: '1',
  season_type: 'REG', game_id: '2026_01_NYJ_TEN', team: 'NYJ', opponent_team: 'TEN', completions: '0', attempts: '0', passing_yards: '0', passing_tds: '0',
  passing_interceptions: '0', carries: '1', rushing_yards: '-3', rushing_tds: '0', receptions: '6', targets: '9', receiving_yards: '88', receiving_tds: '1',
  def_tackles_solo: '0', def_tackle_assists: '0', def_sacks: '0', def_interceptions: '0', def_pass_defended: '0', def_fumbles_forced: '0', ...fields }).join(',');

test('a season keeps only Jets rows, in week order, as compact lines that leave untouched categories out', () => {
  const csv = [header, row({ week: '2', game_id: '2026_02_GB_NYJ', opponent_team: 'GB', receiving_yards: '40' }), row({}),
    row({ player_id: '00-0012345', team: 'TEN', game_id: '2026_01_NYJ_TEN' }), row({ player_id: '', player_name: '', player_display_name: '' })].join('\n');
  const players = seasonPlayers(csv, 2026);
  assert.deepEqual(Object.keys(players), ['00-0037740']);
  assert.deepEqual(players['00-0037740'].games.map((game) => game.week), [1, 2]);
  assert.deepEqual(players['00-0037740'].games[0], { week: 1, gameId: '2026_01_NYJ_TEN', post: false, opponent: 'TEN', rush: [1, -3, 0], rec: [6, 9, 88, 1] });
});

test('half sacks are kept; impossible or foreign rows fail the season', () => {
  const players = seasonPlayers([header, row({ position: 'DE', receptions: '0', targets: '0', receiving_yards: '0', receiving_tds: '0', carries: '0', rushing_yards: '0', def_tackles_solo: '3', def_tackle_assists: '2', def_sacks: '0.5' })].join('\n'), 2026);
  assert.deepEqual(players['00-0037740'].games[0].def, [5, 0.5, 0, 0, 0]);
  assert.throws(() => seasonPlayers([header, row({ completions: '5', attempts: '3' })].join('\n'), 2026), /Completions exceed attempts/);
  assert.throws(() => seasonPlayers([header, row({ game_id: '2025_01_NYJ_TEN' })].join('\n'), 2026), /Invalid player stats row/);
  assert.throws(() => seasonPlayers([header, row({}), row({})].join('\n'), 2026), /Duplicate player game/);
  assert.throws(() => seasonPlayers('player_id,team\n00-0037740,NYJ', 2026), /Missing player stats column/);
});

test('a name matches with or without a jersey number, never inside a longer name', () => {
  const named = namePattern('G.Wilson');
  assert.ok(named.test('(4:11) 7-G.Smith pass deep right to 5-G.Wilson to DET 1 for 22 yards'));
  assert.ok(named.test('G.Wilson 12 yard pass from C.Pennington'));
  assert.ok(!named.test('pass to 5-G.Wilsonson for 3 yards'));
  assert.ok(!named.test('pass to 5-AG.Wilson for 3 yards'));
  assert.ok(namePattern("A.St. Brown").test('pass to 14-A.St. Brown for 9 yards'));
});

test('big plays rank the Jets-positive plays naming the player, and shared short names get none', () => {
  const players = {
    a: { short: 'G.Wilson', games: [{ gameId: 'g1' }], plays: [] },
    b: { short: 'B.Hall', games: [{ gameId: 'g1' }], plays: [] },
    c: { short: 'B.Hall', games: [{ gameId: 'g1' }], plays: [] },
  };
  const curves = new Map([['g1', [
    { playId: 1, meaningful: true, q: 1, d: 0.05, desc: 'pass to 5-G.Wilson for 9 yards' },
    { playId: 2, meaningful: true, q: 4, d: 0.2, desc: 'pass to 5-G.Wilson for 22 yards' },
    { playId: 3, meaningful: true, q: 2, d: -0.1, desc: 'pass to 5-G.Wilson INTERCEPTED' },
    { playId: 4, meaningful: false, q: 2, d: 0.3, desc: 'pass to 5-G.Wilson, No Play' },
    { playId: 5, meaningful: true, q: 3, d: 0.1, desc: '20-B.Hall up the middle for 30 yards' },
  ]]]);
  bigPlays(players, curves);
  assert.deepEqual(players.a.plays.map((play) => play.playId), [2, 1]);
  assert.deepEqual(players.b.plays, []);
  assert.deepEqual(players.c.plays, []);
});

test('Jets-prefixed fumble recoveries count without matching an opponent or a longer name', () => {
  const named = namePattern('H.Phillips');
  assert.ok(named.test('RECOVERED by NYJ-97-H.Phillips at GB 39.'));
  assert.ok(!named.test('RECOVERED by GB-97-H.Phillips at GB 39.'));
  assert.ok(!named.test('RECOVERED by NYJ-97-H.Phillipson at GB 39.'));
  const players = { a: { short: 'H.Phillips', games: [{ gameId: 'g1' }], plays: [] } };
  bigPlays(players, new Map([['g1', [
    { playId: 3373, meaningful: true, q: 4, d: 0.076, desc: 'FUMBLES, RECOVERED by NYJ-97-H.Phillips at GB 39.' },
    { playId: 3374, meaningful: true, q: 4, d: 0.15, desc: 'FUMBLES, RECOVERED by GB-97-H.Phillips at GB 39.' },
  ]]]));
  assert.deepEqual(players.a.plays.map((play) => play.playId), [3373]);
});

test('replay descriptions retain the final touchdown ruling before the stored text is shortened', () => {
  const players = { a: { short: 'G.Wilson', games: [{ gameId: 'g1' }], plays: [] } };
  const desc = '(4:11) (Shotgun) 7-G.Smith pass deep right to 5-G.Wilson to DET 1 for 22 yards (4-D.Reed). Penalty on DET-4-D.Reed, Defensive Pass Interference, declined. New York Jets challenged the short of the goal line ruling, and the play was REVERSED. (Shotgun) 7-G.Smith pass deep right to 5-G.Wilson for 23 yards, TOUCHDOWN. Penalty on DET-4-D.Reed, Defensive Pass Interference, declined.';
  bigPlays(players, new Map([['g1', [{ playId: 3619, meaningful: true, q: 4, d: 0.2, desc }]]]));
  assert.match(players.a.plays[0].desc, /23 yards, TOUCHDOWN/);
  assert.doesNotMatch(players.a.plays[0].desc, /22 yards/);
});

test('a refresh writes the season file and keeps it when the season is not yet published', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-players-'));
  try {
    await mkdir(path.join(root, 'curves'));
    await writeFile(path.join(root, 'curves', '2026_01_NYJ_TEN.json'), JSON.stringify([{ playId: 9, meaningful: true, q: 1, d: 0.12, desc: 'pass to 5-G.Wilson for 30 yards' }]));
    const body = gzipSync([header, row({})].join('\n'));
    const fetcher = async (url) => url === weekSource(2026) ? { ok: true, status: 200, arrayBuffer: async () => body } : { ok: false, status: 404 };
    const notes = [];
    const written = await refreshPlayers({ seasons: [2025, 2026], root, fetcher, now: new Date('2026-10-13T12:00:00Z'), onError: (note) => notes.push(note) });
    assert.deepEqual(written, [2026]);
    assert.match(notes[0], /2025 player stats not published/);
    const file = JSON.parse(await readFile(path.join(root, 'players', '2026.json'), 'utf8'));
    assert.equal(file.players['00-0037740'].plays[0].playId, 9);
    assert.equal(file.checkedAt, '2026-10-13T12:00:00.000Z');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const priorTime = '2026-10-13T12:00:00.000Z';
const later = new Date('2026-10-14T12:00:00.000Z');
const weeklyResponse = (csv) => new Response(gzipSync(csv));
const snapshot = (csv = [header, row({})].join('\n')) => ({ schemaVersion: 1, season: 2026, source: weekSource(2026),
  checkedAt: priorTime, players: seasonPlayers(csv, 2026) });
async function withPrevious(previous, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-player-retention-'));
  const out = path.join(root, 'players', '2026.json');
  try {
    await mkdir(path.dirname(out));
    const bytes = `${JSON.stringify(previous, null, 2)}\n`;
    await writeFile(out, bytes);
    await run({ root, out, bytes });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('a valid prior season survives HTTP failures and timeouts without advancing its source clock or blocking later seasons', async () => {
  for (const failedFetch of [async () => new Response('', { status: 503 }), async () => { throw new DOMException('Provider timed out', 'TimeoutError'); }]) {
    await withPrevious(snapshot(), async ({ root, out, bytes }) => {
      const notes = [], requests = [];
      const written = await refreshPlayers({ seasons: [2026, 2025], root, now: later, onError: (note) => notes.push(note), fetcher: async (url) => {
        requests.push(url);
        return url === weekSource(2026) ? failedFetch() : weeklyResponse([header, row({ season: '2025', game_id: '2025_01_NYJ_TEN' })].join('\n'));
      } });
      assert.deepEqual(written, [2025]);
      assert.deepEqual(requests, [weekSource(2026), weekSource(2025)]);
      assert.equal(await readFile(out, 'utf8'), bytes);
      assert.match(notes[0], new RegExp(`2026 player stats retained from ${priorTime}`));
      assert.equal(JSON.parse(await readFile(out, 'utf8')).checkedAt, priorTime);
      assert.equal(JSON.parse(await readFile(path.join(root, 'players', '2025.json'), 'utf8')).checkedAt, later.toISOString());
    });
  }
});

test('malformed, empty, missing-player and missing-game replacements retain the validated complete season byte for byte', async () => {
  const complete = snapshot([header, row({}), row({ week: '2', game_id: '2026_02_GB_NYJ', opponent_team: 'GB' }),
    row({ player_id: '00-0034831', player_name: 'B.Hall', player_display_name: 'Breece Hall' })].join('\n'));
  for (const replacement of [
    () => new Response('broken compression'),
    () => weeklyResponse('player_id,team\n00-0037740,NYJ'),
    () => weeklyResponse([header, row({ completions: '10', attempts: '2' })].join('\n')),
    () => weeklyResponse([header, row({ team: 'TEN' })].join('\n')),
    () => weeklyResponse([header, row({}), row({ week: '2', game_id: '2026_02_GB_NYJ', opponent_team: 'GB' })].join('\n')),
    () => weeklyResponse([header, row({}), row({ player_id: '00-0034831', player_name: 'B.Hall', player_display_name: 'Breece Hall' })].join('\n')),
  ]) {
    await withPrevious(complete, async ({ root, out, bytes }) => {
      const notes = [];
      assert.deepEqual(await refreshPlayers({ seasons: [2026], root, now: later, fetcher: async () => replacement(), onError: (note) => notes.push(note) }), []);
      assert.equal(await readFile(out, 'utf8'), bytes);
      assert.match(notes[0], /player stats retained from/);
    });
  }
});

test('a complete correction and added game publish normally after a prior season', async () => {
  await withPrevious(snapshot(), async ({ root, out }) => {
    const updated = [header, row({ receiving_yards: '81' }), row({ week: '2', game_id: '2026_02_GB_NYJ', opponent_team: 'GB', receiving_yards: '40' })].join('\n');
    assert.deepEqual(await refreshPlayers({ seasons: [2026], root, now: later, fetcher: async () => weeklyResponse(updated) }), [2026]);
    const actual = validatePlayers(JSON.parse(await readFile(out, 'utf8')));
    assert.equal(actual.checkedAt, later.toISOString());
    assert.deepEqual(actual.players['00-0037740'].games.map((game) => game.rec[2]), [81, 40]);
  });
});

test('a provider failure without a valid prior season remains fatal', async () => {
  for (const invalid of [null, { ...snapshot(), checkedAt: 'not-a-clock' },
    { ...snapshot(), players: { '00-0037740': { ...snapshot().players['00-0037740'], games: [{ gameId: 'foreign' }] } } }]) {
    await withPrevious(invalid, async ({ root, out, bytes }) => {
      await assert.rejects(refreshPlayers({ seasons: [2026], root, now: later, fetcher: async () => new Response('', { status: 503 }) }), /Source HTTP 503/);
      assert.equal(await readFile(out, 'utf8'), bytes);
    });
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-player-initial-'));
  try {
    await assert.rejects(refreshPlayers({ seasons: [2026], root, fetcher: async () => new Response('broken compression') }));
    await assert.rejects(refreshPlayers({ seasons: [2026], root, fetcher: async () => { throw new DOMException('Provider timed out', 'TimeoutError'); } }), /Provider timed out/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('filesystem publication errors remain fatal even when a valid prior season exists', async () => {
  await withPrevious(snapshot(), async ({ root, out, bytes }) => {
    // Make the atomic temporary output unwritable without depending on user privileges.
    await mkdir(`${out}.${process.pid}.tmp`);
    await assert.rejects(refreshPlayers({ seasons: [2026], root, now: later, fetcher: async () => weeklyResponse([header, row({})].join('\n')) }), (error) => ['EISDIR', 'ERR_FS_EISDIR'].includes(error.code));
    assert.equal(await readFile(out, 'utf8'), bytes);
  });
});

test('prior-season validation rejects orphaned plays and every generated season remains valid', async () => {
  const invalid = snapshot();
  invalid.players['00-0037740'].plays = [{ gameId: '2026_02_GB_NYJ', playId: 1, q: 4, d: 0.1, desc: 'Unknown game' }];
  assert.throws(() => validatePlayers(invalid), /Invalid player play/);
  for (let season = 1999; season <= 2026; season++) {
    const file = JSON.parse(await readFile(new URL(`../public/data/players/${season}.json`, import.meta.url), 'utf8'));
    assert.equal(validatePlayers(file), file);
  }
});
