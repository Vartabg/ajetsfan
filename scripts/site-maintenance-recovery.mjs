import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readTradeArchiveIncident } from './check-site-health.mjs';

const repository = 'Vartabg/ajetsfan';
const branch = 'master';
const apiOrigin = `https://api.github.com/repos/${repository}`;
const publisher = '/actions/workflows/refresh-data.yml';
const publisherCooldown = 45 * 60_000;
const automaticRecoveryWindow = 28 * 24 * 60 * 60_000; // Shorter than the attempt artifact's 30-day retention.
const activeStatuses = ['queued', 'in_progress', 'requested', 'waiting', 'pending'];
const validIncident = (value) => typeof value === 'string' && /^\d{8}T\d{9}Z$/.test(value);
const validId = (value) => Number.isSafeInteger(value) && value > 0;

function trustedSchedule(env) {
  return env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_REPOSITORY?.toLowerCase() === repository.toLowerCase()
    && env.GITHUB_WORKFLOW_REF?.toLowerCase() === `${repository.toLowerCase()}/.github/workflows/site-health.yml@refs/heads/${branch}`
    && env.GITHUB_REF === `refs/heads/${branch}`
    && env.GITHUB_EVENT_NAME === 'schedule';
}

function createGitHubClient(fetcher, token) {
  const request = (route, options = {}) => fetcher(apiOrigin + route, {
    ...options, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const get = async (route, description) => {
    let response;
    try { response = await request(route); }
    catch { throw new Error(`Could not read ${description} from GitHub.`); }
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} for ${description}.`);
    try { return await response.json(); }
    catch { throw new Error(`GitHub returned invalid JSON for ${description}.`); }
  };
  return { get, request };
}

async function publisherRunToWaitFor(get, now) {
  const runs = async (query) => {
    const data = await get(`${publisher}/runs?branch=${branch}&${query}`, 'archive publisher runs');
    if (!Array.isArray(data?.workflow_runs) || !data.workflow_runs.every((run) => validId(run?.id)
      && run.head_branch === branch && typeof run.status === 'string' && Number.isFinite(Date.parse(run.updated_at)))) {
      throw new Error('GitHub returned invalid archive publisher runs.');
    }
    return data.workflow_runs;
  };
  // Query active runs explicitly so completed runs cannot hide an older active publisher.
  const active = (await Promise.all(activeStatuses.map((status) => runs(`status=${status}&per_page=1`)))).flat()[0];
  if (active) return `Archive publisher run #${active.id} is active.`;
  const recent = (await runs('per_page=10')).find((run) => run.status !== 'completed'
    || now() - Date.parse(run.updated_at) < publisherCooldown);
  return recent ? `Waiting for archive publisher run #${recent.id} and its deployment (45-minute cooldown).` : undefined;
}

function matchesAttempt(artifact, name, repositoryId) {
  return artifact?.name === name && artifact.expired === false && validId(artifact.id)
    && artifact.workflow_run?.head_branch === branch
    && validId(artifact.workflow_run.id)
    && artifact.workflow_run.head_repository_id === repositoryId
    && artifact.workflow_run.repository_id === repositoryId;
}

async function sendDispatch(request, incident) {
  let response;
  try {
    response = await request(`${publisher}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: branch, return_run_details: true }),
    });
  } catch {
    return { status: 'unconfirmed', incident, message: 'GitHub did not confirm dispatch. The attempt remains recorded.' };
  }
  if (![200, 204].includes(response.status)) {
    return { status: 'unconfirmed', incident, message: `GitHub returned HTTP ${response.status} for dispatch. The attempt remains recorded.` };
  }
  const details = response.status === 200 ? await response.json().catch(() => null) : null;
  const run = validId(details?.workflow_run_id) ? ` Run #${details.workflow_run_id}.` : '';
  return { status: 'dispatched', incident, message: `Archive publisher dispatch accepted.${run}` };
}

export async function runRecovery({
  mode = 'preview', env = process.env, fetcher = fetch, readIncident = readTradeArchiveIncident, now = Date.now,
} = {}) {
  if (!['preview', 'plan', 'dispatch'].includes(mode)) throw new Error('Unknown archive recovery mode.');
  const expected = env.RECOVERY_INCIDENT;
  const preview = mode === 'preview';
  if (!preview && (!trustedSchedule(env) || !env.GH_TOKEN || !validIncident(expected))) {
    throw new Error('Archive recovery requires the trusted default-branch schedule and a confirmed health signal.');
  }
  let diagnosis;
  try { diagnosis = await readIncident(); }
  catch { throw new Error('Could not read production archive health.'); }
  const incident = diagnosis?.id;
  const skip = (message) => ({ status: 'skipped', incident, message });
  if (!validIncident(incident) || !Number.isFinite(diagnosis.overdueSince) || (expected && incident !== expected)) {
    return skip('Production health no longer confirms the expected overdue trade archive.');
  }
  const recoveryWindowClosed = () => now() - diagnosis.overdueSince >= automaticRecoveryWindow;
  const closed = () => skip('The archive has been overdue for at least 28 days. The automatic recovery window has closed.');
  if (recoveryWindowClosed()) return closed();

  const { get, request } = createGitHubClient(fetcher, preview ? undefined : env.GH_TOKEN);
  const repo = await get('', 'the production repository');
  if (typeof repo?.full_name !== 'string' || repo.full_name.toLowerCase() !== repository.toLowerCase()
      || !validId(repo.id) || repo.default_branch !== branch) {
    return skip('GitHub does not confirm the expected production default branch.');
  }
  const name = `jets-trade-archive-recovery-${incident}`;

  // The serialized job records the attempt before the POST, including if the response is lost.
  if (mode === 'dispatch') {
    const attemptId = Number(env.RECOVERY_ATTEMPT_ID);
    if (!validId(attemptId) || !validId(Number(env.GITHUB_RUN_ID))) {
      throw new Error('Archive recovery requires a recorded attempt.');
    }
    const attempt = await get(`/actions/artifacts/${attemptId}`, 'the recorded recovery attempt');
    if (!matchesAttempt(attempt, name, repo.id) || attempt.id !== attemptId
        || attempt.workflow_run.id !== Number(env.GITHUB_RUN_ID)) {
      throw new Error('GitHub does not confirm this run recorded the expected recovery attempt.');
    }
  } else {
    const data = await get(`/actions/artifacts?name=${name}&per_page=100`, 'recorded recovery attempts');
    if (!Array.isArray(data?.artifacts) || data.total_count !== data.artifacts.length) {
      throw new Error('GitHub did not return a complete list of recorded recovery attempts.');
    }
    const attempt = data.artifacts.find((artifact) => matchesAttempt(artifact, name, repo.id));
    if (attempt) return skip(`An attempt for this trade archive was already recorded in run #${attempt.workflow_run.id}.`);
  }

  const wait = await publisherRunToWaitFor(get, now);
  if (wait) return skip(wait);
  if (recoveryWindowClosed()) return closed();
  if (mode === 'dispatch') return sendDispatch(request, incident);
  return { status: 'ready', incident, artifactName: name, message: 'The trade archive qualifies for a single publisher dispatch.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2]?.slice(2) ?? 'preview';
  try {
    const decision = await runRecovery({ mode });
    const incident = validIncident(decision.incident) ? ` (incident ${decision.incident})` : '';
    const message = `${decision.message}${incident}`;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Trade archive recovery\n\n${message}\n`);
    if (mode === 'plan' && decision.status === 'ready') {
      await writeFile(join(process.env.RUNNER_TEMP, 'jets-trade-recovery-attempt.txt'), `${decision.incident}\n`);
      await appendFile(process.env.GITHUB_OUTPUT, `artifact_name=${decision.artifactName}\n`);
    }
    if (decision.status === 'unconfirmed') process.exitCode = 1;
  } catch (error) {
    // GitHub response bodies and headers stay out of workflow logs.
    const message = error instanceof Error ? error.message : 'Archive recovery could not be evaluated.';
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Trade archive recovery\n\n${message}\n`);
    process.exitCode = 1;
  }
}
