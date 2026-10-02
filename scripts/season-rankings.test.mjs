import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonRankings, seasonPlayerSource, seasonTeamSource } from './season-rankings.mjs';

const checkedAt = '2026-10-02T20:00:00Z';
const year = 2026;
const g1 = { id: '2026_01_BUF_NYJ', season: year, week: 1, seasonType: 'REG', date: '2026-09-13', homeTeam: 'NYJ', awayTeam: 'BUF', homeScore: 20, awayScore: 10, status: 'final' };
const g2 = { id: '2026_02_NYJ_MIA', season: year, week: 2, seasonType: 'REG', date: '2026-09-20', homeTeam: 'MIA', awayTeam: 'NYJ', homeScore: 20, awayScore: 20, status: 'final' };
const g3 = { id: '2026_03_NE_BUF', season: year, week: 3, seasonType: 'REG', date: '2026-09-27', homeTeam: 'BUF', awayTeam: 'NE', homeScore: 40, awayScore: 7, status: 'final' };
const fields = ['attempts', 'passing_yards', 'passing_tds', 'sack_yards_lost', 'carries', 'rushing_yards', 'rushing_tds', 'receptions', 'receiving_yards', 'receiving_tds', 'targets', 'def_sacks', 'def_interceptions', 'fg_made', 'fg_att'];

function teamRow(game, team, passing = 100, rushing = 50, overrides = {}) {
  return { season: String(game.season), week: String(game.week), season_type: game.seasonType, game_id: game.id, team,
    opponent_team: game.homeTeam === team ? game.awayTeam : game.homeTeam,
    ...Object.fromEntries(fields.map((field) => [field, '0'])), attempts: '10', passing_yards: String(passing), sack_yards_lost: '-10',
    carries: '5', rushing_yards: String(rushing), receptions: '5', targets: '8', receiving_yards: String(passing), ...overrides };
}
const schedule = [g1, g2, g3];
const teamCsv = [teamRow(g1, 'NYJ', 30, 80), teamRow(g1, 'BUF', 90, 40), teamRow(g2, 'NYJ', 60, 60), teamRow(g2, 'MIA', 50, 20), teamRow(g3, 'BUF', 80, 60), teamRow(g3, 'NE', 40, 10)];
const playerCsv = teamCsv.map((row, i) => ({ ...row, player_id: `00-${String(i + 1).padStart(7, '0')}`, player_name: `P${i}`, player_display_name: `Player ${i}`, position: 'QB' }));
const fixture = (overrides = {}) => buildSeasonRankings({ year, checkedAt, schedule, teamCsv, playerCsv, ...overrides });
const metric = (phase, id, kind = 'team') => phase[kind].find((row) => row.id === id);

test('team scoring ranks compare all confirmed participants using exact per-game ties', () => {
  const phase = fixture().phases.regular;
  const points = metric(phase, 'points-per-game');
  assert.equal(points.population, 4);
  assert.deepEqual([points.jets.value, points.jets.rank, points.jets.tied, points.jets.games], [20, 2, true, 2]);
  assert.deepEqual(points.leaders.map((entry) => [entry.id, entry.rank]), [['BUF', 1], ['MIA', 2], ['NYJ', 2]]);
  const allowed = metric(phase, 'points-allowed-per-game');
  assert.deepEqual([allowed.jets.value, allowed.jets.rank], [15, 2]);
  assert.equal(phase.jetsGames, 2);
  assert.equal(phase.expectedGames, 3);
});

test('net passing subtracts negative sack yardage and defense mirrors opponents', () => {
  const phase = fixture().phases.regular;
  assert.equal(metric(phase, 'net-passing-per-game').jets.value, 35);
  assert.equal(metric(phase, 'rushing-per-game').jets.value, 70);
  assert.equal(metric(phase, 'net-yards-per-game').jets.value, 105);
  assert.equal(metric(phase, 'passing-allowed-per-game').jets.value, 60);
  assert.equal(metric(phase, 'rushing-allowed-per-game').jets.value, 30);
  assert.equal(metric(phase, 'yards-allowed-per-game').jets.value, 90);
  assert.equal(phase.team.length, 8);
});

test('a traded player ranks on all-club totals while Jets stint stays explicit', () => {
  const rows = playerCsv.map((row) => ({ ...row }));
  rows[4].player_id = rows[0].player_id;
  rows[4].player_display_name = rows[0].player_display_name;
  const passing = metric(fixture({ playerCsv: rows }).phases.regular, 'passing-yards', 'individual');
  const jet = passing.players.find((entry) => entry.id === rows[0].player_id);
  assert.deepEqual([jet.value, jet.jetsValue, jet.games, jet.jetsGames, jet.rank], [110, 30, 2, 1, 1]);
  assert.deepEqual(jet.teams, ['BUF', 'NYJ']);
  assert.equal(passing.population, 6 - 1);
  assert.equal(passing.jets, null);
  assert.equal(passing.players.length, 2);
});

test('January postseason is attached to its football season and excludes nonparticipants', () => {
  const game = { ...g1, id: '2010_19_NYJ_NE', season: 2010, week: 19, seasonType: 'POST', date: '2011-01-16', homeTeam: 'NE', awayTeam: 'NYJ', homeScore: 21, awayScore: 28 };
  const teams = [teamRow(game, 'NYJ'), teamRow(game, 'NE')];
  const players = teams.map((row, i) => ({ ...row, player_id: `00-000000${i + 1}`, player_display_name: `Player ${i}`, position: 'QB' }));
  const value = fixture({ year: 2010, schedule: [game], teamCsv: teams, playerCsv: players });
  assert.equal(value.phases.regular.expectedGames, 0);
  assert.equal(value.phases.playoffs.expectedGames, 1);
  assert.equal(value.phases.playoffs.throughDate, '2011-01-16');
  assert.equal(metric(value.phases.playoffs, 'points-per-game').population, 2);
  assert.match(value.phases.playoffs.notes.join(' '), /playoff participants only/);
});

test('missing team games preserve complete scoring ranks and withhold yardage pools', () => {
  const value = fixture({ teamCsv: teamCsv.slice(1) }).phases.regular;
  assert.equal(value.teamGames, 2);
  assert.deepEqual(value.missingTeamGames, [g1.id]);
  assert.equal(value.team.length, 2);
  assert.equal(metric(value, 'points-per-game').population, 4);
  assert.match(value.notes.join(' '), /Yardage ranks are withheld/);
  assert.equal(value.individual.length, 0);
});

test('unreconciled individual metric is withheld without erasing independent offense ranks', () => {
  const rows = playerCsv.map((row, i) => i === 0 ? { ...row, passing_yards: '31' } : { ...row });
  const phase = fixture({ playerCsv: rows }).phases.regular;
  assert.equal(metric(phase, 'passing-yards', 'individual'), undefined);
  assert.ok(metric(phase, 'rushing-yards', 'individual'));
  assert.ok(metric(phase, 'receiving-yards', 'individual'));
  assert.deepEqual(phase.missingPlayerGames, [g1.id]);
  assert.match(phase.notes.join(' '), /Passing yards ranks are withheld/);
});

test('defensive and kicking metrics require meaningful fields and matching team sums', () => {
  const teams = teamCsv.map((row, i) => ({ ...row, def_sacks: i === 0 ? '1.5' : '0', def_interceptions: i === 1 ? '1' : '0', fg_made: i === 0 ? '2' : '0', fg_att: i === 0 ? '3' : '0' }));
  const players = playerCsv.map((row, i) => ({ ...row, def_sacks: i === 0 ? '1.5' : '0', def_interceptions: i === 1 ? '1' : '0', fg_made: i === 0 ? '2' : '0', fg_att: i === 0 ? '3' : '0' }));
  let phase = fixture({ teamCsv: teams, playerCsv: players }).phases.regular;
  assert.equal(metric(phase, 'sacks', 'individual').players[0].value, 1.5);
  assert.equal(metric(phase, 'interceptions', 'individual').population, 1);
  assert.equal(metric(phase, 'field-goals', 'individual').players[0].value, 2);
  players[0].def_sacks = '2';
  players[1].def_interceptions = '';
  players[0].fg_made = '1';
  phase = fixture({ teamCsv: teams, playerCsv: players }).phases.regular;
  for (const id of ['sacks', 'interceptions', 'field-goals']) assert.equal(metric(phase, id, 'individual'), undefined);
  assert.ok(metric(phase, 'rushing-yards', 'individual'));
  assert.match(phase.notes.join(' '), /Credited sacks ranks are withheld/);
});

test('anonymous team credits reconcile coverage but never become ranked players', () => {
  const teams = teamCsv.map((row, i) => i === 0 ? { ...row, def_sacks: '1' } : { ...row });
  const anonymous = { ...playerCsv[0], ...Object.fromEntries(fields.map((field) => [field, '0'])), player_id: '', player_name: 'Team', player_display_name: '', def_sacks: '1' };
  const phase = fixture({ teamCsv: teams, playerCsv: [...playerCsv, anonymous] }).phases.regular;
  assert.equal(phase.playerGames, 3);
  assert.equal(metric(phase, 'passing-yards', 'individual').population, 6);
  assert.equal(metric(phase, 'sacks', 'individual'), undefined);
  assert.ok(phase.individual.every((row) => row.leaders.every((entry) => entry.id)));
});

test('unattributed offensive attempts withhold that player population rather than inventing an identity', () => {
  const teams = teamCsv.map((row, i) => i === 0 ? { ...row, attempts: '11', passing_yards: '72' } : { ...row });
  const anonymous = { ...playerCsv[0], ...Object.fromEntries(fields.map((field) => [field, '0'])), player_id: '', player_name: 'Team', player_display_name: '', attempts: '1', passing_yards: '42' };
  const phase = fixture({ teamCsv: teams, playerCsv: [...playerCsv, anonymous] }).phases.regular;
  assert.equal(metric(phase, 'passing-yards', 'individual'), undefined);
  assert.equal(metric(phase, 'passing-touchdowns', 'individual'), undefined);
  assert.ok(metric(phase, 'rushing-yards', 'individual'));
  assert.match(phase.notes.join(' '), /Passing yards ranks are withheld/);
});

test('unassigned team credits preserve scoring but withhold affected yardage and individual populations', () => {
  const unknown = { ...teamCsv[0], ...Object.fromEntries(fields.map((field) => [field, '0'])), team: '', opponent_team: '', attempts: '1', carries: '2', rushing_yards: '-2' };
  const unknownPlayer = { ...unknown, player_id: '00-0000100', player_display_name: 'Unassigned player', position: 'QB' };
  const phase = fixture({ teamCsv: [...teamCsv, unknown], playerCsv: [...playerCsv, unknownPlayer] }).phases.regular;
  assert.equal(phase.team.length, 2);
  assert.equal(metric(phase, 'points-per-game').population, 4);
  assert.deepEqual(phase.missingTeamGames, [g1.id]);
  assert.equal(metric(phase, 'passing-yards', 'individual'), undefined);
  assert.equal(metric(phase, 'rushing-yards', 'individual'), undefined);
  assert.ok(metric(phase, 'receiving-yards', 'individual'));
  assert.ok(phase.individual.every((row) => row.leaders.every((entry) => entry.id !== unknownPlayer.player_id)));
});

test('unassigned zero-stat housekeeping rows do not invent an opponent or erase valid ranks', () => {
  const unknown = { ...playerCsv[0], ...Object.fromEntries(fields.map((field) => [field, '0'])), opponent_team: '', player_id: '', player_name: '', player_display_name: '' };
  const phase = fixture({ playerCsv: [...playerCsv, unknown] }).phases.regular;
  assert.equal(phase.team.length, 8);
  assert.equal(metric(phase, 'passing-yards', 'individual').population, 6);
  assert.equal(phase.playerGames, 3);
  assert.throws(() => fixture({ playerCsv: [...playerCsv, { ...unknown, team: 'MIA' }] }), /identity mismatch/);
});

test('legacy anonymous identifiers remain source credits rather than fabricated individuals', () => {
  for (const player_id of ['0', 'XX-0000001']) {
    const unknown = { ...playerCsv[0], ...Object.fromEntries(fields.map((field) => [field, '0'])), player_id, player_name: '', player_display_name: '' };
    const phase = fixture({ playerCsv: [...playerCsv, unknown] }).phases.regular;
    assert.equal(phase.playerGames, 3);
    assert.equal(metric(phase, 'passing-yards', 'individual').population, 6);
    assert.ok(phase.individual.every((row) => row.leaders.every((entry) => entry.id !== player_id)));
  }
});

test('future and scheduled fixtures cannot contribute or inflate rank populations', () => {
  const future = { ...g3, id: '2026_05_NE_BUF', week: 5, date: '2026-10-11' };
  const scheduled = { ...g3, id: '2026_04_NE_BUF', week: 4, date: '2026-10-04', status: 'scheduled', homeScore: null, awayScore: null };
  const value = fixture({ schedule: [...schedule, future, scheduled] }).phases.regular;
  assert.equal(value.expectedGames, 3);
  assert.equal(value.throughDate, '2026-09-27');
  assert.equal(metric(value, 'points-per-game').jets.value, 20);
});

test('duplicate fixtures, duplicate player-game identities and opponent mismatches fail closed', () => {
  assert.throws(() => fixture({ schedule: [...schedule, g1] }), /Duplicate ranking schedule/);
  assert.throws(() => fixture({ teamCsv: [...teamCsv, teamCsv[0]] }), /Duplicate ranking stats/);
  assert.throws(() => fixture({ playerCsv: [...playerCsv, { ...playerCsv[0], team: 'BUF', opponent_team: 'NYJ' }] }), /Duplicate ranking stats/);
  assert.throws(() => fixture({ teamCsv: teamCsv.map((row, i) => i === 0 ? { ...row, opponent_team: 'MIA' } : row) }), /identity mismatch/);
  assert.throws(() => fixture({ playerCsv: playerCsv.map((row, i) => i === 0 ? { ...row, season_type: 'POST' } : row) }), /identity mismatch/);
});

test('invalid calendar seasons and impossible statistical values are rejected', () => {
  for (const date of ['2026-01-18', '2026-05-18', '2026-09-31', '2028-01-18']) assert.throws(() => fixture({ schedule: [{ ...g1, date }] }), /Invalid ranking schedule/);
  assert.throws(() => fixture({ teamCsv: teamCsv.map((row, i) => i === 0 ? { ...row, sack_yards_lost: '10' } : row) }), /Invalid sack_yards_lost/);
  assert.throws(() => fixture({ playerCsv: playerCsv.map((row, i) => i === 0 ? { ...row, def_sacks: '0.3' } : row) }), /Invalid def_sacks/);
  assert.throws(() => fixture({ checkedAt: 'invalid' }), /check time/);
  assert.throws(() => seasonTeamSource(1968), /Unsupported statistical season/);
});

test('historical franchise aliases reconcile to their current nflverse identity', () => {
  const game = { ...g1, id: '2010_04_NYJ_OAK', season: 2010, week: 4, date: '2010-10-03', awayTeam: 'NYJ', homeTeam: 'OAK' };
  const teams = [teamRow(game, 'NYJ'), { ...teamRow(game, 'OAK'), team: 'LV' }];
  const players = teams.map((row, i) => ({ ...row, player_id: `00-000000${i + 1}`, player_display_name: `Player ${i}` }));
  const phase = fixture({ year: 2010, schedule: [game], teamCsv: teams, playerCsv: players }).phases.regular;
  assert.equal(phase.teamGames, 1);
  assert.equal(metric(phase, 'points-per-game').population, 2);
  assert.ok(metric(phase, 'points-per-game').leaders.some((entry) => entry.id === 'LV'));
  assert.equal(seasonPlayerSource(2010), 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2010.csv');
});
