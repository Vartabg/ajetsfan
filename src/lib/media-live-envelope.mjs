import { createHash } from 'node:crypto';
import { validateMediaCollection } from './media.ts';

// Increment for importer/selection policy changes not represented in source config.
export const MEDIA_POLICY_REVISION = 1;

/** Editorial/source policy changes invalidate old runtime selections. */
export function mediaPolicyFingerprint(curated, sources) {
  return createHash('sha256').update(JSON.stringify({ revision: MEDIA_POLICY_REVISION, curated, sources },
    (_key, value) => value instanceof RegExp ? value.toString() : value)).digest('hex');
}

export function validateLiveMediaEnvelope(value) {
  if (!value || value.version !== 1 || !Number.isInteger(value.policyRevision) || value.policyRevision < 1
    || !/^[a-f0-9]{64}$/.test(value.policyFingerprint)
    || !Number.isFinite(Date.parse(value.updatedAt)) || !Number.isInteger(value.durationMs) || value.durationMs < 0
    || !Array.isArray(value.previousCollections) || value.previousCollections.length > 2) throw new Error('Invalid live media edition');
  validateMediaCollection(value.collection);
  for (const collection of value.previousCollections) validateMediaCollection(collection);
  if (value.collection.sources?.some((source) => Date.parse(source.attemptedAt) > Date.parse(value.updatedAt))) throw new Error('Invalid live media generation');
  return value;
}

export function liveMediaEnvelope(collection, previous, policyFingerprint, startedAt, completedAt) {
  const compatible = previous?.policyFingerprint === policyFingerprint;
  return validateLiveMediaEnvelope({ version: 1, policyRevision: MEDIA_POLICY_REVISION, policyFingerprint, updatedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(), collection,
    previousCollections: compatible ? [previous.collection, ...previous.previousCollections].slice(0, 2) : [] });
}
