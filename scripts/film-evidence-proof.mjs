/** Reproducible offline coverage and small source-record examples. No runtime publication decisions. */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_ROOT, json, openCorpus, query, sqlString, verifyObject } from './film-evidence-corpus.mjs';

export const MAX_SHARD_BYTES = 2 * 1024 * 1024;
export const PROOF_COLUMNS = [
  'game_id', 'play_id', 'season', 'season_type', 'week', 'game_date', 'home_team', 'away_team',
  'posteam', 'defteam', 'qtr', 'time', 'quarter_seconds_remaining', 'half_seconds_remaining',
  'game_seconds_remaining', 'down', 'ydstogo', 'yardline_100', 'desc', 'play_type', 'yards_gained',
  'first_down', 'touchdown', 'pass_touchdown', 'rush_touchdown', 'return_touchdown', 'fumble_lost',
  'field_goal_result', 'kick_distance', 'return_yards', 'passer_player_id', 'passer_player_name',
  'receiver_player_id', 'receiver_player_name', 'rusher_player_id', 'rusher_player_name',
  'kicker_player_id', 'kicker_player_name', 'td_player_id', 'td_player_name',
  'punt_returner_player_id', 'punt_returner_player_name', 'kickoff_returner_player_id',
  'kickoff_returner_player_name', 'total_home_score', 'total_away_score', 'home_score', 'away_score',
  'home_wp', 'wpa', 'epa', 'game_end',
];
const quoteColumn = name => `"${name.replaceAll('"', '""')}"`;
const numericSelectors = new Map([
  ['qtr', 'qtr'], ['quarterSecondsRemaining', 'quarter_seconds_remaining'], ['down', 'down'],
  ['ydstogo', 'ydstogo'], ['yards_gained', 'yards_gained'], ['touchdown', 'touchdown'],
  ['kick_distance', 'kick_distance'], ['return_yards', 'return_yards'], ['fumble_lost', 'fumble_lost'],
]);
const literalSelectors = new Map([['play_type', 'play_type'], ['field_goal_result', 'field_goal_result']]);
const nameColumns = new Map([
  ['passerName', ['passer_player_name']], ['receiverName', ['receiver_player_name']],
  ['rusherName', ['rusher_player_name']], ['kickerName', ['kicker_player_name']],
  ['returnerName', ['punt_returner_player_name', 'kickoff_returner_player_name']],
  ['returnTouchdownPlayerName', ['td_player_name']],
]);
/** Explicit display-name variants only. No initial/surname guessing or approximate text match. */
const nameAliases = new Map([
  ['Joe Flacco', ['J.Flacco']], ['Garrett Wilson', ['G.Wilson']],
  ['Vinny Testaverde', ['V.Testaverde']], ['Jumbo Elliott', ['J.Elliott']],
  ['John Hall', ['J.Hall']], ['Mark Sanchez', ['M.Sanchez']], ['Steve Gregory', ['S.Gregory']],
  ['Kene Nwangwu', ['K.Nwangwu']], ['Isaiah Williams', ['I.Williams']],
  ['Kirk Cousins', ['K.Cousins']], ['Stefon Diggs', ['S.Diggs']],
  ['Breece Hall', ['B.Hall']], ['Braelon Allen', ['B.Allen']],
  ['Geno Smith', ['G.Smith']], ['Omar Cooper Jr.', ['O.Cooper', 'O.Cooper Jr.']],
]);

export function selectorPredicate(selector, columnNames) {
  const columns = new Set(columnNames);
  const conditions = [], unsupported = [], identityRules = [];
  if (!selector || typeof selector !== 'object' || Array.isArray(selector) || !Object.keys(selector).length) {
    return { sql: null, unsupported: ['empty-selector'], identityRules };
  }
  for (const [key, value] of Object.entries(selector)) {
    if (numericSelectors.has(key)) {
      const column = numericSelectors.get(key);
      if (!columns.has(column) || typeof value !== 'number' || !Number.isFinite(value)) unsupported.push(key);
      else conditions.push(`${quoteColumn(column)}=${value}`);
    } else if (literalSelectors.has(key)) {
      const column = literalSelectors.get(key);
      if (!columns.has(column) || typeof value !== 'string' || !value.length) unsupported.push(key);
      else conditions.push(`${quoteColumn(column)}=${sqlString(value)}`);
    } else if (nameColumns.has(key)) {
      const available = nameColumns.get(key).filter(column => columns.has(column));
      const aliases = nameAliases.get(value);
      if (!available.length || !aliases) unsupported.push(key);
      else {
        // Include the supplied full name for sources that retain it, plus only explicitly listed variants.
        const values = [...new Set([value, ...aliases])];
        conditions.push(`(${available.map(column => `${quoteColumn(column)} IN (${values.map(sqlString).join(',')})`).join(' OR ')})`);
        identityRules.push({ selector: key, suppliedName: value, columns: available, exactValues: values });
      }
    } else unsupported.push(key);
  }
  return { sql: unsupported.length ? null : conditions.join(' AND '), unsupported, identityRules };
}

export const HISTORICAL_CASES = [
  { id: 'wilson-cleveland', title: 'Wilson’s winning touchdown', gameId: '2022_02_NYJ_CLE',
    qtr: 4, playType: 'pass', descriptionRegex: 'J\\.Flacco pass.*G\\.Wilson for 15 yards.*TOUCHDOWN' },
  { id: 'elliott-miami', title: 'Jumbo Elliott’s touchdown', gameId: '2000_08_MIA_NYJ',
    qtr: 4, playType: 'pass', descriptionRegex: 'V\\.Testaverde pass to J\\.Elliott for 3 yards.*TOUCHDOWN' },
  { id: 'hall-miami', title: 'Hall’s winning field goal', gameId: '2000_08_MIA_NYJ',
    qtr: 5, playType: 'field_goal', descriptionRegex: 'J\\.Hall 40 yard field goal is GOOD' },
  { id: 'sanchez-thanksgiving', title: 'Sanchez’s Thanksgiving fumble', gameId: '2012_12_NE_NYJ',
    qtr: 2, playType: 'run', descriptionRegex: 'M\\.Sanchez up the middle.*FUMBLES.*RECOVERED by NE-28-S\\.Gregory.*32 yards, TOUCHDOWN' },
];
const sourceForGame = (manifest, gameId) => manifest.sources.find(s => s.family === 'pbp' && s.season === Number(gameId.slice(0, 4)));
const sourceProvenance = source => source ? ({ url: source.url, name: source.name, fetchedAt: source.fetchedAt,
  persistedAt: source.persistedAt ?? null, sha256: source.object.sha256, originalColumnCount: source.columnCount }) : null;

export async function resolveCatalog(db, original, manifest, columnNames, resolvedAt = new Date().toISOString()) {
  const catalog = structuredClone(original);
  const summary = { sources: catalog.sources.length, exactGameMatches: 0, exactPlayMatches: 0,
    unresolvedGameMatches: 0, unresolvedPlayCandidates: 0, evidenceModes: {}, textVerifiedClaims: 0 };
  const games = new Map();
  const columns = PROOF_COLUMNS.filter(column => columnNames.includes(column));
  const projection = columns.map(quoteColumn).join(',');
  for (const source of catalog.sources) {
    summary.evidenceModes[source.evidence.mode] = (summary.evidenceModes[source.evidence.mode] ?? 0) + 1;
    summary.textVerifiedClaims += source.claims.filter(claim => claim.reviewStatus === 'text-verified').length;
    for (const match of source.matches) {
      const candidateGameId = match.candidateGameId ?? match.gameId ?? null;
      match.status = 'unresolved'; delete match.gameId; delete match.resolution;
      match.candidateGameId = candidateGameId;
      for (const candidate of match.playCandidates) {
        candidate.status = 'unresolved'; candidate.canonicalPlayId = null; delete candidate.resolution;
      }
      let failure = 'No precise candidate game ID supplied; season-level and broad subjects are not forced into a game.';
      if (candidateGameId && /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(candidateGameId)) {
        if (!games.has(candidateGameId)) games.set(candidateGameId, await query(db, `SELECT DISTINCT game_id,
          season, week, home_team, away_team, game_date::VARCHAR AS game_date FROM pbp WHERE game_id=${sqlString(candidateGameId)}`));
        const rows = games.get(candidateGameId);
        if (rows.length === 1) {
          const row = rows[0];
          const contextsMatch = (!match.season || row.season === match.season)
            && (!match.week || row.week === match.week)
            && (!match.gameDate || row.game_date === match.gameDate)
            && (!match.teams || (match.teams.length >= 1 && match.teams.length <= 2
              && new Set(match.teams).size === match.teams.length
              && match.teams.every(team => team === row.home_team || team === row.away_team)));
          if (contextsMatch) {
            match.status = 'exact-game'; match.gameId = row.game_id;
            match.resolution = { method: 'persisted-pbp-exact-game-id-and-context', corpusEdition: manifest.editionId,
              resolvedAt, sourceGame: row, source: sourceProvenance(sourceForGame(manifest, row.game_id)) };
          } else failure = 'Candidate game exists, but supplied season/week/date/team context conflicts with the persisted source.';
        } else failure = rows.length ? 'The candidate ID has conflicting game identity rows.' : 'Candidate game ID is absent from the persisted edition.';
      }
      if (match.status !== 'exact-game') {
        match.resolutionAttempt = { corpusEdition: manifest.editionId, checkedAt: resolvedAt, reason: failure };
        summary.unresolvedGameMatches++;
        summary.unresolvedPlayCandidates += match.playCandidates.length;
        continue;
      }
      delete match.resolutionAttempt;
      summary.exactGameMatches++;
      for (const candidate of match.playCandidates) {
        const predicate = selectorPredicate(candidate.selector, columnNames);
        if (!predicate.sql) {
          candidate.resolutionAttempt = { corpusEdition: manifest.editionId, checkedAt: resolvedAt,
            reason: 'A supplied selector is unsupported, invalid, or absent from the corpus schema. No selectors were dropped.',
            unsupported: predicate.unsupported };
          summary.unresolvedPlayCandidates++;
          continue;
        }
        const records = await query(db, `SELECT ${projection} FROM pbp WHERE game_id=${sqlString(match.gameId)} AND ${predicate.sql} ORDER BY play_id LIMIT 2`);
        if (records.length !== 1) {
          candidate.resolutionAttempt = { corpusEdition: manifest.editionId, checkedAt: resolvedAt,
            reason: records.length ? 'Multiple rows satisfy every selector; no exact-play link assigned.' : 'No row satisfies every selector.',
            matchedRows: records.length, countCappedAt: 2, identityRules: predicate.identityRules };
          summary.unresolvedPlayCandidates++;
          continue;
        }
        const record = records[0];
        candidate.status = 'exact-play'; candidate.canonicalPlayId = `${record.game_id}:${record.play_id}`;
        candidate.resolution = { method: 'persisted-pbp-unique-match-all-selectors', matchedRows: 1,
          corpusEdition: manifest.editionId, resolvedAt, gameId: record.game_id, playId: record.play_id,
          sourceDescription: record.desc, identityRules: predicate.identityRules,
          source: sourceProvenance(sourceForGame(manifest, record.game_id)),
          limitation: 'This verifies source-record identity only. It does not verify the video contents, assignments, coordinates or the analyst’s interpretation.' };
        delete candidate.resolutionAttempt;
        summary.exactPlayMatches++;
      }
    }
  }
  catalog.resolvedAgainst = { corpusEdition: manifest.editionId, resolvedAt,
    method: 'Exact candidate game IDs with source context; unique PBP rows satisfying every supported supplied selector.', ...summary };
  return { catalog, summary };
}

export function serializeShard(value, limit = MAX_SHARD_BYTES) {
  const serialized = json(value);
  const bytes = Buffer.byteLength(serialized);
  if (bytes > limit) throw new Error(`Proof shard is ${bytes} bytes; maximum ${limit}. Narrow the explicit projection before delivery.`);
  return { serialized, bytes };
}
async function atomicWrite(file, serialized) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, serialized);
  await rename(temporary, file);
}
const number = value => Number(value ?? 0).toLocaleString('en-US');
const md = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
function seasonRange(sources, actualSeasons) {
  const seasons = [...new Set(actualSeasons ?? sources.flatMap(s => s.season != null ? [s.season] : []))].sort((a, b) => a - b);
  if (!seasons.length) return 'not season-indexed';
  const ranges = []; let start = seasons[0], end = start;
  for (const season of seasons.slice(1)) {
    if (season === end + 1) end = season;
    else { ranges.push(start === end ? String(start) : `${start}–${end}`); start = end = season; }
  }
  ranges.push(start === end ? String(start) : `${start}–${end}`);
  return ranges.join(', ');
}
const familyNotes = {
  pbp: 'All retained source columns; administrative/nullified rows are retained. Earliest PBP is 1999.',
  player_stats: 'Weekly player statistics; no tracking trajectories.', team_stats: 'Weekly team statistics.',
  rosters: 'Season roster identities and biographical fields; early roster years do not extend PBP history.',
  weekly_rosters: 'Week-specific roster records.', participation: 'Published participation/player identifiers; not movement coordinates.',
  ftn_charting: 'Selected charted play attributes; availability and source attribution follow the manifest.',
  snap_counts: 'Player snap-count aggregates, not positions over time.',
  ngs_passing: 'Weekly/season passing aggregates, not tracking frames.',
  ngs_receiving: 'Weekly/season receiving aggregates, not tracking frames.',
  ngs_rushing: 'Weekly/season rushing aggregates, not tracking frames.',
  players: 'Player identity crosswalk and biographical records.', draft_picks: 'Draft-pick records.',
  trades: 'Published trade records.', schedule: 'Schedule/results; older schedule dates do not imply older PBP.',
};

export function coverageMarkdown({ manifest, root, generatedAt, recent, historical, summary, shards, familySeasons = {} }) {
  const pbp = manifest.sources.filter(s => s.family === 'pbp').sort((a, b) => a.season - b.season);
  const sum = (items, fn) => items.reduce((total, item) => total + Number(fn(item) ?? 0), 0);
  const rawRows = sum(pbp, s => s.rows), games = sum(pbp, s => s.coverage.games);
  const actions = sum(pbp, s => s.coverage.actionRows);
  const lines = ['# Film evidence corpus coverage', '',
    `Generated ${generatedAt} from research edition \`${manifest.editionId}\` (completed ${manifest.completedAt}).`, '',
    `Stored at \`${root}\`. The [source manifest](manifest.json) records exact URLs, acquisition times, schemas and checksums; full Parquet objects remain outside Git and browser payloads.`, '',
    `Persisted PBP: **${number(rawRows)} raw rows in ${number(games)} games, ${seasonRange(pbp)}**, with **${number(actions)} action-proxy rows**. These are source-edition counts, not a claim of every NFL play ever.`, '',
    `Raw rows include administrative and nullified records. Action proxy: ${manifest.definitions?.actionRows ?? 'selected published play_type values; not proof of physical snaps'}`, '',
    `Candidate-complete audit: ${manifest.definitions?.candidateCompleteGames ?? 'source and schedule reconciliation only'}`, '',
    '**Published eligibility remains controlled by the existing application. This research audit grants no new published cases.**', '',
    '## Persisted statistical families', '', '| Family | Assets | Rows | Source years | Columns per asset | Object bytes | Notes |', '| --- | ---: | ---: | --- | ---: | ---: | --- |'];
  for (const family of [...new Set(manifest.sources.map(s => s.family))].sort()) {
    const sources = manifest.sources.filter(s => s.family === family);
    const counts = sources.map(s => s.columnCount);
    const columns = Math.min(...counts) === Math.max(...counts) ? counts[0] : `${Math.min(...counts)}–${Math.max(...counts)}`;
    lines.push(`| ${md(family)} | ${number(sources.length)} | ${number(sum(sources, s => s.rows))} | ${seasonRange(sources, familySeasons[family])} | ${md(columns)} | ${number(sum(sources, s => s.object.bytes))} | ${md(familyNotes[family] ?? 'See source manifest.')} |`);
  }
  const emptySources = manifest.sources.filter(s => s.rows === 0);
  if (emptySources.length) lines.push('', `Retained empty source assets (file existence does not establish coverage): ${emptySources.map(s => `\`${s.name}\``).join(', ')}.`);
  lines.push('', '## Per-season PBP audit', '',
    '| Season | Raw rows | Games | Unique play keys | Action proxy | No-play | Other/admin | Candidate-complete games | Incomplete games | Missing finished schedule games | Columns | Bytes | Last game date |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const s of pbp) {
    const c = s.coverage;
    lines.push(`| [${s.season}](${s.url}) | ${number(s.rows)} | ${number(c.games)} | ${number(c.uniquePlayKeys)} | ${number(c.actionRows)} | ${number(c.noPlayRows)} | ${number(c.otherRows)} | ${number(c.candidateCompleteGames)} | ${number(c.incompleteGameIds.length)} | ${number(c.missingFinalGameIds.length)} | ${number(s.columnCount)} | ${number(s.object.bytes)} | ${md(c.lastGameDate)} |`);
  }
  lines.push('', 'Counts use the exact source edition. “Other/admin” includes null or non-action play types. Missing finished games are schedule games with final scores but no retained PBP rows.', '', '### Retained gaps', '');
  const gaps = pbp.filter(s => s.coverage.incompleteGameIds.length || s.coverage.missingFinalGameIds.length);
  if (!gaps.length) lines.push('No missing finished schedule games or candidate-incomplete retained games were found by this edition’s audit. This does not verify every physical snap or player assignment.');
  for (const s of gaps) {
    if (s.coverage.incompleteGameIds.length) lines.push(`- ${s.season} retained, candidate-incomplete: ${s.coverage.incompleteGameIds.map(id => `\`${id}\``).join(', ')}.`);
    if (s.coverage.missingFinalGameIds.length) lines.push(`- ${s.season} missing finished schedule games: ${s.coverage.missingFinalGameIds.map(id => `\`${id}\``).join(', ')}.`);
  }
  lines.push('', '## Query proof', '',
    `- [Latest persisted Jets game](examples/recent-jets-game.json): \`${recent.game.gameId}\`, ${recent.game.gameDate}; ${number(recent.rows.length)} retained source rows. Candidate-complete audit: ${md(recent.game.audit?.candidateComplete ?? 'unavailable')}.`,
    `- [Historical Film Room plays](examples/historical-film-room-plays.json): ${historical.cases.filter(c => c.status === 'exact-play').length}/${historical.cases.length} uniquely matched source records.`, '',
    '| Film Room case | Game | Source play ID | Resolution |', '| --- | --- | ---: | --- |');
  for (const c of historical.cases) lines.push(`| ${md(c.title)} | ${md(c.gameId)} | ${md(c.play?.play_id)} | ${md(c.status)} |`);
  lines.push('', `Example shards contain an explicit ${recent.projectedColumns.length}-column projection, preserving original game/play IDs and descriptions. Every full source column remains in Parquet. Each shard is capped at ${number(MAX_SHARD_BYTES)} bytes.`, '',
    ...shards.map(s => `- \`${s.file}\`: ${number(s.bytes)} bytes.`), '',
    '## Analyst evidence', '',
    `[Catalog](analyst-sources.json): ${number(summary.sources)} source records; ${Object.entries(summary.evidenceModes).map(([mode, count]) => `${number(count)} ${mode}`).join(', ')}. ${number(summary.textVerifiedClaims)} attributed statements were verified in readable text.`, '',
    `${number(summary.exactGameMatches)} catalog game references and ${number(summary.exactPlayMatches)} play candidates matched the corpus; ${number(summary.unresolvedGameMatches)} game references and ${number(summary.unresolvedPlayCandidates)} play candidates remain unresolved. Counts are catalog references and can repeat the same game/play across analysts.`, '',
    'Matching a metadata-described play to PBP verifies its identity only. No metadata source is upgraded to watched film, and no video timestamps, trajectories or assignments are invented. Written claims retain the named speaker, section locator, evidence kind and review state.', '',
    '## Remaining limits and next evidence', '', ...manifest.limitations.map(limit => `- ${limit}`),
    '- Earlier reusable PBP was not acquired; schedule/roster history must not be represented as earlier play-by-play.',
    '- The source manifest is a finite dataset selection, not an inventory of all public football statistics online.',
    '- No All-22 video, proprietary live tracking feed or complete 22-player tracking series was acquired. Aggregate NGS, participation and charting are different evidence families.',
    '- Inaccessible social video remains a discovery pointer. Official publisher pages offer accessible metadata alternatives; equivalence to a social clip must be checked.',
    '- An eventual 3D scene can join stable player IDs, canonical game/play keys, source events, reviewed analyst claims and separately labeled inferred intervals. Coordinates and unseen assignments still require evidence and review.',
    '', 'Source selection, content checksums, exact counts and these examples can be regenerated with the corpus/proof scripts. This proof step does not invoke the production refresh or change runtime delivery eligibility.', '');
  return lines.join('\n');
}

export async function generateProof({ root = DEFAULT_ROOT, reportDir = path.resolve('data/film-evidence') } = {}) {
  const corpus = await openCorpus(root);
  try {
    const { db, manifest } = corpus;
    if (!manifest.sources.some(s => s.family === 'pbp')) throw new Error('Manifest contains no PBP source.');
    const generatedAt = new Date().toISOString();
    const familySeasons = {};
    for (const family of [...new Set(manifest.sources.map(s => s.family))]) {
      const schema = await query(db, `DESCRIBE SELECT * FROM ${family}`);
      if (schema.some(column => column.column_name === 'season')) {
        familySeasons[family] = (await query(db, `SELECT DISTINCT season::INTEGER AS season FROM ${family} WHERE season IS NOT NULL ORDER BY season`)).map(row => row.season);
      }
    }
    const columnNames = (await query(db, 'DESCRIBE SELECT * FROM pbp')).map(column => column.column_name);
    for (const required of ['game_id','play_id','desc','qtr','play_type','game_date','season','week','home_team','away_team']) {
      if (!columnNames.includes(required)) throw new Error(`PBP proof requires ${required}.`);
    }
    const projectedColumns = PROOF_COLUMNS.filter(column => columnNames.includes(column));
    const projection = projectedColumns.map(quoteColumn).join(',');
    await verifyObject(root, manifest.gameAuditObject);
    const audits = JSON.parse(await readFile(path.join(root, manifest.gameAuditObject.path), 'utf8'));
    const [latest] = await query(db, `SELECT game_id, min(game_date)::VARCHAR AS game_date,
      min(season)::INTEGER AS season, min(week)::INTEGER AS week, min(home_team) AS home_team,
      min(away_team) AS away_team, count(*)::INTEGER AS raw_rows FROM pbp
      WHERE home_team='NYJ' OR away_team='NYJ' GROUP BY game_id ORDER BY game_date DESC, game_id DESC LIMIT 1`);
    if (!latest) throw new Error('No persisted Jets game to demonstrate.');
    const common = { schemaVersion: 1, corpusEdition: manifest.editionId, generatedAt, projectedColumns,
      fullPbpColumnCounts: [...new Set(manifest.sources.filter(s => s.family === 'pbp').map(s => s.columnCount))].sort((a, b) => a - b),
      limitations: ['Bounded projection of retained raw rows, not reconstructed tracking.', 'Original source descriptions are retained; action and eligibility must not be inferred solely from row presence.'] };
    const recent = { ...common, kind: 'recent-jets-game', game: { gameId: latest.game_id, gameDate: latest.game_date,
      season: latest.season, week: latest.week, homeTeam: latest.home_team, awayTeam: latest.away_team,
      rawRows: latest.raw_rows, audit: audits.find(game => game.game_id === latest.game_id) ?? null },
      source: sourceProvenance(sourceForGame(manifest, latest.game_id)),
      rows: await query(db, `SELECT ${projection} FROM pbp WHERE game_id=${sqlString(latest.game_id)} ORDER BY play_id`) };
    if (recent.rows.length !== latest.raw_rows) throw new Error('Latest game row count changed while querying.');
    const historical = { ...common, kind: 'historical-film-room-plays', cases: [] };
    for (const study of HISTORICAL_CASES) {
      const records = await query(db, `SELECT ${projection} FROM pbp WHERE game_id=${sqlString(study.gameId)}
        AND qtr=${study.qtr} AND play_type=${sqlString(study.playType)}
        AND regexp_matches("desc", ${sqlString(study.descriptionRegex)}, 'i') ORDER BY play_id LIMIT 2`);
      historical.cases.push({ id: study.id, title: study.title, gameId: study.gameId, status: records.length === 1 ? 'exact-play' : 'unresolved',
        selector: { qtr: study.qtr, play_type: study.playType, descriptionRegex: study.descriptionRegex },
        matchedRows: records.length, countCappedAt: 2, source: sourceProvenance(sourceForGame(manifest, study.gameId)),
        ...(records.length === 1 ? { canonicalPlayId: `${records[0].game_id}:${records[0].play_id}`, play: records[0] }
          : { reason: records.length ? 'Multiple source rows matched; no exact-play link assigned.' : 'No source row matched.' }) });
    }
    const catalogPath = path.join(reportDir, 'analyst-sources.json');
    const original = JSON.parse(await readFile(catalogPath, 'utf8'));
    const { catalog, summary } = await resolveCatalog(db, original, manifest, columnNames, generatedAt);
    // Validate all bounded output before replacing any published report file.
    const outputs = [
      { file: 'examples/recent-jets-game.json', ...serializeShard(recent) },
      { file: 'examples/historical-film-room-plays.json', ...serializeShard(historical) },
    ];
    const report = coverageMarkdown({ manifest, root, generatedAt, recent, historical, summary, shards: outputs, familySeasons });
    for (const output of outputs) await atomicWrite(path.join(reportDir, output.file), output.serialized);
    await atomicWrite(catalogPath, json(catalog));
    await atomicWrite(path.join(reportDir, 'coverage.md'), report);
    return { editionId: manifest.editionId, reportDir, latestJetsGame: latest.game_id,
      historicalExactPlays: historical.cases.filter(c => c.status === 'exact-play').length,
      historicalCases: historical.cases.length, catalog: summary,
      shards: outputs.map(({ file, bytes }) => ({ file, bytes })) };
  } finally { corpus.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    if (!args.includes(name)) return fallback;
    const value = args[args.indexOf(name) + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    return value;
  };
  const result = await generateProof({ root: path.resolve(option('--root', DEFAULT_ROOT)),
    reportDir: path.resolve(option('--report-dir', 'data/film-evidence')) });
  process.stdout.write(json(result));
  if (result.historicalExactPlays !== result.historicalCases) process.exitCode = 1;
}
