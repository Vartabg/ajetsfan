import test from 'node:test';
import assert from 'node:assert/strict';
import * as history from '../src/lib/player-history.ts';

const id = '00-0030565';
const checkedAt = '2026-10-18T12:41:00.000Z';
const game = (week, pass = [19, 24, 215, 0, 0], extra = {}) => ({ week, gameId: `2026_${String(week).padStart(2, '0')}_NYJ_NE`, post: false, opponent: 'NE', pass, ...extra });
const file = (games, extraPlayers = {}) => ({ schemaVersion: 1, season: 2026, source: 'weekly player stats', checkedAt,
  players: { [id]: { name: 'Geno Smith', short: 'G.Smith', position: 'QB', games, plays: [] }, ...extraPlayers } });
const stats = (games, overrides = {}) => ({ status: 'ready', season: 2026, checkedAt: '2026-10-20T17:20:00.000Z',
  playerGameIds: { [id]: games.map((entry) => entry.gameId) }, players: [{ id, games: games.length,
    passing: { completions: 19, attempts: 24, yards: 215, touchdowns: 0, interceptions: 0 },
    rushing: { carries: 0, yards: 0, touchdowns: 0 }, receiving: { receptions: 0, targets: 0, yards: 0, touchdowns: 0 }, ...overrides }] });

test('player archive coverage keeps its own source clock and the file-wide cutoff, including a player bye', () => {
  const value = history.historyFor(id, [file([game(1)], { other: { name: 'Other', short: 'Other', position: 'WR', games: [game(2)], plays: [] } })]);
  assert.equal(value.latest.checkedAt, checkedAt);
  assert.equal(value.latest.throughWeek, 2);
  assert.equal(value.latest.playoffs, false);
  assert.equal(value.seasons[0].checkedAt, checkedAt);
  assert.equal(value.seasons[0].throughWeek, 2);
  assert.equal(value.seasons[0].games, 1);
});

test('archive comparison catches a newly recorded game and later stat correction without inventing a game line', () => {
  assert.equal(typeof history.archiveDiffersFromStats, 'function');
  const recorded = [game(1)];
  const value = history.historyFor(id, [file(recorded)]);
  assert.equal(history.archiveDiffersFromStats(value, id, stats(recorded)), false);
  assert.equal(history.archiveDiffersFromStats(value, id, stats([...recorded, game(2)])), true);
  assert.equal(history.archiveDiffersFromStats(value, id, stats(recorded, { passing: { completions: 19, attempts: 24, yards: 216, touchdowns: 0, interceptions: 0 } })), true);
  assert.deepEqual(value.latest.games, recorded);
});

test('archive comparison respects regular-season coverage, unavailable feeds and historical-only players', () => {
  const recorded = [game(1)];
  const value = history.historyFor(id, [file([...recorded, game(19, [1, 1, 30, 1, 0], { post: true })])]);
  assert.equal(typeof history.archiveDiffersFromStats, 'function');
  assert.equal(value.latest.playoffs, true);
  assert.equal(history.archiveDiffersFromStats(value, id, stats(recorded)), false);
  assert.equal(history.archiveDiffersFromStats(value, id, { ...stats(recorded), status: 'unavailable' }), false);
  assert.equal(history.archiveDiffersFromStats(value, id, { ...stats(recorded), season: 2025 }), false);
  assert.equal(history.archiveDiffersFromStats(value, id, { ...stats(recorded), players: [] }), false);
});
