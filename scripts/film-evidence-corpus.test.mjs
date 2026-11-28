import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, access, readdir, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import {
  ACTION_TYPES, acquire, ingest, inspectSource, json, putObject, query, selectAssets, sha256,
  sqlString, validateManifest, verifyObject,
} from './film-evidence-corpus.mjs';

const PBP_SCHEMA = {
  game_id: 'VARCHAR', play_id: 'DOUBLE', desc: 'VARCHAR', play_type: 'VARCHAR',
  season: 'INTEGER', home_team: 'VARCHAR', away_team: 'VARCHAR', game_end: 'INTEGER',
  total_home_score: 'INTEGER', total_away_score: 'INTEGER', home_score: 'INTEGER',
  away_score: 'INTEGER', game_date: 'DATE', home_wp: 'DOUBLE', passer_player_id: 'VARCHAR',
};
const SCHEDULE_SCHEMA = { game_id: 'VARCHAR', season: 'INTEGER', home_score: 'INTEGER', away_score: 'INTEGER' };
const valueSql = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : sqlString(value);
const row = (game_id, play_id, extra = {}) => ({
  game_id, play_id, desc: 'A source description retained verbatim.', play_type: 'pass',
  season: 2025, home_team: 'NYJ', away_team: 'PIT', game_end: 0,
  total_home_score: 24, total_away_score: 21, home_score: 24, away_score: 21,
  game_date: '2025-09-07', home_wp: 0.5, passer_player_id: '00-0031111', ...extra,
});
const scheduled = (game_id, extra = {}) => ({ game_id, season: 2025, home_score: 24, away_score: 21, ...extra });

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-film-evidence-test-'));
  const instance = await DuckDBInstance.create(':memory:', { threads: '1', memory_limit: '128MB' });
  const db = await instance.connect();
  t.after(async () => { db.closeSync(); instance.closeSync(); await rm(root, { recursive: true, force: true }); });
  let sequence = 0;
  async function parquet(schema, rows) {
    const name = `fixture_${sequence++}`;
    const columns = Object.keys(schema);
    await db.run(`CREATE TABLE ${name} (${columns.map(key => `"${key}" ${schema[key]}`).join(',')})`);
    if (rows.length) await db.run(`INSERT INTO ${name} VALUES ${rows.map(record => `(${columns.map(key => valueSql(record[key])).join(',')})`).join(',')}`);
    const file = path.join(root, `${name}.parquet`);
    await db.run(`COPY ${name} TO ${sqlString(file)} (FORMAT PARQUET)`);
    return file;
  }
  async function inspect(rows, scheduleRows, schema = PBP_SCHEMA) {
    const file = await parquet(schema, rows);
    const object = await putObject(root, await readFile(file), 'parquet');
    const schedule = await parquet(SCHEDULE_SCHEMA, scheduleRows);
    return inspectSource(db, root, { family: 'pbp', name: 'play_by_play_2025.parquet', season: 2025, object }, schedule);
  }
  return { root, db, parquet, inspect };
}

test('real Parquet coverage partitions actions, no-play and administrative rows without dropping source columns', async t => {
  const f = await fixture(t);
  const game = '2025_01_PIT_NYJ';
  const records = ACTION_TYPES.map((play_type, index) => row(game, index + 1, { play_type }));
  records.push(row(game, 9, { play_type: 'no_play', desc: 'Penalty; play nullified.' }));
  records.push(row(game, 10, { play_type: 'timeout', desc: 'Timeout.' }));
  records.push(row(game, 11, { play_type: null, desc: ' END OF GAME ', game_end: 0 }));
  const audit = await f.inspect(records, [scheduled(game)]);
  assert.equal(audit.rows, 11);
  assert.deepEqual(audit.coverage, {
    games: 1, uniquePlayKeys: 11, missingKeys: 0, actionRows: 8, noPlayRows: 1, otherRows: 2,
    firstGameDate: '2025-09-07', lastGameDate: '2025-09-07', terminalGames: 1,
    candidateCompleteGames: 1, incompleteGameIds: [], missingFinalGameIds: [],
  });
  assert.equal(audit.coverage.actionRows + audit.coverage.noPlayRows + audit.coverage.otherRows, audit.rows);
  assert.equal(audit.columnCount, Object.keys(PBP_SCHEMA).length);
  assert.equal(audit.playTypes.find(x => x.play_type === 'qb_kneel').rows, 1);
  assert.equal(audit.playTypes.find(x => x.play_type === 'qb_spike').rows, 1);
  await verifyObject(f.root, audit.object);
  await verifyObject(f.root, audit.schemaObject);
  const [retained] = await query(f.db, `SELECT "desc", passer_player_id FROM read_parquet(${sqlString(path.join(f.root, audit.object.path))}) WHERE play_id=1`);
  assert.deepEqual(retained, { desc: records[0].desc, passer_player_id: '00-0031111' });
});

test('game audit reconciles final schedule scores and exposes missing or incomplete games', async t => {
  const f = await fixture(t);
  const records = [
    row('complete', 1, { game_end: 1 }),
    row('score-mismatch', 1, { game_end: 1 }),
    row('no-terminal', 1),
    row('no-probability', 1, { game_end: 1, home_wp: null }),
    row('absent-from-schedule', 1, { game_end: 1 }),
  ];
  const audit = await f.inspect(records, [
    scheduled('complete'), scheduled('score-mismatch', { home_score: 25 }),
    scheduled('no-terminal'), scheduled('no-probability'), scheduled('missing-final'),
    scheduled('future', { home_score: null, away_score: null }), scheduled('other-season', { season: 2024 }),
  ]);
  assert.equal(audit.coverage.games, 5);
  assert.equal(audit.coverage.terminalGames, 4);
  assert.equal(audit.coverage.candidateCompleteGames, 1);
  assert.deepEqual(audit.coverage.missingFinalGameIds, ['missing-final']);
  assert.deepEqual(audit.coverage.incompleteGameIds, ['absent-from-schedule', 'no-probability', 'no-terminal', 'score-mismatch']);
  const games = Object.fromEntries(audit.gameAudit.map(game => [game.game_id, game]));
  assert.equal(games.complete.candidateComplete, true);
  assert.equal(games['score-mismatch'].candidateComplete, false);
  assert.equal(games['no-terminal'].hasTerminal, false);
  assert.equal(games['no-probability'].probabilityRows, 0);
  assert.equal(games['absent-from-schedule'].inSchedule, false);
  assert.notEqual(games['absent-from-schedule'].candidateComplete, true);
});

test('PBP without a game_end column uses terminal descriptions while quarter endings remain incomplete', async t => {
  const f = await fixture(t);
  const { game_end: omitted, ...schema } = PBP_SCHEMA;
  assert.equal(omitted, 'INTEGER');
  const audit = await f.inspect([
    row('complete', 1), row('complete', 2, { desc: ' END GAME ', play_type: null }),
    row('quarter-only', 1, { desc: 'END QUARTER 4', play_type: null }),
  ], [scheduled('complete'), scheduled('quarter-only')], schema);
  assert.equal(audit.columnCount, Object.keys(PBP_SCHEMA).length - 1);
  assert.equal(audit.coverage.terminalGames, 1);
  assert.equal(audit.coverage.candidateCompleteGames, 1);
  assert.deepEqual(audit.coverage.incompleteGameIds, ['quarter-only']);
});

test('invalid PBP keys and season cannot pass the Parquet audit', async t => {
  const f = await fixture(t);
  for (const [label, records] of [
    ['duplicate keys', [row('game', 1), row('game', 1)]],
    ['missing game key', [row(null, 1)]],
    ['missing play key', [row('game', null)]],
    ['null season among valid seasons', [row('game', 1), row('game', 2, { season: null })]],
    ['wrong season', [row('game', 1, { season: 2024 })]],
  ]) await t.test(label, () => assert.rejects(f.inspect(records, [scheduled('game')]), /Invalid PBP keys\/season/));
  await t.test('missing required column', async () => {
    const { play_type: omitted, ...schema } = PBP_SCHEMA;
    assert.equal(omitted, 'VARCHAR');
    await assert.rejects(f.inspect([row('game', 1)], [scheduled('game')], schema), /missing play_type/);
  });
  await t.test('downloaded HTML is not a Parquet source', async () => {
    const object = await putObject(f.root, Buffer.from('<html>download unavailable</html>'), 'parquet');
    const schedule = await f.parquet(SCHEDULE_SCHEMA, [scheduled('game')]);
    await assert.rejects(inspectSource(f.db, f.root, { family: 'pbp', name: 'bad.parquet', season: 2025, object }, schedule), /[Pp]arquet|magic bytes/);
  });
});

test('content objects reject same-length corruption, wrong sizes and path traversal', async t => {
  const f = await fixture(t);
  const object = await putObject(f.root, Buffer.from('source evidence'), 'json');
  await verifyObject(f.root, object);
  await assert.rejects(verifyObject(f.root, { ...object, bytes: object.bytes + 1 }), /checksum mismatch/);
  await assert.rejects(verifyObject(f.root, { ...object, path: '../current.json' }), /Invalid object path/);
  await writeFile(path.join(f.root, object.path), 'source evidenc!');
  await assert.rejects(verifyObject(f.root, object), /checksum mismatch/);
  await assert.rejects(putObject(f.root, Buffer.from('source evidence'), 'json'), /Corrupt existing object/);
});

test('asset selection retains annual weekly partitions and excludes aggregate/CSV duplicates', () => {
  const names = ['stats_player_week_2024.parquet', 'stats_player_week_2025.parquet',
    'stats_player_reg_2024.parquet', 'stats_player_season_2024.parquet',
    'stats_player_week_2024.csv', 'stats_player_week.parquet'];
  const release = { html_url: 'https://github.com/nflverse/nflverse-data/releases/tag/stats_player', assets: names.map((name, index) => ({
    name, id: index + 1, size: 100 + index, browser_download_url: `https://example.test/${name}`,
    updated_at: '2026-10-20T00:00:00Z', digest: `sha256:${'a'.repeat(64)}`,
  })) };
  const assets = selectAssets(release, /^stats_player_week_(\d{4})\.parquet$/, 'player_stats');
  assert.deepEqual(assets.map(asset => asset.name), names.slice(0, 2));
  assert.deepEqual(assets.map(asset => asset.season), [2024, 2025]);
  assert.equal(assets[0].expectedBytes, 100);
  assert.equal(assets[0].providerDigest, `sha256:${'a'.repeat(64)}`);
  assert.equal(assets[0].releaseUrl, release.html_url);
  const ngs = selectAssets({ assets: [{ name: 'ngs_passing.parquet' }, { name: 'ngs_passing_2025.parquet' }] }, /^ngs_(passing|receiving|rushing)\.parquet$/, 'ngs');
  assert.equal(ngs.length, 1);
  assert.equal(ngs[0].family, 'ngs_passing');
  assert.equal(ngs[0].season, null);
});

test('an existing writer lock is preserved and prevents acquisition', async t => {
  const f = await fixture(t);
  const lock = path.join(f.root, '.ingest.lock');
  await writeFile(lock, 'another writer owns this lock');
  t.mock.method(globalThis, 'fetch', () => { assert.fail('a locked ingestion must not fetch'); });
  await assert.rejects(ingest({ root: f.root, reportDir: path.join(f.root, 'reports') }), { code: 'EEXIST' });
  assert.equal(await readFile(lock, 'utf8'), 'another writer owns this lock');
});

test('failed source inventory preserves the active pointer and releases its own lock', async t => {
  const f = await fixture(t);
  const pointer = JSON.stringify({ editionId: 'previous-edition', sources: [] });
  await writeFile(path.join(f.root, 'current.json'), pointer);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ assets: [] }), { status: 200 }));
  await assert.rejects(ingest({ root: f.root, reportDir: path.join(f.root, 'reports') }), /No selected assets: pbp/);
  assert.equal(await readFile(path.join(f.root, 'current.json'), 'utf8'), pointer);
  await assert.rejects(access(path.join(f.root, '.ingest.lock')), { code: 'ENOENT' });
  await assert.rejects(access(path.join(f.root, 'current.json.tmp')), { code: 'ENOENT' });
});

const downloadSource = (bytes, extra = {}) => ({
  family: 'pbp', season: 2025, name: 'play_by_play_2025.parquet',
  url: 'https://example.test/play_by_play_2025.parquet',
  providerUpdatedAt: '2026-10-20T00:00:00Z', expectedBytes: bytes.length,
  providerDigest: `sha256:${sha256(bytes)}`, ...extra,
});
const rangeReply = (bytes, start, end, total, extra = {}) => ({
  status: 206,
  headers: new Headers({ 'content-range': `bytes ${start}-${end}/${total}`, etag: '"source-revision"', 'last-modified': 'Tue, 20 Oct 2026 00:00:00 GMT' }),
  arrayBuffer: async () => bytes,
  ...extra,
});

test('range downloads retry truncated and failed bodies, then reuse a verified receipt without changing fetch time', async t => {
  const f = await fixture(t);
  const chunkSize = 1024 * 1024;
  const bytes = Buffer.alloc(chunkSize + 17, 42);
  bytes[chunkSize] = 99;
  const source = downloadSource(bytes);
  const attempts = new Map();
  let noNetwork = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(noNetwork, false, 'receipt reuse must not access the network');
    const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
    assert.ok(match, 'acquisition must send an exact byte range');
    const start = Number(match[1]), end = Number(match[2]);
    assert.equal(url, `${source.url}?ajetsfan_range=${start}`);
    attempts.set(start, (attempts.get(start) ?? 0) + 1);
    const body = bytes.subarray(start, end + 1);
    if (start === 0 && attempts.get(start) === 1) return rangeReply(body.subarray(0, -1), start, end, bytes.length);
    if (start === 0 && attempts.get(start) === 2) return rangeReply(body, start, end, bytes.length, {
      arrayBuffer: async () => { throw new Error('body interrupted after response headers'); },
    });
    return rangeReply(body, start, end, bytes.length);
  });
  const acquired = await acquire(f.root, source);
  assert.deepEqual([...attempts].sort((a, b) => a[0] - b[0]), [[0, 3], [chunkSize, 1]]);
  assert.equal(acquired.transport, 'downloaded');
  assert.equal(acquired.etag, '"source-revision"');
  assert.ok(Number.isFinite(Date.parse(acquired.fetchedAt)));
  assert.equal(acquired.object.sha256, sha256(bytes));
  assert.deepEqual(await readFile(path.join(f.root, acquired.object.path)), bytes);
  assert.deepEqual(await readdir(path.join(f.root, 'incoming')), []);
  const receipts = await readdir(path.join(f.root, 'receipts'));
  assert.equal(receipts.length, 1);
  const persisted = JSON.parse(await readFile(path.join(f.root, 'receipts', receipts[0]), 'utf8'));
  assert.equal(persisted.fetchedAt, acquired.fetchedAt);
  noNetwork = true;
  const reused = await acquire(f.root, source);
  assert.equal(reused.transport, 'verified-local-object');
  assert.equal(reused.fetchedAt, acquired.fetchedAt);
  assert.deepEqual(reused.object, acquired.object);
  assert.equal(attempts.get(0), 3);
});

test('mismatched range responses exhaust bounded retries without publishing a receipt', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('complete source bytes');
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return rangeReply(bytes, 0, bytes.length - 1, bytes.length, { status: 200 });
  });
  await assert.rejects(acquire(f.root, downloadSource(bytes)), /Invalid range response 200/);
  assert.equal(attempts, 4);
  await assert.rejects(access(path.join(f.root, 'receipts')), { code: 'ENOENT' });
});

test('provider digest mismatch cannot publish a receipt or content object', async t => {
  const f = await fixture(t);
  const expected = Buffer.from('verified original');
  const wrong = Buffer.from('tampered original');
  assert.equal(wrong.length, expected.length);
  t.mock.method(globalThis, 'fetch', async () => rangeReply(wrong, 0, wrong.length - 1, wrong.length));
  await assert.rejects(acquire(f.root, downloadSource(expected)), /Provider digest mismatch/);
  await assert.rejects(access(path.join(f.root, 'receipts')), { code: 'ENOENT' });
  await assert.rejects(access(path.join(f.root, 'objects')), { code: 'ENOENT' });
});

test('a failed digest does not trap the next acquisition on the same rejected partial bytes', async t => {
  const f = await fixture(t);
  const expected = Buffer.from('verified original');
  const wrong = Buffer.from('tampered original');
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    const bytes = attempts++ === 0 ? wrong : expected;
    return rangeReply(bytes, 0, bytes.length - 1, bytes.length);
  });
  const source = downloadSource(expected);
  await assert.rejects(acquire(f.root, source), /Provider digest mismatch/);
  const acquired = await acquire(f.root, source);
  assert.equal(attempts, 2, 'rejected partial bytes must be fetched again');
  assert.equal(acquired.object.sha256, sha256(expected));
  await verifyObject(f.root, acquired.object);
});

test('same-size tampering of a retained partial is caught by the provider digest before creating a receipt', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('verified original');
  const source = downloadSource(bytes);
  const key = sha256(json({ url: source.url, updated: source.providerUpdatedAt, bytes: source.expectedBytes, digest: source.providerDigest }));
  await mkdir(path.join(f.root, 'incoming'));
  const partial = path.join(f.root, 'incoming', `${key}.0.part`);
  await writeFile(partial, Buffer.alloc(bytes.length, 0));
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return rangeReply(bytes, 0, bytes.length - 1, bytes.length);
  });
  await assert.rejects(acquire(f.root, source), /Provider digest mismatch/);
  assert.equal(attempts, 0, 'the retained partial must fail the final provider checksum');
  await assert.rejects(access(path.join(f.root, 'receipts')), { code: 'ENOENT' });
  await assert.rejects(access(partial), { code: 'ENOENT' });
  await acquire(f.root, source);
  assert.equal(attempts, 1, 'invalidated partials must be replaceable from the source');
});

test('recovery of a provider-verified object does not invent a missing fetch timestamp', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('verified original');
  await putObject(f.root, bytes, 'parquet');
  t.mock.method(globalThis, 'fetch', () => { assert.fail('a provider-verified object needs no network recovery'); });
  const recovered = await acquire(f.root, downloadSource(bytes));
  assert.equal(recovered.transport, 'recovered-verified-object');
  assert.equal(recovered.fetchedAt, null);
  assert.ok(Number.isFinite(Date.parse(recovered.persistedAt)));
  assert.match(recovered.fetchTimeEvidence, /filesystem evidence only/);
  await verifyObject(f.root, recovered.object);
});

test('a corrupted cached object is rejected before its receipt can be reused', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('verified original');
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return rangeReply(bytes, 0, bytes.length - 1, bytes.length);
  });
  const source = downloadSource(bytes);
  const acquired = await acquire(f.root, source);
  await writeFile(path.join(f.root, acquired.object.path), Buffer.alloc(bytes.length, 0));
  await assert.rejects(acquire(f.root, source), /Object checksum mismatch/);
  assert.equal(attempts, 1, 'a checksum failure must not silently accept or replace cached evidence');
});

test('mutable sources without provider version evidence are fetched again instead of reusing a URL-only receipt', async t => {
  const f = await fixture(t);
  const bodies = [Buffer.from('game_id,home_score\n2025_01,7\n'), Buffer.from('game_id,home_score\n2025_01,9\n')];
  let attempts = 0;
  const source = {
    family: 'schedule', name: 'games.csv', url: 'https://example.test/games.csv', providerUpdatedAt: null,
  };
  t.mock.method(globalThis, 'fetch', async () => new Response(bodies[attempts++], { status: 200 }));
  const first = await acquire(f.root, source);
  const second = await acquire(f.root, source);
  assert.equal(attempts, 2, 'a mutable URL without version evidence must be revalidated');
  assert.notEqual(second.object.sha256, first.object.sha256);
  assert.deepEqual(await readFile(path.join(f.root, second.object.path)), bodies[1]);
});

const sealManifest = content => ({ ...content, editionId: sha256(json(content)) });
const manifestFixture = () => ({
  schemaVersion: 1,
  sources: [{
    family: 'pbp', url: 'https://example.test/play_by_play_2025.parquet',
    object: { path: `objects/${'a'.repeat(64)}.parquet`, sha256: 'a'.repeat(64), bytes: 123 },
    schemaObject: { path: `objects/${'b'.repeat(64)}.json`, sha256: 'b'.repeat(64), bytes: 45 },
  }],
  inventories: [],
});

test('manifest checksum binds the edition and rejects unsafe descriptors even after resealing', () => {
  const content = manifestFixture();
  const manifest = sealManifest(content);
  assert.equal(validateManifest(manifest), manifest);
  assert.throws(() => validateManifest({ ...manifest, completedAt: 'changed without resealing' }), /edition checksum mismatch/);
  const revised = sealManifest({ ...content, completedAt: '2026-10-20T00:00:00Z' });
  assert.notEqual(revised.editionId, manifest.editionId);
  assert.equal(validateManifest(revised), revised);
  for (const descriptor of [
    { ...content.sources[0].object, path: '../private.parquet' },
    { ...content.sources[0].object, path: `/objects/${'a'.repeat(64)}.parquet` },
    { ...content.sources[0].object, sha256: 'c'.repeat(64) },
    { ...content.sources[0].object, bytes: -1 },
    { ...content.sources[0].object, bytes: 1.5 },
  ]) {
    const changed = manifestFixture();
    changed.sources[0].object = descriptor;
    assert.throws(() => validateManifest(sealManifest(changed)), /Invalid manifest object descriptor/);
  }
  const duplicate = manifestFixture();
  duplicate.sources.push({ ...duplicate.sources[0] });
  assert.throws(() => validateManifest(sealManifest(duplicate)), /Duplicate source URL/);
});
