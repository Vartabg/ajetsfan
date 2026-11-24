import { cache } from "react";
import FocusHome from "@/components/FocusHome";
import FocusMoment from "@/components/FocusMoment";
import FootballLiveCard, { footballOpponent, showFootballMoment } from "@/components/football-live-card";
import Link from "@/components/IntentLink";
import LivePlays from "@/components/LivePlays";
import { TeamLeadersMoment, TeamNewsMoment } from "@/components/TeamMoments";
import { selectLead } from "@/lib/current";
import { buildFocus } from "@/lib/focus";
import { homePlay } from "@/lib/home-play";
import { dayOf } from "@/lib/focus-format";
import { loadCoverage } from "@/lib/load-coverage";
import { loadAnalytics, loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { loadMediaCollection, scheduleStaleMediaRecovery } from "@/lib/load-media";
import { loadFootballLive } from "@/lib/load-football";
import { editionClock } from "@/lib/live-plays";
import { pageMetadata } from "@/lib/site";
import { buildTeamFocus } from "@/lib/team-focus";
import { loadSnapGame } from "@/lib/load-snaps";
import { featuredSnap, snapPath } from "@/lib/snap-explorer";
import { snapHeadline } from "@/lib/snap-context";
import { focusFonts } from "./focus-fonts";
import shared from "@/components/Focus.module.css";

// The server and hydrating client start from the same minute before the browser clock takes over.
const requestMinute = cache(() => Math.floor(Date.now() / 60_000) * 60_000);

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export const metadata = pageMetadata({
  path: "/", title: "ajetsfan · the Jets, one thing at a time",
  description: "Get the Jets score, see a play that shaped the game, and replay it snap by snap. Follow the next matchup, season standings and player leaders.",
});

export default async function Home() {
  const [games, snapshot, mediaCollection, live, coverage, analytics] = await Promise.all([
    loadGames(), loadCurrent(), loadMediaCollection(), loadFootballLive(), loadCoverage(), loadAnalytics().catch(() => null),
  ]);
  await scheduleStaleMediaRecovery();
  const lead = selectLead(games, snapshot);
  const curve = lead.kind === "current" && lead.analysisStatus === "ready" && lead.analysis ? await loadCurve(lead.analysis.id) : [];
  const data = buildFocus({ games, snapshot, curve, media: mediaCollection, analytics });
  if (data.last && lead.kind === "current" && lead.analysisStatus === "ready" && lead.analysis?.id === data.last.id) {
    const archive = await loadSnapGame(lead.analysis.id);
    const play = featuredSnap(archive, lead.analysis.keyPlay);
    if (play && archive) {
      const roster = coverage?.roster;
      data.last.play = homePlay(archive, play, roster?.season === lead.analysis.season && roster.status !== "unavailable" ? roster.players : []);
      if (data.last.turningPoint) {
        data.last.turningPoint.snap = { href: snapPath(archive.id, play.key), label: snapHeadline(archive, play).replace(/\.$/, "") };
      }
    }
  }
  const team = buildTeamFocus(coverage, snapshot?.season ?? null);

  const candidate = live && showFootballMoment(live, data.last?.id) && (!snapshot || live.featured?.season === snapshot.season) ? live.featured : null;
  const progress = (postseason: boolean, week: number) => (postseason ? 100 : 0) + week;
  const livePlacement: "lead" | "postgame" | null = !candidate ? null
    : candidate.state !== "final" ? "lead"
    : candidate.gameId === data.last?.id ? "postgame"
    : !data.last || progress(candidate.seasonType === "POST", candidate.week) > progress(data.last.postseason, data.last.week) ? "lead"
    : null;
  const showNext = Boolean(data.next && !(livePlacement && candidate?.gameId === data.next.id));

  const activeIds = [
    livePlacement === "lead" ? "live" : null,
    data.last ? "last" : null,
    livePlacement === "postgame" ? "live" : null,
    showNext ? "next" : null,
    data.season ? "season" : null,
    data.division ? "division" : null,
    team.stats.leaders.length ? "leaders" : null,
    team.news.lead ? "headlines" : null,
    data.media ? "media" : null,
  ].filter((id): id is string => id !== null);
  const firstId = activeIds[0] ?? null;

  const liveMoment = livePlacement && candidate && live ? {
    title: candidate.state === "live" && live.status === "ready" ? "Live game" : "Game update",
    answer: candidate.jetsScore !== null && candidate.oppScore !== null ? `Jets ${candidate.jetsScore}–${candidate.oppScore}` : candidate.detail,
    content: <FocusMoment id="live" first={firstId === "live"}
      label={`${live.status === "retained" ? "Last verified game update" : candidate.state === "live" ? "Live game" : "Latest game update"} · ${candidate.seasonType === "POST" ? "Playoffs" : `Week ${candidate.week}`}`}
      heading={<>Jets {candidate.atHome ? "vs" : "at"} {footballOpponent(candidate)}.</>}
      actions={<Link href="/game-day" className={shared.go}>Game Day <span aria-hidden="true">→</span></Link>}>
      <figure className={shared.shape}>{candidate.state === "live" ? <LivePlays foldChart event={candidate.eventId} nickname={footballOpponent(candidate)} us={candidate.jetsScore} them={candidate.oppScore} clock={editionClock(candidate)} />
        : <FootballLiveCard feed={live} id="home-football-score" />}</figure>
    </FocusMoment>,
  } : undefined;

  const leadersMoment = team.stats.leaders.length ? {
    title: "Leaders",
    answer: team.stats.names,
    content: <TeamLeadersMoment season={team.season} stats={team.stats} first={firstId === "leaders"} rosterLink />,
  } : undefined;

  const newsMoment = team.news.lead ? {
    title: "Team news",
    answer: dayOf(team.news.lead.publishedAt),
    content: <TeamNewsMoment news={team.news} first={firstId === "headlines"} />,
  } : undefined;

  return <FocusHome data={data} renderedAt={requestMinute()} firstId={firstId} showNext={showNext} livePlacement={livePlacement}
    liveMoment={liveMoment} leadersMoment={leadersMoment} newsMoment={newsMoment} className={focusFonts} />;
}
