import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';

// Exercise the real TypeScript route without starting a server or any provider refresh.
function load(file, stubs = {}, globals = {}) {
  const filename = path.resolve(file), fixtureModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name) => {
    if (name in stubs) return stubs[name];
    if (name === 'server-only') return {};
    const target = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(filename), name);
    if (target.endsWith('.json')) return JSON.parse(readFileSync(target, 'utf8'));
    return load(`${target}.ts`, stubs, globals);
  };
  vm.runInNewContext(source, { module: fixtureModule, exports: fixtureModule.exports, require, Response, Request, Date, Intl, console, TextEncoder, TextDecoder, ...globals }, { filename });
  return fixtureModule.exports;
}
const day = '2026-10-20';
const game = JSON.parse(readFileSync('public/data/games.json', 'utf8'))[0];
const route = () => load('src/app/api/puzzle/route.ts', { '@/lib/load-puzzle': { loadPuzzle: async () => ({ pool: [game], game }) } });
const post = (body) => route().POST(new Request('http://localhost/api/puzzle', { method: 'POST', body: JSON.stringify(body) }));

test('puzzle request rejects null, primitives and malformed guess values instead of crashing', async () => {
  for (const body of [null, false, 3, 'bad', [], {}, { day, guesses: [null] }, { day, guesses: [{ opponent: 'NE', season: 2 }] }]) {
    const response = await post(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    const error = await response.json();
    assert.equal(typeof error.error, 'string');
    assert.equal(typeof error.action, 'string');
  }
});

test('puzzle dates are real calendar dates, bounded and never in the future', async () => {
  for (const value of ['2026-00-00', '2026-02-30', '2025-02-29', '0000-01-01', '1998-12-31', '2999-01-01']) {
    assert.equal((await post({ day: value, guesses: [] })).status, 400, value);
  }
  const response = await post({ day, guesses: [] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { verdicts: [], clues: [], answer: null });
});

test('a request body is bounded before parsing, without trusting content-length', async () => {
  const response = await route().POST(new Request('http://localhost/api/puzzle', { method: 'POST', body: JSON.stringify({ day, guesses: [], extra: 'x'.repeat(5000) }) }));
  assert.equal(response.status, 413);
});

test('runtime archive additions cannot change an existing daily puzzle or its pool', async () => {
  const games = JSON.parse(readFileSync('public/data/games.json', 'utf8'));
  let runtime = games.slice(0, -1);
  const loader = load('src/lib/load-puzzle.ts', { './load-games': { loadGames: async () => runtime, loadCurrent: async () => null } });
  const first = await loader.loadPuzzle(day);
  runtime = games;
  const second = await loader.loadPuzzle(day);
  assert.equal(second.pool.length, first.pool.length);
  assert.equal(second.game.id, first.game.id);
  assert.ok(second.pool.every((entry) => entry.season <= 2025));
});

test('the chart has a useful, spoiler-free quarter summary and marked second-half point', () => {
  const { puzzleChartSummary } = load('src/lib/puzzle.ts');
  const rows = puzzleChartSummary([{ q: 1, wp: 0.3 }, { q: 1, wp: 0.6 }, { q: 3, wp: 0.15 }, { q: 4, wp: 0.9 }], 'miracle');
  assert.match(rows.join(' '), /Quarter 1.*30%.*60%/);
  assert.match(rows.join(' '), /Lowest after halftime.*15%.*quarter 3/i);
});

test('a storage clear never resurrects a tab memory copy, while unavailable storage still works', () => {
  const values = new Map();
  let unavailable = false;
  const localStorage = { getItem: (key) => { if (unavailable) throw Error('blocked'); return values.get(key) ?? null; },
    setItem: (key, value) => { if (unavailable) throw Error('blocked'); values.set(key, value); } };
  const storage = load('src/components/puzzle-storage.ts', { react: {} }, { localStorage });
  storage.writeStore('day', { guesses: [] });
  assert.ok(storage.readRaw('day'));
  values.delete('day');
  assert.equal(storage.readRaw('day'), null);
  unavailable = true;
  storage.writeStore('day', { guesses: ['memory only'] });
  assert.match(storage.readRaw('day'), /memory only/);
});

test('the published frozen series cannot silently change during a data or deployment refresh', () => {
  const source = readFileSync('src/lib/puzzle-archive-v1.json');
  assert.equal(createHash('sha256').update(source).digest('hex'), '7e7eb580b0fb42d1051206b760d5264a3c24db64e0c64e013630100d286d557d', 'Keep v1 immutable; add a future-effective version instead');
  const archive = JSON.parse(source);
  assert.equal(archive.rows.length, 448);
  assert.equal(new Set(archive.rows.map((row) => row[0])).size, 448);
});
