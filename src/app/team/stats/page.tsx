import PlayerLeaders from "@/components/PlayerLeaders";
import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import TeamFocusNavigation from "@/components/TeamFocusNavigation";
import shared from "@/components/Focus.module.css";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";
import styles from "../focus.module.css";

export const metadata = pageMetadata({ path: "/team/stats", title: "Jets Player Stats — The Back Page", description: "Jets passing, rushing and receiving leaders from confirmed regular-season games." });

export default async function TeamStatsPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const currentStats = coverage && coverage.stats.season === season && coverage.stats.status !== "unavailable";
  return <FocusShell page="team-stats" section="/team" className={focusFonts} checkedAt={coverage?.stats.checkedAt ?? null}
    entries={[{ id: "leaders", title: "Player stats", answer: "Passing, rushing, receiving" }]}>
    <FocusMoment id="leaders" first heading="Player stats." status={<TeamFocusNavigation />}
      label={`${season ? `${season} regular season` : "Recorded production"}${currentStats && coverage.stats.throughWeek != null ? ` · through Week ${coverage.stats.throughWeek}` : ""}`}
      actions={<Link className={shared.go} href="/how-made">Sources &amp; definitions <span aria-hidden="true">→</span></Link>}>
      <p className={shared.caption}>Passing, rushing and receiving. From confirmed games.</p>
      {coverage ? <div className={styles.content}><PlayerLeaders stats={coverage.stats} roster={coverage.roster} editionSeason={season ?? coverage.season} externalHeadingId="leaders-heading" /></div> : <p className={shared.caption}>Player statistics will appear after the next successful source check.</p>}
    </FocusMoment>
  </FocusShell>;
}
