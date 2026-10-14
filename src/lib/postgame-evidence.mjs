// These validators are deliberately independent of filesystem and native PBP extraction.
const SCHEDULE_SOURCE = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
export const DRIVE_RESULTS = ['Touchdown', 'Field goal', 'Missed field goal', 'Punt', 'Turnover', 'Turnover on downs', 'Opp touchdown', 'Safety', 'End of half', 'Not recorded'];
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const instant = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00Z`)) && new Date(`${value}T00:00Z`).toISOString().slice(0, 10) === value;
const text = (value, max = 240) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const score = (value) => Number.isInteger(value) && value >= 0 && value <= 150;
const outcome = (us, them) => us > them ? 'win' : us < them ? 'loss' : 'tie';
const fail = () => { throw new Error('Invalid postgame evidence'); };
const identity = (id, season = null) => {
  const match = typeof id === 'string' && /^(\d{4})_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/.exec(id);
  if (!match || Number(match[1]) < 1999 || Number(match[1]) > 2200 || Number(match[2]) < 1 || Number(match[2]) > 24
    || season !== null && Number(match[1]) !== season || match[3] === match[4] || (match[3] === 'NYJ') === (match[4] === 'NYJ')) return fail();
  return { season: Number(match[1]), week: Number(match[2]), atHome: match[4] === 'NYJ', opponent: match[4] === 'NYJ' ? match[3] : match[4] };
};
function source(value) {
  if (!instant(value.checkedAt) || value.status !== undefined && !['ready', 'retained'].includes(value.status)
    || value.attemptedAt !== undefined && (!instant(value.attemptedAt) || Date.parse(value.attemptedAt) < Date.parse(value.checkedAt))) return fail();
}

/** Validate the full history, including starters and completed-season playoff counts. */
export function validateRuntimeHistory(value) {
  if (!record(value) || value.schemaVersion !== 1 || value.team !== 'NYJ' || value.source !== SCHEDULE_SOURCE
    || !Array.isArray(value.games) || !value.games.length || value.games.length > 6000) return fail();
  source(value);
  const ids = new Set();
  for (const game of value.games) {
    if (!record(game)) return fail();
    const expected = identity(game.id);
    if (ids.has(game.id) || game.season !== expected.season || game.week !== expected.week || game.atHome !== expected.atHome
      || game.opponent !== expected.opponent || !/^[A-Z]{2,3}$/.test(game.opponentDisplay ?? '') || !date(game.date)
      || game.kickoff !== null && !instant(game.kickoff) || !['REG', 'POST'].includes(game.seasonType)
      || game.seasonType === 'REG' && game.week > 18 || game.seasonType === 'POST' && game.week < 18
      || game.stadium !== null && !text(game.stadium) || game.espn !== null && !/^\d{6,12}$/.test(game.espn)) return fail();
    if (game.status === 'final') {
      if (!score(game.jetsScore) || !score(game.oppScore) || game.outcome !== outcome(game.jetsScore, game.oppScore)) return fail();
    } else if (game.status !== 'scheduled' || game.jetsScore !== null || game.oppScore !== null || game.outcome !== null || game.qb !== null) return fail();
    if (game.qb !== null && (!record(game.qb) || game.status !== 'final' || !/^00-\d{7}$/.test(game.qb.id) || !text(game.qb.name, 160))) return fail();
    ids.add(game.id);
  }
  const table = value.playoffsByWins;
  if (!record(table) || !Array.isArray(table.seasons) || !Array.isArray(table.rows)
    || table.seasons.some((year) => !Number.isInteger(year) || year < 2021 || year > 2200)
    || table.seasons.some((year, index) => index > 0 && year <= table.seasons[index - 1])
    || table.rows.some((row, index) => index > 0 && row?.wins <= table.rows[index - 1]?.wins)
    || table.rows.some((row) => !record(row) || !Number.isInteger(row.wins) || row.wins < 0 || row.wins > 17
      || !Number.isInteger(row.clubs) || row.clubs < 1 || !Number.isInteger(row.playoffs) || row.playoffs < 0 || row.playoffs > row.clubs)
    || table.rows.reduce((sum, row) => sum + row.clubs, 0) !== table.seasons.length * 32
    || table.rows.reduce((sum, row) => sum + row.playoffs, 0) !== table.seasons.length * 14) return fail();
  return value;
}

/** Compiled historical rows remain valid inputs, without fabricating runtime witnesses. */
export function validateDrivesData(value) {
  if (!record(value) || value.schemaVersion !== 1 || !Number.isInteger(value.season) || value.season < 1999 || value.season > 2200
    || value.source !== `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${value.season}.parquet`
    || !record(value.games) || Object.keys(value.games).length > 30 || JSON.stringify(value.results) !== JSON.stringify(DRIVE_RESULTS)) return fail();
  source(value);
  for (const [id, drives] of Object.entries(value.games)) {
    identity(id, value.season);
    if (!Array.isArray(drives) || !drives.length || drives.length > 150) return fail();
    for (const row of drives) {
      if (!Array.isArray(row) || row.length !== 7) return fail();
      const [jets, quarter, clock, start, end, plays, result] = row;
      if (![0, 1].includes(jets) || !Number.isInteger(quarter) || quarter < 1 || quarter > 10 || !Number.isInteger(clock) || clock < 0 || clock > 900
        || ![start, end].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
        || !Number.isInteger(plays) || plays < 0 || plays > 200 || !Number.isInteger(result) || result < 0 || result >= DRIVE_RESULTS.length) return fail();
    }
  }
  return value;
}

/** Runtime drives require terminal-game score/date witnesses; corrections cannot inherit old charts. */
export function validateRuntimeDrives(value, footballCurrent = null) {
  validateDrivesData(value);
  if (!record(value.finals) || !Array.isArray(value.pendingGameIds) || !instant(value.attemptedAt)
    || !['ready', 'retained'].includes(value.status) || new Set(value.pendingGameIds).size !== value.pendingGameIds.length
    || Object.keys(value.finals).length !== Object.keys(value.games).length) return fail();
  for (const [id, witness] of Object.entries(value.finals)) {
    identity(id, value.season);
    if (!Object.hasOwn(value.games, id) || !record(witness) || !date(witness.date) || !score(witness.jetsScore) || !score(witness.oppScore)) return fail();
    if (footballCurrent) {
      const final = footballCurrent.schedule?.find((game) => game.id === id);
      if (footballCurrent.season !== value.season || final?.status !== 'final' || final.date !== witness.date
        || final.jetsScore !== witness.jetsScore || final.oppScore !== witness.oppScore) return fail();
    }
  }
  for (const id of value.pendingGameIds) {
    identity(id, value.season);
    if (Object.hasOwn(value.games, id) || footballCurrent && footballCurrent.schedule?.find((game) => game.id === id)?.status !== 'final') return fail();
  }
  if (footballCurrent && (footballCurrent.season !== value.season || footballCurrent.schedule?.some((game) => game.status === 'final'
    && !Object.hasOwn(value.games, game.id) && !value.pendingGameIds.includes(game.id)))) return fail();
  if (value.asset !== undefined && value.asset !== null) {
    if (!record(value.asset) || value.asset.url !== value.source
      || value.asset.etag !== null && (typeof value.asset.etag !== 'string' || value.asset.etag.length > 256 || !/^"[^"\u0000-\u001f\u007f]*"$/.test(value.asset.etag))
      || value.asset.lastModified !== null && !instant(value.asset.lastModified)
      || value.asset.contentLength !== null && (!Number.isSafeInteger(value.asset.contentLength) || value.asset.contentLength < 1)) return fail();
  }
  return value;
}

/** Legacy charts need matching analyzed evidence, never a newer schedule-only score. */
export function makeBakedDrivesEvidence(value, compiledCurrent, compiledGames = []) {
  validateDrivesData(value);
  if (!compiledCurrent || compiledCurrent.season !== value.season || !Array.isArray(compiledCurrent.schedule)) return null;
  // New witnessed editions retain their own evidence through score corrections.
  if (Object.hasOwn(value, 'finals')) return validateRuntimeDrives(value);
  const checked = Date.parse(compiledCurrent.analysisCheck?.checkedAt ?? '');
  const eligible = Number.isFinite(checked) && Date.parse(value.checkedAt) >= checked;
  const analyzed = new Map(compiledGames.filter((game) => game.season === value.season && game.dataSuspect === false).map((game) => [game.id, game]));
  const games = {}, finals = {};
  for (const final of compiledCurrent.schedule.filter((game) => game.status === 'final')) {
    const evidence = analyzed.get(final.id);
    if (!eligible || !Object.hasOwn(value.games, final.id) || !evidence || evidence.date !== final.date || evidence.atHome !== final.atHome
      || evidence.opponent !== final.opponent || evidence.jetsScore !== final.jetsScore || evidence.oppScore !== final.oppScore) continue;
    games[final.id] = value.games[final.id];
    finals[final.id] = { date: evidence.date, jetsScore: evidence.jetsScore, oppScore: evidence.oppScore };
  }
  const withheld = Object.keys(value.games).some((id) => !Object.hasOwn(games, id));
  return validateRuntimeDrives({ ...value, games, finals, asset: null, status: withheld ? 'retained' : value.status ?? 'ready',
    attemptedAt: value.attemptedAt ?? value.checkedAt,
    pendingGameIds: compiledCurrent.schedule.filter((game) => game.status === 'final' && !Object.hasOwn(games, game.id)).map((game) => game.id) }, compiledCurrent);
}
