import { Suspense } from "react";
import Link from "@/components/IntentLink";
import RosterExplorer from "@/components/RosterExplorer";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { publishedPlayers } from "@/lib/published-pages";
import { pageMetadata } from "@/lib/site";
import styles from "../page.module.css";

export const metadata = pageMetadata({ path: "/team/roster", title: "Jets Roster — The Back Page", description: "Search Jets player profiles by name, number, position and unit. Explore recorded player production and roster details." });

export default async function TeamRosterPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  return <section id="roster" aria-labelledby="roster-heading">
    <header className={styles.pageHeader}><p className={styles.kicker}>{coverage ? `${coverage.roster.season} source roster${coverage.roster.week != null ? ` · Week ${coverage.roster.week}` : ""}` : "The players"}</p><h1 id="roster-heading" className="hed" tabIndex={-1}>The roster.</h1><p>Find a player. Get to know his game.</p></header>
    {coverage ? <>
      <Suspense fallback={<p role="status">Loading roster controls…</p>}><RosterExplorer roster={coverage.roster} stats={coverage.stats} editionSeason={season ?? coverage.season} profileIds={publishedPlayers(coverage, season ?? coverage.season).map((player) => player.id)} /></Suspense>
      <details className={styles.rosterDetails}><summary>Roster coverage</summary><p>Roster membership does not establish game-day availability. {coverage.roster.players.length + (coverage.roster.excludedPlayers ?? 0)} source entries supply {coverage.roster.players.length} searchable profiles.{coverage.roster.excludedPlayers ? ` ${coverage.roster.excludedPlayers} entries await player identifiers.` : ""}</p><Link href="/how-made">Sources &amp; roster coverage</Link></details>
    </> : <p className={styles.empty}>The roster will appear after the next successful source check.</p>}
  </section>;
}
