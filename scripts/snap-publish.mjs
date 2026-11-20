import { readFile, rename, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';

/** Atomically replace a compressed football edition after verifying the staged bytes. */
export async function publishGzipSeason(filename, staged, json) {
  let old;
  try { old = await readFile(filename); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Different zlib builds may encode identical JSON differently. Keep identical
  // editions byte-for-byte on daily runs, including across Mac/Linux rebuilds.
  if (old) {
    try { if (gunzipSync(old).toString('utf8') === json) return false; }
    catch (error) { if (error.code !== 'Z_DATA_ERROR' && error.code !== 'Z_BUF_ERROR') throw error; }
  }
  const bytes = gzipSync(json, { level: 9 });
  bytes[9] = 255; // RFC 1952's unspecified OS. No build timestamp or host metadata.
  await writeFile(staged, bytes);
  if (gunzipSync(await readFile(staged)).toString('utf8') !== json)
    throw new Error(`Staged ${filename} failed verification`);
  await rename(staged, filename);
  return true;
}
