import { driveReadHref } from "@/lib/drive-read-links";
import { snapTime } from "@/lib/snap-explorer";
import type { RedZoneGame } from "@/lib/team-situations";
import { teamName } from "@/lib/teams";
import styles from "./RedZoneTrips.module.css";

const shortLabels: Record<string, string> = {
  "Offensive touchdown": "TD", "Field goal": "FG", "Missed field goal": "Missed FG",
  "Turnover on downs": "Downs", "Drive ended on a kneel": "Kneel",
  "Drive ended without a touchdown": "No TD", "Trip outcome unavailable": "Unresolved",
};

export function RedZoneTrips({ games }: { games: RedZoneGame[] }) {
  if (!games.length) return null;
  return <section className={styles.chart} aria-labelledby="red-zone-games">
    <h3 id="red-zone-games">Red-zone trips by game</h3>
    <p>Trips run from left to right. Select a result to see the score, clock and play. TD means touchdown and FG means field goal.</p>
    <ol className={styles.games} role="list">
      {games.map(({ game, covered, trips }) => <li key={game.id} className={styles.game}>
        <span className={styles.match}>Week {game.week}<small>{game.atHome ? "vs. " : "at "}{game.opponentDisplay}</small></span>
        {trips.length ? <ol className={styles.trips} role="list" aria-label={"Week " + game.week + " against " + teamName(game.opponentDisplay)}>
          {trips.map(({play,result,label}, i) => {
            const description = "Trip " + (i + 1) + " · " + label + " · " + snapTime(play);
            return <li key={play.key}><a className={result ? styles.touchdown : undefined}
              href={driveReadHref(game.id, { play: play.key, phase: "action" })} aria-label={description}>
              {shortLabels[label] ?? label}</a></li>;
          })}
        </ol> : <span className={styles.empty}>{covered ? "No recorded trips" : "Play-by-play unavailable"}</span>}
      </li>)}
    </ol>
  </section>;
}
