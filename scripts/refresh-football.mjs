import { SCHEDULE_SOURCE, pbpSource, parseLeagueSchedule, jetsSchedule, inferSeason, currentManifest } from './data-refresh.mjs';
import { NEWS_SOURCE, rosterSource, playerStatsSource, refreshCoverage, validateCoverage } from './coverage.mjs';
import { refreshLiveFootball, validateLiveFootball } from './football-live.mjs';

export const FOOTBALL_COVERAGE_INTERVALS = { news: 300_000, roster: 900_000, stats: 300_000 };
const skippedSource = 'football-source-not-due';
const instant = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const sameGame = (left, right) => left.id === (right.id ?? right.gameId) && left.season === right.season
  && left.week === right.week && left.seasonType === right.seasonType && left.opponent === right.opponent && left.atHome === right.atHome;
const score = (value) => Number.isInteger(value) && value >= 0 && value <= 150;
const outcome = (jets, opponent) => jets > opponent ? 'win' : jets < opponent ? 'loss' : 'tie';

/** The fast clock covers pregame, the game itself and immediate postgame corrections. */
/** @param {import('../src/lib/current.ts').ScheduledGame[]} schedule @param {Date} [now] @param {import('../src/lib/football-live.ts').LiveFootballFeed|null} [live] */
export function footballActiveWindow(schedule, now = new Date(), live = null) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid football clock');
  return schedule.some((game) => {
    const kickoff = Date.parse(game.kickoff);
    return Number.isFinite(kickoff) && now.getTime() >= kickoff - 60 * 60_000 && now.getTime() <= kickoff + 6 * 60 * 60_000;
  }) || !!live?.games?.some((game) => game.state === 'live' && schedule.some((entry) => sameGame(entry, game))
    && live.checkedAt && now.getTime() - Date.parse(live.checkedAt) >= 0 && now.getTime() - Date.parse(live.checkedAt) < 15 * 60_000);
}

export function footballEditionAttemptedAt(edition) {
  return Math.max(Date.parse(edition.scheduleCheck.attemptedAt), ...['news', 'roster', 'stats'].map((name) => Date.parse(edition.coverage[name].attemptedAt)),
    edition.live ? Date.parse(edition.live.attemptedAt) : 0);
}

export function validateFootballEdition(edition) {
  const fail = () => { throw new Error('Invalid football edition'); };
  if (!edition || edition.schemaVersion !== 1 || !edition.current || !Number.isInteger(edition.current.season)
    || edition.current.season < 1999 || edition.current.season > 2200 || !instant(edition.current.checkedAt)
    || !Array.isArray(edition.current.schedule) || !edition.current.schedule.length
    || edition.current.sources?.schedule !== SCHEDULE_SOURCE || edition.current.sources?.pbp !== pbpSource(edition.current.season)) fail();
  const current = edition.current, ids = new Set();
  for (const game of current.schedule) {
    if (!game || !new RegExp(`^${current.season}_\\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$`).test(game.id) || ids.has(game.id)
      || game.season !== current.season || !Number.isInteger(game.week) || game.week < 1 || game.week > 22
      || !['REG', 'POST'].includes(game.seasonType) || !/^\d{4}-\d{2}-\d{2}$/.test(game.date) || !instant(game.date)
      || typeof game.atHome !== 'boolean' || !/^[A-Z]{2,3}$/.test(game.opponent) || typeof game.opponentDisplay !== 'string'
      || (game.kickoff !== null && !instant(game.kickoff)) || !['scheduled', 'final'].includes(game.status)) fail();
    const [, week, away, home] = game.id.split('_');
    if (Number(week) !== game.week || (game.atHome ? home !== 'NYJ' || away !== game.opponent : away !== 'NYJ' || home !== game.opponent)) fail();
    if (game.status === 'final' ? !score(game.jetsScore) || !score(game.oppScore) || game.outcome !== outcome(game.jetsScore, game.oppScore)
      : game.jetsScore !== null || game.oppScore !== null || game.outcome !== null) fail();
    if (game.scoreCheckedAt !== undefined && (!instant(game.scoreCheckedAt) || Date.parse(game.scoreCheckedAt) > Date.parse(current.checkedAt))) fail();
    if (game.scoreSource !== undefined && game.scoreSource !== SCHEDULE_SOURCE && game.scoreSource !== edition.live?.source
      && !edition.live?.sources?.includes(game.scoreSource)) fail();
    ids.add(game.id);
  }
  if (current.latestAnalyzedGameId !== null && !current.schedule.some((game) => game.id === current.latestAnalyzedGameId && game.status === 'final')) fail();
  if (current.analysisUpdatedAt !== null && (!instant(current.analysisUpdatedAt) || Date.parse(current.analysisUpdatedAt) > Date.parse(current.checkedAt))) fail();
  if (current.analysisCheck && (!instant(current.analysisCheck.attemptedAt) || !['ready', 'retained', 'unavailable'].includes(current.analysisCheck.status)
    || current.analysisCheck.checkedAt !== null && (!instant(current.analysisCheck.checkedAt) || Date.parse(current.analysisCheck.checkedAt) > Date.parse(current.analysisCheck.attemptedAt))
    || (current.analysisCheck.status === 'unavailable') !== (current.analysisCheck.checkedAt === null))) fail();
  const check = edition.scheduleCheck;
  if (!check || check.source !== SCHEDULE_SOURCE || !['ready', 'retained', 'unavailable'].includes(check.status) || !instant(check.attemptedAt)
    || (check.checkedAt !== null && (!instant(check.checkedAt) || Date.parse(check.checkedAt) > Date.parse(check.attemptedAt)))
    || (check.status === 'unavailable') !== (check.checkedAt === null) || check.status === 'ready' && check.checkedAt !== check.attemptedAt) fail();
  validateCoverage(edition.coverage);
  if (edition.coverage.season !== current.season) fail();
  if (edition.live !== null) {
    validateLiveFootball(edition.live);
    if (edition.live.season !== current.season) fail();
  }
  const checked = Math.max(check.checkedAt ? Date.parse(check.checkedAt) : 0, edition.live?.checkedAt ? Date.parse(edition.live.checkedAt) : 0);
  if (Date.parse(current.checkedAt) < checked) fail();
  return edition;
}

function due(feed, interval, now, season = null) {
  const age = feed?.checkedAt ? now.getTime() - Date.parse(feed.checkedAt) : Infinity;
  return feed?.status !== 'ready' || season !== null && feed.season !== season || !Number.isFinite(age) || age < 0 || age >= interval;
}

async function coverageAt({ season, schedule, previous, now, fetcher, onError }) {
  const definitions = { news: NEWS_SOURCE, roster: rosterSource(season), stats: playerStatsSource(season) };
  const skipped = new Set(Object.entries(definitions).filter(([name]) => !due(previous?.[name], FOOTBALL_COVERAGE_INTERVALS[name], now, name === 'news' ? null : season)).map(([, url]) => url));
  const coverage = await refreshCoverage({ season, schedule, previous, now,
    fetcher: (url, options) => {
      if (skipped.has(url)) throw new Error(skippedSource);
      return fetcher(url, options);
    }, onError: (message) => { if (!message.includes(skippedSource)) onError(message); },
  });
  for (const [name, url] of Object.entries(definitions)) if (skipped.has(url)) {
    coverage[name] = previous[name];
    if (name === 'stats') coverage.stats = { ...previous.stats, pendingGameIds: schedule.filter((game) => game.season === season && game.seasonType === 'REG'
      && game.status === 'final' && !previous.stats.analyzedGameIds.includes(game.id)).map((game) => game.id) };
  }
  return validateCoverage(coverage);
}

/** Only completed, identity-matched provider games can change confirmed results. */
export function mergeConfirmedFootballSchedule(schedule, previous, live, scheduleCheck, fromLeague = false) {
  return schedule.map((game) => {
    if (game.status === 'final') return fromLeague || !game.scoreSource
      ? { ...game, scoreSource: SCHEDULE_SOURCE, scoreCheckedAt: scheduleCheck.checkedAt } : game;
    const old = previous?.find((entry) => sameGame(game, entry) && entry.status === 'final');
    const fresh = live?.games.find((entry) => sameGame(game, entry) && entry.state === 'final' && !entry.provisional && score(entry.jetsScore) && score(entry.oppScore));
    if (fresh) return { ...game, kickoff: fresh.kickoff ?? game.kickoff, status: 'final', jetsScore: fresh.jetsScore, oppScore: fresh.oppScore,
      outcome: outcome(fresh.jetsScore, fresh.oppScore), scoreSource: fresh.source ?? live.source, scoreCheckedAt: live.checkedAt };
    return old ? { ...game, status: 'final', jetsScore: old.jetsScore, oppScore: old.oppScore, outcome: old.outcome,
      ...(old.scoreSource ? { scoreSource: old.scoreSource, scoreCheckedAt: old.scoreCheckedAt } : { scoreSource: SCHEDULE_SOURCE, scoreCheckedAt: scheduleCheck.checkedAt }) } : game;
  });
}

/** Fast provider updates never claim that delayed PBP, EPA or archive extraction ran. */
/** @param {{previous?: any, now?: Date, fetcher?: typeof fetch, onError?: (message: string) => void, games?: any[], refreshLive?: typeof refreshLiveFootball}} [options] */
export async function refreshFootball({ previous = null, now = new Date(), fetcher = fetch, onError = () => {}, games = [], refreshLive = refreshLiveFootball } = {}) {
  if (!Number.isFinite(now.getTime()) || typeof refreshLive !== 'function') throw new Error('Invalid football refresh configuration');
  if (previous) validateFootballEdition(previous);
  let league = null, schedule, season, scheduleCheck;
  if (!due(previous?.scheduleCheck, 300_000, now)) {
    schedule = previous.current.schedule; season = previous.current.season; scheduleCheck = previous.scheduleCheck;
  } else try {
    const response = await fetcher(SCHEDULE_SOURCE, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('Schedule provider unavailable');
    league = parseLeagueSchedule(await response.text());
    schedule = jetsSchedule(league); season = inferSeason(schedule, now);
    if (previous && season < previous.current.season) throw new Error('Schedule season regressed');
    if (previous?.current.season === season && previous.current.schedule.some((old) => old.status === 'final'
      && !schedule.some((game) => sameGame(game, old)))) throw new Error('Schedule lost a verified game');
    scheduleCheck = { source: SCHEDULE_SOURCE, status: 'ready', checkedAt: now.toISOString(), attemptedAt: now.toISOString() };
  } catch {
    if (!previous) throw new Error('No verified football schedule available');
    schedule = previous.current.schedule; season = previous.current.season;
    scheduleCheck = { ...previous.scheduleCheck, status: previous.scheduleCheck.checkedAt ? 'retained' : 'unavailable', attemptedAt: now.toISOString() };
    onError('Football schedule unavailable; retaining verified results.');
  }
  const ownSchedule = schedule.filter((game) => game.season === season);
  const active = footballActiveWindow(ownSchedule, now, previous?.live);
  let live = previous?.live?.season === season ? previous.live : null;
  if (due(live, active ? 40_000 : 300_000, now, season)) live = await refreshLive({ season, schedule: ownSchedule, previous: live, now, fetcher, onError });
  validateLiveFootball(live);
  const previousCurrent = previous?.current.season === season ? previous.current : null;
  const combined = mergeConfirmedFootballSchedule(ownSchedule, previousCurrent?.schedule, live, scheduleCheck, !!league);
  const finalById = new Map(combined.filter((game) => game.status === 'final').map((game) => [game.id, game]));
  if (league) league = league.map((game) => {
    const final = finalById.get(game.id);
    return final ? { ...game, status: 'final', homeScore: final.atHome ? final.jetsScore : final.oppScore,
      awayScore: final.atHome ? final.oppScore : final.jetsScore } : game;
  });
  const current = currentManifest({ season, schedule: combined, league, games, now, previous: previousCurrent });
  const lastAnalysis = previousCurrent?.latestAnalyzedGameId;
  if (lastAnalysis && !current.latestAnalyzedGameId) {
    const old = previousCurrent.schedule.find((game) => game.id === lastAnalysis), fresh = combined.find((game) => game.id === lastAnalysis);
    if (fresh?.status === 'final' && old?.jetsScore === fresh.jetsScore && old?.oppScore === fresh.oppScore) current.latestAnalyzedGameId = lastAnalysis;
  }
  if (previousCurrent?.analysisCheck) current.analysisCheck = previousCurrent.analysisCheck;
  if (!league && previousCurrent?.standings) current.standings = previousCurrent.standings;
  current.checkedAt = new Date(Math.max(scheduleCheck.checkedAt ? Date.parse(scheduleCheck.checkedAt) : 0, live.checkedAt ? Date.parse(live.checkedAt) : 0,
    previousCurrent ? Date.parse(previousCurrent.checkedAt) : 0)).toISOString();
  const coverage = await coverageAt({ season, schedule: combined, previous: previous?.coverage ?? null, now, fetcher, onError });
  return validateFootballEdition({ schemaVersion: 1, current, coverage, live, scheduleCheck });
}
