import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gameAgreesWithFootball, checkedRuntimeCurve } from '../src/lib/football-evidence.mjs';

const read = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const current = await read('current'), games = await read('games');
const game = games.find((entry) => entry.id === current.latestAnalyzedGameId), points = await read(`curves/${game.id}`);
const pathname = `analysis/v1/curves/${createHash('sha256').update(JSON.stringify(points)).digest('hex')}.json`;

test('score correction or withdrawal prevents stale compiled analysis and chart fallback', () => {
  assert.equal(gameAgreesWithFootball(game, current), true);
  for (const change of [{ status: 'scheduled' }, { jetsScore: game.jetsScore + 1 }, { date: '2026-10-10' }, { atHome: !game.atHome }]) {
    const updated = { ...current, schedule: current.schedule.map((fixture) => fixture.id === game.id ? { ...fixture, ...change } : fixture) };
    assert.equal(gameAgreesWithFootball(game, updated), false);
  }
  assert.equal(gameAgreesWithFootball(games.find((entry) => entry.season !== current.season), current), true);
});

test('private chart data must validate and match the exact immutable edition hash', () => {
  assert.equal(checkedRuntimeCurve(points, pathname, game), points);
  const altered = structuredClone(points); altered[0].wp = altered[0].wp === 0 ? 0.1 : 0;
  assert.throws(() => checkedRuntimeCurve(altered, pathname, game), /immutable curve/);
  assert.throws(() => checkedRuntimeCurve([{ ...points[0], wp: 2 }], pathname, game), /Invalid advanced/);
});
