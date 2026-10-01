import Link from "next/link";
import type { FinalGame } from "@/lib/current";
import { gameHref } from "@/lib/explorer";
import styles from "./SeasonTrend.module.css";

export default function SeasonTrend({ games, analysisIds = [] }: { games: FinalGame[]; analysisIds?: string[] }) {
  if (!games.length) return <p>No regular-season final has been confirmed in this edition.</p>;
  const max = Math.max(7, ...games.map((game) => Math.abs(game.jetsScore - game.oppScore)));
  const scored = games.reduce((total, game) => total + game.jetsScore, 0);
  const allowed = games.reduce((total, game) => total + game.oppScore, 0);
  const differential = scored - allowed;
  const analyzed = new Set(analysisIds);
  return <figure className={styles.trend}>
    <figcaption><strong>The season in margins.</strong><span>Final point differential · above the line is a Jets win</span><p className={styles.total}><b>{differential > 0 ? "+" : ""}{differential} overall</b> · {scored} points scored / {allowed} allowed across {games.length} confirmed {games.length === 1 ? "final" : "finals"}</p></figcaption>
    <div className={styles.scroll} tabIndex={0} role="region" aria-label="Season margins, scroll to explore every game">
      <ol className={styles.bars}>{games.map((game) => {
        const margin = game.jetsScore - game.oppScore;
        const bar = <span className={margin > 0 ? styles.positive : margin < 0 ? styles.negative : styles.tie} style={{ height: `${Math.max(Math.abs(margin) / max * 4.5, .125)}rem` }} aria-hidden="true" />;
        const value = <strong>{margin > 0 ? "+" : ""}{margin}</strong>;
        return <li key={game.id} className={styles.column}>
          <div className={styles.plot} aria-label={`Week ${game.week}: Jets ${game.jetsScore}, ${game.opponentDisplay} ${game.oppScore}; point differential ${margin > 0 ? "+" : ""}${margin}`}>
            <div className={styles.upper}>{margin > 0 ? <>{value}{bar}</> : null}</div>
            <div className={styles.lower}>{margin <= 0 ? <>{bar}{value}</> : null}</div>
          </div>
          <span className={styles.opponent}>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</span><span className={styles.score}>NYJ {game.jetsScore}–{game.oppScore}</span><span className={styles.week}>Week {game.week}</span>
          {analyzed.has(game.id) && game.outcome !== "tie" ? <Link className={styles.analysis} href={gameHref(game.id, game.outcome === "win" ? "miracle" : "heartbreak")} aria-label={`Inspect Week ${game.week} ${game.opponentDisplay} game analysis`}>Inspect game →</Link> : <span className={styles.week}>Score confirmed</span>}
        </li>;
      })}</ol>
    </div>
    {games.length > 5 ? <p className={styles.hint}>Scroll the chart to explore every final.</p> : null}
  </figure>;
}
