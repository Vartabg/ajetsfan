import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import { json, putObject, query, sha256, sqlString } from './film-evidence-corpus.mjs';
import { generateProof, MAX_SHARD_BYTES, resolveCatalog, selectorPredicate, serializeShard } from './film-evidence-proof.mjs';

const columns = ['game_id','play_id','season','week','home_team','away_team','game_date','qtr','desc',
  'play_type','yards_gained','touchdown','passer_player_name','receiver_player_name','rusher_player_name'];
const types = ['VARCHAR','DOUBLE','INTEGER','INTEGER','VARCHAR','VARCHAR','DATE','INTEGER','VARCHAR',
  'VARCHAR','INTEGER','INTEGER','VARCHAR','VARCHAR','VARCHAR'];
const value = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : sqlString(value);
function record(gameId, playId, date, qtr, description, playType, extra = {}) {
  const [year, week, away, home] = gameId.split('_');
  return { game_id: gameId, play_id: playId, season: Number(year), week: Number(week), home_team: home,
    away_team: away, game_date: date, qtr, desc: description, play_type: playType, yards_gained: 0,
    touchdown: 0, passer_player_name: null, receiver_player_name: null, rusher_player_name: null, ...extra };
}
function sourceCatalog(matches) {
  return { schemaVersion: 1, edition: '2026-10-20', sources: [{ id: 'test-source',
    evidence: { mode: 'metadata-reviewed', videoReviewed: false }, claims: [], matches }] };
}
function gameMatch(candidates, extra = {}) {
  return { id: 'test-game', status: 'unresolved', candidateGameId: '2026_06_NYJ_NE',
    season: 2026, week: 6, teams: ['NYJ','NE'], playCandidates: candidates, ...extra };
}
const candidate = (id, selector) => ({ id, status: 'unresolved', canonicalPlayId: null, selector });

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'film-evidence-proof-'));
  const instance = await DuckDBInstance.create(':memory:', { threads: '1', memory_limit: '128MB' });
  const db = await instance.connect();
  t.after(async () => { db.closeSync(); instance.closeSync(); await rm(root, { recursive: true, force: true }); });
  await db.run(`CREATE TABLE pbp (${columns.map((column, i) => `"${column}" ${types[i]}`).join(',')})`);
  async function insert(rows) {
    await db.run(`INSERT INTO pbp VALUES ${rows.map(row => `(${columns.map(column => value(row[column])).join(',')})`).join(',')}`);
  }
  return { root, db, insert };
}

test('selector matching uses every exact field and never drops an unknown constraint', () => {
  const supported = selectorPredicate({ play_type: 'pass', yards_gained: 48, passerName: 'Geno Smith', receiverName: 'Omar Cooper Jr.' }, columns);
  assert.equal(supported.unsupported.length, 0);
  assert.ok(supported.sql.includes('yards_gained'));
  assert.deepEqual(supported.identityRules[1].exactValues, ['Omar Cooper Jr.','O.Cooper','O.Cooper Jr.']);
  const unknown = selectorPredicate({ yards_gained: 48, route: 'slant' }, columns);
  assert.equal(unknown.sql, null);
  assert.deepEqual(unknown.unsupported, ['route']);
  assert.equal(selectorPredicate({ receiverName: 'Unlisted Name' }, columns).sql, null);
  assert.equal(selectorPredicate({ quarterSecondsRemaining: 25 }, columns).sql, null);
  assert.equal(selectorPredicate({ yards_gained: '48' }, columns).sql, null);
});

test('unique identity matching preserves metadata status and leaves ambiguous or conflicting references unresolved', async t => {
  const f = await fixture(t);
  const game = '2026_06_NYJ_NE';
  await f.insert([
    record(game, 10, '2026-10-18', 2, 'G.Smith pass to O.Cooper for 48 yards, TOUCHDOWN.', 'pass',
      { yards_gained: 48, touchdown: 1, passer_player_name: 'G.Smith', receiver_player_name: 'O.Cooper' }),
    record(game, 20, '2026-10-18', 2, 'B.Allen for 16 yards.', 'run', { yards_gained: 16, rusher_player_name: 'B.Allen' }),
    record(game, 30, '2026-10-18', 3, 'B.Allen for 16 yards.', 'run', { yards_gained: 16, rusher_player_name: 'B.Allen' }),
  ]);
  const original = sourceCatalog([
    gameMatch([
      candidate('unique', { play_type: 'pass', yards_gained: 48, touchdown: 1, passerName: 'Geno Smith', receiverName: 'Omar Cooper Jr.' }),
      candidate('ambiguous', { play_type: 'run', yards_gained: 16, rusherName: 'Braelon Allen' }),
      candidate('unsupported', { yards_gained: 48, route: 'slant' }),
    ]),
    gameMatch([candidate('wrong-date', { yards_gained: 48 })], { id: 'conflict', gameDate: '2026-10-17' }),
  ]);
  const manifest = { editionId: 'a'.repeat(64), sources: [] };
  const { catalog, summary } = await resolveCatalog(f.db, original, manifest, columns, '2026-10-20T00:00:00Z');
  assert.equal(catalog.sources[0].evidence.mode, 'metadata-reviewed');
  assert.equal(catalog.sources[0].evidence.videoReviewed, false);
  assert.equal(catalog.sources[0].matches[0].status, 'exact-game');
  const [unique, ambiguous, unsupported] = catalog.sources[0].matches[0].playCandidates;
  assert.equal(unique.canonicalPlayId, `${game}:10`);
  assert.equal(unique.resolution.sourceDescription, 'G.Smith pass to O.Cooper for 48 yards, TOUCHDOWN.');
  assert.equal(unique.resolution.matchedRows, 1);
  assert.equal(ambiguous.status, 'unresolved');
  assert.equal(ambiguous.resolutionAttempt.matchedRows, 2);
  assert.deepEqual(unsupported.resolutionAttempt.unsupported, ['route']);
  assert.equal(catalog.sources[0].matches[1].status, 'unresolved');
  assert.match(catalog.sources[0].matches[1].resolutionAttempt.reason, /conflicts/);
  assert.equal(summary.exactPlayMatches, 1);
  assert.equal(summary.unresolvedPlayCandidates, 3);
  assert.equal(original.sources[0].matches[0].status, 'unresolved', 'Input discovery evidence is not mutated');
});

test('shard limit counts UTF-8 bytes and rejects oversized output', () => {
  assert.equal(serializeShard({ text: 'é' }).bytes, Buffer.byteLength(json({ text: 'é' })));
  assert.throws(() => serializeShard({ text: 'é'.repeat(100) }, 100), /maximum 100/);
  assert.throws(() => serializeShard({ text: 'x'.repeat(MAX_SHARD_BYTES) }), /Narrow the explicit projection/);
});

test('proof generation queries real Parquet and persists bounded recent and four historical source examples', async t => {
  const f = await fixture(t);
  const reportDir = path.join(f.root, 'report');
  await mkdir(reportDir);
  const records = [
    record('2022_02_NYJ_CLE', 4072, '2022-09-18', 4,
      '(:25) (Shotgun) 19-J.Flacco pass short middle to 17-G.Wilson for 15 yards, TOUCHDOWN.', 'pass'),
    record('2000_08_MIA_NYJ', 4425, '2000-10-23', 4,
      '(1:20) V.Testaverde pass to J.Elliott for 3 yards, TOUCHDOWN.', 'pass'),
    record('2000_08_MIA_NYJ', 4620, '2000-10-23', 5,
      '(8:13) J.Hall 40 yard field goal is GOOD.', 'field_goal'),
    record('2012_12_NE_NYJ', 1700, '2012-11-22', 2,
      '(9:10) 6-M.Sanchez up the middle for 1 yard. FUMBLES, RECOVERED by NE-28-S.Gregory at NYJ 32. 28-S.Gregory for 32 yards, TOUCHDOWN.', 'run'),
    record('2026_06_NYJ_NE', 2500, '2026-10-18', 3,
      'G.Smith pass to O.Cooper for 48 yards, TOUCHDOWN.', 'pass', { yards_gained: 48, touchdown: 1,
        passer_player_name: 'G.Smith', receiver_player_name: 'O.Cooper' }),
    record('2026_06_NYJ_NE', 2600, '2026-10-18', 3, 'Timeout.', 'no_play'),
  ];
  await f.insert(records);
  const sources = [];
  for (const season of [2000, 2012, 2022, 2026]) {
    const file = path.join(f.root, `test-${season}.parquet`);
    await f.db.run(`COPY (SELECT * FROM pbp WHERE season=${season}) TO ${sqlString(file)} (FORMAT PARQUET)`);
    const object = await putObject(f.root, await readFile(file), 'parquet');
    const rows = records.filter(row => row.season === season);
    const games = [...new Set(rows.map(row => row.game_id))];
    sources.push({ family: 'pbp', season, name: `play_by_play_${season}.parquet`,
      url: `https://example.test/play_by_play_${season}.parquet`, fetchedAt: '2026-10-20T00:00:00Z',
      object, columnCount: columns.length, rows: rows.length,
      coverage: { games: games.length, uniquePlayKeys: rows.length, actionRows: rows.filter(row => row.play_type !== 'no_play').length,
        noPlayRows: rows.filter(row => row.play_type === 'no_play').length, otherRows: 0,
        candidateCompleteGames: 0, incompleteGameIds: games, missingFinalGameIds: [], lastGameDate: rows[0].game_date } });
  }
  const audit = [{ game_id: '2026_06_NYJ_NE', candidateComplete: false }];
  const manifest = { schemaVersion: 1, completedAt: '2026-10-20T00:00:00Z', sources,
    gameAuditObject: await putObject(f.root, Buffer.from(json(audit)), 'json'),
    definitions: { actionRows: 'fixture proxy', candidateCompleteGames: 'fixture audit' }, limitations: ['Fixture is deliberately partial.'] };
  manifest.editionId = sha256(json(manifest));
  await writeFile(path.join(f.root, 'current.json'), json(manifest));
  await writeFile(path.join(reportDir, 'analyst-sources.json'), json(sourceCatalog([gameMatch([
    candidate('cooper', { yards_gained: 48, touchdown: 1, receiverName: 'Omar Cooper Jr.' }),
  ])])));
  const result = await generateProof({ root: f.root, reportDir });
  assert.equal(result.historicalExactPlays, 4);
  assert.equal(result.latestJetsGame, '2026_06_NYJ_NE');
  assert.ok(result.shards.every(shard => shard.bytes < MAX_SHARD_BYTES));
  const recent = JSON.parse(await readFile(path.join(reportDir, 'examples/recent-jets-game.json'), 'utf8'));
  assert.equal(recent.rows.length, 2);
  assert.equal(recent.game.audit.candidateComplete, false);
  const historical = JSON.parse(await readFile(path.join(reportDir, 'examples/historical-film-room-plays.json'), 'utf8'));
  assert.deepEqual(historical.cases.map(study => study.play.play_id), [4072,4425,4620,1700]);
  const catalog = JSON.parse(await readFile(path.join(reportDir, 'analyst-sources.json'), 'utf8'));
  assert.equal(catalog.sources[0].matches[0].playCandidates[0].canonicalPlayId, '2026_06_NYJ_NE:2500');
  assert.equal(catalog.sources[0].evidence.mode, 'metadata-reviewed');
  const report = await readFile(path.join(reportDir, 'coverage.md'), 'utf8');
  assert.match(report, /Published eligibility remains controlled/);
  assert.match(report, /4\/4 uniquely matched/);
  assert.match(report, /not a claim of every NFL play ever/);
});


test('a valid game ID cannot override a conflicting single-team source context', async t => {
  const f = await fixture(t);
  await f.insert([record('2026_06_NYJ_NE', 2411, '2026-10-18', 3,
    'G.Smith pass to O.Cooper for 48 yards, TOUCHDOWN.', 'pass', { yards_gained: 48 })]);
  const original = sourceCatalog([
    gameMatch([candidate('wrong-team-play', { yards_gained: 48 })], { id: 'wrong-team', teams: ['DAL'] }),
    gameMatch([candidate('right-team-play', { yards_gained: 48 })], { id: 'right-team', teams: ['NYJ'] }),
  ]);
  const { catalog, summary } = await resolveCatalog(f.db, original, { editionId: 'a'.repeat(64), sources: [] }, columns);
  const [wrongTeam, rightTeam] = catalog.sources[0].matches;
  assert.equal(wrongTeam.status, 'unresolved');
  assert.equal(wrongTeam.gameId, undefined);
  assert.match(wrongTeam.resolutionAttempt.reason, /context conflicts/);
  assert.equal(wrongTeam.playCandidates[0].status, 'unresolved');
  assert.equal(wrongTeam.playCandidates[0].canonicalPlayId, null);
  assert.equal(rightTeam.status, 'exact-game', 'A matching one-team context remains valid evidence');
  assert.equal(rightTeam.playCandidates[0].canonicalPlayId, '2026_06_NYJ_NE:2411');
  assert.equal(summary.exactGameMatches, 1);
  assert.equal(summary.unresolvedGameMatches, 1);
});

test('readable modified Parquet under an old hash is rejected before catalog attribution or report writes', async t => {
  const f = await fixture(t);
  const reportDir = path.join(f.root, 'report');
  await mkdir(reportDir);
  await f.insert([record('2026_06_NYJ_NE', 2411, '2026-10-18', 3,
    'G.Smith pass to O.Cooper for 48 yards, TOUCHDOWN.', 'pass', { yards_gained: 48 })]);
  const originalFile = path.join(f.root, 'original.parquet');
  await f.db.run(`COPY pbp TO ${sqlString(originalFile)} (FORMAT PARQUET)`);
  const object = await putObject(f.root, await readFile(originalFile), 'parquet');
  const audit = [{ game_id: '2026_06_NYJ_NE', candidateComplete: false }];
  const manifest = { schemaVersion: 1, completedAt: '2026-10-20T00:00:00Z',
    sources: [{ family: 'pbp', season: 2026, name: 'play_by_play_2026.parquet',
      url: 'https://example.test/play_by_play_2026.parquet', fetchedAt: '2026-10-20T00:00:00Z',
      object, columnCount: columns.length, rows: 1, coverage: { games: 1, uniquePlayKeys: 1,
        actionRows: 1, noPlayRows: 0, otherRows: 0, candidateCompleteGames: 0,
        incompleteGameIds: ['2026_06_NYJ_NE'], missingFinalGameIds: [], lastGameDate: '2026-10-18' } }],
    gameAuditObject: await putObject(f.root, Buffer.from(json(audit)), 'json'),
    definitions: { actionRows: 'fixture proxy', candidateCompleteGames: 'fixture audit' }, limitations: [] };
  manifest.editionId = sha256(json(manifest));
  await writeFile(path.join(f.root, 'current.json'), json(manifest));
  const discovery = json(sourceCatalog([gameMatch([candidate('cooper', { yards_gained: 48 })])]));
  const catalogPath = path.join(reportDir, 'analyst-sources.json');
  await writeFile(catalogPath, discovery);
  const coveragePath = path.join(reportDir, 'coverage.md');
  await writeFile(coveragePath, 'previous proof remains authoritative');

  // Replace the immutable object with another valid Parquet file, rather than breaking its format.
  await f.db.run(`UPDATE pbp SET yards_gained=49, "desc"='Modified source record.'`);
  const modifiedFile = path.join(f.root, 'modified.parquet');
  await f.db.run(`COPY pbp TO ${sqlString(modifiedFile)} (FORMAT PARQUET)`);
  await writeFile(path.join(f.root, object.path), await readFile(modifiedFile));
  const [readable] = await query(f.db, `SELECT yards_gained FROM read_parquet(${sqlString(path.join(f.root, object.path))})`);
  assert.equal(readable.yards_gained, 49, 'The replacement is valid, queryable Parquet');
  assert.notEqual(sha256(await readFile(path.join(f.root, object.path))), object.sha256);

  await assert.rejects(generateProof({ root: f.root, reportDir }), /Object checksum mismatch/);
  assert.equal(await readFile(catalogPath, 'utf8'), discovery, 'Unverified source bytes cannot produce catalog resolutions');
  assert.equal(await readFile(coveragePath, 'utf8'), 'previous proof remains authoritative');
  await assert.rejects(access(path.join(reportDir, 'examples/recent-jets-game.json')), { code: 'ENOENT' });
});
