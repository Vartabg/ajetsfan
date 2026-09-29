import type { Metadata } from "next";
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
        <p className={`${styles.kicker} label`}>The analyzed archive · {coverage.seasonLabel}{coverage.lastDate ? ` · through ${formatDate(coverage.lastDate)}` : ""}</p>
        <h1 className={`${styles.title} hed`}>The Morgue</h1>
        <p className={styles.standfirst}>
          A newspaper&apos;s own word for the room where it keeps everything that
          already happened. {coverage.count} analyzed games; {heartbreak.length + miracle.length} qualify for the rankings, ordered by the
          win probability they reached in the second half before it all went wrong.
          Or right.
        </p>
      </header>

      <Boards heartbreak={heartbreak} miracle={miracle} />
    </main>
  );
}
