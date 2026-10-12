import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cronAuthorized } from '../src/lib/cron-authorized.mjs';
import { liveMediaEnvelope, mediaPolicyFingerprint, validateLiveMediaEnvelope } from '../src/lib/media-live-envelope.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/data/media.json', import.meta.url), 'utf8'));
const start = new Date(catalog.checkedAt), finish = new Date(start.getTime() + 10_000);
const policy = mediaPolicyFingerprint(catalog, [{ id: 'sample', pathname: /^\/sports\//, outletId: 'reporting' }]);

test('runtime policies include source path, publisher and channel discovery restrictions', () => {
  for (const source of [{ pathname: /^\/video\// }, { excludedPathname: /^\/betting\// }, { outletId: 'other' }, { youtubeTab: 'streams' }]) {
    assert.notEqual(mediaPolicyFingerprint(catalog, [{ id: 'sample', pathname: /^\/sports\//, outletId: 'reporting', ...source }]), policy);
  }
});

test('two previous generations preserve artwork without reviving another editorial policy', () => {
  let envelope = null;
  for (let i = 0; i < 5; i++) envelope = liveMediaEnvelope(catalog, envelope, policy, start, finish);
  assert.equal(envelope.previousCollections.length, 2);
  assert.equal(liveMediaEnvelope(catalog, envelope, 'f'.repeat(64), start, finish).previousCollections.length, 0);
});

test('invalid live content, generation dates and unbounded history are rejected', () => {
  const envelope = liveMediaEnvelope(catalog, null, policy, start, finish);
  for (const value of [{ ...envelope, policyFingerprint: 'invalid' }, { ...envelope, durationMs: -1 },
    { ...envelope, updatedAt: 'invalid' }, { ...envelope, collection: { ...catalog, items: [{ id: 'invalid' }] } },
    { ...envelope, previousCollections: Array(3).fill(catalog) }]) assert.throws(() => validateLiveMediaEnvelope(value));
});

test('cron authentication fails closed for unset, incorrect and equal-character multi-byte headers', () => {
  assert.equal(cronAuthorized('example', 'Bearer example'), true);
  for (const input of [null, undefined, '', 'example', 'Bearer invalid', 'Bearer ééééééé', 'Bearer example ']) assert.equal(cronAuthorized('example', input), false);
  assert.equal(cronAuthorized(undefined, 'Bearer undefined'), false);
  assert.equal(cronAuthorized('', 'Bearer '), false);
});
