import type { FinalGame } from "@/lib/current";
import styles from "./SeasonTrend.module.css";

export default function SeasonTrend({ games }: { games: FinalGame[] }) {
  if (!games.length) return <p>No regular-season final has been confirmed in this edition.</p>;
  const max = Math.max(7, ...games.map((game) => Math.abs(game.jetsScore - game.oppScore)));
  return <figure className={styles.trend}>
    <figcaption><strong>The season in margins.</strong><span>Final point differential · above the line is a Jets win</span></figcaption>
    <div className={styles.scroll} tabIndex={0} role="region" aria-label="Season margins, scroll to explore every game">
      <ol className={styles.bars} style={{ minWidth: `${games.length * 55}px` }}>{games.map((game) => {
        const margin = game.jetsScore - game.oppScore;
        const height = Math.abs(margin) / max * 74;
        return <li key={game.id} className={styles.column}>
          <div className={styles.plot}>
            <span className={margin > 0 ? styles.positive : margin < 0 ? styles.negative : styles.tie} style={{ height: `${Math.max(height, 2)}px` }} aria-hidden="true" />
            <strong className={margin > 0 ? styles.topValue : styles.bottomValue} style={margin > 0 ? { bottom: `${110 + height + 5}px` } : { top: `${100 + height + 5}px` }}>{margin > 0 ? "+" : ""}{margin}</strong>
          </div>
          <span className={styles.opponent}>{game.opponentDisplay}</span><span className={styles.week}>Week {game.week}</span>
        </li>;
      })}</ol>
    </div>
    {games.length > 5 ? <p className={styles.hint}>Scroll the chart to explore every final.</p> : null}
  </figure>;
}
