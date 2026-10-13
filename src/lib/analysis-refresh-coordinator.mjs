import { randomUUID } from 'node:crypto';
import { validateAnalysisEnvelope } from './analysis-envelope.mjs';

export const ANALYSIS_COLLECTION_PATH = 'analysis/v1/collection.json';
export const ANALYSIS_LEASE_PATH = 'analysis/v1/lease.json';
export const ANALYSIS_LEASE_TTL_MS = 660_000;
export const MIN_ANALYSIS_REFRESH_INTERVAL_MS = 480_000;

export class AnalysisRefreshCoordinatorError extends Error {
  constructor(code) { super(`Analysis refresh ${code.replaceAll('_', ' ')}.`); this.name = 'AnalysisRefreshCoordinatorError'; this.code = code; }
}
function validated(value) {
  try { return validateAnalysisEnvelope(value); }
  catch { throw new AnalysisRefreshCoordinatorError('invalid_snapshot'); }
}
const stamp = (value) => value ? Date.parse(value) : 0;
const time = (now) => {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new AnalysisRefreshCoordinatorError('invalid_clock');
  return value;
};

/** Dataset checks take precedence over the enclosing publication timestamp. */
export function analysisSourceChecks(envelope) {
  const check = (name, payload) => payload
    ? { status: payload.status ?? 'ready', checkedAt: payload.checkedAt ?? null, attemptedAt: payload.attemptedAt ?? payload.checkedAt }
    : envelope.sourceChecks?.[name] ?? { status: 'unavailable', checkedAt: null, attemptedAt: envelope.updatedAt };
  return { analysis: check('analysis', envelope.current.analysisCheck), rankings: check('rankings', envelope.rankings), nextgen: check('nextgen', envelope.nextgen) };
}
export const analysisFailedSourceIds = (envelope) => Object.entries(analysisSourceChecks(envelope))
  .filter(([, source]) => source.status !== 'ready' || !source.checkedAt).map(([id]) => id);

/** A slow analysis job uses its own lease and never imports the native extractor here. */
export async function coordinateAnalysisRefresh({ read, write, isConflict, refresh, now = () => new Date(), owner = randomUUID(),
  collectionPath = ANALYSIS_COLLECTION_PATH, leasePath = ANALYSIS_LEASE_PATH }) {
  if ([read, write, isConflict, refresh, now].some((value) => typeof value !== 'function') || typeof owner !== 'string' || !owner || owner.length > 120
    || typeof collectionPath !== 'string' || !collectionPath || typeof leasePath !== 'string' || !leasePath || collectionPath === leasePath) throw new AnalysisRefreshCoordinatorError('invalid_configuration');
  const get = async (path) => {
    try {
      const result = await read(path);
      if (result === null) return null;
      if (!result || typeof result.etag !== 'string' || !result.etag || !Object.hasOwn(result, 'value')) throw new Error('Invalid storage record');
      return result;
    } catch { throw new AnalysisRefreshCoordinatorError('storage_unavailable'); }
  };
  const put = async (path, value, options) => {
    try {
      const result = await write(path, value, options);
      if (!result || typeof result.etag !== 'string' || !result.etag) throw new Error('Invalid storage record');
      return result;
    } catch (error) {
      if (isConflict(error)) return null;
      throw new AnalysisRefreshCoordinatorError('storage_unavailable');
    }
  };
  const leaseValue = (value) => {
    if (!value || typeof value.owner !== 'string' || !value.owner || value.owner.length > 120 || typeof value.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(value.expiresAt))) throw new AnalysisRefreshCoordinatorError('invalid_lease');
    return value;
  };
  const started = time(now), oldLease = await get(leasePath);
  if (oldLease && stamp(leaseValue(oldLease.value).expiresAt) > started.getTime()) return { status: 'busy' };
  const acquired = await put(leasePath, { owner, expiresAt: new Date(started.getTime() + ANALYSIS_LEASE_TTL_MS).toISOString() },
    oldLease ? { ifMatch: oldLease.etag } : { createOnly: true });
  if (!acquired) return { status: 'busy' };
  try {
    const baseline = await get(collectionPath), previous = baseline ? validated(baseline.value) : null;
    if (previous && !baseline.refreshRequired && !analysisFailedSourceIds(previous).length) {
      const ages = Object.values(analysisSourceChecks(previous)).map((source) => started.getTime() - stamp(source.checkedAt));
      if (ages.every((age) => age >= 0 && age < MIN_ANALYSIS_REFRESH_INTERVAL_MS)) return { status: 'fresh', updatedAt: previous.updatedAt, season: previous.season };
    }
    let envelope;
    try { envelope = await refresh({ previous, now: started }); }
    catch { throw new AnalysisRefreshCoordinatorError('publisher_refresh_failed'); }
    validated(envelope);
    if (previous && (envelope.season < previous.season || stamp(envelope.updatedAt) < stamp(previous.updatedAt))) return { status: 'superseded' };
    if (previous?.season === envelope.season) {
      const oldChecks = analysisSourceChecks(previous), freshChecks = analysisSourceChecks(envelope);
      if (Object.keys(oldChecks).some((name) => stamp(freshChecks[name].checkedAt) < stamp(oldChecks[name].checkedAt)
        || stamp(freshChecks[name].attemptedAt) < stamp(oldChecks[name].attemptedAt))) return { status: 'superseded' };
    }
    const currentLease = await get(leasePath);
    if (!currentLease || currentLease.etag !== acquired.etag || leaseValue(currentLease.value).owner !== owner
      || stamp(currentLease.value.expiresAt) <= time(now).getTime()) return { status: 'superseded' };
    if (!await put(collectionPath, envelope, baseline ? { ifMatch: baseline.etag } : { createOnly: true })) return { status: 'superseded' };
    const failedSourceIds = analysisFailedSourceIds(envelope);
    return { status: failedSourceIds.length ? 'degraded' : 'published', updatedAt: envelope.updatedAt, season: envelope.season, failedSourceIds };
  } finally { await put(leasePath, { owner, expiresAt: new Date(0).toISOString() }, { ifMatch: acquired.etag }); }
}
