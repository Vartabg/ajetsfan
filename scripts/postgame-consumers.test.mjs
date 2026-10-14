import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeBakedDrivesEvidence, validateRuntimeDrives } from '../src/lib/postgame-evidence.mjs';
import { selectDriveSeason as selectDrives, selectLeagueHistory } from '../src/lib/postgame-consumers.mjs';

const read = async (file) => JSON.parse(await readFile(new URL(`../public/data/${file}`, import.meta.url), 'utf8'));
const [current, drives, history, analyzed] = await Promise.all([read('current.json'), read('drives/2026.json'), read('league-history.json'), read('games.json')]);
const selectDriveSeason = (options) => selectDrives({ compiledGames: analyzed, ...options });
const id = '2026_05_CLE_NYJ', nextId = '2026_06_NYJ_NE';
const baselineClock = Math.max(...[current, drives, history].map((value) => Date.parse(value.checkedAt)));
const clock = (offset) => new Date(baselineClock + 86_400_000 + offset * 60_000).toISOString();
const checkedAt = clock(0), compiledAt = clock(5), attemptedAt = clock(10);
const final = { ...current.schedule.find((game) => game.id === nextId), status: 'final', jetsScore: 20, oppScore: 17, outcome: 'win' };
const nextCurrent = { ...current, checkedAt, schedule: current.schedule.map((game) => game.id === nextId ? final : game) };
const compiled = () => makeBakedDrivesEvidence(drives, current, analyzed);
const publishedDrives = () => validateRuntimeDrives({ ...compiled(), checkedAt, attemptedAt: checkedAt, status: 'ready',
  games: { ...drives.games, [nextId]: structuredClone(drives.games[id]) },
  finals: { ...compiled().finals, [nextId]: { date: final.date, jetsScore: 20, oppScore: 17 } }, pendingGameIds: [] });
const publishedHistory = () => ({ ...history, checkedAt, attemptedAt: checkedAt, status: 'ready', games: history.games.map((game) => game.id === nextId
  ? { ...game, ...final, qb: { id: '00-0030565', name: 'Verified test starter' } } : game) });

test('new published drives add the postgame chart without a compiled file or redeploy', () => {
  const runtime = publishedDrives();
  const value = selectDriveSeason({ baked: null, runtime, compiledCurrent: current, current: nextCurrent });
  assert.equal(value.checkedAt, checkedAt);
  assert.deepEqual(value.games[nextId], runtime.games[nextId]);
  assert.deepEqual(value.finals[nextId], { date: final.date, jetsScore: 20, oppScore: 17 });
  assert.equal(value.pendingGameIds.includes(nextId), false);
});

test('a newer compiled source check cannot drop still-valid runtime-only charts or advance their source clock', () => {
  const baked = { ...drives, checkedAt: compiledAt };
  const value = selectDriveSeason({ baked, runtime: publishedDrives(), compiledCurrent: current, current: nextCurrent });
  assert.equal(value.checkedAt, checkedAt);
  assert.deepEqual(value.games[id], drives.games[id]);
  assert.deepEqual(value.games[nextId], publishedDrives().games[nextId]);
  assert.equal(value.pendingGameIds.includes(nextId), false);
  assert.equal(value.status, 'ready');
});

test('equal-clock retained runtime evidence keeps its newly verified game without fabricating source freshness', () => {
  const runtime = { ...publishedDrives(), checkedAt: drives.checkedAt, status: 'retained', attemptedAt };
  const value = selectDriveSeason({ baked: drives, runtime, compiledCurrent: current, current: nextCurrent });
  assert.equal(value.checkedAt, drives.checkedAt);
  assert.equal(value.attemptedAt, attemptedAt);
  assert.equal(value.status, 'retained');
  assert.deepEqual(value.games[nextId], runtime.games[nextId]);
  assert.equal(value.pendingGameIds.includes(nextId), false);
});

test('same-game published drives survive newer compiled rows, including mixed asset-null editions', () => {
  const runtime = publishedDrives();
  runtime.games[id] = runtime.games[id].map((row) => [...row]);
  runtime.games[id][0][3] = 41;
  const newer = selectDriveSeason({ baked: { ...drives, checkedAt: attemptedAt }, runtime, compiledCurrent: current, current: nextCurrent });
  assert.equal(newer.games[id][0][3], 41);
  const equal = selectDriveSeason({ baked: drives, runtime: { ...runtime, checkedAt: drives.checkedAt, status: 'retained', attemptedAt }, compiledCurrent: current, current: nextCurrent });
  assert.equal(equal.games[id][0][3], 41);
  assert.equal(newer.checkedAt, checkedAt);
});

test('a failed drive check preserves the newest good content and honest success and attempt clocks', () => {
  const baked = { ...drives, checkedAt: compiledAt };
  const runtime = { ...publishedDrives(), status: 'retained', attemptedAt };
  const value = selectDriveSeason({ baked, runtime, compiledCurrent: current, current: nextCurrent });
  assert.equal(value.status, 'retained');
  assert.equal(value.checkedAt, checkedAt);
  assert.equal(value.attemptedAt, attemptedAt);
  assert.deepEqual(value.games[id], drives.games[id]);
});

test('score and date corrections withhold both compiled and runtime old charts until re-extracted', () => {
  const changed = { ...nextCurrent, schedule: nextCurrent.schedule.map((game) => game.id === id ? { ...game, jetsScore: 18 } : game.id === nextId ? { ...game, date: '2026-10-19' } : game) };
  const value = selectDriveSeason({ baked: drives, runtime: publishedDrives(), compiledCurrent: current, current: changed });
  assert.equal(value.games[id], undefined);
  assert.equal(value.games[nextId], undefined);
  assert.ok(value.pendingGameIds.includes(id));
  assert.ok(value.pendingGameIds.includes(nextId));
  assert.deepEqual(value.games['2026_04_NYJ_CHI'], drives.games['2026_04_NYJ_CHI']);
  const compiledValue = selectDriveSeason({ baked: drives, compiledCurrent: current, current: changed });
  assert.equal(compiledValue.games[id], undefined);
});

test('a game without provider drive rows remains pending; an unconfirmed final cannot keep old rows', () => {
  const value = selectDriveSeason({ baked: drives, compiledCurrent: current, current: nextCurrent });
  assert.equal(value.games[nextId], undefined);
  assert.ok(value.pendingGameIds.includes(nextId));
  const unconfirmed = { ...current, schedule: current.schedule.map((game) => game.id === id ? { ...game, status: 'scheduled', jetsScore: null, oppScore: null, outcome: null } : game) };
  assert.equal(selectDriveSeason({ baked: drives, compiledCurrent: current, current: unconfirmed }).games[id], undefined);
});

test('invalid or unrelated runtime drives fall back to verified compiled evidence', () => {
  for (const runtime of [{ ...publishedDrives(), source: 'https://invalid.example/drives' }, { ...publishedDrives(), finals: {} }, { ...publishedDrives(), season: 2025 }]) {
    const value = selectDriveSeason({ baked: drives, runtime, compiledCurrent: current, current });
    assert.equal(value.checkedAt, drives.checkedAt);
    assert.deepEqual(value.games[id], drives.games[id]);
  }
  assert.equal(selectDriveSeason({ baked: null, runtime: null, compiledCurrent: current, current }), null);
});

test('new history records the newly published starter and keeps historical rows untouched', () => {
  const runtime = publishedHistory();
  const before = JSON.stringify(runtime);
  const value = selectLeagueHistory({ baked: history, runtime, current: nextCurrent });
  assert.equal(value.checkedAt, checkedAt);
  assert.deepEqual(value.games.find((game) => game.id === nextId).qb, { id: '00-0030565', name: 'Verified test starter' });
  assert.deepEqual(value.games.find((game) => game.season === 1999), history.games.find((game) => game.season === 1999));
  assert.equal(JSON.stringify(runtime), before);
  assert.equal(selectLeagueHistory({ baked: null, runtime, current: nextCurrent }).checkedAt, checkedAt);
});

test('newer complete compiled history permits an explicit starter correction and records a later failed attempt', () => {
  const baked = { ...publishedHistory(), checkedAt: compiledAt, attemptedAt: compiledAt, games: publishedHistory().games.map((game) => game.id === nextId
    ? { ...game, qb: { id: '00-0033873', name: 'Corrected test starter' } } : game) };
  const value = selectLeagueHistory({ baked, runtime: { ...publishedHistory(), status: 'retained', attemptedAt }, current: nextCurrent });
  assert.equal(value.checkedAt, baked.checkedAt);
  assert.equal(value.attemptedAt, attemptedAt);
  assert.equal(value.status, 'retained');
  assert.equal(value.games.find((game) => game.id === nextId).qb.name, 'Corrected test starter');
});

test('newer one-row compiled data cannot replace a verified 26-row runtime chart', () => {
  const runtime = { ...compiled(), checkedAt, attemptedAt: checkedAt, asset: { url: drives.source, etag: '"terminal-verified"', lastModified: checkedAt, contentLength: 250000 } };
  assert.equal(runtime.games[id].length, 26);
  const baked = { ...drives, checkedAt: attemptedAt, games: { ...drives.games, [id]: drives.games[id].slice(0, 1) } };
  for (const asset of [runtime.asset, null]) {
    const value = selectDriveSeason({ baked, runtime: { ...runtime, asset }, compiledCurrent: current, current });
    assert.equal(value.games[id].length, 26);
    assert.equal(value.checkedAt, checkedAt);
    assert.deepEqual(value.asset, asset);
  }
});

test('compiled-only witnessed games join runtime evidence with retained status and its original clock', () => {
  const runtime = compiled();
  delete runtime.games[id]; delete runtime.finals[id]; runtime.pendingGameIds.push(id);
  const value = selectDriveSeason({ baked: { ...drives, checkedAt: attemptedAt }, runtime, compiledCurrent: current, current });
  assert.deepEqual(value.games[id], drives.games[id]);
  assert.equal(value.checkedAt, runtime.checkedAt);
  assert.equal(value.attemptedAt, attemptedAt);
  assert.equal(value.status, 'retained');
  assert.equal(value.asset, null);
});

test('a newer compiled history losing one of 466 known finals retains the complete prior history and playoff table', () => {
  const runtime = { ...history, checkedAt, attemptedAt: checkedAt, status: 'ready', games: history.games.map((game) => game.status === 'scheduled'
    ? { ...game, status: 'final', jetsScore: 10, oppScore: 7, outcome: 'win', qb: null } : game) };
  assert.equal(runtime.games.filter((game) => game.status === 'final').length, 466);
  const baked = { ...runtime, checkedAt: attemptedAt, attemptedAt, games: runtime.games.filter((game) => game.id !== nextId), playoffsByWins: { seasons: [], rows: [] } };
  assert.equal(baked.games.filter((game) => game.status === 'final').length, 465);
  const value = selectLeagueHistory({ baked, runtime, current });
  assert.equal(value.games.filter((game) => game.status === 'final').length, 466);
  assert.deepEqual(value.playoffsByWins, runtime.playoffsByWins);
  assert.equal(value.checkedAt, checkedAt);
  assert.equal(value.attemptedAt, attemptedAt);
  assert.equal(value.status, 'retained');
});

test('a newer compiled same-result final with a blank starter keeps the prior known starter', () => {
  const runtime = publishedHistory();
  const baked = { ...runtime, checkedAt: attemptedAt, attemptedAt, games: runtime.games.map((game) => game.id === nextId ? { ...game, qb: null } : game) };
  const value = selectLeagueHistory({ baked, runtime, current: nextCurrent });
  assert.deepEqual(value.games.find((game) => game.id === nextId).qb, runtime.games.find((game) => game.id === nextId).qb);
  assert.equal(value.checkedAt, checkedAt);
  assert.equal(value.status, 'retained');
  const first = selectLeagueHistory({ baked: history, runtime: { ...baked, checkedAt: clock(15), attemptedAt: clock(15) }, current: nextCurrent });
  assert.equal(first.games.find((game) => game.id === nextId).qb, null);
  assert.equal(first.status, 'ready');
});

test('a compiled score correction cannot relabel retained old drive rows with the new score', () => {
  const corrected = { ...current, checkedAt: attemptedAt, schedule: current.schedule.map((game) => game.id === id ? { ...game, jetsScore: 20 } : game) };
  const value = selectDriveSeason({ baked: drives, runtime: compiled(), compiledCurrent: corrected, current: corrected });
  assert.equal(value.games[id], undefined);
  assert.equal(value.finals[id], undefined);
  assert.ok(value.pendingGameIds.includes(id));
});

test('an invalid runtime history falls back; a corrected current final cannot reuse an older starter', () => {
  const value = selectLeagueHistory({ baked: history, runtime: { ...publishedHistory(), source: 'https://invalid.example/history' }, current });
  assert.equal(value.checkedAt, history.checkedAt);
  const changed = { ...nextCurrent, schedule: nextCurrent.schedule.map((game) => game.id === nextId ? { ...game, jetsScore: 21 } : game) };
  const corrected = selectLeagueHistory({ baked: history, runtime: publishedHistory(), current: changed });
  assert.equal(corrected.games.find((game) => game.id === nextId).qb, null);
  assert.deepEqual(corrected.games.find((game) => game.id === id).qb, history.games.find((game) => game.id === id).qb);
  assert.equal(selectLeagueHistory({ baked: null, runtime: null, current }), null);
});
