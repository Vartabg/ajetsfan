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
    "The analyzed Jets archive, ranked by the second-half win probability they reached before it all went wrong. Or right.",
};

export default async function Morgue() {
  const games = await loadGames();
  const coverage = archiveCoverage(games);
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");

  return (
    <main id="main" className={styles.main}>
      <header className={styles.head}>
        <div><p className={styles.kicker}>Jets archive / Game explorer</p><h1 className={`${styles.title} hed`}>The Morgue</h1><p className={styles.standfirst}>Every game has a turning point. Find the hope, the heartbreak, and the moments that brought it back.</p></div>
        <div className={styles.coverage}><strong>{coverage.count}</strong><span>games analyzed · {coverage.seasonLabel}</span><small>{coverage.lastDate ? `Through ${formatDate(coverage.lastDate)} · ` : ""}{heartbreak.length + miracle.length} eligible for probability rankings</small></div>
      </header>

      <Suspense fallback={<p className={styles.loading} role="status">Opening the game explorer…</p>}><Boards heartbreak={heartbreak} miracle={miracle} /></Suspense>
    </main>
  );
}
