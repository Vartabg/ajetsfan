import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { confirmedDriveGame } from '../src/lib/drive-game-page.mjs';
import { validateRuntimeDrives } from '../src/lib/postgame-evidence.mjs';

const read = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const [currentFixture, analyzedFixture] = await Promise.all([read('current.json'), read('games.json')]);
const driveFixture = await read(`drives/${currentFixture.season}.json`);
const next = currentFixture.schedule.filter((game) => game.season === currentFixture.season && game.status === 'scheduled')
  .sort((left, right) => left.date.localeCompare(right.date) || left.week - right.week)[0];
assert.ok(next, 'the source fixture must contain a next current-season game');
const id = next.id;
const donor = Object.entries(driveFixture.games).find(([gameId, rows]) => rows.some((row) => row[0] === 1)
  && currentFixture.schedule.some((game) => game.id === gameId && game.status === 'final'));
assert.ok(donor, 'the source fixture must contain a confirmed chart with Jets drives');
const final = { ...next, status: 'final', jetsScore: 20, oppScore: 17, outcome: 'win' };
const baselineClock = Math.max(...[currentFixture.checkedAt, driveFixture.checkedAt, next.kickoff, `${next.date}T23:59:59.000Z`]
  .filter(Boolean).map(Date.parse));
const clock = (minutes = 0) => new Date(baselineClock + 3_600_000 + minutes * 60_000).toISOString();
const dayAfter = (date) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const current = () => structuredClone({ ...currentFixture, checkedAt: clock(),
  schedule: currentFixture.schedule.map((game) => game.id === id ? final : game) });
const drives = () => {
  const snapshot = current();
  const games = {}, finals = {};
  for (const game of snapshot.schedule.filter((game) => game.status === 'final')) {
    const rows = game.id === id ? donor[1] : driveFixture.games[game.id];
    if (!rows) continue;
    games[game.id] = structuredClone(rows);
    finals[game.id] = { date: game.date, jetsScore: game.jetsScore, oppScore: game.oppScore };
  }
  return validateRuntimeDrives({ ...driveFixture, checkedAt: clock(), attemptedAt: clock(), status: 'ready', asset: null,
    games, finals, pendingGameIds: snapshot.schedule.filter((game) => game.status === 'final' && !Object.hasOwn(games, game.id)).map((game) => game.id) }, snapshot);
};
const changeFinal = (snapshot, update) => ({ ...snapshot,
  schedule: snapshot.schedule.map((game) => game.id === id ? { ...game, ...update } : game) });

test('a confirmed final with verified Jets drives is available without an analyzed WP game', () => {
  const analyzed = analyzedFixture.filter((game) => game.id !== id);
  assert.equal(analyzed.some((game) => game.id === id), false);
  const snapshot = current(), file = drives();
  const before = JSON.stringify({ snapshot, file });
  const result = confirmedDriveGame(id, snapshot, file);
  assert.ok(result);
  assert.deepEqual(result.game, final);
  assert.deepEqual(result.file, file);
  assert.ok(result.file.games[id].some((row) => row[0] === 1));
  for (const field of ['swing', 'peakH2Wp', 'troughH2Wp', 'keyPlay', 'wentToOt', 'dataSuspect']) {
    assert.equal(Object.hasOwn(result.game, field), false, `${field} must not be invented from a schedule final`);
  }
  assert.equal(JSON.stringify({ snapshot, file }), before);
});

test('retained verified drives remain available with their original success clock', () => {
  const file = { ...drives(), status: 'retained', attemptedAt: clock(10) };
  const result = confirmedDriveGame(id, current(), file);
  assert.ok(result);
  assert.equal(result.file.status, 'retained');
  assert.equal(result.file.checkedAt, clock());
  assert.equal(result.file.attemptedAt, clock(10));
});

test('unknown and non-current-season IDs cannot create a game page', () => {
  for (const requested of [`${currentFixture.season}_24_NYJ_BUF`, `${currentFixture.season - 1}_06_NYJ_NE`, 'unknown']) {
    assert.equal(confirmedDriveGame(requested, current(), drives()), null);
  }
  assert.equal(confirmedDriveGame(id, { ...current(), season: currentFixture.season + 1 }, drives()), null);
});

test('scheduled and provisional fixtures cannot inherit a final from drive witnesses', () => {
  for (const update of [{ status: 'scheduled', jetsScore: null, oppScore: null, outcome: null },
    { status: 'scheduled', jetsScore: 20, oppScore: 17, outcome: 'win' }, { status: 'provisional' }]) {
    assert.equal(confirmedDriveGame(id, changeFinal(current(), update), drives()), null);
  }
});

test('a final needs actual non-null integer scores and the matching outcome', () => {
  for (const update of [{ jetsScore: null }, { oppScore: null }, { outcome: null }, { outcome: 'loss' }, { jetsScore: 20.5 }]) {
    assert.equal(confirmedDriveGame(id, changeFinal(current(), update), drives()), null);
  }
});

test('a missing runtime file or requested game is unavailable instead of an empty page', () => {
  assert.equal(confirmedDriveGame(id, current(), null), null);
  assert.equal(confirmedDriveGame(id, current(), undefined), null);
  const file = drives();
  delete file.games[id];
  delete file.finals[id];
  file.pendingGameIds.push(id);
  validateRuntimeDrives(file, current());
  assert.equal(confirmedDriveGame(id, current(), file), null);
});

test('invalid source and malformed runtime witnesses are rejected', () => {
  for (const update of [{ source: 'https://invalid.example/play_by_play.parquet' }, { finals: {} }, { checkedAt: 'not-a-source-clock' }]) {
    assert.equal(confirmedDriveGame(id, current(), { ...drives(), ...update }), null);
  }
});

test('a current score correction with an old witness withholds the chart', () => {
  assert.equal(confirmedDriveGame(id, changeFinal(current(), { jetsScore: 21 }), drives()), null);
});

test('a current date correction with an old witness withholds the chart', () => {
  const snapshot = changeFinal(current(), { date: dayAfter(final.date) });
  snapshot.checkedAt = new Date(Date.parse(`${snapshot.schedule.find((game) => game.id === id).date}T23:59:59.000Z`) + 3_600_000).toISOString();
  assert.equal(confirmedDriveGame(id, snapshot, drives()), null);
});

test('a matching drive witness cannot confirm a final dated after the schedule source check', () => {
  const futureDate = dayAfter(current().checkedAt.slice(0, 10));
  const snapshot = changeFinal(current(), { date: futureDate });
  const file = drives();
  file.finals[id].date = futureDate;
  validateRuntimeDrives(file, snapshot);
  assert.equal(confirmedDriveGame(id, snapshot, file), null);
});

test('duplicate fixture IDs are ambiguous even when both copies claim the same final', () => {
  const snapshot = current();
  snapshot.schedule.push(structuredClone(snapshot.schedule.find((game) => game.id === id)));
  assert.equal(confirmedDriveGame(id, snapshot, drives()), null);
});

test('an opponent-only chart is not a verified Jets drive game', () => {
  const file = drives();
  file.games[id] = file.games[id].filter((row) => row[0] === 0);
  assert.ok(file.games[id].length);
  validateRuntimeDrives(file, current());
  assert.equal(confirmedDriveGame(id, current(), file), null);
});

test('validation covers the full runtime file, including other final witnesses', () => {
  const file = drives();
  const otherId = Object.keys(file.finals).find((gameId) => gameId !== id);
  assert.ok(otherId);
  file.finals[otherId].jetsScore += 1;
  assert.equal(confirmedDriveGame(id, current(), file), null);
});
