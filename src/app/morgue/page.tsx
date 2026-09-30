import type { Metadata } from "next";
import { Suspense } from "react";
import { rank } from "@/lib/games";
import { loadGames } from "@/lib/load-games";
import { archiveCoverage, formatDate } from "@/lib/current";
import Boards from "@/components/Boards";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "The Morgue — a Jets fan",
  description:
    "A shrine to lost leads, improbable Jets wins, and the games we still can't leave alone. Explore the scores, turning points, and play-by-play.",
};

export default async function Morgue() {
  const games = await loadGames();
  const coverage = archiveCoverage(games);
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");

  return (
    <main id="main" className={styles.main}>
      <header className={styles.head}>
        <p className={styles.kicker}>For the fans who keep showing up</p>
        <h1 className={`${styles.title} hed`}>The Morgue<span aria-hidden="true">.</span></h1>
        <p className={styles.epitaph}>Sunday optimism. Gone too soon.</p>
        <p className={styles.standfirst}>A shrine to lost leads, improbable wins, and the Sundays we swore we&apos;d stop caring. See you next week.</p>
        <div className={styles.coverage}><span>{coverage.count} analyzed games · {coverage.seasonLabel}</span><span>{coverage.lastDate ? <>Through <time dateTime={coverage.lastDate}>{formatDate(coverage.lastDate)}</time></> : "No analyzed games yet"}</span></div>
      </header>

      <Suspense fallback={<p className={styles.loading} role="status">Finding the tape…</p>}><Boards heartbreak={heartbreak} miracle={miracle} /></Suspense>
      <p className={styles.sourceNote}>The scores are real. So are the reasons we remember them. {heartbreak.length + miracle.length} wins and losses qualify for these rankings. Win probability comes from nflverse; <a href="/how-made">the method and integrity checks are here</a>.</p>
    </main>
  );
}
