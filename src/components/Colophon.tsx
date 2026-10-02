import styles from "./Colophon.module.css";
import Link from "next/link";
import type { Game } from "@/lib/games";
import type { CurrentSnapshot } from "@/lib/current";
import { archiveCoverage, formatDate } from "@/lib/current";
import FanMark from "./FanMark";

/**
 * The one-line colophon a newspaper carries at the foot of the page. Sources and
 * the single excluded game are disclosed here rather than on a page of their own.
 */
export default function Colophon({ games, snapshot }: { games: Game[]; snapshot: CurrentSnapshot | null }) {
  const coverage = archiveCoverage(games);
  const excluded = games.filter((game) => game.dataSuspect).length;
  return (
    <footer className={styles.foot}>
      <div className={styles.top}><Link href="/" className={styles.brand} aria-label="The Back Page"><FanMark className={styles.crest} /><span>The Back Page</span></Link><p className={styles.tagline}>Jets football.<br />On the record.</p></div>
      <div className={styles.bottom}><p>Independent coverage. Sources, sample sizes, and methods are open for inspection.</p><div className={styles.links}><Link href="/how-made">How it is made</Link><Link href="#top">Back to top <span aria-hidden="true">↑</span></Link></div></div>
      <details className={styles.sources}><summary className="disclosure"><span className="when-closed">Sources &amp; the small print</span><span className="when-open">Hide sources &amp; the small print</span></summary><p>
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
        details are in the methodology.
        {" "}An independent fan project, not affiliated with
        the New York Jets or the NFL.
      </p></details>
    </footer>
  );
}
