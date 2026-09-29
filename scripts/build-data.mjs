/**
 * Builds the Heartbreak & Miracles dataset from nflverse play-by-play.
 *
 * Metric (second half only, qtr >= 3, overtime included):
 *   Heartbreak = highest Jets win probability reached in a game they lost.
 *   Miracle    = lowest Jets win probability reached in a game they won.
 *
 * Outputs:
 *   public/data/games.json          one row per game, powers both boards
 *   public/data/curves/{id}.json    per-play win probability series, loaded on click
 *
 * Run: node scripts/build-data.mjs (current season); add --full for historical rebuild.
 * Schedule/results publish independently while complete play-by-play is pending.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEAM, SCHEDULE_SOURCE, pbpSource, parseSchedule, inferSeason, mergeAnalysis, currentManifest, readSnapshot, publishSnapshot, withDataLock, fetchText } from './data-refresh.mjs';

const FIRST_SEASON = 1999;

// Administrative rows -- END QUARTER, timeouts, two-minute warnings -- carry
// meaningless win probability. In the 2000 Oakland game an "END QUARTER 3" row
// reads 99.4% while the Jets are losing 0-21 and every real snap around it reads
// 4%. They have an EMPTY STRING posteam, not NULL, so `posteam IS NOT NULL` does
// not filter them. Anything that reads win probability must sit behind this.
const IS_SNAP = `posteam IS NOT NULL AND posteam <> '' AND play_type IS NOT NULL`;

// On top of that: kneels, spikes and nullified plays produce huge swings because
// the game is resolving, not because anything happened. They must never win
// "the play that did it".
const IS_MEANINGFUL_PLAY = `
  ${IS_SNAP}
  AND play_type NOT IN ('no_play', 'qb_kneel', 'qb_spike')
  AND "desc" NOT ILIKE '%kneels%'
  AND "desc" NOT ILIKE '%spiked the ball%'
`;

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);
const clean = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, num(v)]));

export async function extractSeason(db, season, src) {
  const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects().map(clean);
  const games = [];
  const parquet = `read_parquet('${src.replaceAll("'", "''")}')`;
  const columns = await rows(`DESCRIBE SELECT * FROM ${parquet}`);
  const hasGameEnd = columns.some((column) => column.column_name === 'game_end');
  // Terminal rows often have null WP and no possession/play type. Inspect raw
  // PBP, before filtering real snaps, so a truncated file cannot look complete.
  const terminal = `${hasGameEnd ? 'game_end = 1 OR ' : ''}trim("desc") ILIKE 'END GAME%' OR trim("desc") ILIKE 'END OF GAME%'`;
  const completed = await rows(`SELECT DISTINCT game_id FROM ${parquet}
    WHERE (home_team='${TEAM}' OR away_team='${TEAM}') AND (${terminal})`);
  const completeGameIds = new Set(completed.map((game) => game.game_id));
  // Every Jets play, flipped to the Jets' point of view.
  const jetsView = `
    SELECT
      game_id, play_id, week, season_type, game_date, qtr, "desc", play_type,
      half_seconds_remaining, game_seconds_remaining, posteam, home_team, away_team,
      roof, temp, wind, stadium,
      CASE WHEN home_team='${TEAM}' THEN home_wp ELSE away_wp END AS jets_wp,
      CASE WHEN posteam='${TEAM}' THEN wpa ELSE -wpa END AS jets_wpa,
      CASE WHEN home_team='${TEAM}' THEN home_score ELSE away_score END AS jets_final,
      CASE WHEN home_team='${TEAM}' THEN away_score ELSE home_score END AS opp_final,
      CASE WHEN home_team='${TEAM}' THEN away_team ELSE home_team END AS opponent,
      home_team='${TEAM}' AS at_home,
      total_home_score, total_away_score, home_score, away_score,
      (${IS_SNAP}) AS is_snap
    FROM ${parquet}
    WHERE (home_team='${TEAM}' OR away_team='${TEAM}') AND home_wp IS NOT NULL
  `;

  const seasonGames = await rows(`
    WITH j AS (${jetsView}),
    summary AS (
      SELECT
        game_id,
        any_value(opponent)     AS opponent,
        any_value(at_home)      AS at_home,
        any_value(week)         AS week,
        any_value(season_type)  AS season_type,
        any_value(game_date)    AS game_date,
        any_value(roof)         AS roof,
        any_value(temp)         AS temp,
        any_value(wind)         AS wind,
        any_value(stadium)      AS stadium,
        max(jets_final)         AS jets_score,
        max(opp_final)          AS opp_score,
        -- Win probability is only read off real snaps. See IS_SNAP above.
        max(CASE WHEN qtr >= 3 AND is_snap THEN jets_wp END) AS peak_h2_wp,
        min(CASE WHEN qtr >= 3 AND is_snap THEN jets_wp END) AS trough_h2_wp,
        max(qtr)                AS last_qtr,
        -- Integrity guard: the play-by-play running score must actually reach the
        -- official final. 2002_04_NYJ_JAX does not, and its win probability is
        -- built on a game that never happened.
        max(total_home_score)   AS run_home,
        max(total_away_score)   AS run_away,
        any_value(home_score)   AS official_home,
        any_value(away_score)   AS official_away
      FROM j GROUP BY game_id
    ),
    swing AS (
      SELECT game_id, play_id, "desc" AS play_desc, jets_wpa, qtr,
             half_seconds_remaining, game_seconds_remaining,
             row_number() OVER (PARTITION BY game_id ORDER BY jets_wpa ASC, play_id ASC)  AS worst_rank,
             row_number() OVER (PARTITION BY game_id ORDER BY jets_wpa DESC, play_id ASC) AS best_rank
      FROM j
      WHERE qtr >= 3 AND jets_wpa IS NOT NULL AND ${IS_MEANINGFUL_PLAY}
    )
    SELECT s.*,
           ${season} AS season,
           w.play_id AS worst_play_id, w.play_desc AS worst_play, w.jets_wpa AS worst_play_wpa,
           w.qtr AS worst_play_qtr, w.game_seconds_remaining AS worst_play_left,
           b.play_id AS best_play_id, b.play_desc AS best_play,  b.jets_wpa AS best_play_wpa,
           b.qtr AS best_play_qtr,  b.game_seconds_remaining AS best_play_left
    FROM summary s
    LEFT JOIN swing w ON w.game_id = s.game_id AND w.worst_rank = 1
    LEFT JOIN swing b ON b.game_id = s.game_id AND b.best_rank  = 1
    ORDER BY s.week
  `);

  for (const g of seasonGames) {
    const won = g.jets_score > g.opp_score;
    const tied = g.jets_score === g.opp_score;
    const dataSuspect = g.run_home !== g.official_home || g.run_away !== g.official_away;

    // nflverse normalises franchises to their current abbreviation, so a 2009 trip
    // to Oakland reads "LV". game_id preserves the abbreviation used at the time.
    const [, , awayAbbr, homeAbbr] = g.game_id.split('_');
    const opponentDisplay = g.at_home ? awayAbbr : homeAbbr;

    games.push({
      id: g.game_id,
      dataSuspect,
      opponentDisplay,
      season: g.season,
      week: g.week,
      seasonType: g.season_type,
      date: String(g.game_date).slice(0, 10),
      opponent: g.opponent,
      atHome: Boolean(g.at_home),
      jetsScore: g.jets_score,
      oppScore: g.opp_score,
      outcome: tied ? 'tie' : won ? 'win' : 'loss',
      // The headline number: peak for a loss, trough for a win.
      swing: tied ? null : won ? g.trough_h2_wp : g.peak_h2_wp,
      peakH2Wp: g.peak_h2_wp,
      troughH2Wp: g.trough_h2_wp,
      wentToOt: g.last_qtr > 4,
      stadium: g.stadium,
      roof: g.roof,
      temp: g.temp,
      wind: g.wind,
      keyPlay: won
        ? { playId: g.best_play_id, desc: g.best_play, wpa: g.best_play_wpa, qtr: g.best_play_qtr, secondsLeft: g.best_play_left }
        : { playId: g.worst_play_id, desc: g.worst_play, wpa: g.worst_play_wpa, qtr: g.worst_play_qtr, secondsLeft: g.worst_play_left },
    });
  }

  // Per-game win probability series. Small enough to fetch on click.
  const curves = await rows(`
    WITH j AS (${jetsView})
    SELECT game_id, play_id, qtr, game_seconds_remaining AS left_s, jets_wp, jets_wpa,
           "desc" AS play_desc, play_type, (${IS_MEANINGFUL_PLAY}) AS meaningful
    FROM j WHERE qtr IS NOT NULL AND ${IS_SNAP}
    ORDER BY game_id, play_id
  `);

  const byGame = new Map();
  for (const p of curves) {
    if (!byGame.has(p.game_id)) byGame.set(p.game_id, []);
    byGame.get(p.game_id).push({
      playId: p.play_id,
      meaningful: Boolean(p.meaningful),
      q: p.qtr,
      t: p.left_s,
      wp: p.jets_wp === null ? null : Math.round(p.jets_wp * 1000) / 1000,
      d: p.jets_wpa === null ? null : Math.round(p.jets_wpa * 1000) / 1000,
      desc: p.play_desc,
      type: p.play_type,
    });
  }
  return { games, curves: byGame, completeGameIds };
}

/** Refresh from official schedule/results first; analysis can legitimately arrive later. */
export async function refreshData({
  out = path.join(process.cwd(), 'public', 'data'), now = new Date(), full = false,
  fetcher = fetch, extract = null,
} = {}) {
  return withDataLock(out, async () => {
    const previous = await readSnapshot(out);
    if (!full && !previous.games.length) throw new Error('No historical snapshot; run with --full to initialize');
    const schedule = parseSchedule(await fetchText(SCHEDULE_SOURCE, fetcher));
    const season = inferSeason(schedule, now);
    const archived = new Map(previous.games.map((game) => [game.id, game]));
    const lastArchivedSeason = Math.max(FIRST_SEASON, ...previous.games.map((game) => game.season));
    const needsBackfill = (target) => schedule.some((game) => {
      const old = archived.get(game.id);
      return game.season === target && game.status === 'final' &&
        (!old || old.dataSuspect || old.jetsScore !== game.jetsScore || old.oppScore !== game.oppScore);
    });
    const seasons = full
      ? [...new Set(schedule.filter((g) => g.season >= FIRST_SEASON && g.season <= season).map((g) => g.season))].sort((a, b) => a - b)
      : [...new Set(schedule.filter((g) => g.season >= lastArchivedSeason && g.season <= season).map((g) => g.season))]
        .filter((target) => target === season || needsBackfill(target)).sort((a, b) => a - b);
    const analyses = [];
    let instance, db, temp;
    try {
      for (const target of seasons) {
        // No completed games means there is nothing to analyze yet.
        if (!schedule.some((g) => g.season === target && g.status === 'final')) continue;
        let analysis;
        if (extract) analysis = await extract(target);
        else {
          const source = pbpSource(target);
          const response = await fetcher(source, { signal: AbortSignal.timeout(60_000) });
          if (response.status === 404) analysis = null;
          else {
            if (!response.ok) throw new Error(`PBP HTTP ${response.status}: ${source}`);
            if (!db) {
              const { DuckDBInstance } = await import('@duckdb/node-api');
              instance = await DuckDBInstance.create(':memory:');
              db = await instance.connect();
              temp = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-pbp-'));
            }
            const file = path.join(temp, `${target}.parquet`);
            await writeFile(file, Buffer.from(await response.arrayBuffer()));
            analysis = await extractSeason(db, target, file);
            await rm(file);
          }
        }
        if (!analysis && target !== season) throw new Error(`Historical PBP unavailable: ${target}`);
        if (analysis) analyses.push(analysis);
      }
      const result = mergeAnalysis(previous.games, analyses, schedule, { full });
      let analysisChanged = JSON.stringify(result.games) !== JSON.stringify(previous.games);
      if (!analysisChanged) {
        for (const [id, points] of result.curves) {
          let old;
          try { old = await readFile(path.join(out, 'curves', `${id}.json`), 'utf8'); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (old !== JSON.stringify(points)) { analysisChanged = true; break; }
        }
      }
      const current = currentManifest({ season, schedule, games: result.games, now, previous: previous.current, analysisChanged });
      await publishSnapshot(out, { ...result, current });
      const finals = current.schedule.filter((g) => g.status === 'final').length;
      console.log(`${season}: ${finals} confirmed results; ${result.games.length} archived games; latest analyzed: ${current.latestAnalyzedGameId ?? 'pending'}`);
      return current;
    } finally {
      if (db) db.closeSync();
      if (instance) instance.closeSync();
      if (temp) await rm(temp, { recursive: true, force: true });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--full')) {
    console.error('Usage: node scripts/build-data.mjs [--full]');
    process.exitCode = 1;
  } else {
    refreshData({ full: args.includes('--full') }).catch((error) => {
      console.error(`Data refresh failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
