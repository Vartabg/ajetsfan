/** Offline evidence preparation. Never imported by a page or production refresh job. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';

export const DEFAULT_ROOT = path.join(os.homedir(), '.local/share/ajetsfan/film-evidence');
export const LICENSE = 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md';
export const sqlString = (v) => `'${String(v).replaceAll("'", "''")}'`;
export const sha256 = (v) => createHash('sha256').update(v).digest('hex');
export const json = (v) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? Number(x) : x, 2) + '\n';
export const query = async (db, sql) => (await db.runAndReadAll(sql)).getRowObjectsJson();

const selections = [
  ['pbp', /^play_by_play_(\d{4})\.parquet$/, 'pbp'],
  ['stats_player', /^stats_player_week_(\d{4})\.parquet$/, 'player_stats'],
  ['stats_team', /^stats_team_week_(\d{4})\.parquet$/, 'team_stats'],
  ['rosters', /^roster_(\d{4})\.parquet$/, 'rosters'],
  ['weekly_rosters', /^roster_weekly_(\d{4})\.parquet$/, 'weekly_rosters'],
  ['pbp_participation', /^pbp_participation_(\d{4})\.parquet$/, 'participation'],
  ['ftn_charting', /^ftn_charting_(\d{4})\.parquet$/, 'ftn_charting'],
  ['snap_counts', /^snap_counts_(\d{4})\.parquet$/, 'snap_counts'],
  ['nextgen_stats', /^ngs_(passing|receiving|rushing)\.parquet$/, 'ngs'],
  ['players', /^players\.parquet$/, 'players'],
  ['draft_picks', /^draft_picks\.parquet$/, 'draft_picks'],
  ['trades', /^trades\.parquet$/, 'trades'],
];

export function selectAssets(release, pattern, family) {
  return release.assets.filter(a => pattern.test(a.name)).map(a => ({
    family: family === 'ngs' ? `ngs_${a.name.match(pattern)[1]}` : family,
    season: /^\d{4}$/.test(a.name.match(pattern)[1] ?? '') ? Number(a.name.match(pattern)[1]) : null,
    name: a.name, url: a.browser_download_url, assetId: a.id,
    expectedBytes: a.size, providerUpdatedAt: a.updated_at, providerDigest: a.digest ?? null,
    releaseUrl: release.html_url,
    licenseUrl: ['ftn_charting','participation'].includes(family) ? 'https://creativecommons.org/licenses/by-sa/4.0/' : LICENSE,
    attribution: family === 'ftn_charting' ? 'FTN Data via nflverse' : family === 'participation' ? 'NFL Next Gen Stats (2016–2022); FTN Data via nflverse (2023 onward)' : 'nflverse; original providers as documented by each dataset',
  }));
}

async function request(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { 'User-Agent': 'aJetsFan-evidence-corpus/1', Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return response;
    } catch (error) { last = error; }
  }
  throw last;
}

export async function putObject(root, bytes, extension) {
  const hash = sha256(bytes);
  const relative = `objects/${hash}.${extension}`;
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const existing = await readFile(target);
    if (sha256(existing) !== hash) throw new Error(`Corrupt existing object: ${relative}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, target);
  }
  return { path: relative, sha256: hash, bytes: bytes.length };
}

export async function verifyObject(root, object) {
  if (!/^objects\/[a-f0-9]{64}\.(parquet|csv|json)$/.test(object.path)) throw new Error('Invalid object path');
  if (object.path.split('/')[1].split('.')[0] !== object.sha256) throw new Error('Object filename/hash mismatch');
  const bytes = await readFile(path.join(root, object.path));
  if (bytes.length !== object.bytes || sha256(bytes) !== object.sha256) throw new Error(`Object checksum mismatch: ${object.path}`);
}

export async function acquire(root, source, previous, { forceDownload = false } = {}) {
  const receiptKey = sha256(json({ url: source.url, updated: source.providerUpdatedAt, bytes: source.expectedBytes, digest: source.providerDigest }));
  const receiptPath = path.join(root, 'receipts', `${receiptKey}.json`);
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (receipt.url !== source.url || receipt.name !== source.name || receipt.providerUpdatedAt !== source.providerUpdatedAt || receipt.providerDigest !== source.providerDigest || (source.expectedBytes && receipt.object?.bytes !== source.expectedBytes) || (source.providerDigest && `sha256:${receipt.object?.sha256}` !== source.providerDigest)) throw new Error(`Receipt/source mismatch: ${source.name}`);
    await verifyObject(root, receipt.object);
    if (!forceDownload && (source.providerDigest || (source.providerUpdatedAt && source.expectedBytes))) {
      return { ...receipt, inventoryCheckedAt: new Date().toISOString(), transport: 'verified-local-object' };
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const cached = previous?.find(x => x.url === source.url && x.providerUpdatedAt === source.providerUpdatedAt && x.expectedBytes === source.expectedBytes && source.providerDigest && x.providerDigest === source.providerDigest);
  if (cached && !forceDownload) {
    if (cached.object.bytes !== source.expectedBytes || `sha256:${cached.object.sha256}` !== source.providerDigest) throw new Error(`Cached/source mismatch: ${source.name}`);
    await verifyObject(root, cached.object);
    return { ...cached, inventoryCheckedAt: new Date().toISOString(), transport: 'verified-local-object' };
  }
  // A stopped build may have finished immutable objects before publishing a manifest.
  // Recover only by the provider's exact digest; never invent a successful fetch time.
  if (!forceDownload && /^sha256:[a-f0-9]{64}$/.test(source.providerDigest ?? '')) {
    const hash = source.providerDigest.slice(7);
    const object = { path: `objects/${hash}.parquet`, sha256: hash, bytes: source.expectedBytes };
    try {
      await verifyObject(root, object);
      return { ...source, object, fetchedAt: null, persistedAt: (await stat(path.join(root, object.path))).mtime.toISOString(), inventoryCheckedAt: new Date().toISOString(), transport: 'recovered-verified-object', fetchTimeEvidence: 'Original fetch receipt unavailable after an interrupted build; persistedAt is filesystem evidence only.' };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let bytes, etag = null, lastModified = null;
  if (source.expectedBytes) {
    const chunkSize = 1024 * 1024;
    const chunks = new Array(Math.ceil(source.expectedBytes / chunkSize));
    await mkdir(path.join(root, 'incoming'), { recursive: true });
    let partCursor = 0;
    await Promise.all(Array.from({length: Math.min(4, chunks.length)}, async () => {
      while (partCursor < chunks.length) {
        const part = partCursor++;
        const start = part * chunkSize, end = Math.min(source.expectedBytes - 1, start + chunkSize - 1);
        const partialPath = path.join(root, 'incoming', `${receiptKey}.${part}.part`);
        let chunk;
        try { chunk = await readFile(partialPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!chunk || chunk.length !== end-start+1) {
          let last;
          for (let attempt=0; attempt<4; attempt++) {
            try {
              const response = await fetch(`${source.url}?ajetsfan_range=${start}`, { signal: AbortSignal.timeout(90_000), headers: { Range: `bytes=${start}-${end}`, 'User-Agent': 'aJetsFan-evidence-corpus/1' } });
              if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${source.expectedBytes}`) throw new Error(`Invalid range response ${response.status}: ${source.name}`);
              chunk = Buffer.from(await response.arrayBuffer());
              if (chunk.length !== end-start+1) throw new Error(`Truncated range: ${source.name}`);
              etag = response.headers.get('etag'); lastModified = response.headers.get('last-modified');
              await writeFile(partialPath, chunk);
              last = null; break;
            } catch (error) { last = error; }
          }
          if (last) throw last;
        }
        chunks[part] = chunk;
      }
    }));
    bytes = Buffer.concat(chunks);
  } else {
    let last;
    for (let attempt=0; attempt<4; attempt++) {
      try { const response = await request(source.url); bytes = Buffer.from(await response.arrayBuffer()); etag=response.headers.get('etag'); lastModified=response.headers.get('last-modified'); last=null; break; } catch(error) {last=error;}
    }
    if (last) throw last;
  }
  if (source.expectedBytes && bytes.length !== source.expectedBytes) throw new Error(`Byte size mismatch: ${source.name}`);
  const digest = sha256(bytes);
  if (source.providerDigest && source.providerDigest !== `sha256:${digest}`) {
    for (let part=0;part<Math.ceil(source.expectedBytes/(1024*1024));part++) await rm(path.join(root,'incoming',`${receiptKey}.${part}.part`), {force:true});
    throw new Error(`Provider digest mismatch: ${source.name}; suspect partials invalidated for retry`);
  }
  const object = await putObject(root, bytes, source.name.endsWith('.parquet') ? 'parquet' : 'csv');
  const receipt = { ...source, fetchedAt: new Date().toISOString(), inventoryCheckedAt: new Date().toISOString(), transport: 'downloaded', etag, lastModified, object };
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(`${receiptPath}.tmp`, json(receipt)); await rename(`${receiptPath}.tmp`, receiptPath);
  if (source.expectedBytes) for (let part=0;part<Math.ceil(source.expectedBytes/(1024*1024));part++) await rm(path.join(root,'incoming',`${receiptKey}.${part}.part`));
  return receipt;
}

export const ACTION_TYPES = ['run', 'pass', 'punt', 'kickoff', 'field_goal', 'extra_point', 'qb_kneel', 'qb_spike'];
const ACTION = `play_type IN (${ACTION_TYPES.map(sqlString).join(',')})`;

export async function inspectSource(db, root, source, schedulePath) {
  const relation = `read_parquet(${sqlString(path.join(root, source.object.path))})`;
  const schema = await query(db, `DESCRIBE SELECT * FROM ${relation}`);
  const names = schema.map(x => x.column_name);
  const required = source.family === 'pbp' ? ['game_id','play_id','desc','play_type','season','home_team','away_team','game_date','home_wp','total_home_score','total_away_score','home_score','away_score'] : [];
  for (const name of required) if (!names.includes(name)) throw new Error(`${source.name}: missing ${name}`);
  const [counts] = await query(db, `SELECT count(*)::INTEGER AS rows${names.includes('season') ? ', min(season)::INTEGER AS firstSeason, max(season)::INTEGER AS lastSeason' : ''} FROM ${relation}`);
  const result = { ...source, ...counts, columnCount: schema.length, schemaSha256: sha256(json(schema)) };
  if (source.family === 'pbp') {
    const terminal = `(${names.includes('game_end') ? 'game_end=1 OR ' : ''}trim("desc") ILIKE 'END GAME%' OR trim("desc") ILIKE 'END OF GAME%')`;
    const [coverage] = await query(db, `SELECT count(DISTINCT game_id)::INTEGER AS games,
      count(DISTINCT (game_id, play_id))::INTEGER AS uniquePlayKeys,
      count(*) FILTER (WHERE game_id IS NULL OR play_id IS NULL OR season IS NULL)::INTEGER AS missingKeys,
      count(*) FILTER (WHERE ${ACTION})::INTEGER AS actionRows,
      count(*) FILTER (WHERE play_type='no_play')::INTEGER AS noPlayRows,
      count(*) FILTER (WHERE play_type IS NULL OR play_type NOT IN (${[...ACTION_TYPES,'no_play'].map(sqlString).join(',')}))::INTEGER AS otherRows,
      min(game_date)::VARCHAR AS firstGameDate, max(game_date)::VARCHAR AS lastGameDate
      FROM ${relation}`);
    if (coverage.missingKeys || coverage.uniquePlayKeys !== result.rows || counts.firstSeason !== source.season || counts.lastSeason !== source.season) throw new Error(`Invalid PBP keys/season in ${source.name}`);
    result.coverage = coverage;
    result.playTypes = await query(db, `SELECT play_type, count(*)::INTEGER AS rows FROM ${relation} GROUP BY play_type ORDER BY play_type`);
    result.gameAudit = await query(db, `WITH p AS (SELECT game_id, count(*)::INTEGER AS rows,
      count(*) FILTER (WHERE ${ACTION})::INTEGER AS actionRows,
      bool_or(${terminal}) AS hasTerminal,
      max(total_home_score) AS runningHome, max(total_away_score) AS runningAway,
      max(home_score) AS officialHome, max(away_score) AS officialAway,
      count(*) FILTER (WHERE home_wp IS NOT NULL)::INTEGER AS probabilityRows
      FROM ${relation} GROUP BY game_id)
      SELECT p.*, s.home_score AS scheduleHome, s.away_score AS scheduleAway,
      s.game_id IS NOT NULL AS inSchedule,
      (hasTerminal AND probabilityRows>0 AND runningHome=officialHome AND runningAway=officialAway
       AND officialHome=s.home_score AND officialAway=s.away_score) AS candidateComplete
      FROM p LEFT JOIN read_parquet(${sqlString(schedulePath)}) s USING (game_id) ORDER BY game_id`);
    result.coverage.terminalGames = result.gameAudit.filter(x => x.hasTerminal).length;
    result.coverage.candidateCompleteGames = result.gameAudit.filter(x => x.candidateComplete === true).length;
    result.coverage.incompleteGameIds = result.gameAudit.filter(x => x.candidateComplete !== true).map(x => x.game_id);
    result.coverage.missingFinalGameIds = (await query(db, `SELECT game_id FROM read_parquet(${sqlString(schedulePath)})
      WHERE season=${source.season} AND home_score IS NOT NULL AND away_score IS NOT NULL
      EXCEPT SELECT game_id FROM ${relation} ORDER BY game_id`)).map(x => x.game_id);
  }
  const schemaObject = await putObject(root, Buffer.from(json(schema)), 'json');
  result.schemaObject = schemaObject;
  return result;
}

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || !manifest.sources.length || !/^[a-f0-9]{64}$/.test(manifest.editionId ?? '')) throw new Error('Invalid corpus manifest');
  const { editionId, ...content } = manifest;
  if (sha256(json(content)) !== editionId) throw new Error('Manifest edition checksum mismatch');
  if (new Set(manifest.sources.map(x=>x.url)).size !== manifest.sources.length) throw new Error('Duplicate source URL');
  for (const source of manifest.sources) {
    for (const object of [source.object, source.schemaObject, source.rawObject].filter(Boolean)) {
      if (!/^objects\/[a-f0-9]{64}\.(parquet|csv|json)$/.test(object.path) || object.path.split('/')[1].split('.')[0] !== object.sha256 || !Number.isSafeInteger(object.bytes) || object.bytes < 0) throw new Error('Invalid manifest object descriptor');
    }
  }
  return manifest;
}

export async function openCorpus(root = DEFAULT_ROOT, manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath ?? path.join(root, 'current.json'), 'utf8'));
  validateManifest(manifest);
  // A resealable manifest alone cannot establish that mutable local files still
  // contain the bytes its provenance advertises. Queries and proofs fail closed.
  for (const source of manifest.sources) await verifyObject(root, source.object);
  const instance = await DuckDBInstance.create(':memory:', { threads: '2', memory_limit: '1GB' });
  const db = await instance.connect();
  const families = [...new Set(manifest.sources.map(x => x.family))];
  for (const family of families) {
    if (!/^[a-z_]+$/.test(family)) throw new Error('Invalid family');
    const files = manifest.sources.filter(x => x.family === family).map(x => sqlString(path.join(root, x.object.path)));
    await db.run(`CREATE VIEW ${family} AS SELECT * FROM read_parquet([${files.join(',')}], union_by_name=true)`);
  }
  return { db, manifest, close() { db.closeSync(); instance.closeSync(); } };
}

export async function ingest({ root = DEFAULT_ROOT, reportDir = path.resolve('data/film-evidence'), inventoryDir, refetchUnknownTimes = false } = {}) {
  await mkdir(root, { recursive: true });
  const lock = await open(path.join(root, '.ingest.lock'), 'wx');
  let instance, db;
  try {
    await lock.writeFile(json({ pid: process.pid, startedAt: new Date().toISOString() }));
    const startedAt = new Date().toISOString();
    let previous;
    try { previous = JSON.parse(await readFile(path.join(root, 'current.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const sources = [], inventories = [];
    for (const [tag, pattern, family] of selections) {
      const url = `https://api.github.com/repos/nflverse/nflverse-data/releases/tags/${tag}`;
      const release = inventoryDir ? JSON.parse(await readFile(path.join(inventoryDir, `${tag}.json`), 'utf8')) : await (await request(url)).json();
      let publisherSnapshot;
      if (release._sourceEvidence?.htmlPath) {
        const html = await readFile(release._sourceEvidence.htmlPath);
        if (sha256(html) !== release._sourceEvidence.htmlSHA256) throw new Error(`Publisher inventory snapshot mismatch: ${tag}`);
        publisherSnapshot = await putObject(root, Buffer.from(json({ sourceUrl: release._sourceEvidence.sourceUrl, fetchedAt: release._sourceEvidence.fetchedAt, html: html.toString('utf8') })), 'json');
      }
      const selected = selectAssets(release, pattern, family);
      if (!selected.length) throw new Error(`No selected assets: ${tag}`);
      inventories.push({ tag, url: release._sourceEvidence?.sourceUrl ?? url, checkedAt: release._sourceEvidence?.fetchedAt ?? (inventoryDir ? null : new Date().toISOString()), ...(publisherSnapshot ? { publisherSnapshot } : {}), ...(inventoryDir ? { retainedFileModifiedAt: (await stat(path.join(inventoryDir, `${tag}.json`))).mtime.toISOString() } : {}), mode: release._sourceEvidence?.format ?? (inventoryDir ? 'retained-inventory' : 'live-api'), object: await putObject(root, Buffer.from(json(release)), 'json'), selectedNames: selected.map(x=>x.name) });
      sources.push(...selected);
    }
    const pbpYears = sources.filter(x => x.family === 'pbp').map(x => x.season).sort();
    if (pbpYears[0] !== 1999 || pbpYears.some((year, i) => year !== 1999+i)) throw new Error('PBP season inventory has a gap');
    sources.push({ family: 'schedule', season: null, name: 'games.csv', url: 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv', licenseUrl: 'https://github.com/nflverse/nfldata', attribution: 'nflverse/nfldata', providerUpdatedAt: null });
    // Deliver recent/historical proof first while other independent sources continue.
    const priority = (s) => s.family==='pbp' && s.season===Math.max(...pbpYears) ? 0 : s.family==='pbp' && s.season===2022 ? 1 : s.family==='schedule' ? 2 : 3;
    sources.sort((a,b)=>priority(a)-priority(b));
    let cursor = 0;
    const downloaded = new Array(sources.length);
    const failures = [];
    await Promise.all(Array.from({length: 8}, async () => {
      while (cursor < sources.length) {
        const i = cursor++;
        try {
          downloaded[i] = await acquire(root, sources[i], previous?.sources);
          if (refetchUnknownTimes && !downloaded[i].fetchedAt) downloaded[i] = await acquire(root, sources[i], undefined, {forceDownload:true});
          process.stdout.write(`Fetched ${i+1}/${sources.length}: ${sources[i].name}\n`);
        } catch (error) { failures.push({ name: sources[i].name, attemptedAt: new Date().toISOString(), error: String(error) }); process.stderr.write(`Failed ${sources[i].name}: ${error}\n`); }
      }
    }));
    if (failures.length) {
      await mkdir(path.join(root,'attempts'), {recursive:true});
      await writeFile(path.join(root,'attempts',`${Date.now()}.json`), json({startedAt, failures, successfulSources:downloaded.filter(Boolean).length}));
      throw new Error(`${failures.length} source downloads failed; completed objects and receipts retained. See ${path.join(root,'attempts')}`);
    }
    instance = await DuckDBInstance.create(':memory:', { threads: '2', memory_limit: '1GB' });
    db = await instance.connect();
    const schedule = downloaded.find(x => x.family === 'schedule');
    schedule.rawObject = schedule.object;
    const temp = path.join(root, `schedule-${process.pid}.parquet`);
    await db.run(`COPY (SELECT * FROM read_csv(${sqlString(path.join(root, schedule.object.path))}, auto_detect=true, sample_size=-1)) TO ${sqlString(temp)} (FORMAT PARQUET, COMPRESSION ZSTD)`);
    schedule.object = await putObject(root, await readFile(temp), 'parquet');
    await rm(temp);
    const [scheduleKeys] = await query(db, `SELECT count(*)::INTEGER AS rows, count(DISTINCT game_id)::INTEGER AS keys FROM read_parquet(${sqlString(path.join(root, schedule.object.path))})`);
    if (scheduleKeys.rows !== scheduleKeys.keys) throw new Error('Schedule game IDs must be unique and present');
    const audited = [];
    const gameAudits = [];
    for (const source of downloaded) {
      const record = await inspectSource(db, root, source, path.join(root, schedule.object.path));
      if (record.gameAudit) { gameAudits.push(...record.gameAudit); delete record.gameAudit; }
      audited.push(record);
      process.stdout.write(`Validated ${source.name}: ${record.rows} rows\n`);
    }
    const manifest = { schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
      sourceSelection: 'All inventoried PBP seasons; weekly player/team stats; all season and weekly roster assets; participation; FTN charting; snap counts; combined NGS categories; players, drafts, trades, schedule. No aggregate/weekly duplication.',
      runtime: { node: process.version, platform: process.platform, architecture: process.arch, duckdb: (await query(db, 'SELECT version() AS version'))[0].version },
      definitions: { rawRows: 'Every original PBP row, including administrative and nullified rows.', actionRows: `Published play_type in ${ACTION_TYPES.join(', ')}. Includes kneels/spikes/special teams; a reproducible action-row proxy, not proof of physical snaps.`,
        inventoryCheckedAt: 'Local verification against selected inventory metadata. Provider inventory fetch times and retained/live/HTML modes are recorded in inventories; a local verification does not establish a fresh upstream check.',
        candidateCompleteGames: 'Terminal marker, nonempty probability evidence and PBP running/final scores reconciled with schedule. An audit candidate only; existing publication eligibility remains authoritative.' },
      inventories, sources: audited, gameAuditObject: await putObject(root, Buffer.from(json(gameAudits)), 'json'),
      limitations: ['PBP starts in 1999. Earlier season rosters and schedule are not earlier PBP.', 'Current-season feeds are incomplete and revisable.', 'NGS aggregates and snap counts are not trajectories.', 'No tracking coordinate time series acquired in this edition.', 'Downloaded research corpus does not alter published-case eligibility or runtime editions.'] };
    manifest.editionId = sha256(json(manifest));
    await mkdir(path.join(root, 'editions'), { recursive: true });
    await writeFile(path.join(root, 'editions', `${manifest.editionId}.json`), json(manifest), { flag: 'wx' });
    await mkdir(reportDir, { recursive: true });
    await writeFile(path.join(reportDir, 'manifest.json'), json(manifest));
    await writeFile(path.join(reportDir, 'game-audit.json'), json(gameAudits));
    await writeFile(path.join(root, 'current.json.tmp'), json(manifest));
    await rename(path.join(root, 'current.json.tmp'), path.join(root, 'current.json'));
    return manifest;
  } finally {
    db?.closeSync(); instance?.closeSync();
    await lock.close(); await rm(path.join(root, '.ingest.lock'));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    if (!args.includes(name)) return fallback;
    const value = args[args.indexOf(name)+1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    return value;
  };
  const root = path.resolve(option('--root', DEFAULT_ROOT));
  if (args.includes('--sql')) {
    const corpus = await openCorpus(root, option('--manifest'));
    try { process.stdout.write(json(await query(corpus.db, option('--sql')))); } finally { corpus.close(); }
  } else if (args.includes('--verify')) {
    const manifest = validateManifest(JSON.parse(await readFile(option('--manifest', path.join(root, 'current.json')), 'utf8')));
    for (const source of manifest.sources) {
      await verifyObject(root, source.object); await verifyObject(root, source.schemaObject);
      if (source.rawObject) await verifyObject(root, source.rawObject);
    }
    for (const inventory of manifest.inventories) { await verifyObject(root, inventory.object); if (inventory.publisherSnapshot) await verifyObject(root, inventory.publisherSnapshot); }
    await verifyObject(root, manifest.gameAuditObject);
    process.stdout.write(`Verified ${manifest.sources.length} sources for ${manifest.editionId}\n`);
  } else {
    const result = await ingest({ root, reportDir: path.resolve(option('--report-dir', 'data/film-evidence')), inventoryDir: option('--inventory-dir'), refetchUnknownTimes: args.includes('--refetch-unknown-times') });
    process.stdout.write(`Published research edition ${result.editionId} at ${root}\n`);
  }
}
