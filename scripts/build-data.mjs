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
 * Run: node scripts/build-data.mjs
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FIRST_SEASON = 1999;
const LAST_SEASON = 2025;
const TEAM = 'NYJ';

const OUT = path.join(process.cwd(), 'public', 'data');
const url = (s) =>
  `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${s}.parquet`;

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

const instance = await DuckDBInstance.create(':memory:');
const db = await instance.connect();
await db.run('INSTALL httpfs; LOAD httpfs;');

const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects().map(clean);

const games = [];
let curvesWritten = 0;

await mkdir(path.join(OUT, 'curves'), { recursive: true });

for (let season = FIRST_SEASON; season <= LAST_SEASON; season++) {
  const src = url(season);

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
    FROM read_parquet('${src}')
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
      SELECT game_id, "desc" AS play_desc, jets_wpa, qtr,
             half_seconds_remaining, game_seconds_remaining,
             row_number() OVER (PARTITION BY game_id ORDER BY jets_wpa ASC)  AS worst_rank,
             row_number() OVER (PARTITION BY game_id ORDER BY jets_wpa DESC) AS best_rank
      FROM j
      WHERE qtr >= 3 AND jets_wpa IS NOT NULL AND ${IS_MEANINGFUL_PLAY}
    )
    SELECT s.*,
           ${season} AS season,
           w.play_desc AS worst_play, w.jets_wpa AS worst_play_wpa,
           w.qtr AS worst_play_qtr, w.game_seconds_remaining AS worst_play_left,
           b.play_desc AS best_play,  b.jets_wpa AS best_play_wpa,
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
        ? { desc: g.best_play, wpa: g.best_play_wpa, qtr: g.best_play_qtr, secondsLeft: g.best_play_left }
        : { desc: g.worst_play, wpa: g.worst_play_wpa, qtr: g.worst_play_qtr, secondsLeft: g.worst_play_left },
    });
  }

  // Per-game win probability series. Small enough to fetch on click.
  const curves = await rows(`
    WITH j AS (${jetsView})
    SELECT game_id, play_id, qtr, game_seconds_remaining AS left_s, jets_wp, jets_wpa,
           "desc" AS play_desc, play_type
    FROM j WHERE qtr IS NOT NULL AND ${IS_SNAP}
    ORDER BY game_id, play_id
  `);

  const byGame = new Map();
  for (const p of curves) {
    if (!byGame.has(p.game_id)) byGame.set(p.game_id, []);
    byGame.get(p.game_id).push({
      q: p.qtr,
      t: p.left_s,
      wp: p.jets_wp === null ? null : Math.round(p.jets_wp * 1000) / 1000,
      d: p.jets_wpa === null ? null : Math.round(p.jets_wpa * 1000) / 1000,
      desc: p.play_desc,
      type: p.play_type,
    });
  }
  for (const [id, series] of byGame) {
    await writeFile(path.join(OUT, 'curves', `${id}.json`), JSON.stringify(series));
    curvesWritten++;
  }

  process.stdout.write(`${season}: ${seasonGames.length} games  `);
}

games.sort((a, b) => (a.date < b.date ? -1 : 1));
await writeFile(path.join(OUT, 'games.json'), JSON.stringify(games, null, 0));

const eligible = games.filter((g) => !g.dataSuspect && g.swing != null);
const losses = eligible.filter((g) => g.outcome === 'loss').sort((a, b) => b.swing - a.swing);
const wins = eligible.filter((g) => g.outcome === 'win').sort((a, b) => a.swing - b.swing);
const suspect = games.filter((g) => g.dataSuspect);

const line = (g) =>
  `  ${g.date} ${g.atHome ? 'vs' : 'at'} ${g.opponentDisplay}  ${(g.swing * 100).toFixed(1)}%  ` +
  `${g.outcome === 'win' ? 'won' : 'lost'} ${g.jetsScore}-${g.oppScore}\n      ${String(g.keyPlay.desc).slice(0, 88)}`;

console.log(`\n\n${games.length} games, ${curvesWritten} curves written.`);
console.log(`${suspect.length} excluded as data-suspect: ${suspect.map((g) => g.id).join(', ') || 'none'}`);
console.log('\nWorst heartbreak, all time:');
losses.slice(0, 5).forEach((g) => console.log(line(g)));
console.log('\nBiggest miracle, all time:');
wins.slice(0, 5).forEach((g) => console.log(line(g)));

await db.closeSync();
