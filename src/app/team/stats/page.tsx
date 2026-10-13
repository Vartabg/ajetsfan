import PlayerLeaders from "@/components/PlayerLeaders";
import FootballLiveCard from "@/components/football-live-card";
import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import TeamFocusNavigation from "@/components/TeamFocusNavigation";
import shared from "@/components/Focus.module.css";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { loadFootballLive } from "@/lib/load-football";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";
import styles from "../focus.module.css";

export const metadata = pageMetadata({ path: "/team/stats", title: "Jets Player Stats — The Back Page", description: "Jets passing, rushing and receiving leaders from confirmed regular-season games." });
export const dynamic = "force-dynamic";

export default async function TeamStatsPage() {
  const [coverage, current, live] = await Promise.all([loadCoverage(), loadCurrent(), loadFootballLive()]);
  const season = current?.season ?? coverage?.season;
  const currentStats = coverage && coverage.stats.season === season && coverage.stats.status !== "unavailable";
  const showGame = live?.featured && live.season === season && ["live", "final", "suspended"].includes(live.featured.state);
  return <FocusShell page="team-stats" section="/team" className={focusFonts} checkedAt={coverage?.stats.checkedAt ?? null}
    entries={[{ id: "leaders", title: "Player stats", answer: "Passing, rushing, receiving" }]}>
    <FocusMoment id="leaders" first heading="Player stats." status={<TeamFocusNavigation />}
      label={`${season ? `${season} regular season` : "Recorded production"}${currentStats && coverage.stats.throughWeek != null ? ` · through Week ${coverage.stats.throughWeek}` : ""}`}
      actions={<Link className={shared.go} href="/how-made">Sources &amp; definitions <span aria-hidden="true">→</span></Link>}>
      {showGame && live ? <><FootballLiveCard feed={live} id="latest-game-box-score" boxScore /><h2 style={{ margin: "16px 0 0", font: "650 22px/1.3 var(--display)" }}>Confirmed season totals</h2></> : null}
      <p className={shared.caption}>Passing, rushing and receiving. From confirmed games.</p>
      {coverage ? <div className={styles.content}><PlayerLeaders stats={coverage.stats} roster={coverage.roster} editionSeason={season ?? coverage.season} externalHeadingId="leaders-heading" /></div> : <p className={shared.caption}>Player statistics will appear after the next successful source check.</p>}
    </FocusMoment>
  </FocusShell>;
}
