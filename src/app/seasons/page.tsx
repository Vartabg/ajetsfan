import Link from "next/link";
import { loadSeasonArchive } from "@/lib/load-season-archive";
import { phaseResults, seasonNumbers } from "@/lib/season-archive";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

export const metadata = pageMetadata({ path: "/seasons", title: "Jets Season Archive — results, playoffs, stories and film", description: "Explore the Jets by football season: final scores, scoring margins, playoff runs, game evidence, sourced facts, reporting and replays. Historical game coverage begins in 1999 with selected earlier moments." });

export default async function SeasonsPage() {
  const seasons = await loadSeasonArchive();
  const featured = seasons.find((season) => season.year === 2010);
  const postseason = featured ? seasonNumbers(phaseResults(featured, "playoffs")) : null;
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">The Back Page</Link><span aria-hidden="true">/</span><span>Seasons</span></nav>
    <header className={styles.header}><p className={styles.kicker}>Every season leaves a record</p><h1 className="hed">Pick a year.<br /><span>Go back in.</span></h1><p>Find the scores, playoff games, measured evidence and moments from one Jets season. News and replays are tagged to the football season they cover, even when they were published years later.</p></header>
    {featured && postseason?.games ? <section className={styles.feature} aria-labelledby="season-feature-heading"><div><p className={styles.kicker}>Start here · the 2010 playoffs</p><h2 id="season-feature-heading" className="hed">Indianapolis.<br />Foxborough.<br />Pittsburgh.</h2><p>Follow three road playoff games, revisit the 28–21 New England win, and open the original reporting and NFL replay.</p><Link href="/seasons/2010?phase=playoffs">Explore the playoff run <span aria-hidden="true">↗</span></Link></div><div className={styles.featureNumbers}><strong>{postseason.wins}–{postseason.losses}</strong><small>2010 postseason · {postseason.games} recorded games<br />Played in January 2011</small></div></section> : null}
    <div className={styles.directoryTitle}><h2 className="hed">Available seasons</h2><p>{seasons.length} years · coverage varies by year</p></div>
    <div className={styles.years}>{seasons.map((season) => {
      const regular = seasonNumbers(phaseResults(season, "regular")), playoffs = seasonNumbers(phaseResults(season, "playoffs"));
      return <Link className={styles.season} data-archive-year={season.year} key={season.year} href={`/seasons/${season.year}`}><h3>{season.year}<span aria-hidden="true">↗</span></h3><p>{regular.games ? `${regular.wins}–${regular.losses}${regular.ties ? `–${regular.ties}` : ""} regular season` : "Selected historical moments"}</p><small>{season.current ? "Current season · in progress" : `${season.results.length} recorded finals`}{playoffs.games ? ` · ${playoffs.wins}–${playoffs.losses} playoffs` : ""}</small><small>{season.cases.length} game cases · {season.facts.length} sourced moments · {season.media.length} media items</small></Link>;
    })}</div>
    <p className={styles.note}>Game results and usable win-probability evidence begin in 1999. Earlier years contain selected verified moments; reporting remains a curated selection. Team and player league comparisons begin in 1999; available Next Gen tracking begins in 2016. The current season includes confirmed finals only. <Link href="/how-made">See sources and methods ↗</Link></p>
  </main>;
}
