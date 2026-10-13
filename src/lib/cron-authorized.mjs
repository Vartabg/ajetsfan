import { timingSafeEqual } from 'node:crypto';

/** Compare bytes, so malformed multi-byte headers cannot throw or authorize work. */
export function cronAuthorized(expected, received) {
  if (typeof expected !== 'string' || !expected || typeof received !== 'string') return false;
  const expectedBytes = Buffer.from(`Bearer ${expected}`), receivedBytes = Buffer.from(received);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
