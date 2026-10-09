/** Build checked league comparisons without adding runtime requests to season pages. */
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { SCHEDULE_SOURCE, parseLeagueSchedule, fetchText, withDataLock } from './data-refresh.mjs';
import { isNextGenCollection } from '../src/lib/nextgen-stats.ts';
import { seasonTeamSource, seasonPlayerSource } from './season-rankings.mjs';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

function validSourceCheck(value) {
  return timestamp(value.checkedAt) && (value.status === undefined || ['ready', 'retained'].includes(value.status)) &&
    (value.attemptedAt === undefined || timestamp(value.attemptedAt) && Date.parse(value.attemptedAt) >= Date.parse(value.checkedAt));
}

/** Retention is safe only when the existing record still has usable checked data. */
function validateSeasonRankings(value) {
  const fail = () => { throw new Error('Invalid prior season rankings snapshot'); };
  if (!record(value) || !integer(value.year, 1999) || !validSourceCheck(value) ||
    value.year > new Date(value.checkedAt).getUTCFullYear() || !record(value.sources) ||
    value.sources.schedule !== SCHEDULE_SOURCE || value.sources.teams !== seasonTeamSource(value.year) ||
    value.sources.players !== seasonPlayerSource(value.year) || !record(value.phases)) fail();
  const gameIds = (ids) => Array.isArray(ids) && new Set(ids).size === ids.length &&
    ids.every((id) => typeof id === 'string' && new RegExp(`^${value.year}_\\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$`).test(id));
  const metric = (item) => {
    if (!record(item) || !['id', 'label', 'populationLabel', 'note'].every((key) => text(item[key])) ||
      !['perGame', 'yards', 'count', 'sacks'].includes(item.unit) || !['higher', 'lower'].includes(item.direction) || !integer(item.population, 1)) return false;
    const entry = (row) => record(row) && text(row.id) && text(row.name) && Number.isFinite(row.value) &&
      integer(row.rank, 1) && row.rank <= item.population && integer(row.games, 1) && typeof row.tied === 'boolean' &&
      (row.teams === undefined || Array.isArray(row.teams) && row.teams.length > 0 && new Set(row.teams).size === row.teams.length && row.teams.every((team) => /^[A-Z]{2,3}$/.test(team))) &&
      (row.jetsValue === undefined || Number.isFinite(row.jetsValue)) && (row.jetsGames === undefined || integer(row.jetsGames) && row.jetsGames <= row.games);
    const entries = (rows) => Array.isArray(rows) && rows.length <= item.population && rows.every(entry) && new Set(rows.map((row) => row.id)).size === rows.length;
    return (item.jets === null || entry(item.jets)) && entries(item.leaders) && item.leaders.length <= 3 &&
      (item.players === undefined || entries(item.players));
  };
  for (const name of ['all', 'regular', 'playoffs']) {
    const phase = value.phases[name];
    if (!record(phase) || phase.phase !== name || !['expectedGames', 'teamGames', 'playerGames', 'jetsGames'].every((key) => integer(phase[key])) ||
      !gameIds(phase.missingTeamGames) || !gameIds(phase.missingPlayerGames) ||
      phase.teamGames + phase.missingTeamGames.length !== phase.expectedGames || phase.playerGames + phase.missingPlayerGames.length !== phase.expectedGames ||
      phase.jetsGames > phase.expectedGames || !Array.isArray(phase.notes) || !phase.notes.every(text)) fail();
    if (phase.expectedGames === 0 ? phase.throughDate !== null : typeof phase.throughDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(phase.throughDate) || !Number.isFinite(Date.parse(phase.throughDate)) ||
      new Date(phase.throughDate).toISOString().slice(0, 10) !== phase.throughDate || phase.throughDate > value.checkedAt.slice(0, 10)) fail();
    for (const kind of ['team', 'individual']) if (!Array.isArray(phase[kind]) || !phase[kind].every(metric) ||
      new Set(phase[kind].map((item) => item.id)).size !== phase[kind].length) fail();
  }
  for (const key of ['expectedGames', 'teamGames', 'playerGames', 'jetsGames']) if (value.phases.all[key] !== value.phases.regular[key] + value.phases.playoffs[key]) fail();
  return value;
}

function validateRankingsCollection(value) {
  if (!record(value) || value.schemaVersion !== 1 || !timestamp(value.checkedAt) || !Array.isArray(value.seasons) || !value.seasons.length ||
    new Set(value.seasons.map((season) => season?.year)).size !== value.seasons.length) throw new Error('Unsupported prior rankings snapshot');
  for (const season of value.seasons) {
    validateSeasonRankings(season);
    if (Date.parse(season.checkedAt) > Date.parse(value.checkedAt)) throw new Error('Invalid prior season rankings check time');
  }
  return value;
}

async function previousFile(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function publish(file, value, beforePromote) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value));
    if (beforePromote) await beforePromote();
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
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

export async function refreshSeasonRankings({ outDir = path.resolve('public/data'), full = false, cacheDir = null, now = new Date(), fetcher = fetch, onError = console.warn, beforePromote } = {}) {
  const { buildSeasonRankings } = await import('./season-rankings.mjs');
  const checkedAt = now.toISOString();
  await mkdir(outDir, { recursive: true });
  return withDataLock(outDir, async () => {
    const file = path.join(outDir, 'season-rankings.json');
    const previous = await previousFile(file);
    if (previous) validateRankingsCollection(previous);
    let schedule, years;
    try {
      schedule = parseLeagueSchedule(await fetchText(SCHEDULE_SOURCE, fetcher));
      years = [...new Set(schedule.filter((game) => game.season >= 1999 && game.status === 'final' && game.date <= checkedAt.slice(0, 10)).map((game) => game.season))].sort((a, b) => a - b);
      if (!years.length) throw new Error('No confirmed league games available for rankings');
    } catch (error) {
      if (!previous || full) throw error;
      const latest = Math.max(...previous.seasons.map((entry) => entry.year));
      const retained = { ...previous, checkedAt, seasons: previous.seasons.map((entry) => entry.year === latest ? { ...entry, status: 'retained', attemptedAt: checkedAt } : entry) };
      validateRankingsCollection(retained);
      onError(`League schedule unavailable; retaining checked rankings: ${error.message}`);
      await publish(file, retained, beforePromote);
      return retained;
    }
    const records = new Map((previous?.seasons ?? []).map((entry) => [entry.year, entry]));
    const unavailableSeasons = [];
    const requested = full ? years : years.filter((year) => year === years.at(-1) || !records.has(year));
    for (const year of requested) {
      try {
        const [teamCsv, playerCsv] = await Promise.all([csvSource(seasonTeamSource(year), cacheDir, fetcher), csvSource(seasonPlayerSource(year), cacheDir, fetcher)]);
        records.set(year, { ...buildSeasonRankings({ year, checkedAt, schedule, teamCsv, playerCsv }), status: 'ready', attemptedAt: checkedAt });
        console.log(`${year}: league team and individual comparisons checked`);
      } catch (error) {
        // A newly confirmed season can precede the processed weekly stats release.
        // Publish independent results/media while this season is explicitly pending.
        if (!records.has(year) && previous && !full && year === years.at(-1)) {
          unavailableSeasons.push({ year, attemptedAt: checkedAt });
          onError(`${year}: rankings pending; independent source updates can publish: ${error.message}`);
          continue;
        }
        if (!records.has(year)) throw new Error(`${year} rankings unavailable: ${error.message}`, { cause: error });
        onError(`${year}: retaining rankings checked ${records.get(year).checkedAt}: ${error.message}`);
        records.set(year, { ...records.get(year), status: 'retained', attemptedAt: checkedAt });
      }
    }
    const collection = { schemaVersion: 1, checkedAt, seasons: [...records.values()].sort((a, b) => b.year - a.year), unavailableSeasons };
    validateRankingsCollection(collection);
    await publish(file, collection, beforePromote);
    return collection;
  });
}

export async function refreshNextGen({ outDir = path.resolve('public/data'), now = new Date(), cacheDir = null, fetcher = fetch, onError = console.warn, beforePromote } = {}) {
  const { buildNextGenCollection, NEXTGEN_SOURCES } = await import('./nextgen-stats.mjs');
  await mkdir(outDir, { recursive: true });
  return withDataLock(outDir, async () => {
    const file = path.join(outDir, 'nextgen-stats.json');
    const previous = await previousFile(file);
    if (previous && (!isNextGenCollection(previous) || !previous.seasons.length)) throw new Error('Invalid prior Next Gen snapshot');
    let collection;
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
      collection = { ...buildNextGenCollection({ ...Object.fromEntries(entries), checkedAt: now.toISOString(), sourceUpdatedAt }), status: 'ready', attemptedAt: now.toISOString() };
      if (!collection.seasons.length) throw new Error('Empty Next Gen season collection');
      for (const prior of previous?.seasons ?? []) {
        const replacement = collection.seasons.find((season) => season.year === prior.year);
        if (!replacement || ['passing', 'receiving', 'rushing'].some((kind) => prior[kind]?.length && !replacement[kind]?.length)) {
          throw new Error(`Next Gen coverage regressed for ${prior.year}`);
        }
      }
      console.log(`Next Gen Stats: ${collection.seasons.length} seasons checked`);
    } catch (error) {
      if (!previous) throw error;
      onError(`Retaining Next Gen measurements checked ${previous.checkedAt}: ${error.message}`);
      collection = { ...previous, status: 'retained', attemptedAt: now.toISOString() };
    }
    if (!isNextGenCollection(collection)) throw new Error('Invalid Next Gen publication');
    await publish(file, collection, beforePromote);
    return collection;
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
