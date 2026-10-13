import { validateLiveFootball } from '../src/lib/football-live.ts';
export { validateLiveFootball };
export const footballScheduleSource = (season, phase = 'REG') => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/20/schedule?season=${season}&seasontype=${phase === 'POST' ? 3 : 2}`;
export const footballSummarySource = (eventId) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`;
const aliases = { LAR: 'LA', WSH: 'WAS' };
const code = (value) => aliases[value] ?? value;
const fail = () => { throw new Error('Invalid ESPN football identity or content'); };
const text = (value, max = 160) => typeof value === 'string' && value.trim() && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value) ? value.trim() : fail();
const integer = (value, min = 0, max = 10000) => /^-?\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fail();
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) return fail();
  return new Date(value).toISOString();
}
function identity(competitors) {
  if (!Array.isArray(competitors) || competitors.length !== 2) return fail();
  const jets = competitors.find((entry) => entry.team?.id === '20');
  const other = competitors.find((entry) => entry.team?.id !== '20');
  if (!jets || !other || jets.id !== jets.team.id || jets.team.abbreviation !== 'NYJ' || other.id !== other.team?.id
    || !/^[A-Z]{2,4}$/.test(other.team?.abbreviation ?? '') || !['home', 'away'].includes(jets.homeAway)
    || other.homeAway !== (jets.homeAway === 'home' ? 'away' : 'home')) return fail();
  return { jets, other };
}
function state(status) {
  const type = status?.type;
  if (!type || typeof type.completed !== 'boolean') return fail();
  if (type.name === 'STATUS_FINAL' && type.state === 'post' && type.completed) return 'final';
  if (type.completed) return fail();
  if (type.name === 'STATUS_SCHEDULED' && type.state === 'pre') return 'scheduled';
  if (['STATUS_IN_PROGRESS', 'STATUS_HALFTIME'].includes(type.name) && type.state === 'in') return 'live';
  if (type.name === 'STATUS_POSTPONED') return 'postponed';
  if (['STATUS_SUSPENDED', 'STATUS_DELAYED'].includes(type.name)) return 'suspended';
  if (['STATUS_CANCELED', 'STATUS_CANCELLED'].includes(type.name)) return 'cancelled';
  return fail();
}
const score = (entry) => integer(typeof entry.score === 'object' ? entry.score?.value : entry.score, 0, 999);
const easternDate = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
function scheduledEvent(event, season, schedule, phase = 'REG') {
  if (!/^\d{1,12}$/.test(event?.id ?? '') || event.season?.year !== season || !Array.isArray(event.competitions) || event.competitions.length !== 1) return fail();
  const comp = event.competitions[0];
  if (comp.id !== event.id) return fail();
  const { jets, other } = identity(comp.competitors);
  const kickoff = instant(event.date);
  const kind = state(comp.status), flex = kind === 'scheduled' && comp.status.isTBDFlex === true;
  const providerWeek = integer(event.week?.number, 1, phase === 'POST' ? 4 : 30), opponent = code(other.team.abbreviation), atHome = jets.homeAway === 'home';
  const candidates = schedule.filter((game) => game.season === season && game.seasonType === phase && game.opponent === opponent && game.atHome === atHome
    && game.date === easternDate(kickoff) && (phase === 'POST' || game.week === providerWeek));
  if (candidates.length !== 1) return fail();
  const expected = candidates[0], week = expected.week, gameId = expected.id;
  // Actual starts can trail the listed kickoff (the 2010 opener differs by 25
  // minutes). Identity, phase, week and Eastern game date must still match.
  if (!flex && expected.kickoff && Math.abs(Date.parse(instant(expected.kickoff)) - Date.parse(kickoff)) > 30 * 60_000) return fail();
  const partial = ['live', 'suspended'].includes(kind), scored = partial || kind === 'final';
  return { eventId: event.id, gameId, season, week, providerWeek, seasonType: expected.seasonType, source: footballScheduleSource(season, phase), kickoff: flex ? null : kickoff,
    opponent, opponentDisplay: text(other.team.displayName ?? expected.opponentDisplay, 80), atHome, state: kind,
    jetsScore: scored ? score(jets) : null, oppScore: scored ? score(other) : null,
    period: integer(comp.status.period ?? 0, 0, 10), clock: comp.status.displayClock ? text(comp.status.displayClock, 8) : null,
    detail: text(comp.status.type.detail ?? comp.status.type.description), provisional: partial, players: [] };
}
const counter = (value, signed = false) => value === '--' || value === '-' || value === '' ? null : integer(value, signed ? -2000 : 0);
function playersFrom(boxscore) {
  if (!Array.isArray(boxscore?.players)) return fail();
  const teams = boxscore.players.filter((entry) => entry.team?.id === '20');
  if (teams.length !== 1 || teams[0].team.abbreviation !== 'NYJ' || !Array.isArray(teams[0].statistics)) return fail();
  const players = new Map(), seen = new Set();
  const mappings = { passing: { yards: 'passingYards', touchdowns: 'passingTouchdowns', interceptions: 'interceptions' },
    rushing: { carries: 'rushingAttempts', yards: 'rushingYards', touchdowns: 'rushingTouchdowns' },
    receiving: { targets: 'receivingTargets', receptions: 'receptions', yards: 'receivingYards', touchdowns: 'receivingTouchdowns' } };
  for (const category of teams[0].statistics) {
    if (!Object.hasOwn(mappings, category.name)) continue;
    if (seen.has(category.name) || !Array.isArray(category.keys) || new Set(category.keys).size !== category.keys.length || !Array.isArray(category.athletes)) return fail();
    seen.add(category.name);
    const required = [...Object.values(mappings[category.name]), ...(category.name === 'passing' ? ['completions/passingAttempts'] : [])];
    if (required.some((key) => !category.keys.includes(key))) return fail();
    const categoryPlayers = new Set();
    for (const row of category.athletes) {
      const athlete = row.athlete;
      if (!/^\d{1,12}$/.test(athlete?.id ?? '') || categoryPlayers.has(athlete.id) || !Array.isArray(row.stats) || row.stats.length !== category.keys.length) return fail();
      categoryPlayers.add(athlete.id);
      const name = text(athlete.displayName), position = text(athlete.position?.abbreviation ?? 'Unknown', 12);
      const existing = players.get(athlete.id);
      if (existing && existing.name !== name) return fail();
      const player = existing ?? { espnId: athlete.id, name, position, passing: null, rushing: null, receiving: null };
      const stats = Object.fromEntries(Object.entries(mappings[category.name]).map(([field, key]) => [field, counter(row.stats[category.keys.indexOf(key)], field === 'yards')]));
      if (category.name === 'passing') {
        const pair = row.stats[category.keys.indexOf('completions/passingAttempts')];
        if (pair === '--' || pair === '-') Object.assign(stats, { completions: null, attempts: null });
        else {
          if (!/^\d+\/\d+$/.test(pair)) return fail();
          const [completions, attempts] = pair.split('/').map((value) => integer(value));
          if (completions > attempts) return fail();
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
    || integer(header.week, 1, 30) !== (game.providerWeek ?? game.week) || !Array.isArray(header.competitions) || header.competitions.length !== 1) return fail();
  const comp = header.competitions[0], teams = identity(comp.competitors);
  if (comp.id !== game.eventId || (teams.jets.homeAway === 'home') !== game.atHome || code(teams.other.team.abbreviation) !== game.opponent
    || game.kickoff && instant(comp.date) !== game.kickoff) return fail();
  const kind = state(comp.status);
  // A summary can advance an in-progress schedule to final; it cannot roll a final back.
  if (game.state === 'final' && kind !== 'final' || game.state === 'live' && !['live', 'final', 'suspended'].includes(kind)) return fail();
  const teamStats = summary.boxscore?.teams?.filter((entry) => entry.team?.id === '20');
  const rows = teamStats?.length === 1 && Array.isArray(teamStats[0].statistics) ? teamStats[0].statistics.map((row) =>
    ({ name: text(row.name, 80), label: text(row.label, 100), displayValue: text(row.displayValue, 80) })) : [];
  return { ...game, state: kind, provisional: ['live', 'suspended'].includes(kind),
    jetsScore: score(teams.jets), oppScore: score(teams.other), period: integer(comp.status.period ?? (kind === game.state ? game.period : 0), 0, 10),
    clock: comp.status.displayClock ? text(comp.status.displayClock, 8) : kind === game.state ? game.clock : null,
    detail: text(comp.status.type.detail ?? comp.status.type.description), players: playersFrom(summary.boxscore), teamStats: rows };
}
async function jsonSource(url, fetcher) {
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('ESPN football unavailable');
  const declared = response.headers?.get('content-length');
  if (declared && Number(declared) > 3_000_000) throw new Error('ESPN football response too large');
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.byteLength > 3_000_000) throw new Error('ESPN football response too large');
  try { return JSON.parse(new TextDecoder().decode(raw)); } catch { throw new Error('Invalid ESPN football JSON'); }
}
export async function refreshLiveFootball({ season, schedule, previous = null, now = new Date(), fetcher = fetch, onError = () => {} }) {
  if (!Number.isInteger(season) || season < 1999 || season > 2200 || !Array.isArray(schedule) || !schedule.length || schedule.length > 30 || !Number.isFinite(now.getTime())) throw new Error('Invalid live football configuration');
  if (previous) validateLiveFootball(previous);
  const attemptedAt = now.toISOString(), source = footballScheduleSource(season);
  try {
    const phases = ['REG', ...(schedule.some((game) => game.season === season && game.seasonType === 'POST') ? ['POST'] : [])];
    const sources = phases.map((phase) => footballScheduleSource(season, phase));
    const groups = await Promise.all(phases.map(async (phase) => {
      const body = await jsonSource(footballScheduleSource(season, phase), fetcher);
      // ESPN's top-level season describes its current site context for historical
      // requests. The requested phase and each event's season identify this feed.
      if (body.team?.id !== '20' || body.team.abbreviation !== 'NYJ' || !Number.isInteger(body.season?.year) || body.season.year < season
        || body.requestedSeason?.year !== season || body.requestedSeason?.type !== (phase === 'POST' ? 3 : 2)
        || !Array.isArray(body.events) || !body.events.length || body.events.length > 30) return fail();
      const games = body.events.map((event) => scheduledEvent(event, season, schedule, phase));
      if (games.length !== schedule.filter((game) => game.season === season && game.seasonType === phase).length) return fail();
      return games;
    }));
    const games = groups.flat();
    const active = games.filter((game) => ['live', 'suspended'].includes(game.state));
    if (active.length > 1) return fail();
    let featured = active[0] ?? games.filter((game) => game.state === 'final').sort((a, b) => b.week - a.week)[0] ?? null;
    if (featured) {
      featured = enrichGame(await jsonSource(footballSummarySource(featured.eventId), fetcher), featured);
      games[games.findIndex((game) => game.gameId === featured.gameId)] = featured;
    }
    if (previous?.season === season && previous.games.some((old) => old.state === 'final'
      && !games.some((game) => game.gameId === old.gameId && game.state === 'final'))) return fail();
    return validateLiveFootball({ schemaVersion: 1, season, source, sources, checkedAt: attemptedAt, attemptedAt, status: 'ready', games, featured });
  } catch {
    onError('ESPN football refresh failed; retaining the last verified edition when available.');
    const old = previous?.season === season && previous.checkedAt ? previous : null;
    return validateLiveFootball({ schemaVersion: 1, season, source, checkedAt: old?.checkedAt ?? null, attemptedAt,
      status: old ? 'retained' : 'unavailable', ...(old?.sources ? { sources: old.sources } : {}), games: old?.games ?? [], featured: old?.featured ?? null });
  }
}
