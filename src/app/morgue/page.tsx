import type { Metadata } from "next";
import { rank } from "@/lib/games";
import { loadGames } from "@/lib/load-games";
import Boards from "@/components/Boards";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "The Morgue — a Jets fan",
  description:
    "Every Jets game since 1999, ranked by the win probability they reached before it all went wrong. Or right.",
};

export default async function Morgue() {
  const games = await loadGames();
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");

  return (
    <main id="main" className={styles.main}>
      <header className={styles.head}>
        <p className={`${styles.kicker} label`}>The archive · 1999 to 2025</p>
        <h1 className={`${styles.title} hed`}>The Morgue</h1>
        <p className={styles.standfirst}>
          A newspaper&apos;s own word for the room where it keeps everything that
          already happened. {heartbreak.length + miracle.length} games, ranked by the
          win probability they reached in the second half before it all went wrong.
          Or right.
        </p>
      </header>

      <Boards heartbreak={heartbreak} miracle={miracle} />
    </main>
  );
}
