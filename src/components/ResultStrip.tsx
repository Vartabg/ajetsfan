import type { ResultGame } from "@/lib/current";
import styles from "./ResultStrip.module.css";

/**
 * A season in one glance: one square per recorded final, in date order.
 * Green is a Jets win, rust a loss, grey a tie; playoff games are ringed.
 * The surrounding copy carries the record, so the strip is decorative.
 */
export default function ResultStrip({ results, size = "small", className = "" }: { results: ResultGame[]; size?: "small" | "large"; className?: string }) {
  if (!results.length) return null;
  return <span className={`${styles.strip} ${size === "large" ? styles.large : ""} ${className}`} aria-hidden="true">
    {results.map((game) => <i key={game.id} className={`${styles.game} ${game.outcome === "win" ? styles.win : game.outcome === "loss" ? styles.loss : styles.tie} ${game.seasonType === "POST" ? styles.playoff : ""}`}
      title={`${game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`} · ${game.atHome ? "vs" : "at"} ${game.opponentDisplay} · ${game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} ${game.jetsScore}–${game.oppScore}`} />)}
  </span>;
}
