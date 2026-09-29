import styles from "./Colophon.module.css";
import Link from "next/link";
import type { Game } from "@/lib/games";
import type { CurrentSnapshot } from "@/lib/current";
import { archiveCoverage, formatDate } from "@/lib/current";

/**
 * The one-line colophon a newspaper carries at the foot of the page. Sources and
 * the single excluded game are disclosed here rather than on a page of their own.
 */
export default function Colophon({ games, snapshot }: { games: Game[]; snapshot: CurrentSnapshot | null }) {
  const coverage = archiveCoverage(games);
  const excluded = games.filter((game) => game.dataSuspect).length;
  return (
    <footer className={styles.foot}>
      <div className={styles.top}><Link href="/" className={styles.brand}>The Back Page</Link><p className={styles.tagline}>For the faithful. Fueled by data.</p></div>
      <p>
        Play-by-play and win probability from{" "}
        <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
          nflverse
        </a>
        . {snapshot ? <>Results and schedule from <a href={snapshot.sources.schedule} target="_blank" rel="noreferrer">the schedule source</a>. </> : null}
        <Link href="/team">News and team coverage</Link> uses official Jets headlines and nflverse roster and player statistics.
        {" "}
        The analyzed archive holds {coverage.count} games across the {coverage.seasonLabel} seasons
        {coverage.lastDate ? `, through ${formatDate(coverage.lastDate)}` : ""}.
        {" "}{excluded} {excluded === 1 ? "record is" : "records are"} excluded from rankings by the score integrity check;
        details are in <a href="/how-made">How it is made</a>.
        {" "}An independent fan project, not affiliated with
        the New York Jets or the NFL.
      </p>
    </footer>
  );
}
