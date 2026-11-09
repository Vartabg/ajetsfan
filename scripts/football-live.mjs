import { validateLiveFootball } from '../src/lib/football-live.ts';
export { validateLiveFootball };
export const footballScheduleSource = (season, phase = 'REG') => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/20/schedule?season=${season}&seasontype=${phase === 'POST' ? 3 : 2}`;
export const footballSummarySource = (eventId) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`;
const aliases = { LAR: 'LA', WSH: 'WAS' };
const code = (value) => aliases[value] ?? value;
/** Carries one of our own constant reason codes. Upstream text never travels with it. */
class LiveFootballError extends Error {
  constructor(reason) { super('Invalid ESPN football identity or content'); this.name = 'LiveFootballError'; this.reason = reason; }
}
const fail = (reason = 'content') => { throw new LiveFootballError(reason); };
const text = (value, max = 160) => typeof value === 'string' && value.trim() && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value) ? value.trim() : fail('text_value');
const integer = (value, min = 0, max = 10000) => /^-?\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fail('number_value');
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) return fail('kickoff_time');
  return new Date(value).toISOString();
}
function identity(competitors) {
  if (!Array.isArray(competitors) || competitors.length !== 2) return fail('team_identity');
  const jets = competitors.find((entry) => entry.team?.id === '20');
  const other = competitors.find((entry) => entry.team?.id !== '20');
  if (!jets || !other || jets.id !== jets.team.id || jets.team.abbreviation !== 'NYJ' || other.id !== other.team?.id
    || !/^[A-Z]{2,4}$/.test(other.team?.abbreviation ?? '') || !['home', 'away'].includes(jets.homeAway)
    || other.homeAway !== (jets.homeAway === 'home' ? 'away' : 'home')) return fail('team_identity');
  return { jets, other };
}
function state(status) {
  const type = status?.type;
  if (!type || typeof type.completed !== 'boolean') return fail('game_status');
  if (type.name === 'STATUS_FINAL' && type.state === 'post' && type.completed) return 'final';
  if (type.completed) return fail('game_status');
  if (type.name === 'STATUS_SCHEDULED' && type.state === 'pre') return 'scheduled';
  // The break between quarters is still a game in progress.
  if (['STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD'].includes(type.name) && type.state === 'in') return 'live';
  if (type.name === 'STATUS_POSTPONED') return 'postponed';
  if (['STATUS_SUSPENDED', 'STATUS_DELAYED'].includes(type.name)) return 'suspended';
  if (['STATUS_CANCELED', 'STATUS_CANCELLED'].includes(type.name)) return 'cancelled';
  return fail('game_status');
}
const score = (entry) => integer(typeof entry.score === 'object' ? entry.score?.value : entry.score, 0, 999);
const easternDate = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
function scheduledEvent(event, season, schedule, phase = 'REG') {
  if (!/^\d{1,12}$/.test(event?.id ?? '') || event.season?.year !== season || !Array.isArray(event.competitions) || event.competitions.length !== 1) return fail('event_identity');
  const comp = event.competitions[0];
  if (comp.id !== event.id) return fail('event_identity');
  const { jets, other } = identity(comp.competitors);
  const kickoff = instant(event.date);
  const kind = state(comp.status), flex = kind === 'scheduled' && comp.status.isTBDFlex === true;
  const providerWeek = integer(event.week?.number, 1, phase === 'POST' ? 4 : 30), opponent = code(other.team.abbreviation), atHome = jets.homeAway === 'home';
  const candidates = schedule.filter((game) => game.season === season && game.seasonType === phase && game.opponent === opponent && game.atHome === atHome
    && game.date === easternDate(kickoff) && (phase === 'POST' || game.week === providerWeek));
  if (candidates.length !== 1) return fail('schedule_match');
  const expected = candidates[0], week = expected.week, gameId = expected.id;
  // Actual starts can trail the listed kickoff (the 2010 opener differs by 25
  // minutes). Identity, phase, week and Eastern game date must still match.
  if (!flex && expected.kickoff && Math.abs(Date.parse(instant(expected.kickoff)) - Date.parse(kickoff)) > 30 * 60_000) return fail('kickoff_drift');
  const partial = ['live', 'suspended'].includes(kind), scored = partial || kind === 'final';
  return { eventId: event.id, gameId, season, week, providerWeek, seasonType: expected.seasonType, source: footballScheduleSource(season, phase), kickoff: flex ? null : kickoff,
    opponent, opponentDisplay: text(other.team.displayName ?? expected.opponentDisplay, 80), atHome, state: kind,
    jetsScore: scored ? score(jets) : null, oppScore: scored ? score(other) : null,
    period: integer(comp.status.period ?? 0, 0, 10), clock: comp.status.displayClock ? text(comp.status.displayClock, 8) : null,
    detail: text(comp.status.type.detail ?? comp.status.type.description), provisional: partial, players: [] };
}
const counter = (value, signed = false) => value === '--' || value === '-' || value === '' ? null : integer(value, signed ? -2000 : 0);
function playersFrom(boxscore) {
  if (!Array.isArray(boxscore?.players)) return fail('boxscore_missing');
  const teams = boxscore.players.filter((entry) => entry.team?.id === '20');
  if (teams.length !== 1 || teams[0].team.abbreviation !== 'NYJ' || !Array.isArray(teams[0].statistics)) return fail('boxscore_team');
  const players = new Map(), seen = new Set();
  const mappings = { passing: { yards: 'passingYards', touchdowns: 'passingTouchdowns', interceptions: 'interceptions' },
    rushing: { carries: 'rushingAttempts', yards: 'rushingYards', touchdowns: 'rushingTouchdowns' },
    receiving: { targets: 'receivingTargets', receptions: 'receptions', yards: 'receivingYards', touchdowns: 'receivingTouchdowns' } };
  for (const category of teams[0].statistics) {
    if (!Object.hasOwn(mappings, category.name)) continue;
    if (seen.has(category.name) || !Array.isArray(category.keys) || new Set(category.keys).size !== category.keys.length || !Array.isArray(category.athletes)) return fail('stat_category');
    seen.add(category.name);
    const required = [...Object.values(mappings[category.name]), ...(category.name === 'passing' ? ['completions/passingAttempts'] : [])];
    if (required.some((key) => !category.keys.includes(key))) return fail('stat_keys');
    const categoryPlayers = new Set();
    for (const row of category.athletes) {
      const athlete = row.athlete;
      if (!/^\d{1,12}$/.test(athlete?.id ?? '') || categoryPlayers.has(athlete.id) || !Array.isArray(row.stats)) return fail('stat_row');
      // While a game is in progress ESPN still lists adjQBR among the passing keys
      // but leaves its value out of every row until the game is final. Only that
      // one known gap is accepted; any other length mismatch is still rejected.
      const keys = category.name === 'passing' && row.stats.length === category.keys.length - 1 && category.keys.includes('adjQBR')
        ? category.keys.filter((key) => key !== 'adjQBR') : category.keys;
      if (row.stats.length !== keys.length) return fail('stat_row');
      categoryPlayers.add(athlete.id);
      const name = text(athlete.displayName), position = text(athlete.position?.abbreviation ?? 'Unknown', 12);
      const existing = players.get(athlete.id);
      if (existing && existing.name !== name) return fail('player_identity');
      const player = existing ?? { espnId: athlete.id, name, position, passing: null, rushing: null, receiving: null };
      const stats = Object.fromEntries(Object.entries(mappings[category.name]).map(([field, key]) => [field, counter(row.stats[keys.indexOf(key)], field === 'yards')]));
      if (category.name === 'passing') {
        const pair = row.stats[keys.indexOf('completions/passingAttempts')];
        if (pair === '--' || pair === '-') Object.assign(stats, { completions: null, attempts: null });
        else {
          if (!/^\d+\/\d+$/.test(pair)) return fail('passing_pair');
          const [completions, attempts] = pair.split('/').map((value) => integer(value));
          if (completions > attempts) return fail('passing_pair');
          Object.assign(stats, { completions, attempts });
        }
      }
      player[category.name] = stats; players.set(athlete.id, player);
    }
  }
  return [...players.values()];
}
function enrichGame(summary, game) {
  const header = summary?.header;
  if (header?.id !== game.eventId || header.season?.year !== game.season || header.season?.type !== (game.seasonType === 'REG' ? 2 : 3)
    || integer(header.week, 1, 30) !== (game.providerWeek ?? game.week) || !Array.isArray(header.competitions) || header.competitions.length !== 1) return fail('summary_identity');
  const comp = header.competitions[0], teams = identity(comp.competitors);
  if (comp.id !== game.eventId || (teams.jets.homeAway === 'home') !== game.atHome || code(teams.other.team.abbreviation) !== game.opponent
    || game.kickoff && instant(comp.date) !== game.kickoff) return fail('summary_matchup');
  const kind = state(comp.status);
  // A summary can advance an in-progress schedule to final; it cannot roll a final back.
  if (game.state === 'final' && kind !== 'final' || game.state === 'live' && !['live', 'final', 'suspended'].includes(kind)) return fail('summary_rollback');
  const teamStats = summary.boxscore?.teams?.filter((entry) => entry.team?.id === '20');
  const rows = teamStats?.length === 1 && Array.isArray(teamStats[0].statistics) ? teamStats[0].statistics.map((row) =>
    ({ name: text(row.name, 80), label: text(row.label, 100), displayValue: text(row.displayValue, 80) })) : [];
  return { ...game, state: kind, provisional: ['live', 'suspended'].includes(kind),
    jetsScore: score(teams.jets), oppScore: score(teams.other), period: integer(comp.status.period ?? (kind === game.state ? game.period : 0), 0, 10),
    clock: comp.status.displayClock ? text(comp.status.displayClock, 8) : kind === game.state ? game.clock : null,
    detail: text(comp.status.type.detail ?? comp.status.type.description), players: playersFrom(summary.boxscore), teamStats: rows };
}
async function jsonSource(url, fetcher) {
  let response, raw;
  const timedOut = (error) => ['TimeoutError', 'AbortError'].includes(error?.name);
  try { response = await fetcher(url, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) }); }
  catch (error) { return fail(timedOut(error) ? 'source_timeout' : 'source_unreachable'); }
  if (!response.ok) return fail(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? `source_http_${response.status}` : 'source_unavailable');
  const declared = response.headers?.get('content-length');
  if (declared && Number(declared) > 3_000_000) return fail('source_too_large');
  try { raw = new Uint8Array(await response.arrayBuffer()); }
  catch (error) { return fail(timedOut(error) ? 'source_timeout' : 'source_unreachable'); }
  if (raw.byteLength > 3_000_000) return fail('source_too_large');
  try { return JSON.parse(new TextDecoder().decode(raw)); } catch { return fail('source_json'); }
}
/** @param {{season: number, schedule: any[], previous?: any, now?: Date, fetcher?: typeof fetch, onError?: (message: string, detail?: {source: string, reason: string}) => void}} options */
export async function refreshLiveFootball({ season, schedule, previous = null, now = new Date(), fetcher = fetch, onError = () => {} }) {
  if (!Number.isInteger(season) || season < 1999 || season > 2200 || !Array.isArray(schedule) || !schedule.length || schedule.length > 30 || !Number.isFinite(now.getTime())) throw new Error('Invalid live football configuration');
  if (previous) validateLiveFootball(previous);
  const attemptedAt = now.toISOString(), source = footballScheduleSource(season);
  // Names the step that was running, so a failure log says where the feed stopped.
  let step = 'schedule';
  try {
    const phases = ['REG', ...(schedule.some((game) => game.season === season && game.seasonType === 'POST') ? ['POST'] : [])];
    const sources = phases.map((phase) => footballScheduleSource(season, phase));
    const groups = await Promise.all(phases.map(async (phase) => {
      const body = await jsonSource(footballScheduleSource(season, phase), fetcher);
      // ESPN's top-level season describes its current site context for historical
      // requests. The requested phase and each event's season identify this feed.
      if (body.team?.id !== '20' || body.team.abbreviation !== 'NYJ' || !Number.isInteger(body.season?.year) || body.season.year < season
        || body.requestedSeason?.year !== season || body.requestedSeason?.type !== (phase === 'POST' ? 3 : 2)
        || !Array.isArray(body.events) || !body.events.length || body.events.length > 30) return fail('schedule_feed');
      const games = body.events.map((event) => scheduledEvent(event, season, schedule, phase));
      if (games.length !== schedule.filter((game) => game.season === season && game.seasonType === phase).length) return fail('schedule_count');
      return games;
    }));
    const games = groups.flat();
    const active = games.filter((game) => ['live', 'suspended'].includes(game.state));
    if (active.length > 1) return fail('multiple_live');
    let featured = active[0] ?? games.filter((game) => game.state === 'final').sort((a, b) => b.week - a.week)[0] ?? null;
    if (featured) {
      step = 'summary';
      featured = enrichGame(await jsonSource(footballSummarySource(featured.eventId), fetcher), featured);
      games[games.findIndex((game) => game.gameId === featured.gameId)] = featured;
    }
    step = 'edition';
    if (previous?.season === season && previous.games.some((old) => old.state === 'final'
      && !games.some((game) => game.gameId === old.gameId && game.state === 'final'))) return fail('final_rollback');
    return validateLiveFootball({ schemaVersion: 1, season, source, sources, checkedAt: attemptedAt, attemptedAt, status: 'ready', games, featured });
  } catch (error) {
    const reason = error instanceof LiveFootballError ? error.reason : step === 'edition' ? 'invalid_edition' : 'unexpected';
    onError('ESPN football refresh failed; retaining the last verified edition when available.', { source: `live_${step}`, reason });
    const old = previous?.season === season && previous.checkedAt ? previous : null;
    return validateLiveFootball({ schemaVersion: 1, season, source, checkedAt: old?.checkedAt ?? null, attemptedAt,
      status: old ? 'retained' : 'unavailable', ...(old?.sources ? { sources: old.sources } : {}), games: old?.games ?? [], featured: old?.featured ?? null });
  }
}
