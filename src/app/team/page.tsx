import type { Metadata } from "next";
import { Suspense } from "react";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import NewsDesk from "@/components/NewsDesk";
import PlayerLeaders from "@/components/PlayerLeaders";
import RosterExplorer from "@/components/RosterExplorer";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "News & Team — The Back Page",
  description: "Official Jets headlines, season player leaders, and a searchable roster with player profiles. Each source check and statistical cutoff is visible.",
};

export default async function TeamPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const active = coverage?.roster.players.filter((player) => player.status === "ACT").length ?? 0;
  const rosterAvailable = coverage?.roster.status !== "unavailable";
  return <main id="main" className={styles.main}>
    <header className={styles.hero}>
      <p className={styles.kicker}>The people. The stories. The green &amp; white.</p>
      <div className={styles.heroGrid}><h1 className="hed">Inside<br /><span>the Jets.</span></h1><div className={styles.intro}><p>Follow the team beyond the final score. Official headlines, the players making an impact, and the roster behind the next chapter.</p><nav aria-label="Team coverage sections"><a href="#news">Latest news <span aria-hidden="true">↓</span></a><a href="#season-leaders">Player leaders <span aria-hidden="true">↓</span></a><a href="#roster">The roster <span aria-hidden="true">↓</span></a></nav></div></div>
      {coverage ? <div className={styles.facts}><p><b>{rosterAvailable ? coverage.roster.players.length : "—"}</b><span>{coverage.roster.season} searchable roster profiles</span></p><p><b>{rosterAvailable ? active : "—"}</b><span>Active roster profiles</span></p><p><b>{coverage.stats.status !== "unavailable" && coverage.stats.season === season ? coverage.stats.analyzedGameIds.length : "—"}</b><span>Completed games with player stats</span></p><p><b>{season}</b><span>Season edition</span></p></div> : null}
    </header>
    {coverage ? <>
      <NewsDesk feed={coverage.news} />
      <PlayerLeaders stats={coverage.stats} roster={coverage.roster} editionSeason={season ?? coverage.season} />
      <section id="roster" className={styles.rosterSection} aria-labelledby="roster-heading"><div className={styles.rosterHeading}><div><p className={styles.kicker}>Meet the green &amp; white</p><h2 id="roster-heading" className="hed">The roster.</h2></div><p>{coverage.roster.season} source snapshot{coverage.roster.week != null ? ` · Week ${coverage.roster.week}` : ""}</p></div><p className={styles.rosterNote}>Search a player, number, or position. Select a player for their profile and recorded season statistics. Roster membership does not establish game-day availability.{coverage.roster.excludedPlayers ? ` ${coverage.roster.excludedPlayers} source ${coverage.roster.excludedPlayers === 1 ? "entry is" : "entries are"} awaiting player identifiers and cannot supply a searchable profile.` : ""}</p><Suspense fallback={<p>Loading roster controls…</p>}><RosterExplorer roster={coverage.roster} stats={coverage.stats} editionSeason={season ?? coverage.season} /></Suspense></section>
    </> : <section className={styles.empty}><h2>Team coverage is being prepared.</h2><p>No verified news, roster, or player-stat snapshot is available in this edition.</p><a href="https://www.newyorkjets.com/news/" target="_blank" rel="noreferrer">Read official Jets coverage <span aria-hidden="true">↗</span></a></section>}
    <p className={styles.sourceNote}>Headlines link to the original team coverage. Roster and box-score statistics come from nflverse. Each module keeps its own successful-check time and makes missing or retained data visible.</p>
  </main>;
}
