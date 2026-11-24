import assert from 'node:assert/strict';
import test from 'node:test';
import { runRecovery } from './site-maintenance-recovery.mjs';

const incident = '20261122T162859756Z';
const artifactName = `jets-trade-archive-recovery-${incident}`;
const now = () => Date.parse('2026-11-24T18:00:00Z');
const diagnosis = { id: incident, overdueSince: Date.parse('2026-11-24T04:28:59.756Z') };
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'schedule',
  GITHUB_REPOSITORY: 'Vartabg/ajetsfan',
  GITHUB_REF: 'refs/heads/master',
  GITHUB_WORKFLOW_REF: 'Vartabg/ajetsfan/.github/workflows/site-health.yml@refs/heads/master',
  GITHUB_RUN_ID: '100',
  RECOVERY_INCIDENT: incident,
  RECOVERY_ATTEMPT_ID: '200',
  GH_TOKEN: 'test-actions-token',
};
const repository = { id: 10, full_name: 'Vartabg/ajetsfan', default_branch: 'master' };
const artifact = {
  id: 200, name: artifactName, expired: false,
  workflow_run: { id: 100, head_branch: 'master', repository_id: 10, head_repository_id: 10 },
};
const oldRun = { id: 50, status: 'completed', updated_at: '2026-11-24T16:00:00Z', head_branch: 'master' };

function fixture({ repo = repository, artifacts = [], recorded = artifact, active, recent = oldRun, dispatch, statusRead } = {}) {
  const requests = [];
  const fetcher = async (url, options) => {
    const route = new URL(url);
    assert.equal(route.origin, 'https://api.github.com');
    assert.equal(options.redirect, 'error');
    requests.push({ route, options });
    const path = route.pathname.replace('/repos/Vartabg/ajetsfan', '');
    if (path === '') return Response.json(repo);
    if (path === '/actions/artifacts') return Response.json({ artifacts, total_count: artifacts.length });
    if (path === '/actions/artifacts/200') return Response.json(recorded);
    if (path === '/actions/workflows/refresh-data.yml/runs') {
      assert.equal(route.searchParams.get('branch'), 'master');
      if (statusRead) return statusRead();
      const status = route.searchParams.get('status');
      const run = status ? active?.status === status ? active : null : recent;
      return Response.json({ workflow_runs: run ? [run] : [] });
    }
    assert.equal(path, '/actions/workflows/refresh-data.yml/dispatches');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { ref: 'master', return_run_details: true });
    assert.equal(options.headers.Authorization, 'Bearer test-actions-token');
    return dispatch ? dispatch() : Response.json({ workflow_run_id: 300 });
  };
  const evaluate = (overrides = {}) => runRecovery({ env, now, fetcher, readIncident: async () => diagnosis, ...overrides });
  return { evaluate, requests };
}

test('previews an eligible archive using only unauthenticated reads', async () => {
  const { evaluate, requests } = fixture();
  assert.deepEqual(await evaluate(), {
    status: 'ready', incident, artifactName, message: 'The trade archive qualifies for a single publisher dispatch.',
  });
  assert.ok(requests.length > 0);
  assert.ok(requests.every(({ options }) => !options.method && !options.headers.Authorization));
});

test('requires the same incident at dispatch and ignores an untrusted incident value', async () => {
  const { evaluate, requests } = fixture();
  for (const readIncident of [
    async () => undefined,
    async () => ({ ...diagnosis, id: incident.replace('59', '58') }),
    async () => ({ ...diagnosis, id: 'master\nartifact_name=other' }),
  ]) {
    assert.equal((await evaluate({ mode: 'dispatch', readIncident })).status, 'skipped');
  }
  assert.equal(requests.length, 0);
});

test('closes recovery 28 days after the archive became overdue and before attempt records expire', async () => {
  const cutoff = diagnosis.overdueSince + 28 * 24 * 60 * 60_000;
  const { evaluate, requests } = fixture();
  assert.equal((await evaluate({ mode: 'plan', now: () => cutoff - 1 })).status, 'ready');
  const earlierRequests = requests.length;
  assert.match((await evaluate({ mode: 'dispatch', now: () => cutoff })).message, /recovery window has closed/);
  assert.equal(requests.length, earlierRequests);

  let time = cutoff - 1;
  const crossing = fixture({ statusRead: () => {
    time = cutoff;
    return Response.json({ workflow_runs: [] });
  } });
  assert.match((await crossing.evaluate({ mode: 'dispatch', now: () => time })).message, /recovery window has closed/);
  assert.ok(crossing.requests.every(({ options }) => !options.method));
});

test('blocks write modes on manual runs, a non-default ref, a different workflow or a different repository', async () => {
  const { evaluate, requests } = fixture();
  for (const context of [
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_REF: 'refs/heads/preview' },
    { GITHUB_WORKFLOW_REF: 'Vartabg/ajetsfan/.github/workflows/ci.yml@refs/heads/master' },
    { GITHUB_REPOSITORY: 'someone/ajetsfan' },
    { GH_TOKEN: '' },
  ]) {
    await assert.rejects(evaluate({ mode: 'dispatch', env: { ...env, ...context } }), /trusted default-branch schedule/);
  }
  assert.equal(requests.length, 0);
});

test('checks that live repository metadata still identifies master as the default branch', async () => {
  const { evaluate, requests } = fixture({ repo: { ...repository, default_branch: 'new-default' } });
  assert.match((await evaluate({ mode: 'dispatch' })).message, /expected production default branch/);
  assert.equal(requests.length, 1);
});

test('blocks dispatch for any active publisher or when its deployment may still be propagating', async () => {
  for (const status of ['queued', 'in_progress', 'requested', 'waiting', 'pending']) {
    const { evaluate, requests } = fixture({ active: { ...oldRun, status } });
    assert.match((await evaluate({ mode: 'dispatch' })).message, /run #50 is active/);
    assert.ok(requests.every(({ options }) => !options.method));
  }
  const recent = { ...oldRun, updated_at: '2026-11-24T17:59:00Z' };
  const { evaluate, requests } = fixture({ recent });
  assert.match((await evaluate({ mode: 'dispatch' })).message, /run #50.*cooldown/);
  assert.ok(requests.every(({ options }) => !options.method));
});

test('only records and honors attempts from the trusted default branch', async () => {
  const artifacts = [
    { ...artifact, expired: true },
    { ...artifact, workflow_run: { ...artifact.workflow_run, head_branch: 'preview' } },
    { ...artifact, workflow_run: { ...artifact.workflow_run, head_repository_id: 101 } },
  ];
  const { evaluate } = fixture({ artifacts });
  assert.equal((await evaluate({ mode: 'plan' })).status, 'ready');
  artifacts.push(artifact);
  assert.match((await evaluate({ mode: 'plan' })).message, /already recorded in run #100/);
});

test('requires proof this workflow run recorded the attempt before sending the single allowed POST', async () => {
  const wrongRun = fixture({ recorded: { ...artifact, workflow_run: { ...artifact.workflow_run, id: 101 } } });
  await assert.rejects(wrongRun.evaluate({ mode: 'dispatch' }), /this run recorded/);
  assert.ok(wrongRun.requests.every(({ options }) => !options.method));

  const { evaluate, requests } = fixture();
  assert.match((await evaluate({ mode: 'dispatch' })).message, /dispatch accepted. Run #300/);
  assert.equal(requests.filter(({ options }) => options.method === 'POST').length, 1);
  assert.equal(requests.at(-1).options.method, 'POST');
});

test('keeps an attempt recorded after an ambiguous dispatch or failed publisher', async () => {
  for (const dispatch of [
    () => { throw new Error('network failed after send'); },
    () => new Response('do not print this response', { status: 502 }),
    () => new Response(null, { status: 204 }),
  ]) {
    const artifacts = [];
    const { evaluate, requests } = fixture({ artifacts, dispatch, recent: { ...oldRun, conclusion: 'failure' } });
    assert.equal((await evaluate({ mode: 'plan' })).status, 'ready');
    // The workflow uploads before sending; a separate scheduled evaluation sees this record.
    artifacts.push(artifact);
    const result = await evaluate({ mode: 'dispatch' });
    assert.ok(['unconfirmed', 'dispatched'].includes(result.status));
    assert.doesNotMatch(result.message, /network failed|do not print/);
    assert.equal((await evaluate({ mode: 'plan' })).status, 'skipped');
    assert.equal(requests.filter(({ options }) => options.method === 'POST').length, 1);
  }
});

test('fails closed without dispatch when publisher activity cannot be verified', async () => {
  for (const statusRead of [
    () => new Response('service unavailable', { status: 503 }),
    () => Response.json({ workflow_runs: [{ id: 3, status: 'completed' }] }),
  ]) {
    const { evaluate, requests } = fixture({ statusRead });
    await assert.rejects(evaluate({ mode: 'dispatch' }), /publisher runs/);
    assert.ok(requests.every(({ options }) => !options.method));
  }
});
