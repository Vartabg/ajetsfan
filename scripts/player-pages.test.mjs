import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bigPlays, namePattern, refreshPlayers, seasonPlayers, weekSource } from './player-pages.mjs';

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
