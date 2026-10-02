import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { publishedPlayers } from "@/lib/published-pages";
import Link from "next/link";
import { Suspense } from "react";
import { leaders } from "@/lib/coverage";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { teamEditorialPhoto } from "@/lib/editorial-photos";
import EditorialPhoto from "@/components/EditorialPhoto";
import NewsDesk from "@/components/NewsDesk";
import PlayerLeaders from "@/components/PlayerLeaders";
import RosterExplorer from "@/components/RosterExplorer";
import styles from "./page.module.css";

export const metadata: Metadata = pageMetadata({
  path: "/team",
  title: "News & Team — The Back Page",
  description: "The Jets team sheet: current source roster, recorded player production, and dated official team coverage.",
});

export default async function TeamPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const coverPhoto = season != null ? teamEditorialPhoto(season) : null;
  const active = coverage?.roster.players.filter((player) => player.status === "ACT").length ?? 0;
  const rosterAvailable = !!coverage && coverage.roster.status !== "unavailable";
  const currentRoster = rosterAvailable && coverage.roster.season === season;
  const featured = coverage && currentRoster ? (["passing", "rushing", "receiving"] as const).flatMap((kind) => {
    const leader = coverage.stats.season === season && coverage.stats.status !== "unavailable" ? leaders(coverage.stats, kind)[0] : undefined;
    const player = leader && coverage.roster.players.find((entry) => entry.id === leader.id);
    return player ? [player] : [];
  }).filter((player, index, players) => players.findIndex((entry) => entry.id === player.id) === index) : [];
  return <main id="main" className={styles.main}>
    <header className={styles.hero}>
      <div className={styles.programmeFolio}><b>Team sheet</b>{" "}<span>{season ? `${season} · ` : ""}The player programme</span></div>
      <div className={`${styles.heroGrid} ${coverPhoto ? "" : styles.solo}`}>
        <div className={styles.intro}>
          <p className={styles.kicker}>Roster &amp; production</p>
          <h1 className="hed">The Jets<br />team<br /><span>sheet.</span></h1>
          <p>Current source roster, recorded player production, and dated official coverage.</p>
          <span className={styles.loyaltyStamp} aria-hidden="true">Source<br />checked.</span>
          {coverage ? <nav aria-label="Team coverage sections"><Link href="#season-leaders">Season leaders <span aria-hidden="true">↓</span></Link><Link href="#roster">Players &amp; roster <span aria-hidden="true">↓</span></Link><Link href="#news">Team news <span aria-hidden="true">↓</span></Link></nav> : null}
        </div>
        {coverPhoto ? <div className={styles.lineup}>
          <EditorialPhoto photo={coverPhoto} eager className={styles.coverPhoto} sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1288px) calc(58.33vw - 3.2rem), 700px" />
        </div> : null}
      </div>
      {featured.length ? <div className={styles.lineupNames}><p className={styles.lineupKicker}>Season yardage leaders.</p><div className={styles.lineupPlayers}>{featured.map((player) => <Link className={styles.featuredPlayer} href={`/team?${new URLSearchParams({ player: player.id })}#roster`} key={player.id}>
            {player.jersey !== null ? <span className={styles.jersey} aria-hidden="true">{player.jersey}</span> : null}
            <span className={styles.featuredName}><strong>{player.name}</strong><span>{player.position}{player.jersey !== null ? ` · No. ${player.jersey}` : ""}</span><span className={styles.profileCue}>View profile <span aria-hidden="true">↗</span></span></span>
          </Link>)}</div></div> : null}
      {coverage ? <p className={styles.edition}><b>{season} edition</b><span>{rosterAvailable ? `${coverage.roster.season} roster: ${coverage.roster.players.length + (coverage.roster.excludedPlayers ?? 0)} source entries · ${coverage.roster.players.length} searchable profiles · ${active} active-roster profiles` : "Roster profiles unavailable"}</span><span>{coverage.stats.status !== "unavailable" && coverage.stats.season === season ? `Player stats from ${coverage.stats.analyzedGameIds.length} completed regular-season games` : "Current-season player stats pending"}</span></p> : null}
    </header>
    {coverage ? <>
      <PlayerLeaders stats={coverage.stats} roster={coverage.roster} editionSeason={season ?? coverage.season} />
      <NewsDesk feed={coverage.news} />
      <section id="roster" className={styles.rosterSection} aria-labelledby="roster-heading"><div className={styles.rosterHeading}><div><p className={styles.kicker}>Source roster</p><h2 id="roster-heading" className="hed">The roster.</h2></div><p>{coverage.roster.season} source snapshot{coverage.roster.week != null ? ` · Week ${coverage.roster.week}` : ""}</p></div><p className={styles.rosterNote}>Search by name, number, or position for a source profile and recorded season statistics. Roster membership does not establish game-day availability.{coverage.roster.excludedPlayers ? ` ${coverage.roster.excludedPlayers} source ${coverage.roster.excludedPlayers === 1 ? "entry is" : "entries are"} awaiting player identifiers and cannot supply a searchable profile.` : ""}</p><Suspense fallback={<p>Loading roster controls…</p>}><RosterExplorer roster={coverage.roster} stats={coverage.stats} editionSeason={season ?? coverage.season} profileIds={publishedPlayers(coverage, season ?? coverage.season).map((player) => player.id)} /></Suspense></section>
    </> : <section className={styles.empty}><h2>Team coverage is being prepared.</h2><p>No verified news, roster, or player-stat snapshot is available in this edition.</p><a href="https://www.newyorkjets.com/news/" target="_blank" rel="noreferrer">Read official Jets coverage <span aria-hidden="true">↗</span></a></section>}
    <p className={styles.sourceNote}>Headlines come straight from the Jets. Rosters and season stats come from nflverse; check times and any delays are shown with each section.</p>
  </main>;
}
