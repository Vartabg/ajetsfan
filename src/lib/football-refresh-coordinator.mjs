import { randomUUID } from 'node:crypto';
import { validateFootballEdition, footballEditionAttemptedAt, footballActiveWindow, mergeConfirmedFootballSchedule } from '../../scripts/refresh-football.mjs';

export const FOOTBALL_COLLECTION_PATH = 'football/collection.json';
export const FOOTBALL_LEASE_PATH = 'football/lease.json';
export const FOOTBALL_LEASE_TTL_MS = 180_000;
export const MIN_ACTIVE_FOOTBALL_INTERVAL_MS = 40_000;
export const MIN_IDLE_FOOTBALL_INTERVAL_MS = 240_000;

export class FootballRefreshCoordinatorError extends Error {
  constructor(code) { super(`Football refresh ${code.replaceAll('_', ' ')}.`); this.name = 'FootballRefreshCoordinatorError'; this.code = code; }
}
function validated(value) {
  try { return validateFootballEdition(value); }
  catch { throw new FootballRefreshCoordinatorError('invalid_snapshot'); }
}
function time(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new FootballRefreshCoordinatorError('invalid_clock');
  return value;
}
/** @param {any} baked @param {any} [stored] */
export function selectLatestFootballEdition(baked, stored = null) {
  validated(baked);
  if (!stored) return baked;
  validated(stored);
  if (baked.current.season !== stored.current.season) return baked.current.season > stored.current.season ? baked : stored;
  const stamp = (value) => value ? Date.parse(value) : 0;
  const latestFeed = (left, right) => {
    if (!left) return right;
    if (!right) return left;
    const attempt = Date.parse(right.attemptedAt) >= Date.parse(left.attemptedAt) ? right : left;
    const good = stamp(right.checkedAt) > stamp(left.checkedAt) ? right : left;
    return stamp(attempt.checkedAt) >= stamp(good.checkedAt) ? attempt
      : { ...good, attemptedAt: attempt.attemptedAt, status: good.checkedAt ? 'retained' : 'unavailable' };
  };
  const base = Date.parse(stored.current.checkedAt) > Date.parse(baked.current.checkedAt) ? stored : baked;
  const coverage = { ...base.coverage };
  for (const name of ['news', 'roster', 'stats']) coverage[name] = latestFeed(baked.coverage[name], stored.coverage[name]);
  const live = latestFeed(baked.live, stored.live), scheduleCheck = latestFeed(baked.scheduleCheck, stored.scheduleCheck);
  const scheduleBase = stamp(baked.scheduleCheck.checkedAt) > stamp(stored.scheduleCheck.checkedAt) ? baked : stored;
  const current = { ...base.current, schedule: mergeConfirmedFootballSchedule(scheduleBase.current.schedule,
    (scheduleBase === baked ? stored : baked).current.schedule, live, scheduleCheck) };
  const analysis = [baked.current, stored.current].sort((left, right) => stamp(right.analysisCheck?.checkedAt ?? right.analysisUpdatedAt)
    - stamp(left.analysisCheck?.checkedAt ?? left.analysisUpdatedAt))[0];
  if (analysis.latestAnalyzedGameId) {
    const old = analysis.schedule.find((game) => game.id === analysis.latestAnalyzedGameId), final = current.schedule.find((game) => game.id === analysis.latestAnalyzedGameId);
    if (final?.status === 'final' && old.jetsScore === final.jetsScore && old.oppScore === final.oppScore) {
      current.latestAnalyzedGameId = analysis.latestAnalyzedGameId; current.analysisUpdatedAt = analysis.analysisUpdatedAt;
      if (analysis.analysisCheck) current.analysisCheck = analysis.analysisCheck;
    }
  }
  coverage.stats = { ...coverage.stats, pendingGameIds: current.schedule.filter((game) => game.status === 'final' && game.seasonType === 'REG'
    && !coverage.stats.analyzedGameIds.includes(game.id)).map((game) => game.id) };
  current.checkedAt = new Date(Math.max(Date.parse(current.checkedAt), stamp(scheduleCheck.checkedAt), stamp(live?.checkedAt))).toISOString();
  return validated({ schemaVersion: 1, current, coverage, live, scheduleCheck });
}
export function footballFailedSourceIds(edition) {
  return [
    ['schedule', edition.scheduleCheck], ['news', edition.coverage.news], ['roster', edition.coverage.roster], ['stats', edition.coverage.stats], ['live', edition.live],
  ].filter(([, source]) => !source || source.status !== 'ready').map(([id]) => id);
}
/** Private-store preconditions must be atomic; readers return the body and its strong ETag together. */
export async function coordinateFootballRefresh({ read, write, isConflict, refresh, baked, now = () => new Date(), owner = randomUUID(),
  collectionPath = FOOTBALL_COLLECTION_PATH, leasePath = FOOTBALL_LEASE_PATH }) {
  if ([read, write, isConflict, refresh, now].some((entry) => typeof entry !== 'function') || typeof owner !== 'string' || !owner || owner.length > 120
    || typeof collectionPath !== 'string' || !collectionPath || typeof leasePath !== 'string' || !leasePath || collectionPath === leasePath) throw new FootballRefreshCoordinatorError('invalid_configuration');
  validated(baked);
  const get = async (path) => {
    try {
      const saved = await read(path);
      if (saved === null) return null;
      if (!saved || typeof saved.etag !== 'string' || !saved.etag || !Object.hasOwn(saved, 'value')) throw new Error('Invalid storage record');
      return saved;
    } catch { throw new FootballRefreshCoordinatorError('storage_unavailable'); }
  };
  const put = async (path, value, options) => {
    try {
      const result = await write(path, value, options);
      if (!result || typeof result.etag !== 'string' || !result.etag) throw new Error('Invalid storage record');
      return result;
    } catch (error) {
      if (isConflict(error)) return null;
      throw new FootballRefreshCoordinatorError('storage_unavailable');
    }
  };
  const leaseValue = (value) => {
    if (!value || typeof value.owner !== 'string' || !value.owner || typeof value.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(value.expiresAt))) throw new FootballRefreshCoordinatorError('invalid_lease');
    return value;
  };
  const started = time(now), oldLease = await get(leasePath);
  if (oldLease && Date.parse(leaseValue(oldLease.value).expiresAt) > started.getTime()) return { status: 'busy' };
  const acquired = await put(leasePath, { owner, expiresAt: new Date(started.getTime() + FOOTBALL_LEASE_TTL_MS).toISOString() },
    oldLease ? { ifMatch: oldLease.etag } : { createOnly: true });
  if (!acquired) return { status: 'busy' };
  try {
    const baseline = await get(collectionPath), previous = selectLatestFootballEdition(baked, baseline?.value ?? null);
    const active = footballActiveWindow(previous.current.schedule, started, previous.live);
    const failed = footballFailedSourceIds(previous), interval = active ? MIN_ACTIVE_FOOTBALL_INTERVAL_MS : MIN_IDLE_FOOTBALL_INTERVAL_MS;
    if (baseline && !baseline.refreshRequired && !failed.length && baseline.value.current.season === previous.current.season
      && footballEditionAttemptedAt(baseline.value) === footballEditionAttemptedAt(previous) && baseline.value.current.checkedAt === previous.current.checkedAt) {
      const ages = [started.getTime() - footballEditionAttemptedAt(previous)];
      // Roster has a separate fifteen-minute cadence; it does not hold back live updates.
      if (ages.every((age) => age >= 0 && age < interval)) return { status: 'fresh', checkedAt: previous.current.checkedAt, active };
    }
    let edition;
    try { edition = await refresh({ previous, now: started }); }
    catch { throw new FootballRefreshCoordinatorError('publisher_refresh_failed'); }
    validated(edition);
    if (edition.current.season < previous.current.season || footballEditionAttemptedAt(edition) < footballEditionAttemptedAt(previous)
      || Date.parse(edition.current.checkedAt) < Date.parse(previous.current.checkedAt)) return { status: 'superseded' };
    const currentLease = await get(leasePath);
    if (!currentLease || currentLease.etag !== acquired.etag || leaseValue(currentLease.value).owner !== owner
      || Date.parse(currentLease.value.expiresAt) <= time(now).getTime()) return { status: 'superseded' };
    if (!await put(collectionPath, edition, baseline ? { ifMatch: baseline.etag } : { createOnly: true })) return { status: 'superseded' };
    const failedSourceIds = footballFailedSourceIds(edition);
    return { status: failedSourceIds.length ? 'degraded' : 'published', checkedAt: edition.current.checkedAt,
      attemptedAt: new Date(footballEditionAttemptedAt(edition)).toISOString(), season: edition.current.season, failedSourceIds,
      active: footballActiveWindow(edition.current.schedule, started, edition.live) };
  } finally { await put(leasePath, { owner, expiresAt: new Date(0).toISOString() }, { ifMatch: acquired.etag }); }
}
