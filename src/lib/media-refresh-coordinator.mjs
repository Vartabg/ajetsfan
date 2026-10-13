import { randomUUID } from 'node:crypto';
import { validateMediaCollection } from './media.ts';

export const MEDIA_COLLECTION_PATH = 'media/collection.json';
export const MEDIA_LEASE_PATH = 'media/lease.json';
export const MEDIA_LEASE_TTL_MS = 240_000;
export const MIN_MEDIA_REFRESH_INTERVAL_MS = 480_000;

/** Safe diagnostics only: upstream exceptions can contain request credentials. */
export class MediaRefreshCoordinatorError extends Error {
  constructor(code) {
    super(`Media refresh ${code.replaceAll('_', ' ')}.`);
    this.name = 'MediaRefreshCoordinatorError';
    this.code = code;
  }
}

function validated(collection) {
  try { return validateMediaCollection(collection); }
  catch { throw new MediaRefreshCoordinatorError('invalid_snapshot'); }
}

const curatedTime = (collection) => Date.parse(collection.curatedCheckedAt ?? collection.checkedAt);
const attemptedTime = (collection) => Math.max(0, ...(collection.sources ?? []).map((source) => Date.parse(source.attemptedAt)));

/** A newer deployment's curated archive must not be hidden by an older live edition. */
export function selectLatestMediaCollection(baked, stored = null) {
  validated(baked);
  if (!stored) return baked;
  validated(stored);
  for (const time of [curatedTime, attemptedTime, (collection) => Date.parse(collection.checkedAt)]) {
    const difference = time(stored) - time(baked);
    if (difference) return difference > 0 ? stored : baked;
  }
  return baked;
}

function clockTime(now) {
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new MediaRefreshCoordinatorError('invalid_clock');
  return date;
}

function record(value) {
  if (value === null) return null;
  if (!value || typeof value.etag !== 'string' || !value.etag || !Object.hasOwn(value, 'value')) throw new MediaRefreshCoordinatorError('invalid_storage_record');
  return value;
}

function validLease(lease) {
  if (!lease || typeof lease.owner !== 'string' || !lease.owner || lease.owner.length > 120
    || typeof lease.expiresAt !== 'string' || !Number.isFinite(Date.parse(lease.expiresAt))) throw new MediaRefreshCoordinatorError('invalid_lease');
  return lease;
}

/**
 * The store must provide uncached reads and atomic, conditional writes. A bounded
 * function runs inside the longer lease; CAS also protects against older editions
 * finishing after a deployment or another writer has published newer media.
 */
export async function coordinateMediaRefresh({ read, write, isConflict, refresh, curated, baked,
  apiKey, now = () => new Date(), owner = randomUUID() }) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new MediaRefreshCoordinatorError('missing_api_key');
  if ([read, write, isConflict, refresh, now].some((value) => typeof value !== 'function')
    || typeof owner !== 'string' || !owner || owner.length > 120) throw new MediaRefreshCoordinatorError('invalid_configuration');
  validated(curated);
  validated(baked);

  const get = async (path) => {
    try { return record(await read(path)); }
    catch (error) {
      if (error instanceof MediaRefreshCoordinatorError) throw error;
      throw new MediaRefreshCoordinatorError('storage_unavailable');
    }
  };
  const put = async (path, value, options) => {
    try {
      const saved = await write(path, value, options);
      if (!saved || typeof saved.etag !== 'string' || !saved.etag) throw new MediaRefreshCoordinatorError('invalid_storage_record');
      return saved;
    } catch (error) {
      if (isConflict(error)) return null;
      if (error instanceof MediaRefreshCoordinatorError) throw error;
      throw new MediaRefreshCoordinatorError('storage_unavailable');
    }
  };

  const started = clockTime(now);
  const oldLease = await get(MEDIA_LEASE_PATH);
  if (oldLease && Date.parse(validLease(oldLease.value).expiresAt) > started.getTime()) return { status: 'busy' };
  const lease = { owner, expiresAt: new Date(started.getTime() + MEDIA_LEASE_TTL_MS).toISOString() };
  const acquired = await put(MEDIA_LEASE_PATH, lease, oldLease ? { ifMatch: oldLease.etag } : { createOnly: true });
  if (!acquired) return { status: 'busy' };

  try {
    const baseline = await get(MEDIA_COLLECTION_PATH);
    const previous = selectLatestMediaCollection(baked, baseline?.value ?? null);
    // A request from a superseded deployment cannot roll back editorial changes.
    if (curatedTime(curated) < curatedTime(previous)) return { status: 'superseded' };
    if (baseline && !baseline.refreshRequired && curatedTime(baseline.value) === curatedTime(previous)
      && attemptedTime(baseline.value) === attemptedTime(previous) && baseline.value.checkedAt === previous.checkedAt
      && baseline.value.sources?.length && baseline.value.sources.every((source) => source.status === 'ready')) {
      const age = started.getTime() - Math.min(...baseline.value.sources.map((source) => Date.parse(source.checkedAt)));
      if (age >= 0 && age < MIN_MEDIA_REFRESH_INTERVAL_MS) return { status: 'fresh', checkedAt: previous.checkedAt };
    }
    let collection;
    try {
      collection = await refresh({ curated, previous, youtubeApiKey: apiKey, now: started, onError: () => {} });
    } catch { throw new MediaRefreshCoordinatorError('publisher_refresh_failed'); }
    validated(collection);
    if (!collection.sources?.length) throw new MediaRefreshCoordinatorError('invalid_snapshot');
    if (curatedTime(collection) < curatedTime(previous) || Date.parse(collection.checkedAt) < Date.parse(previous.checkedAt)
      || attemptedTime(collection) < attemptedTime(previous)) return { status: 'superseded' };

    const currentLease = await get(MEDIA_LEASE_PATH);
    if (!currentLease || currentLease.etag !== acquired.etag || validLease(currentLease.value).owner !== owner
      || Date.parse(currentLease.value.expiresAt) <= clockTime(now).getTime()) return { status: 'superseded' };
    const published = await put(MEDIA_COLLECTION_PATH, collection, baseline ? { ifMatch: baseline.etag } : { createOnly: true });
    if (!published) return { status: 'superseded' };

    const failedSourceIds = collection.sources.filter((source) => source.status !== 'ready').map((source) => source.id);
    return {
      status: failedSourceIds.length ? 'degraded' : 'published',
      checkedAt: collection.checkedAt,
      itemCount: collection.items.length,
      sourceCount: collection.sources.length,
      failedSourceIds,
    };
  } finally {
    // Keep an expired tombstone so every subsequent acquisition remains conditional.
    // The acquired ETag prevents releasing a replacement owner's lease.
    await put(MEDIA_LEASE_PATH, { owner, expiresAt: new Date(0).toISOString() }, { ifMatch: acquired.etag });
  }
}
