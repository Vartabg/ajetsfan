import { parseCsv, parseLeagueSchedule, SCHEDULE_SOURCE } from './data-refresh.mjs';

const TEAM = 'NYJ';
const phases = ['all', 'regular', 'playoffs'];
const lineage = { OAK: 'LV', SD: 'LAC', STL: 'LA' };
const normalizedTeam = (team) => lineage[team] ?? team;
const missing = (value) => value === undefined || value === null || ['', 'NA', 'N/A', 'null'].includes(value);
const offenseFields = ['attempts', 'passing_yards', 'passing_tds', 'carries', 'rushing_yards', 'rushing_tds', 'receptions', 'receiving_yards', 'receiving_tds', 'targets'];
const yardFields = ['passing_yards', 'sack_yards_lost', 'rushing_yards'];
const playerMetrics = [
  ['passing-yards', 'Passing yards', 'yards', 'passing_yards', 'attempts', 'Players with at least one passing attempt'],
  ['passing-touchdowns', 'Passing touchdowns', 'count', 'passing_tds', 'attempts', 'Players with at least one passing attempt'],
  ['rushing-yards', 'Rushing yards', 'yards', 'rushing_yards', 'carries', 'Players with at least one carry'],
  ['rushing-touchdowns', 'Rushing touchdowns', 'count', 'rushing_tds', 'carries', 'Players with at least one carry'],
  ['receiving-yards', 'Receiving yards', 'yards', 'receiving_yards', 'targets', 'Players with at least one target'],
  ['receptions', 'Receptions', 'count', 'receptions', 'targets', 'Players with at least one target'],
  ['receiving-touchdowns', 'Receiving touchdowns', 'count', 'receiving_tds', 'targets', 'Players with at least one target'],
  ['sacks', 'Credited sacks', 'sacks', 'def_sacks', 'def_sacks', 'Named players credited with a sack'],
  ['interceptions', 'Defensive interceptions', 'count', 'def_interceptions', 'def_interceptions', 'Named players credited with an interception'],
  ['field-goals', 'Field goals made', 'count', 'fg_made', 'fg_att', 'Players with at least one field-goal attempt'],
];
const individualFields = [...new Set([...offenseFields, ...playerMetrics.flatMap((metric) => [metric[3], metric[4]])])];

function sourceYear(year) {
  if (!Number.isInteger(year) || year < 1999 || year > 9999) throw new Error('Unsupported statistical season');
  return year;
}

export const seasonTeamSource = (year) => `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${sourceYear(year)}.csv`;
export const seasonPlayerSource = (year) => `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${sourceYear(year)}.csv`;

function stat(row, field) {
  if (missing(row[field])) return null;
  const value = Number(row[field]);
  const signed = field.endsWith('_yards') || field === 'sack_yards_lost';
  const integral = field === 'def_sacks' ? Number.isInteger(value * 2) : Number.isInteger(value);
  if (!Number.isFinite(value) || !integral || (!signed && value < 0) || (field === 'sack_yards_lost' && value > 0)) {
    throw new Error(`Invalid ${field} in ${row.game_id}/${row.team}`);
  }
  return value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid rankings check time');
  return new Date(value).toISOString();
}

function validCalendarDate(value, year) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return false;
  const calendarYear = Number(value.slice(0, 4)), month = Number(value.slice(5, 7));
  return calendarYear === year && month >= 8 || calendarYear === year + 1 && month <= 2;
}

function validatedSchedule(input, year, cutoff) {
  const schedule = typeof input === 'string' ? parseLeagueSchedule(input) : input;
  if (!Array.isArray(schedule)) throw new Error('Missing league schedule');
  const ids = new Set();
  return schedule.filter((game) => game.season === year).filter((game) => {
    if (ids.has(game.id)) throw new Error(`Duplicate ranking schedule fixture: ${game.id}`);
    ids.add(game.id);
    const [, week, away, home] = String(game.id).split('_');
    if (!['REG', 'POST'].includes(game.seasonType) || !Number.isInteger(game.week) || game.week < 1 || game.week > 30 ||
        game.id !== `${year}_${String(game.week).padStart(2, '0')}_${game.awayTeam}_${game.homeTeam}` ||
        Number(week) !== game.week || away === home || !/^[A-Z]{2,3}$/.test(away) || !/^[A-Z]{2,3}$/.test(home) ||
        !validCalendarDate(game.date, year) || !['final', 'scheduled'].includes(game.status)) throw new Error(`Invalid ranking schedule fixture: ${game.id}`);
    if (game.status !== 'final') return false;
    if (![game.homeScore, game.awayScore].every((score) => Number.isInteger(score) && score >= 0)) throw new Error(`Invalid ranking final score: ${game.id}`);
    return game.date <= cutoff;
  });
}

function weeklyRows(csv, year, schedule, player = false) {
  if (!csv) return [];
  const rows = Array.isArray(csv) ? csv : parseCsv(csv);
  const games = new Map(schedule.map((game) => [game.id, game]));
  const seen = new Set();
  const accepted = [];
  for (const row of rows) {
    if (Number(row.season) !== year) continue;
    const game = games.get(row.game_id);
    if (!game) continue; // Never admit stats from an unconfirmed or future fixture.
    const team = normalizedTeam(row.team), opponent = normalizedTeam(row.opponent_team);
    const home = normalizedTeam(game.homeTeam), away = normalizedTeam(game.awayTeam);
    const unassigned = missing(team) || missing(opponent);
    if (row.season_type !== game.seasonType || Number(row.week) !== game.week ||
        (!missing(team) && ![home, away].includes(team)) || (!missing(opponent) && ![home, away].includes(opponent)) ||
        (!unassigned && !((team === home && opponent === away) || (team === away && opponent === home)))) throw new Error(`Ranking stats identity mismatch: ${row.game_id}/${row.team}`);
    // Legacy feeds use 0 and XX-prefixed IDs for unattributed/team credits.
    const anonymous = player && (missing(row.player_id) || row.player_id === '0' || /^XX-\d{7}$/.test(row.player_id));
    const identity = player ? `${row.game_id}/${anonymous ? `team:${team}` : row.player_id}` : `${row.game_id}/${team}`;
    if (seen.has(identity)) throw new Error(`Duplicate ranking stats row: ${identity}`);
    seen.add(identity);
    if (player && !anonymous && (!/^\d{2}-\d{7}$/.test(row.player_id) || (!row.player_display_name && !row.player_name))) throw new Error(`Invalid ranking player identity: ${identity}`);
    const fields = player ? individualFields : [...new Set([...yardFields, ...individualFields])];
    accepted.push({ ...row, team, opponent_team: opponent, anonymous, unassigned, values: Object.fromEntries(fields.map((field) => [field, stat(row, field)])) });
  }
  return accepted;
}

/** Integer numerators and game counts are compared before rounding (competition ties 1,1,3). */
function ranked(entries, direction = 'higher') {
  const compare = (a, b) => a.numerator * b.denominator - b.numerator * a.denominator;
  return entries.map((entry) => ({
    ...entry,
    rank: 1 + entries.filter((other) => direction === 'higher' ? compare(other, entry) > 0 : compare(other, entry) < 0).length,
    tied: entries.some((other) => other.id !== entry.id && compare(other, entry) === 0),
  })).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)).map(({ numerator, denominator, ...entry }) => ({ ...entry, value: numerator / denominator }));
}

function teamMetric(id, label, entries, field, direction, populationLabel, note) {
  const values = ranked(entries.map((entry) => ({ id: entry.team, name: entry.team, numerator: entry[field], denominator: entry.games, games: entry.games })), direction);
  return { id, label, unit: 'perGame', direction, populationLabel, population: values.length,
    jets: values.find((entry) => entry.id === TEAM) ?? null, leaders: values.slice(0, 3), note };
}

function buildPhase(phase, schedule, teams, players) {
  const games = schedule.filter((game) => phase === 'all' || game.seasonType === (phase === 'regular' ? 'REG' : 'POST'));
  const ids = new Set(games.map((game) => game.id));
  const teamRows = new Map(teams.filter((row) => ids.has(row.game_id) && !row.unassigned).map((row) => [`${row.game_id}/${row.team}`, row]));
  const playerRows = new Map();
  for (const row of players) if (ids.has(row.game_id) && !row.unassigned) {
    const key = `${row.game_id}/${row.team}`;
    if (!playerRows.has(key)) playerRows.set(key, []);
    playerRows.get(key).push(row);
  }
  const unassignedByGame = new Map();
  for (const row of [...teams, ...players]) if (ids.has(row.game_id) && row.unassigned) {
    if (!unassignedByGame.has(row.game_id)) unassignedByGame.set(row.game_id, []);
    unassignedByGame.get(row.game_id).push(row);
  }
  const missingTeamGames = [], missingPlayerGames = [], metricGaps = new Set();
  const aggregates = new Map();
  const includedPlayers = [];
  for (const game of games) {
    const unassigned = unassignedByGame.get(game.id) ?? [];
    const unknownOffense = unassigned.some((row) => [...yardFields, 'attempts', 'carries'].some((field) => row.values[field] === null || row.values[field] !== undefined && row.values[field] !== 0));
    for (const row of unassigned) for (const [, , , field, qualifier] of playerMetrics) if (row.values[field] !== 0 || row.values[qualifier] === null || row.values[qualifier] > 0) {
      metricGaps.add(field); metricGaps.add(qualifier);
    }
    const participants = [[normalizedTeam(game.homeTeam), normalizedTeam(game.awayTeam), game.homeScore, game.awayScore], [normalizedTeam(game.awayTeam), normalizedTeam(game.homeTeam), game.awayScore, game.homeScore]];
    const bothTeams = !unknownOffense && participants.every(([team]) => {
      const row = teamRows.get(`${game.id}/${team}`);
      return row && yardFields.every((field) => row.values[field] !== null);
    });
    if (!bothTeams) missingTeamGames.push(game.id);
    let bothPlayers = !unknownOffense;
    for (const [team, opponent, points, allowed] of participants) {
      if (!aggregates.has(team)) aggregates.set(team, { team, games: 0, points: 0, pointsAllowed: 0, yards: 0, yardsAllowed: 0, pass: 0, passAllowed: 0, rush: 0, rushAllowed: 0 });
      const entry = aggregates.get(team);
      entry.games++; entry.points += points; entry.pointsAllowed += allowed;
      if (bothTeams) {
        const row = teamRows.get(`${game.id}/${team}`).values, opposing = teamRows.get(`${game.id}/${opponent}`).values;
        entry.pass += row.passing_yards + row.sack_yards_lost; entry.passAllowed += opposing.passing_yards + opposing.sack_yards_lost;
        entry.rush += row.rushing_yards; entry.rushAllowed += opposing.rushing_yards;
        entry.yards += row.passing_yards + row.sack_yards_lost + row.rushing_yards;
        entry.yardsAllowed += opposing.passing_yards + opposing.sack_yards_lost + opposing.rushing_yards;
      }
      const teamPlayers = playerRows.get(`${game.id}/${team}`);
      const teamTotals = teamRows.get(`${game.id}/${team}`)?.values;
      if (!teamPlayers?.length || !teamTotals) {
        bothPlayers = false;
        for (const field of individualFields) metricGaps.add(field);
      } else for (const field of individualFields) {
        const reconciled = teamTotals[field] !== null && teamPlayers.every((row) => row.values[field] !== null)
          && teamPlayers.reduce((sum, row) => sum + row.values[field], 0) === teamTotals[field];
        if (!reconciled) {
          metricGaps.add(field);
          if (offenseFields.includes(field)) bothPlayers = false;
        }
      }
      // Unattributed offensive/kicking credits leave the player population unknown.
      // Defensive tables explicitly rank named recipients, excluding team credits.
      for (const [, , , field, qualifier] of playerMetrics) if (!field.startsWith('def_') && teamPlayers?.some((row) => row.anonymous && row.values[qualifier] > 0)) {
        metricGaps.add(field); metricGaps.add(qualifier); bothPlayers = false;
      }
      if (teamPlayers?.length) includedPlayers.push(...teamPlayers);
    }
    if (!bothPlayers) missingPlayerGames.push(game.id);
  }
  const populationLabel = phase === 'playoffs' ? 'Teams with a confirmed postseason final' : phase === 'all' ? 'Teams with a confirmed regular-season or postseason final' : 'Teams with a confirmed regular-season final';
  const entries = [...aggregates.values()];
  const note = 'Per confirmed final. Competition ranks share ties (1,1,3), using exact totals divided by games before rounding.';
  const team = entries.length ? [teamMetric('points-per-game', 'Points scored per game', entries, 'points', 'higher', populationLabel, note), teamMetric('points-allowed-per-game', 'Points allowed per game', entries, 'pointsAllowed', 'lower', populationLabel, note)] : [];
  if (entries.length && !missingTeamGames.length) for (const [id, label, field, direction] of [
    ['net-yards-per-game', 'Net yards per game', 'yards', 'higher'], ['yards-allowed-per-game', 'Net yards allowed per game', 'yardsAllowed', 'lower'],
    ['net-passing-per-game', 'Net passing yards per game', 'pass', 'higher'], ['rushing-per-game', 'Rushing yards per game', 'rush', 'higher'],
    ['passing-allowed-per-game', 'Net passing yards allowed per game', 'passAllowed', 'lower'], ['rushing-allowed-per-game', 'Rushing yards allowed per game', 'rushAllowed', 'lower'],
  ]) team.push(teamMetric(id, label, entries, field, direction, populationLabel, `${note} Net passing subtracts sack yardage; defense mirrors the opponent's offense.`));
  const individual = [];
  if (games.length) {
    const byPlayer = new Map();
    for (const row of includedPlayers) {
      if (row.anonymous) continue;
      if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, { id: row.player_id, name: row.player_display_name || row.player_name, position: row.position || '', teams: new Set(), games: new Set(), jetsGames: new Set(), values: {}, jetsValues: {} });
      const entry = byPlayer.get(row.player_id);
      entry.teams.add(row.team); entry.games.add(row.game_id);
      if (row.team === TEAM) entry.jetsGames.add(row.game_id);
      for (const field of individualFields) {
        if (row.values[field] === null) { metricGaps.add(field); continue; }
        entry.values[field] = (entry.values[field] ?? 0) + row.values[field];
        if (row.team === TEAM) entry.jetsValues[field] = (entry.jetsValues[field] ?? 0) + row.values[field];
      }
    }
    for (const [id, label, unit, field, qualifier, eligibleLabel] of playerMetrics) {
      if (metricGaps.has(field) || metricGaps.has(qualifier)) continue;
      const eligible = [...byPlayer.values()].filter((entry) => entry.values[qualifier] > 0);
      if (!eligible.length) continue;
      const values = ranked(eligible.map((entry) => ({ id: entry.id, name: entry.name, position: entry.position, numerator: entry.values[field] ?? 0, denominator: 1,
        games: entry.games.size, teams: [...entry.teams].sort(), jetsValue: entry.jetsValues[field] ?? 0, jetsGames: entry.jetsGames.size })));
      individual.push({ id, label, unit, direction: 'higher', populationLabel: `${eligibleLabel}${phase === 'playoffs' ? ' in the postseason' : phase === 'regular' ? ' in the regular season' : ' across regular season and postseason'}`,
        population: values.length, jets: null, leaders: values.slice(0, 3), players: values.filter((entry) => entry.jetsGames > 0),
        note: `Full all-club totals determine rank; Jets stint totals and games are shown separately. Competition ties share ranks (1,1,3).${field.startsWith('def_') ? ' Named-player credits from the source; anonymous team credits are excluded and can differ from team defensive totals.' : ''}` });
    }
  }
  const notes = [];
  if (!games.length) notes.push('No confirmed finals exist for this phase in this snapshot.');
  if (missingTeamGames.length) notes.push(`Yardage ranks are withheld: ${missingTeamGames.length} confirmed league games lack complete team statistics.`);
  if ([...unassignedByGame.values()].flat().some((row) => Object.values(row.values).some((value) => value === null || value !== 0))) notes.push('Unassigned source credits are not attributed to a club or player. Affected statistical populations are withheld.');
  if (missingPlayerGames.length) notes.push(`Complete player coverage is missing for ${missingPlayerGames.length} confirmed league games. Only individually reconciled metrics can produce ranks.`);
  for (const [, label, , field, qualifier] of playerMetrics) if (metricGaps.has(field) || metricGaps.has(qualifier)) notes.push(`${label} ranks are withheld: a confirmed league game has missing player fields or player totals that do not reconcile to team statistics.`);
  if (phase === 'playoffs') notes.push('Postseason ranks compare playoff participants only. Unequal games reflect how far teams and players advanced.');
  if (phase === 'all') notes.push('Combined totals include regular-season and postseason games; postseason advancement adds games.');
  return { phase, expectedGames: games.length, teamGames: games.length - missingTeamGames.length, playerGames: games.length - missingPlayerGames.length,
    missingTeamGames, missingPlayerGames, jetsGames: games.filter((game) => [normalizedTeam(game.homeTeam), normalizedTeam(game.awayTeam)].includes(TEAM)).length,
    throughDate: games.length ? games.map((game) => game.date).sort().at(-1) : null, team, individual, notes };
}

/** Full-league, phase-specific rank snapshots. Incomplete populations never produce yardage/player ranks. */
export function buildSeasonRankings({ year, checkedAt, schedule, teamCsv, playerCsv }) {
  sourceYear(year);
  const checked = timestamp(checkedAt);
  const games = validatedSchedule(schedule, year, checked.slice(0, 10));
  const teams = weeklyRows(teamCsv, year, games);
  const players = weeklyRows(playerCsv, year, games, true);
  return { year, checkedAt: checked, sources: { schedule: SCHEDULE_SOURCE, teams: seasonTeamSource(year), players: seasonPlayerSource(year) },
    phases: Object.fromEntries(phases.map((phase) => [phase, buildPhase(phase, games, teams, players)])) };
}
