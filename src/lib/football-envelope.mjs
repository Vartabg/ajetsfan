import { createHash } from 'node:crypto';
import { validateFootballEdition } from '../../scripts/refresh-football.mjs';

export const FOOTBALL_POLICY_VERSION = 1;
export const FOOTBALL_EDITION_PATH = `football/v${FOOTBALL_POLICY_VERSION}/collection.json`;
const timestamp = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));

/** Operational timestamps do not interrupt a reader when content is unchanged. */
export function footballRevision(edition, analysisRevision = '') {
  const omit = new Set(['checkedAt', 'attemptedAt', 'scoreCheckedAt', 'analysisCheck', 'analysisUpdatedAt', 'sourceUpdatedAt']);
  return createHash('sha256').update(JSON.stringify([edition, analysisRevision], (key, value) => omit.has(key) ? undefined : value)).digest('hex');
}

export function validateFootballEnvelope(value) {
  if (!value || value.version !== FOOTBALL_POLICY_VERSION || !timestamp(value.updatedAt)
    || !Number.isInteger(value.durationMs) || value.durationMs < 0) throw new Error('Invalid football generation');
  validateFootballEdition(value.edition);
  if (Date.parse(value.edition.current.checkedAt) > Date.parse(value.updatedAt)) throw new Error('Invalid football generation clock');
  return value;
}

export function footballEnvelope(edition, started, completed) {
  return validateFootballEnvelope({ version: FOOTBALL_POLICY_VERSION, edition,
    updatedAt: completed.toISOString(), durationMs: completed.getTime() - started.getTime() });
}
