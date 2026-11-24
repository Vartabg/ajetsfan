import { completedGames, divisionPicture, gamesBehind, nextScheduledGame, selectLead, type CurrentSnapshot } from "./current";
import type { SeasonAnalytics } from "./analytics";
import { previewQuestions, unitHeading, unitAnchor } from "./football-preview";
import { clockLabel, type Game, type KeyPlay } from "./games";
import type { CurvePoint } from "./load-games";
import { keyPlayIndex } from "./curve";
import { wpaLabel } from "./analytics-context";
import { type MediaCollection, type MediaItem } from "./media";
import { selectHomeMedia } from "./home-media";
import { compactMediaItem } from "./media-asset-paths.mjs";
import { publishedGames } from "./published-pages";
import { teamIdentity } from "./teams";
import type { HomePlay } from "./home-play";

/** One play of a game's line: the Jets' pre-play win chance and the quarter (5+ is overtime). */
export type FocusPoint = [wp: number, quarter: number];
export type FocusTurningPoint = { index: number; description: string; clock: string; change: string; href: string; snap?: { href: string; label: string } };
export type WeekState = "win" | "loss" | "tie" | "next" | "upcoming" | "bye";

export type FocusData = {
  checkedAt: string | null;
  last: {
    id: string; week: number; postseason: boolean; date: string;
    outcome: "win" | "loss" | "tie"; us: number; them: number; opponent: string; opponentName: string; place: string; home: boolean;
    href: string; hrefLabel: string; line: FocusPoint[]; turningPoint: FocusTurningPoint | null; play?: HomePlay;
  } | null;
  next: { id: string; week: number; postseason: boolean; opponent: string; place: string; home: boolean; date: string; kickoff: string | null; overdue: boolean; matchup: { href: string; label: string } | null } | null;
  season: { year: number; wins: number; losses: number; ties: number; weeks: { week: number; opponent: string | null; home: boolean | null; state: WeekState; score: string | null }[] } | null;
  division: { name: string; place: number; back: number; leader: string; tiedAtTop: number; teams: { team: string; place: string; wins: number; losses: number; ties: number; games: number; pointsFor: number; pointsAgainst: number; us: boolean }[] } | null;
  media: { id: string; title: string; outlet: string; publishedAt: string | null; item: MediaItem } | null;
};

// Two teams share Los Angeles and two share New York; they go by nickname in a sentence.
const SHARED_CITIES = new Set(["Los Angeles", "New York"]);
/** How a sentence names an opponent: "Chicago", "the Chargers". */
export function placeName(code: string): string {
  const team = teamIdentity(code);
  if (!team) return code;
  return team.nickname && SHARED_CITIES.has(team.city) ? `the ${team.nickname}` : team.city;
}

/** Capitalize a place name when it begins a heading ("the Chargers" -> "The Chargers"). */
export const leadPlace = (place: string): string => place ? place.charAt(0).toUpperCase() + place.slice(1) : place;

export type SeasonWeeks = NonNullable<FocusData["season"]>;

/** The current regular season as one entry per week: results, byes, the next game and the rest. */
export function seasonWeeks(snapshot: CurrentSnapshot | null): SeasonWeeks | null {
  if (!snapshot) return null;
  const upcoming = nextScheduledGame(snapshot);
  const regular = snapshot.schedule.filter((game) => game.season === snapshot.season && game.seasonType === "REG");
  const finals = new Map(completedGames(snapshot).filter((game) => game.season === snapshot.season && game.seasonType === "REG").map((game) => [game.id, game]));
  const lastWeek = Math.max(18, ...regular.map((game) => game.week));
  const weeks = Array.from({ length: lastWeek }, (_, index) => {
    const week = index + 1;
    const game = regular.find((entry) => entry.week === week);
    if (!game) return { week, opponent: null, home: null, state: "bye" as const, score: null };
    const final = finals.get(game.id);
    if (final) return { week, opponent: game.opponentDisplay, home: game.atHome, state: final.outcome, score: `${final.jetsScore}–${final.oppScore}` };
    return { week, opponent: game.opponentDisplay, home: game.atHome, state: upcoming?.game.id === game.id ? "next" as const : "upcoming" as const, score: null };
  });
  const results = [...finals.values()];
  return { year: snapshot.season, wins: results.filter((game) => game.outcome === "win").length, losses: results.filter((game) => game.outcome === "loss").length, ties: results.filter((game) => game.outcome === "tie").length, weeks };
}

function focusTurningPoint(points: CurvePoint[], keyPlay: KeyPlay, href: string): FocusTurningPoint | null {
  if (points.length < 2 || !keyPlay.desc?.trim() || keyPlay.wpa == null) return null;
  const change = wpaLabel(keyPlay.wpa);
  if (change === "Unavailable") return null;
  const index = keyPlayIndex(points, keyPlay);
  const point = points[index];
  if (!point || !Number.isInteger(point.q) || point.q < 3 || point.meaningful === false) return null;
  const secondsLeft = point.t ?? (point.q === keyPlay.qtr ? keyPlay.secondsLeft : null);
  return { index, description: keyPlay.desc, clock: clockLabel(point.q, secondsLeft), change, href: `${href}#play` };
}

export function buildFocus({ games, snapshot, curve, media, analytics = null }: { games: Game[]; snapshot: CurrentSnapshot | null; curve: CurvePoint[]; media: MediaCollection; analytics?: SeasonAnalytics | null }): FocusData {
  const lead = selectLead(games, snapshot);
  const result = lead.kind === "current" ? lead.result : null;
  const published = new Set(publishedGames(games, snapshot).map((game) => game.id));
  const points = lead.kind === "current" && lead.analysisStatus === "ready"
    ? curve.filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1)
    : [];
  const line: FocusPoint[] = points.map((point) => [Math.round(point.wp * 1000) / 1000, point.q]);
  const reportHref = result && published.has(result.id) ? `/games/${encodeURIComponent(result.id)}` : null;
  const last = result ? {
    id: result.id, week: result.week, postseason: result.seasonType === "POST", date: result.date,
    outcome: result.outcome, us: result.jetsScore, them: result.oppScore, opponent: result.opponentDisplay,
    opponentName: teamIdentity(result.opponentDisplay)?.nickname ?? result.opponentDisplay, place: placeName(result.opponentDisplay), home: result.atHome,
    href: reportHref ?? `/seasons/${result.season}`,
    hrefLabel: reportHref ? "Full game report" : "Season results", line,
    turningPoint: reportHref && lead.analysis ? focusTurningPoint(points, lead.analysis.keyPlay, reportHref) : null,
  } : null;

  const upcoming = nextScheduledGame(snapshot);
  const questions = upcoming && !upcoming.overdue ? previewQuestions(upcoming.game, analytics) : [];
  const question = questions.find((item) => item.id === "pass-defense") ?? questions[0];
  const next = upcoming ? {
    matchup: question ? {
      href: `/game-day#${unitAnchor(upcoming.game.id, question.id)}`,
      label: unitHeading(question.id, placeName(upcoming.game.opponentDisplay)),
    } : null,
    id: upcoming.game.id,
    week: upcoming.game.week, postseason: upcoming.game.seasonType === "POST", opponent: upcoming.game.opponentDisplay, place: placeName(upcoming.game.opponentDisplay),
    home: upcoming.game.atHome, date: upcoming.game.date, kickoff: upcoming.game.kickoff, overdue: upcoming.overdue,
  } : null;

  const season = seasonWeeks(snapshot);

  const picture = divisionPicture(snapshot?.standings);
  const division = picture && snapshot?.standings ? {
    name: picture.division, place: snapshot.standings.teams.findIndex((row) => row.team === "NYJ") + 1, back: picture.back, leader: placeName(picture.leader.team), tiedAtTop: picture.atTop,
    teams: snapshot.standings.teams.map((row) => ({ team: row.team, place: placeName(row.team), wins: row.wins, losses: row.losses, ties: row.ties, games: row.games, pointsFor: row.pointsFor, pointsAgainst: row.pointsAgainst, us: row.team === "NYJ" })),
  } : null;
  // Keep the helper honest: a tied leader shows zero games back.
  if (division && picture && gamesBehind(picture.leader, picture.self) !== division.back) throw new Error("Division standing out of step");

  // Missing publisher art uses the same factual title-card fallback as the room.
  const outletName = new Map(media.outlets.map((outlet) => [outlet.id, outlet.name]));
  const featured = selectHomeMedia(media.items, snapshot?.season);
  const mediaMoment = featured ? { id: featured.id, title: featured.title, outlet: outletName.get(featured.outletId) ?? featured.author, publishedAt: featured.publishedAt, item: compactMediaItem(featured) } : null;

  return { checkedAt: snapshot?.checkedAt ?? null, last, next, season, division, media: mediaMoment };
}
