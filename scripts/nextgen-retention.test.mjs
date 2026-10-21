import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { refreshNextGen } from './refresh-season-rankings.mjs';
import { buildNextGenCollection, NEXTGEN_SOURCES } from './nextgen-stats.mjs';
import * as nextgen from '../src/lib/nextgen-stats.ts';
const { isNextGenCollection } = nextgen;

const checkedAt = '2026-10-18T12:41:01.150Z';
const now = new Date('2026-10-20T23:00:00Z');
const csv = (rows) => [Object.keys(rows[0]).join(','), ...rows.map((row) => Object.values(row).join(','))].join('\n');
function inputs({ gap = null, changed = false } = {}) {
  return Object.fromEntries(['passing', 'receiving', 'rushing'].map((kind) => {
    const rows = [2020, 2026].filter((year) => !([kind, 'season'].includes(gap) && year === 2020)).map((year) => ({ season: year, season_type: 'REG', week: 0,
      player_gsis_id: '00-0000010', player_display_name: 'Fixture Player', player_position: kind === 'passing' ? 'QB' : kind === 'receiving' ? 'WR' : 'RB', team_abbr: 'NYJ',
      ...kind === 'passing' ? { attempts: 100, avg_time_to_throw: changed ? 2.9 : 2.5 } : kind === 'receiving' ? { targets: 80, avg_separation: 2.4 } : { rush_attempts: 120, rush_yards_over_expected_per_att: -0.1 } }));
    return [`${kind}Csv`, csv(rows)];
  }));
}
function fetcher(options) {
  const data = inputs(options);
  return async (url) => {
    const kind = Object.entries(NEXTGEN_SOURCES).find(([, source]) => source === url)?.[0];
    return kind ? new Response(gzipSync(data[`${kind}Csv`])) : new Response('metadata unavailable', { status: 404 });
  };
}
async function sandbox(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-nextgen-retention-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outDir = path.join(root, 'data');
  await mkdir(outDir);
  const previous = buildNextGenCollection({ ...inputs(), checkedAt });
  const file = path.join(outDir, 'nextgen-stats.json');
  await writeFile(file, JSON.stringify(previous));
  return { outDir, previous, file };
}

test('a historical source gap retains its verified season while current measurements publish independently', async (t) => {
  const { outDir, previous, file } = await sandbox(t);
  const errors = [];
  const result = await refreshNextGen({ outDir, now, fetcher: fetcher({ gap: 'receiving', changed: true }), onError: (message) => errors.push(message) });
  const current = result.seasons.find((season) => season.year === 2026);
  const historical = result.seasons.find((season) => season.year === 2020);
  assert.equal(current.passing[0].metrics[0].value, 2.9, 'an older source gap must not freeze the current season');
  assert.equal(current.checkedAt, now.toISOString());
  assert.equal(current.status, 'ready');
  assert.equal(historical.checkedAt, checkedAt, 'retained values keep their successful source check');
  assert.equal(historical.status, 'retained');
  assert.equal(historical.attemptedAt, now.toISOString());
  assert.match(historical.retentionReason, /2020.*receiving/);
  for (const kind of ['passing', 'receiving', 'rushing']) assert.deepEqual(historical[kind], previous.seasons.find((season) => season.year === 2020)[kind]);
  assert.equal(result.checkedAt, now.toISOString());
  assert.equal(result.status, 'retained', 'collection health must continue to expose the source gap');
  assert.equal(isNextGenCollection(result), true);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), result);
  assert.equal(errors.length, 1);
  assert.equal(nextgen.nextGenSeasonCheck(result, 2020).checkedAt, checkedAt);
  assert.equal(nextgen.nextGenSeasonCheck(result, 2026).checkedAt, now.toISOString());
});

test('repeated gaps preserve the original successful check and recover without stale warning metadata', async (t) => {
  const { outDir } = await sandbox(t);
  await refreshNextGen({ outDir, now, fetcher: fetcher({ gap: 'receiving' }), onError: () => {} });
  const later = new Date(now.getTime() + 600_000);
  const retained = await refreshNextGen({ outDir, now: later, fetcher: fetcher({ gap: 'receiving' }), onError: () => {} });
  assert.equal(retained.seasons.find((season) => season.year === 2020).checkedAt, checkedAt);
  const recovered = await refreshNextGen({ outDir, now: later, fetcher: fetcher({ changed: true }), onError: () => {} });
  assert.equal(recovered.status, 'ready');
  for (const season of recovered.seasons) {
    assert.equal(season.status, 'ready');
    assert.equal(season.checkedAt, later.toISOString());
    assert.equal(season.retentionReason, undefined);
  }
});

test('an absent historical season is retained without blocking a new current season', async (t) => {
  const { outDir, previous } = await sandbox(t);
  const result = await refreshNextGen({ outDir, now, fetcher: fetcher({ gap: 'season', changed: true }), onError: () => {} });
  assert.equal(result.seasons.length, 2);
  const historical = result.seasons.find((season) => season.year === 2020);
  assert.equal(historical.checkedAt, checkedAt);
  for (const kind of ['passing', 'receiving', 'rushing']) assert.deepEqual(historical[kind], previous.seasons.find((season) => season.year === 2020)[kind]);
  assert.equal(result.seasons.find((season) => season.year === 2026).passing[0].metrics[0].value, 2.9);
});

test('complete outages retain each season at its own check and mark all seasons retained', async (t) => {
  const { outDir } = await sandbox(t);
  await refreshNextGen({ outDir, now, fetcher: fetcher({ gap: 'receiving', changed: true }), onError: () => {} });
  const later = new Date(now.getTime() + 600_000);
  const result = await refreshNextGen({ outDir, now: later, fetcher: async () => new Response('Unavailable', { status: 503 }), onError: () => {} });
  assert.equal(result.checkedAt, now.toISOString());
  assert.equal(result.seasons.find((season) => season.year === 2020).checkedAt, checkedAt);
  assert.equal(result.seasons.find((season) => season.year === 2026).checkedAt, now.toISOString());
  assert.equal(result.seasons.every((season) => season.status === 'retained'), true);
});

test('retention metadata rejects false freshness, malformed checks and ready collections hiding a gap', () => {
  const collection = buildNextGenCollection({ ...inputs(), checkedAt });
  const sample = { ...collection, status: 'retained', seasons: collection.seasons.map((season) => ({ ...season, checkedAt, status: 'retained', attemptedAt: now.toISOString(), retentionReason: 'Source gap.' })) };
  assert.equal(isNextGenCollection(sample), true);
  for (const mutate of [
    (value) => { value.seasons[0].checkedAt = 'tomorrow'; },
    (value) => { value.seasons[0].checkedAt = now.toISOString(); },
    (value) => { value.seasons[0].attemptedAt = '2026-10-17T00:00:00Z'; },
    (value) => { value.seasons[0].status = 'ready'; },
    (value) => { value.status = 'ready'; },
  ]) {
    const invalid = structuredClone(sample);
    mutate(invalid);
    assert.equal(isNextGenCollection(invalid), false);
  }
});

test('runtime and compiled collections merge per season and a later successful check clears an older gap', () => {
  const old = buildNextGenCollection({ ...inputs(), checkedAt });
  const compiled = structuredClone({ ...old, checkedAt: '2026-10-20T22:00:00.000Z', status: 'ready', seasons: old.seasons.map((season) => ({
    ...season, checkedAt: '2026-10-20T22:00:00.000Z', status: 'ready', attemptedAt: '2026-10-20T22:00:00.000Z',
  })) });
  compiled.seasons.find((season) => season.year === 2020).passing[0].metrics[0].value = 2.8;
  const runtime = { ...old, checkedAt: now.toISOString(), attemptedAt: now.toISOString(), status: 'retained', seasons: old.seasons.map((season) => ({
    ...season, checkedAt: season.year === 2020 ? checkedAt : now.toISOString(), attemptedAt: now.toISOString(),
    status: season.year === 2020 ? 'retained' : 'ready', ...(season.year === 2020 ? { retentionReason: 'Historical passing source gap.' } : {}),
  })) };
  const merged = nextgen.mergeNextGenCollections(runtime, compiled);
  const historical = merged.seasons.find((season) => season.year === 2020);
  assert.equal(historical.checkedAt, compiled.checkedAt);
  assert.equal(historical.passing[0].metrics[0].value, 2.8);
  assert.equal(historical.status, 'retained');
  assert.equal(historical.retentionReason, 'Historical passing source gap.');
  assert.equal(merged.seasons.find((season) => season.year === 2026).checkedAt, now.toISOString());
  assert.equal(merged.status, 'retained');
  const later = new Date(now.getTime() + 600_000).toISOString();
  const recovered = { ...compiled, checkedAt: later, attemptedAt: later, seasons: compiled.seasons.map((season) => ({ ...season, checkedAt: later, attemptedAt: later })) };
  const clean = nextgen.mergeNextGenCollections(merged, recovered);
  assert.equal(clean.status, 'ready');
  assert.equal(clean.seasons.every((season) => season.status === 'ready' && season.retentionReason === undefined), true);
  assert.equal(nextgen.mergeNextGenCollections(null, null), null);
});
