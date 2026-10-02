/** Build checked league comparisons without adding runtime requests to season pages. */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { SCHEDULE_SOURCE, parseLeagueSchedule, fetchText, withDataLock } from './data-refresh.mjs';

async function previousFile(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function publish(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, file);
}
async function csvSource(url, cacheDir, fetcher) {
  if (cacheDir) {
    try { return await readFile(path.join(cacheDir, new URL(url).pathname.split('/').at(-1)), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const response = await fetcher(`${url}.gz`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Statistics HTTP ${response.status}`);
  return gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
}

export async function refreshSeasonRankings({ outDir = path.resolve('public/data'), full = false, cacheDir = null, now = new Date(), fetcher = fetch, onError = console.warn } = {}) {
  const { buildSeasonRankings, seasonTeamSource, seasonPlayerSource } = await import('./season-rankings.mjs');
  const checkedAt = now.toISOString();
  const schedule = parseLeagueSchedule(await fetchText(SCHEDULE_SOURCE, fetcher));
  const years = [...new Set(schedule.filter((game) => game.season >= 1999 && game.status === 'final' && game.date <= checkedAt.slice(0, 10)).map((game) => game.season))].sort((a, b) => a - b);
  if (!years.length) throw new Error('No confirmed league games available for rankings');
  await mkdir(outDir, { recursive: true });
  return withDataLock(outDir, async () => {
    const file = path.join(outDir, 'season-rankings.json');
    const previous = await previousFile(file);
    if (previous && (previous.schemaVersion !== 1 || !Array.isArray(previous.seasons))) throw new Error('Unsupported prior rankings snapshot');
    const records = new Map((previous?.seasons ?? []).map((entry) => [entry.year, entry]));
    const requested = full ? years : years.filter((year) => year === years.at(-1) || !records.has(year));
    for (const year of requested) {
      try {
        const [teamCsv, playerCsv] = await Promise.all([csvSource(seasonTeamSource(year), cacheDir, fetcher), csvSource(seasonPlayerSource(year), cacheDir, fetcher)]);
        records.set(year, buildSeasonRankings({ year, checkedAt, schedule, teamCsv, playerCsv }));
        console.log(`${year}: league team and individual comparisons checked`);
      } catch (error) {
        if (!records.has(year)) throw new Error(`${year} rankings unavailable: ${error.message}`, { cause: error });
        onError(`${year}: retaining rankings checked ${records.get(year).checkedAt}: ${error.message}`);
      }
    }
    const collection = { schemaVersion: 1, checkedAt, seasons: [...records.values()].sort((a, b) => b.year - a.year) };
    await publish(file, collection);
    return collection;
  });
}

export async function refreshNextGen({ outDir = path.resolve('public/data'), now = new Date(), cacheDir = null, fetcher = fetch, onError = console.warn } = {}) {
  const { buildNextGenCollection, NEXTGEN_SOURCES } = await import('./nextgen-stats.mjs');
  await mkdir(outDir, { recursive: true });
  return withDataLock(outDir, async () => {
    const file = path.join(outDir, 'nextgen-stats.json');
    const previous = await previousFile(file);
    try {
      const entries = await Promise.all(Object.entries(NEXTGEN_SOURCES).map(async ([kind, url]) => {
        if (cacheDir) {
          try { return [`${kind}Csv`, gunzipSync(await readFile(path.join(cacheDir, `ngs_${kind}.csv.gz`))).toString('utf8')]; }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const response = await fetcher(url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`${kind} NGS HTTP ${response.status}`);
        const csv = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
        return [`${kind}Csv`, csv];
      }));
      let sourceUpdatedAt;
      try {
        const raw = cacheDir
          ? await readFile(path.join(cacheDir, 'ngs_timestamp.json'), 'utf8')
          : await fetchText('https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/timestamp.json', fetcher);
        const timestamp = JSON.parse(raw).last_updated;
        if (typeof timestamp === 'string' && timestamp.trim()) sourceUpdatedAt = timestamp;
      } catch { /* Measurements remain usable when the optional source timestamp is absent. */ }
      const collection = buildNextGenCollection({ ...Object.fromEntries(entries), checkedAt: now.toISOString(), sourceUpdatedAt });
      if (!collection.seasons.length) throw new Error('Empty Next Gen season collection');
      for (const prior of previous?.seasons ?? []) {
        const replacement = collection.seasons.find((season) => season.year === prior.year);
        if (!replacement || ['passing', 'receiving', 'rushing'].some((kind) => prior[kind]?.length && !replacement[kind]?.length)) {
          throw new Error(`Next Gen coverage regressed for ${prior.year}`);
        }
      }
      await publish(file, collection);
      console.log(`Next Gen Stats: ${collection.seasons.length} seasons checked`);
      return collection;
    } catch (error) {
      if (!previous?.seasons?.length || previous.schemaVersion !== 1) throw error;
      onError(`Retaining Next Gen measurements checked ${previous.checkedAt}: ${error.message}`);
      return previous;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let cacheDir = null;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--cache' && args[index + 1] && !args[index + 1].startsWith('--')) cacheDir = args[++index];
    else if (args[index] !== '--full') throw new Error('Usage: node scripts/refresh-season-rankings.mjs [--full] [--cache directory]');
  }
  await refreshSeasonRankings({ full: args.includes('--full'), cacheDir });
  await refreshNextGen({ cacheDir });
}
