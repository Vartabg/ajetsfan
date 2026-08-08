import Link from "next/link";
import { rank } from "@/lib/games";
import { loadGames } from "@/lib/load-games";
import Boards from "@/components/Boards";
import styles from "./page.module.css";

export default async function Home() {
  const games = await loadGames();
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");

  const nearCertain = heartbreak.filter((g) => (g.swing ?? 0) >= 0.9).length;
  const worst = heartbreak[0];
  const best = miracle[0];

  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <p className={styles.kicker}>a jets fan</p>
        <h1 className={styles.title}>
          Heartbreak
          <span className={styles.amp}>&amp;</span>
          Miracles
        </h1>
        <p className={styles.lede}>
          Every Jets game since 1999, ranked by the win probability they reached
          before it all went wrong. Or right. Second half only — this measures
          collapse, not a hot start.
        </p>

        <Link href="/how-it-was-made" className={styles.how}>
          How this was made — and the three things the data got wrong →
        </Link>

        <dl className={styles.tiles}>
          <div className={styles.tile}>
            <dt>Games measured</dt>
            <dd className="mono">{heartbreak.length + miracle.length}</dd>
          </div>
          <div className={styles.tile}>
            <dt>Losses after reaching 90%</dt>
            <dd className="mono">{nearCertain}</dd>
          </div>
          <div className={styles.tile}>
            <dt>Worst collapse</dt>
            <dd className="mono">{((worst?.swing ?? 0) * 100).toFixed(1)}%</dd>
          </div>
          <div className={styles.tile}>
            <dt>Deepest comeback</dt>
            <dd className="mono">{((best?.swing ?? 0) * 100).toFixed(1)}%</dd>
          </div>
        </dl>
      </header>

      <Boards heartbreak={heartbreak} miracle={miracle} />

      <footer className={styles.footer}>
        <p>
          Play-by-play from{" "}
          <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
            nflverse
          </a>
          . Win probability is theirs, not mine. An independent fan project, not
          affiliated with the New York Jets or the NFL.
        </p>
        <p className={styles.note}>
          One game is held out of both boards: 2002-09-29 at Jacksonville, where
          the play-by-play scoring never reaches the official final, so its win
          probability describes a game that did not happen.{" "}
          <Link href="/how-it-was-made">Why, and what else was wrong</Link>.
        </p>
      </footer>
    </main>
  );
}
