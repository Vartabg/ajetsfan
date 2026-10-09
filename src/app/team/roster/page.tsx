import { Suspense } from "react";
import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import RosterExplorer from "@/components/RosterExplorer";
import TeamFocusNavigation from "@/components/TeamFocusNavigation";
import shared from "@/components/Focus.module.css";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { publishedPlayers } from "@/lib/published-pages";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";
import styles from "../focus.module.css";

export const metadata = pageMetadata({ path: "/team/roster", title: "Jets Roster — The Back Page", description: "Search Jets player profiles by name, number, position and unit. Explore recorded player production and roster details." });

export default async function TeamRosterPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  return <FocusShell page="team-roster" section="/team" className={focusFonts} checkedAt={coverage?.roster.checkedAt ?? null}
    entries={[{ id: "roster", title: "The roster", answer: coverage ? `${coverage.roster.players.length} players` : "Pending" }]}>
    <FocusMoment id="roster" first heading="The roster." status={<TeamFocusNavigation />}
      label={coverage ? `${coverage.roster.season} source roster${coverage.roster.week != null ? ` · Week ${coverage.roster.week}` : ""}` : "The players"}>
    <p className={shared.caption}>Find a player. Get to know his game.</p>
    {coverage ? <>
      <div className={styles.content} data-focus-tools><Suspense fallback={<p role="status">Loading roster controls…</p>}><RosterExplorer roster={coverage.roster} stats={coverage.stats} editionSeason={season ?? coverage.season} profileIds={publishedPlayers(coverage, season ?? coverage.season).map((player) => player.id)} /></Suspense></div>
      <details className={styles.details}><summary>Roster coverage</summary><p>Roster membership does not establish game-day availability. {coverage.roster.players.length + (coverage.roster.excludedPlayers ?? 0)} source entries supply {coverage.roster.players.length} searchable profiles.{coverage.roster.excludedPlayers ? ` ${coverage.roster.excludedPlayers} entries await player identifiers.` : ""}</p><Link className={shared.go} href="/how-made">Sources &amp; roster coverage</Link></details>
    </> : <p className={shared.caption}>The roster will appear after the next successful source check.</p>}
    </FocusMoment>
  </FocusShell>;
}
