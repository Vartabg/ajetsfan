import { completedGames, divisionPicture, gamesBehind, nextScheduledGame, selectLead, type CurrentSnapshot } from "./current";
import type { Game } from "./games";
import type { CurvePoint } from "./load-games";
import { jetsPlays } from "./jets-playbook";
import { getJetsStudy } from "./jets-snap-study";
import { mediaImage, type MediaCollection, type MediaImage } from "./media";
import type { PlayDesign } from "./playbook";
import { publishedGames } from "./published-pages";
import { teamIdentity } from "./teams";

/** One play of a game's line: the Jets' pre-play win chance and the quarter (5+ is overtime). */
export type FocusPoint = [wp: number, quarter: number];
export type WeekState = "win" | "loss" | "tie" | "next" | "upcoming" | "bye";

export type FocusData = {
  checkedAt: string | null;
  last: {
    id: string; week: number; postseason: boolean; date: string; archive: boolean;
    outcome: "win" | "loss" | "tie"; us: number; them: number; opponent: string; place: string; home: boolean;
    href: string; hrefLabel: string; line: FocusPoint[];
  } | null;
  next: { week: number; postseason: boolean; opponent: string; place: string; home: boolean; date: string; kickoff: string | null; overdue: boolean } | null;
  season: { year: number; wins: number; losses: number; ties: number; weeks: { week: number; opponent: string | null; state: WeekState; score: string | null }[] } | null;
  division: { name: string; place: number; back: number; leader: string; tiedAtTop: number; teams: { team: string; place: string; wins: number; losses: number; ties: number; games: number; pointsFor: number; pointsAgainst: number; us: boolean }[] } | null;
  film: { title: string; date: string; situation: string; result: string; summary: string; star: string; design: PlayDesign } | null;
  media: { id: string; title: string; outlet: string; publishedAt: string | null; image: MediaImage | null } | null;
};

// Two teams share Los Angeles and two share New York; they go by nickname in a sentence.
const SHARED_CITIES = new Set(["Los Angeles", "New York"]);
/** How a sentence names an opponent: "Chicago", "the Chargers". */
export function placeName(code: string): string {
  const team = teamIdentity(code);
  if (!team) return code;
  return team.nickname && SHARED_CITIES.has(team.city) ? `the ${team.nickname}` : team.city;
}

const FEATURED_PLAY = "wilson-cleveland";

export function buildFocus({ games, snapshot, curve, media }: { games: Game[]; snapshot: CurrentSnapshot | null; curve: CurvePoint[]; media: MediaCollection }): FocusData {
  const lead = selectLead(games, snapshot);
  const result = lead.result;
  const published = new Set(publishedGames(games, snapshot).map((game) => game.id));
  const line: FocusPoint[] = lead.analysisStatus === "ready"
    ? curve.filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1).map((point) => [Math.round(point.wp * 1000) / 1000, point.q])
    : [];
  const last = result ? {
    id: result.id, week: result.week, postseason: result.seasonType === "POST", date: result.date, archive: lead.kind === "archive",
    outcome: result.outcome, us: result.jetsScore, them: result.oppScore, opponent: result.opponentDisplay, place: placeName(result.opponentDisplay), home: result.atHome,
    href: published.has(result.id) ? `/games/${encodeURIComponent(result.id)}` : `/seasons/${result.season}`,
    hrefLabel: published.has(result.id) ? "Full game report" : "Season results", line,
  } : null;

  const upcoming = nextScheduledGame(snapshot);
  const next = upcoming ? {
    week: upcoming.game.week, postseason: upcoming.game.seasonType === "POST", opponent: upcoming.game.opponentDisplay, place: placeName(upcoming.game.opponentDisplay),
    home: upcoming.game.atHome, date: upcoming.game.date, kickoff: upcoming.game.kickoff, overdue: upcoming.overdue,
  } : null;

  let season: FocusData["season"] = null;
  if (snapshot) {
    const regular = snapshot.schedule.filter((game) => game.season === snapshot.season && game.seasonType === "REG");
    const finals = new Map(completedGames(snapshot).filter((game) => game.season === snapshot.season && game.seasonType === "REG").map((game) => [game.id, game]));
    const lastWeek = Math.max(18, ...regular.map((game) => game.week));
    const weeks = Array.from({ length: lastWeek }, (_, index) => {
      const week = index + 1;
      const game = regular.find((entry) => entry.week === week);
      if (!game) return { week, opponent: null, state: "bye" as const, score: null };
      const final = finals.get(game.id);
      if (final) return { week, opponent: game.opponentDisplay, state: final.outcome, score: `${final.jetsScore}–${final.oppScore}` };
      return { week, opponent: game.opponentDisplay, state: upcoming?.game.id === game.id ? "next" as const : "upcoming" as const, score: null };
    });
    const results = [...finals.values()];
    season = { year: snapshot.season, wins: results.filter((game) => game.outcome === "win").length, losses: results.filter((game) => game.outcome === "loss").length, ties: results.filter((game) => game.outcome === "tie").length, weeks };
  }

  const picture = divisionPicture(snapshot?.standings);
  const division = picture && snapshot?.standings ? {
    name: picture.division, place: snapshot.standings.teams.findIndex((row) => row.team === "NYJ") + 1, back: picture.back, leader: placeName(picture.leader.team), tiedAtTop: picture.atTop,
    teams: snapshot.standings.teams.map((row) => ({ team: row.team, place: placeName(row.team), wins: row.wins, losses: row.losses, ties: row.ties, games: row.games, pointsFor: row.pointsFor, pointsAgainst: row.pointsAgainst, us: row.team === "NYJ" })),
  } : null;
  // Keep the helper honest: a tied leader shows zero games back.
  if (division && picture && gamesBehind(picture.leader, picture.self) !== division.back) throw new Error("Division standing out of step");

  const play = jetsPlays.find((entry) => entry.id === FEATURED_PLAY);
  const study = play ? getJetsStudy(play.id) : null;
  const film = play && study ? { title: play.title, date: play.date, situation: play.situation, result: play.result, summary: play.summary, star: play.focusPlayerIds[0], design: study.design } : null;

  // The newest dated item that has its publisher's picture.
  const outletName = new Map(media.outlets.map((outlet) => [outlet.id, outlet.name]));
  const pictured = media.items.filter((item) => mediaImage(item) && item.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
  const featured = pictured[0];
  const mediaMoment = featured ? { id: featured.id, title: featured.title, outlet: outletName.get(featured.outletId) ?? featured.author, publishedAt: featured.publishedAt, image: mediaImage(featured) } : null;

  return { checkedAt: snapshot?.checkedAt ?? null, last, next, season, division, film, media: mediaMoment };
}
