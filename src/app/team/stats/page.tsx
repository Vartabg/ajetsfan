import PlayerLeaders from "@/components/PlayerLeaders";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { pageMetadata } from "@/lib/site";
import styles from "../page.module.css";

export const metadata = pageMetadata({ path: "/team/stats", title: "Jets Player Stats — The Back Page", description: "Jets passing, rushing and receiving leaders from confirmed regular-season games." });

export default async function TeamStatsPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const currentStats = coverage && coverage.stats.season === season && coverage.stats.status !== "unavailable";
  return <>
    <header className={styles.pageHeader}><p className={styles.kicker}>{season ? `${season} regular season` : "Recorded production"}{currentStats && coverage.stats.throughWeek != null ? ` · through Week ${coverage.stats.throughWeek}` : ""}</p><h1 id="leaders-heading" className="hed" tabIndex={-1}>Player stats.</h1><p>Passing, rushing and receiving. From confirmed games.</p></header>
    {coverage ? <div className={styles.pageContent}><PlayerLeaders stats={coverage.stats} roster={coverage.roster} editionSeason={season ?? coverage.season} externalHeadingId="leaders-heading" /></div> : <p className={styles.empty}>Player statistics will appear after the next successful source check.</p>}
  </>;
}
