import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseLeagueSchedule, SCHEDULE_SOURCE } from './data-refresh.mjs';
import { jetsHistory, playoffsByWins, refreshHistory, scheduleExtras, validateHistory } from './league-history.mjs';

const HEADER = 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,espn,stadium,away_qb_id,home_qb_id,away_qb_name,home_qb_name';
const csv = (...rows) => [HEADER, ...rows].join('\n');
const PLAYED = '2026_05_CLE_NYJ,2026,REG,5,2026-10-11,13:00,CLE,12,NYJ,17,401872983,MetLife Stadium,00-0033537,00-0030565,Deshaun Watson,Geno Smith';
// The schedule names projected starters for games not yet played; they must not count.
const NEXT = '2026_06_NYJ_NE,2026,REG,6,2026-10-18,13:00,NYJ,,NE,,401873001,Gillette Stadium,00-0030565,00-0039851,Geno Smith,Drake Maye';

test('a played game records the Jets starter; a scheduled one keeps its venue and ESPN event but no starter', () => {
  const source = csv(PLAYED, NEXT);
  const [played, next] = jetsHistory(parseLeagueSchedule(source), scheduleExtras(source));
  assert.deepEqual(played.qb, { id: '00-0030565', name: 'Geno Smith' });
  assert.deepEqual([played.stadium, played.espn], ['MetLife Stadium', '401872983']);
  assert.equal(next.qb, null);
  assert.deepEqual([next.stadium, next.espn, next.atHome], ['Gillette Stadium', '401873001', false]);
});

test('a malformed quarterback or ESPN event fails instead of publishing a wrong name', () => {
  assert.throws(() => scheduleExtras(csv(PLAYED.replace('00-0030565', 'GenoSm00'))), /Invalid home quarterback/);
  assert.throws(() => scheduleExtras(csv(PLAYED.replace('401872983', 'espn'))), /Invalid ESPN event/);
});

/** A complete toy season: 32 clubs, one regular-season game each, and a 14-club postseason. */
function season(year) {
  const clubs = Array.from({ length: 32 }, (_, index) => `T${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`);
  const rows = [];
  for (let index = 0; index < 32; index += 2) {
    rows.push({ id: `${year}_01_${clubs[index]}_${clubs[index + 1]}`, season: year, week: 1, seasonType: 'REG', status: 'final', awayTeam: clubs[index], homeTeam: clubs[index + 1], awayScore: 10, homeScore: index === 30 ? 10 : 20 });
  }
  for (let index = 0; index < 14; index += 2) {
    rows.push({ id: `${year}_19_${clubs[index]}_${clubs[index + 1]}`, season: year, week: 19, seasonType: 'POST', status: 'final', awayTeam: clubs[index], homeTeam: clubs[index + 1], awayScore: 3, homeScore: 7 });
  }
  return rows;
}

test('the playoff table counts clubs by regular-season wins, ties count as neither, and unfinished seasons are left out', () => {
  const unfinished = season(2026).map((game) => game.seasonType === 'POST' ? { ...game, status: 'scheduled', homeScore: null, awayScore: null } : game);
  const table = playoffsByWins([...season(2024), ...season(2025), ...unfinished]);
  assert.deepEqual(table.seasons, [2024, 2025]);
  // Each season: 15 home winners with one win, 15 away losers and one tied pair with none.
  assert.deepEqual(table.rows, [{ wins: 0, clubs: 34, playoffs: 14 }, { wins: 1, clubs: 30, playoffs: 14 }]);
  assert.throws(() => playoffsByWins(season(2024).slice(1)), /Expected 32 clubs/);
});

const snapshot = (games) => ({ schemaVersion: 1, team: 'NYJ', source: SCHEDULE_SOURCE, checkedAt: '2026-10-13T10:00:00.000Z', status: 'ready', games, playoffsByWins: { seasons: [2025], rows: [{ wins: 9, clubs: 18, playoffs: 4 }, { wins: 12, clubs: 14, playoffs: 10 }] } });

test('validation rejects a starter on an unplayed game and a playoff table that does not add up', () => {
  const source = csv(PLAYED, NEXT);
  const games = jetsHistory(parseLeagueSchedule(source), scheduleExtras(source));
  assert.equal(validateHistory(snapshot(games)).games.length, 2);
  assert.throws(() => validateHistory(snapshot([games[0], { ...games[1], qb: { id: '00-0030565', name: 'Geno Smith' } }])), /Invalid starter/);
  assert.throws(() => validateHistory({ ...snapshot(games), playoffsByWins: { seasons: [2025], rows: [{ wins: 9, clubs: 32, playoffs: 13 }] } }), /does not add up/);
});

test('an outage keeps the last validated history and marks it retained', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'league-history-'));
  try {
    const out = path.join(dir, 'league-history.json');
    const source = csv(PLAYED, NEXT);
    const games = jetsHistory(parseLeagueSchedule(source), scheduleExtras(source));
    await writeFile(out, JSON.stringify(snapshot(games)));
    const errors = [];
    const result = await refreshHistory({ out, now: new Date('2026-10-14T00:00:00Z'), fetcher: async () => new Response('down', { status: 503 }), onError: (message) => errors.push(message) });
    assert.equal(result.status, 'retained');
    assert.equal(result.checkedAt, '2026-10-13T10:00:00.000Z');
    assert.match(errors[0], /retained: Source HTTP 503/);
    assert.equal(JSON.parse(await readFile(out, 'utf8')).attemptedAt, '2026-10-14T00:00:00.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
