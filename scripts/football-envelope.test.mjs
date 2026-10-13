import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { footballEnvelope, footballRevision, validateFootballEnvelope } from '../src/lib/football-envelope.mjs';
import { editionHealth } from '../src/lib/edition-health.ts';

const read = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const current = await read('current'), coverage = await read('coverage');
const edition = { schemaVersion: 1, current, coverage, live: null,
  scheduleCheck: { source: current.sources.schedule, status: 'ready', checkedAt: current.checkedAt, attemptedAt: current.checkedAt } };

test('a publication validates every feed and cannot claim a future successful score check', () => {
  const started = new Date(current.checkedAt), completed = new Date(started.getTime() + 1000);
  assert.equal(footballEnvelope(edition, started, completed).durationMs, 1000);
  assert.throws(() => validateFootballEnvelope({ version: 1, edition, updatedAt: new Date(started.getTime() - 1000).toISOString(), durationMs: 1000 }));
  assert.throws(() => footballEnvelope({ ...edition, coverage: { ...coverage, season: coverage.season - 1 } }, started, completed));
});

test('routine successful checks do not refresh an open reader but content and source failures do', () => {
  const advanced = structuredClone(edition);
  advanced.current.checkedAt = '2026-10-13T17:30:00.000Z';
  advanced.scheduleCheck.checkedAt = advanced.scheduleCheck.attemptedAt = advanced.current.checkedAt;
  for (const name of ['news', 'roster', 'stats']) advanced.coverage[name].checkedAt = advanced.coverage[name].attemptedAt = advanced.current.checkedAt;
  assert.equal(footballRevision(advanced), footballRevision(edition));
  advanced.coverage.news.status = 'retained';
  assert.notEqual(footballRevision(advanced), footballRevision(edition));
  assert.notEqual(footballRevision(edition, 'new-analysis'), footballRevision(edition, 'old-analysis'));
});

test('game-time source health cannot be concealed by a recent page or collection timestamp', () => {
  const now = Date.parse('2026-10-13T17:30:00.000Z');
  const checkedAt = new Date(now - 4 * 60_000).toISOString();
  const copy = { ...edition, live: { status: 'ready', checkedAt }, current: { ...current, checkedAt: new Date(now).toISOString() } };
  assert.equal(editionHealth(copy.current, coverage, null, now, {}, { edition: copy, active: true }).feeds.results.status, 'overdue');
  assert.equal(editionHealth(copy.current, coverage, null, now, {}, { edition: copy, active: false }).feeds.results.status, 'ready');
  copy.live = { status: 'retained', checkedAt: new Date(now).toISOString() };
  assert.equal(editionHealth(copy.current, coverage, null, now, {}, { edition: copy, active: true }).feeds.results.status, 'retained');
});
