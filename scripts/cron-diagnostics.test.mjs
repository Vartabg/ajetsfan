import test from 'node:test';
import assert from 'node:assert/strict';
import { cronFailure, cronFailureCode, cronOutcome, failureReason, reasonCollector } from '../src/lib/cron-diagnostics.mjs';
import { FootballRefreshCoordinatorError } from '../src/lib/football-refresh-coordinator.mjs';

const named = (name, message = 'private-provider said no') => Object.assign(new Error(message), { name });

test('a failure is named by its class or HTTP status, never by provider text', () => {
  assert.equal(failureReason(named('TimeoutError')), 'timeout');
  assert.equal(failureReason(named('AbortError')), 'timeout');
  assert.equal(failureReason(new Error('Coverage HTTP 404: https://private-provider.example/roster.csv')), 'http_404');
  assert.equal(failureReason(new Error('Statistics HTTP 503')), 'http_503');
  assert.equal(failureReason(new SyntaxError('private-provider <html>')), 'unreadable');
  assert.equal(failureReason(new TypeError('fetch failed')), 'network_or_type');
  assert.equal(failureReason(new Error('Roster snapshot regressed to an earlier week')), 'rejected');
  assert.equal(failureReason(new Error('HTTP 999 private-provider')), 'rejected');
  for (const value of [null, undefined, 'private-provider', 7, {}]) assert.equal(failureReason(value), 'rejected');
});

test('the collector keeps only short fixed codes, once each, and never the message', () => {
  const collector = reasonCollector();
  collector.onError('private-provider text', { source: 'live_summary', reason: 'stat_row' });
  collector.onError('private-provider text', { source: 'live_summary', reason: 'stat_row' });
  collector.onError('private-provider text', { source: 'stats', reason: 'http_404' });
  collector.onError('private-provider text');
  collector.onError('private-provider text', { source: 'stats', reason: 'Coverage HTTP 404: https://private-provider.example' });
  collector.onError('private-provider text', { source: 'Private Provider', reason: 'timeout' });
  collector.onError('private-provider text', { source: 'stats', reason: 404 });
  const result = collector.attach({ status: 'degraded', failedSourceIds: ['live', 'stats'] });
  assert.deepEqual(result, { status: 'degraded', failedSourceIds: ['live', 'stats'],
    reasons: [{ source: 'live_summary', reason: 'stat_row' }, { source: 'stats', reason: 'http_404' }] });
  assert.doesNotMatch(JSON.stringify(result), /private-provider/i);
});

test('a clean refresh is returned untouched and a noisy one is capped', () => {
  const clean = { status: 'published' };
  assert.equal(reasonCollector().attach(clean), clean);
  const noisy = reasonCollector();
  for (let index = 0; index < 40; index += 1) noisy.onError('x', { source: `source_${index}`, reason: 'timeout' });
  assert.equal(noisy.attach({}).reasons.length, 12);
});

test('a thrown refresh is reduced to one fixed code', () => {
  assert.equal(cronFailureCode(new FootballRefreshCoordinatorError('storage_unavailable')), 'storage_unavailable');
  assert.equal(cronFailureCode(new FootballRefreshCoordinatorError('publisher_refresh_failed')), 'publisher_refresh_failed');
  assert.equal(cronFailureCode(new Error('Hosted football refresh is not configured')), 'not_configured');
  assert.equal(cronFailureCode(new Error('Hosted media refresh is not configured')), 'not_configured');
  assert.equal(cronFailureCode(Object.assign(named('MediaRefreshCoordinatorError'), { code: 'private-provider text' })), 'unexpected');
  assert.equal(cronFailureCode(Object.assign(new Error('private-provider'), { code: 'storage_unavailable' })), 'unexpected');
  for (const value of [null, undefined, 'private-provider', new Error('private-provider is not configured')]) assert.equal(cronFailureCode(value), 'unexpected');
});

test('the failure line carries the code and class name and nothing from the provider', () => {
  assert.deepEqual(JSON.parse(cronFailure('hosted-football-refresh', new FootballRefreshCoordinatorError('invalid_snapshot'))),
    { event: 'hosted-football-refresh', status: 'unavailable', code: 'invalid_snapshot', errorName: 'FootballRefreshCoordinatorError' });
  const leaky = cronFailure('hosted-media-refresh', named('private-provider says hi', 'private-provider token=abc'));
  assert.deepEqual(JSON.parse(leaky), { event: 'hosted-media-refresh', status: 'unavailable', code: 'unexpected', errorName: 'Error' });
  assert.deepEqual(JSON.parse(cronFailure('hosted-analysis-refresh', new TypeError('private-provider'))),
    { event: 'hosted-analysis-refresh', status: 'unavailable', code: 'unexpected', errorName: 'TypeError' });
});

test('a run that kept old data logs as a warning; a healthy run stays informational', () => {
  for (const status of ['published', 'fresh', 'busy', 'superseded']) assert.equal(cronOutcome('hosted-football-refresh', { status }).level, 'info');
  const degraded = cronOutcome('hosted-football-refresh', { status: 'degraded', failedSourceIds: ['live'], reasons: [{ source: 'live_summary', reason: 'stat_row' }] });
  assert.equal(degraded.level, 'warn');
  assert.deepEqual(JSON.parse(degraded.line), { event: 'hosted-football-refresh', status: 'degraded', failedSourceIds: ['live'],
    reasons: [{ source: 'live_summary', reason: 'stat_row' }] });
  assert.equal(cronOutcome('hosted-analysis-refresh', { status: 'published', reasons: [{ source: 'rankings', reason: 'timeout' }] }).level, 'warn');
});

test('a publisher that throws is recorded, and its reasons ride on the thrown error', async () => {
  const collector = reasonCollector();
  const publish = collector.guard(async () => {
    collector.onError('private-provider text', { source: 'jets-x-factor', reason: 'http_403' });
    throw new Error('Publisher HTTP 502 private-provider');
  });
  const coordinator = async () => { try { return await publish(); } catch { throw new FootballRefreshCoordinatorError('publisher_refresh_failed'); } };
  const error = await collector.report(coordinator).then(() => null, (thrown) => thrown);
  assert.equal(error.code, 'publisher_refresh_failed');
  assert.deepEqual(JSON.parse(cronFailure('hosted-football-refresh', error)), { event: 'hosted-football-refresh', status: 'unavailable',
    code: 'publisher_refresh_failed', errorName: 'FootballRefreshCoordinatorError',
    reasons: [{ source: 'jets-x-factor', reason: 'http_403' }, { source: 'publisher', reason: 'http_502' }] });
});

test('reasons planted on an error are filtered again before they are logged', () => {
  const error = Object.assign(new Error('x'), { refreshReasons: [{ source: 'live_summary', reason: 'stat_row' },
    { source: 'private-provider said', reason: 'no' }, 'private-provider', null, { source: 'stats', reason: 'Private Provider' }] });
  assert.deepEqual(JSON.parse(cronFailure('hosted-football-refresh', error)).reasons, [{ source: 'live_summary', reason: 'stat_row' }]);
});

test('a guarded publisher and a reported refresh pass healthy values straight through', async () => {
  const collector = reasonCollector();
  assert.equal(await collector.guard(async (value) => value * 2)(21), 42);
  const result = { status: 'published' };
  assert.equal(await collector.report(async () => result), result);
});
