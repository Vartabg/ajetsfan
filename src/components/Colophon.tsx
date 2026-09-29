import styles from "./Colophon.module.css";
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
    <footer className={`${styles.foot} agate`}>
      <p>
        Play-by-play and win probability from{" "}
        <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
          nflverse
        </a>
        . {snapshot ? <>Results and schedule from <a href={snapshot.sources.schedule} target="_blank" rel="noreferrer">the schedule source</a>. </> : null}
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
