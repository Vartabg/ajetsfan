const TEAM = 'NYJ';
const GAME_ID = /^\d{4}_\d{2}_[A-Z]+_[A-Z]+$/;
export const ANALYTICS_DEFINITIONS = {
  epaPerPlay: 'Expected points added (EPA) summed across included plays, divided by their count. Positive offensive EPA is better; lower defensive EPA allowed is better.',
  successRate: 'Included plays with EPA greater than zero divided by the same included-play count. Rates are fractions from 0 to 1.',
  passRush: 'Dropback EPA uses qb_dropback=1, including sacks and scrambles. Designed rushing EPA uses the remaining included runs. Splits exclude kneels and spikes.',
  scope: 'Current-season REG games confirmed final by the schedule, with terminal game_end/END GAME evidence and reconciled PBP scoring. Clean scrimmage plays only: down 1–4, play_type run/pass, valid possession/defense teams, finite EPA; excludes no-plays, kneels, spikes and two-point attempts. All game situations included; not opponent-adjusted.',
};
const count = (row, key) => Number(row[key] ?? 0);
const blankTotals = () => ({ plays: 0, epa: 0, successes: 0, passPlays: 0, passEpa: 0, rushPlays: 0, rushEpa: 0 });
const safeRate = (total, denominator) => denominator ? total / denominator : null;

function addTotals(total, row) {
  for (const key of Object.keys(total)) total[key] += count(row, key);
}

function metrics(total) {
  return {
    plays: total.plays, epaPerPlay: safeRate(total.epa, total.plays), successRate: safeRate(total.successes, total.plays),
    passPlays: total.passPlays, passEpaPerPlay: safeRate(total.passEpa, total.passPlays),
    rushPlays: total.rushPlays, rushEpaPerPlay: safeRate(total.rushEpa, total.rushPlays),
  };
}

/** Competition ranks share ties (1, 1, 3); use unrounded values, lower allowed EPA/success is better. */
export function competitionRanks(teams, side, field, ascending = false) {
  const eligible = teams.filter((team) => Number.isFinite(team[side][field]));
  return new Map(eligible.map((team) => [team.team, 1 + eligible.filter((other) =>
    ascending ? other[side][field] < team[side][field] - 1e-12 : other[side][field] > team[side][field] + 1e-12,
  ).length]));
}

/** Build a small public snapshot from per-game SQL totals, never from rounded rates. */
export function buildAnalytics({ season, schedule, states, totals, swings = [], now, sources }) {
  const league = schedule.filter((game) => game.season === season && game.seasonType === 'REG');
  const finals = league.filter((game) => game.status === 'final' && game.date <= now.toISOString().slice(0, 10));
  const stateById = new Map(states.map((row) => [row.id, row]));
  const totalsById = new Map();
  for (const row of totals) {
    if (!totalsById.has(row.id)) totalsById.set(row.id, new Map());
    if (totalsById.get(row.id).has(row.team)) throw new Error(`Duplicate analytics totals: ${row.id}/${row.team}`);
    totalsById.get(row.id).set(row.team, row);
  }
  const accepted = finals.filter((game) => {
    const state = stateById.get(game.id);
    if (!state?.complete) return false;
    if (state.homeTeam !== game.homeTeam || state.awayTeam !== game.awayTeam ||
        state.homeScore !== game.homeScore || state.awayScore !== game.awayScore) throw new Error(`Analytics PBP/schedule mismatch: ${game.id}`);
    if (state.runningHome !== game.homeScore || state.runningAway !== game.awayScore) return false;
    const bothSides = totalsById.get(game.id);
    return count(bothSides?.get(game.homeTeam) ?? {}, 'plays') > 0 && count(bothSides?.get(game.awayTeam) ?? {}, 'plays') > 0;
  });
  const aggregate = new Map([...new Set(league.flatMap((game) => [game.homeTeam, game.awayTeam]))].sort().map((team) =>
    [team, { completedGames: 0, offense: blankTotals(), defense: blankTotals() }],
  ));
  const games = [];
  for (const game of accepted) {
    const rows = totalsById.get(game.id);
    for (const [team, opponent] of [[game.homeTeam, game.awayTeam], [game.awayTeam, game.homeTeam]]) {
      const entry = aggregate.get(team);
      entry.completedGames++;
      addTotals(entry.offense, rows.get(team));
      addTotals(entry.defense, rows.get(opponent));
    }
    if (game.homeTeam === TEAM || game.awayTeam === TEAM) {
      const atHome = game.homeTeam === TEAM;
      const opponent = atHome ? game.awayTeam : game.homeTeam;
      games.push({
        id: game.id, date: game.date, week: game.week, opponent, opponentDisplay: opponent, atHome,
        offense: metrics(rows.get(TEAM)), defense: metrics(rows.get(opponent)),
        bigSwings: swings.filter((play) => play.id === game.id).slice(0, 3).map(({ playId, desc, qtr, secondsLeft, wpa }) =>
          ({ playId, desc, qtr, secondsLeft, wpa })),
      });
    }
  }
  const teams = [...aggregate].map(([team, row]) => ({ team, completedGames: row.completedGames, offense: metrics(row.offense), defense: metrics(row.defense) }));
  const rankOffenseEpa = competitionRanks(teams, 'offense', 'epaPerPlay');
  const rankDefenseEpa = competitionRanks(teams, 'defense', 'epaPerPlay', true);
  const rankOffenseSuccess = competitionRanks(teams, 'offense', 'successRate');
  const rankDefenseSuccess = competitionRanks(teams, 'defense', 'successRate', true);
  for (const team of teams) team.ranks = {
    offenseEpa: rankOffenseEpa.get(team.team) ?? null, defenseEpa: rankDefenseEpa.get(team.team) ?? null,
    offenseSuccess: rankOffenseSuccess.get(team.team) ?? null, defenseSuccess: rankDefenseSuccess.get(team.team) ?? null,
  };
  const ids = new Set(accepted.map((game) => game.id));
  const value = {
    schemaVersion: 1, season, analysisUpdatedAt: accepted.length ? now.toISOString() : null,
    throughDate: accepted.length ? accepted.map((game) => game.date).sort().at(-1) : null,
    throughWeek: accepted.length ? Math.max(...accepted.map((game) => game.week)) : null,
    analyzedGameIds: [...ids].sort(), pendingGameIds: finals.filter((game) => !ids.has(game.id)).map((game) => game.id).sort(),
    definitions: ANALYTICS_DEFINITIONS, sources, teams, games,
  };
  validateAnalytics(value);
  return value;
}

/** No analysis timestamp advance for an unchanged payload, or an upstream coverage regression. */
export function retainAnalytics(candidate, previous, now) {
  if (!candidate) return previous;
  if (previous?.season !== candidate.season) return candidate;
  if (previous.analyzedGameIds.some((id) => !candidate.analyzedGameIds.includes(id))) return previous;
  const withoutTimestamp = (value) => JSON.stringify({ ...value, analysisUpdatedAt: null });
  if (withoutTimestamp(previous) === withoutTimestamp(candidate)) return previous;
  const withoutPending = (value) => JSON.stringify({ ...value, analysisUpdatedAt: null, pendingGameIds: [] });
  if (withoutPending(previous) === withoutPending(candidate)) return { ...candidate, analysisUpdatedAt: previous.analysisUpdatedAt };
  return { ...candidate, analysisUpdatedAt: candidate.analyzedGameIds.length ? now.toISOString() : null };
}

export function validateAnalytics(value) {
  if (value.schemaVersion !== 1 || !Number.isInteger(value.season) || !Array.isArray(value.teams) || !Array.isArray(value.games) ||
      !Array.isArray(value.analyzedGameIds) || !Array.isArray(value.pendingGameIds)) throw new Error('Invalid analytics schema');
  const analyzed = new Set(value.analyzedGameIds);
  if (analyzed.size !== value.analyzedGameIds.length || value.analyzedGameIds.some((id) => !GAME_ID.test(id)) ||
      value.pendingGameIds.some((id) => !GAME_ID.test(id) || analyzed.has(id))) throw new Error('Invalid analytics game coverage');
  if ([...value.analyzedGameIds, ...value.pendingGameIds].some((id) => Number(id.slice(0, 4)) !== value.season)) throw new Error('Analytics season/coverage mismatch');
  for (const field of ['schedule', 'pbp', 'methodology']) if (typeof value.sources?.[field] !== 'string') throw new Error('Analytics source metadata missing');
  for (const field of ['epaPerPlay', 'successRate', 'passRush', 'scope']) if (typeof value.definitions?.[field] !== 'string') throw new Error('Analytics definitions missing');
  const names = new Set();
  const checkMetrics = (row) => {
    if (!Number.isInteger(row.plays) || row.plays < 0 || !Number.isInteger(row.passPlays) || row.passPlays < 0 ||
        !Number.isInteger(row.rushPlays) || row.rushPlays < 0 || row.passPlays + row.rushPlays !== row.plays) throw new Error('Invalid analytics denominator');
    for (const [field, denominator] of [['epaPerPlay', row.plays], ['successRate', row.plays], ['passEpaPerPlay', row.passPlays], ['rushEpaPerPlay', row.rushPlays]]) {
      if (denominator === 0 ? row[field] !== null : !Number.isFinite(row[field])) throw new Error(`Invalid analytics rate: ${field}`);
    }
    if (row.successRate !== null && (row.successRate < 0 || row.successRate > 1)) throw new Error('Invalid analytics success rate');
  };
  for (const row of value.teams) {
    if (names.has(row.team) || !/^[A-Z]+$/.test(row.team) || !Number.isInteger(row.completedGames) || row.completedGames < 0 ||
        row.completedGames > value.analyzedGameIds.length) throw new Error('Invalid analytics team');
    names.add(row.team);
    checkMetrics(row.offense); checkMetrics(row.defense);
    for (const rank of Object.values(row.ranks)) if (rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > value.teams.length)) throw new Error('Invalid analytics rank');
  }
  for (const [rankField, side, metric, ascending] of [
    ['offenseEpa', 'offense', 'epaPerPlay', false], ['defenseEpa', 'defense', 'epaPerPlay', true],
    ['offenseSuccess', 'offense', 'successRate', false], ['defenseSuccess', 'defense', 'successRate', true],
  ]) {
    const expected = competitionRanks(value.teams, side, metric, ascending);
    if (value.teams.some((team) => team.ranks[rankField] !== (expected.get(team.team) ?? null))) throw new Error('Analytics rank does not match observed rates');
  }
  for (const row of value.games) {
    if (!analyzed.has(row.id)) throw new Error(`Analytics game outside coverage: ${row.id}`);
    checkMetrics(row.offense); checkMetrics(row.defense);
    for (const play of row.bigSwings) if (!Number.isFinite(play.wpa) || play.wpa < -1 || play.wpa > 1) throw new Error('Invalid analytics play swing');
  }
  if (value.analyzedGameIds.length && (!value.analysisUpdatedAt || !Number.isFinite(Date.parse(value.analysisUpdatedAt)) || !value.throughDate || !Number.isInteger(value.throughWeek))) {
    throw new Error('Analytics cutoff is missing');
  }
  if (!value.analyzedGameIds.length && (value.analysisUpdatedAt !== null || value.throughDate !== null || value.throughWeek !== null)) throw new Error('Empty analytics has a fabricated cutoff');
}

export async function extractAnalytics(db, season, src, schedule, now, sources) {
  const clean = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]));
  const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects().map(clean);
  const parquet = `read_parquet('${src.replaceAll("'", "''")}')`;
  const columns = new Set((await rows(`DESCRIBE SELECT * FROM ${parquet}`)).map((row) => row.column_name));
  for (const field of ['epa', 'down', 'posteam', 'defteam', 'play_type', 'qb_kneel', 'qb_spike', 'qb_dropback', 'two_point_attempt']) {
    if (!columns.has(field)) throw new Error(`Missing analytics PBP column: ${field}`);
  }
  const terminal = `${columns.has('game_end') ? 'game_end=1 OR ' : ''}trim("desc") ILIKE 'END GAME%' OR trim("desc") ILIKE 'END OF GAME%'`;
  const states = await rows(`SELECT game_id AS id, any_value(home_team) AS "homeTeam", any_value(away_team) AS "awayTeam",
    max(home_score) AS "homeScore", max(away_score) AS "awayScore", max(total_home_score) AS "runningHome",
    max(total_away_score) AS "runningAway", bool_or(${terminal}) AS complete
    FROM ${parquet} WHERE season_type='REG' GROUP BY game_id`);
  const totals = await rows(`SELECT game_id AS id, posteam AS team, count(*) AS plays, sum(epa) AS epa,
    sum(CASE WHEN epa>0 THEN 1 ELSE 0 END) AS successes,
    sum(CASE WHEN qb_dropback=1 THEN 1 ELSE 0 END) AS "passPlays",
    sum(CASE WHEN qb_dropback=1 THEN epa ELSE 0 END) AS "passEpa",
    sum(CASE WHEN coalesce(qb_dropback,0)<>1 THEN 1 ELSE 0 END) AS "rushPlays",
    sum(CASE WHEN coalesce(qb_dropback,0)<>1 THEN epa ELSE 0 END) AS "rushEpa"
    FROM ${parquet} WHERE season_type='REG' AND down BETWEEN 1 AND 4 AND play_type IN ('pass','run')
      AND coalesce(qb_kneel,0)<>1 AND coalesce(qb_spike,0)<>1 AND coalesce(two_point_attempt,0)<>1
      AND epa IS NOT NULL AND isfinite(epa) AND posteam IN (home_team,away_team)
      AND defteam IN (home_team,away_team) AND posteam<>defteam
    GROUP BY game_id, posteam`);
  const swings = await rows(`WITH meaningful AS (
    SELECT game_id AS id, play_id AS "playId", "desc", qtr, game_seconds_remaining AS "secondsLeft",
      CASE WHEN posteam='${TEAM}' THEN wpa ELSE -wpa END AS wpa,
      row_number() OVER (PARTITION BY game_id ORDER BY abs(wpa) DESC, play_id ASC) AS n
    FROM ${parquet} WHERE season_type='REG' AND (home_team='${TEAM}' OR away_team='${TEAM}')
      AND posteam IN (home_team,away_team) AND play_type IS NOT NULL
      AND play_type NOT IN ('no_play','qb_kneel','qb_spike') AND coalesce(qb_kneel,0)<>1 AND coalesce(qb_spike,0)<>1
      AND wpa IS NOT NULL AND isfinite(wpa)
  ) SELECT id, "playId", "desc", qtr, "secondsLeft", wpa FROM meaningful WHERE n<=3 ORDER BY id,n`);
  return buildAnalytics({ season, schedule, states, totals, swings, now, sources });
}
