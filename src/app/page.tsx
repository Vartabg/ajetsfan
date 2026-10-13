import FocusHome from "@/components/FocusHome";
import FocusMoment from "@/components/FocusMoment";
import FootballLiveCard, { footballOpponent, showFootballMoment } from "@/components/football-live-card";
import Link from "@/components/IntentLink";
import { selectLead } from "@/lib/current";
import { buildFocus } from "@/lib/focus";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { loadLeagueHistory } from "@/lib/load-league-history";
import { loadMediaCollection, scheduleStaleMediaRecovery } from "@/lib/load-media";
import { loadFootballLive } from "@/lib/load-football";
import { newYorkToday, onThisDay } from "@/lib/on-this-day";
import { publishedGames } from "@/lib/published-pages";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "./focus-fonts";
import shared from "@/components/Focus.module.css";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export const metadata = pageMetadata({
  path: "/", title: "ajetsfan · the Jets, one thing at a time",
  description: "The latest Jets result, the next game, the season, the division, a big play, surprising archive discoveries and the newest coverage, one at a time.",
});

export default async function Home() {
  const [games, snapshot, mediaCollection, live, history] = await Promise.all([loadGames(), loadCurrent(), loadMediaCollection(), loadFootballLive(), loadLeagueHistory()]);
  await scheduleStaleMediaRecovery();
  const lead = selectLead(games, snapshot);
  const curve = lead.analysisStatus === "ready" && lead.analysis ? await loadCurve(lead.analysis.id) : [];
  const data = buildFocus({ games, snapshot, curve, media: mediaCollection });
  // The page renders per request, so "today" is the reader's New York date.
  const today = history ? onThisDay(history.games, newYorkToday(), new Set(publishedGames(games, snapshot).map((game) => game.id))) : null;
  const game = live && showFootballMoment(live, lead.result?.id) ? live.featured : null;
  const liveMoment = game && live ? {
    title: game.state === "live" && live.status === "ready" ? "Live game" : "Game update",
    answer: game.jetsScore !== null && game.oppScore !== null ? `Jets ${game.jetsScore}–${game.oppScore}` : game.detail,
    content: <FocusMoment id="next" first={!data.last} label={`${live.status === "retained" ? "Last verified game update" : game.state === "live" ? "Live game" : "Latest game update"} · ${game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`}`}
      heading={<>Jets {game.atHome ? "vs" : "at"} {footballOpponent(game)}.</>}
      actions={<Link href="/game-day" className={shared.go}>Game Day <span aria-hidden="true">→</span></Link>}>
      <figure className={shared.shape}><FootballLiveCard feed={live} id="home-football-score" /></figure>
    </FocusMoment>,
  } : undefined;
  return <FocusHome data={data} today={today} className={focusFonts} liveMoment={liveMoment} />;
}
