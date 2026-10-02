import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { publishedGames } from "@/lib/published-pages";
import Link from "next/link";
import { Suspense } from "react";
import { rank } from "@/lib/games";
import { selectFanMemories } from "@/lib/fan-memories";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { archiveCoverage, formatDate } from "@/lib/current";
import Boards from "@/components/Boards";
import MemoryWall from "@/components/MemoryWall";
import styles from "./page.module.css";

export const metadata: Metadata = pageMetadata({
  path: "/morgue",
  title: "The Morgue — a Jets fan",
  description:
    "The Jets game archive. Explore confirmed scores, second-half model win probabilities, and recorded play-by-play.",
});

export default async function Morgue() {
  const [games, current] = await Promise.all([loadGames(), loadCurrent()]);
  const coverage = archiveCoverage(games);
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");

  return (
    <main id="main" className={styles.main}>
      <header className={styles.head}>
        <div className={styles.folio}>
          <p className={styles.kicker}>The Jets game archive</p>
          <span aria-hidden="true">Final scores · Recorded plays</span>
        </div>
        <div className={styles.intro}>
          <div>
            <h1 className={styles.title}><span className={styles.article}>The</span> Morgue<span className={styles.period} aria-hidden="true">.</span></h1>
            <p className={styles.epitaph}>Final scores. Probability paths.</p>
          </div>
          <div className={styles.notice}>
            <div className={styles.seal} aria-hidden="true"><span>Analyzed</span><strong>{coverage.count}</strong><span>Archive games</span></div>
            <p className={styles.standfirst}>Compare the final with the probability path. Losses rank by their highest second-half estimate; wins rank by their lowest.</p>
          </div>
        </div>
        <div className={styles.coverage}><span>{coverage.count} analyzed games · {coverage.seasonLabel}</span><span>{coverage.lastDate ? <>Through <time dateTime={coverage.lastDate}>{formatDate(coverage.lastDate)}</time></> : "No analyzed games yet"}</span></div>
      </header>

      {heartbreak.length + miracle.length > 0 ? <nav className={styles.index} aria-label="In The Morgue">{selectFanMemories(games).length ? <Link href="#fan-memories">The classic cases <span aria-hidden="true">↓</span></Link> : null}<Link href="#archive-filters">Find a game <span aria-hidden="true">↓</span></Link></nav> : null}
      <MemoryWall games={games} />
      <Suspense fallback={<p className={styles.loading} role="status">Loading the game archive…</p>}><Boards heartbreak={heartbreak} miracle={miracle} caseIds={publishedGames(games, current).map((game) => game.id)} /></Suspense>
      <p className={styles.sourceNote}>{heartbreak.length + miracle.length} wins and losses have usable second-half probability estimates and qualify for these rankings. Flagged scores and ties are excluded. Win probability is a model estimate from nflverse play-by-play; <a href="/how-made">review the method and integrity checks</a>.</p>
    </main>
  );
}
