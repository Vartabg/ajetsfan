import Link from "next/link";
import { formatDate } from "@/lib/current";
import { selectFanMemories } from "@/lib/fan-memories";
import { pct, type Game } from "@/lib/games";
import styles from "./MemoryWall.module.css";

export default function MemoryWall({ games, compact = false }: { games: Game[]; compact?: boolean }) {
  const cases = selectFanMemories(games);
  if (!cases.length) return null;
  const sectionId = compact ? "remembered-cases" : "fan-memories";
  const headingId = `${sectionId}-heading`;

  return <section id={sectionId} className={`${styles.wall} ${compact ? styles.compact : ""}`} aria-labelledby={headingId}>
    <header className={styles.heading}>
      <div><p className={styles.kicker}>The memory ledger <span>Selected archive cases</span></p><h2 id={headingId}>{compact ? "Selected games." : "Selected games. The record."}</h2></div>
      <p className={styles.note}>Final scores, sourced game accounts and model estimates. These selections sit outside the probability rankings.</p>
    </header>
    {compact ? <>
      <ol className={styles.clippings}>{cases.map(({ memory, game, href }) => <li key={game.id}>
        <Link href={`${href}#game-case-heading`} aria-label={`Open the ${memory.title} case`}>
          <time dateTime={game.date}>{game.date.slice(0, 4)}</time><strong>{memory.title}</strong><span className={styles.clippingScore}>NYJ {game.jetsScore} <span aria-hidden="true">—</span> {game.opponentDisplay} {game.oppScore}{game.wentToOt ? " / OT" : ""}</span><span aria-hidden="true" className={styles.arrow}>↗</span>
        </Link>
      </li>)}</ol>
      <Link className={styles.ledgerLink} href="/morgue#fan-memories">Read the memory ledger <span aria-hidden="true">↗</span></Link>
    </> : <ol className={styles.cases}>{cases.map(({ memory, game, href }, index) => <li key={game.id}>
      <article id={`memory-${game.id}`} className={styles.case} aria-labelledby={`memory-${game.id}-heading`}>
        <div className={styles.filing}><span>Case {String(index + 1).padStart(2, "0")}</span><span>{game.outcome === "win" ? "Jets win" : "Jets loss"}</span></div>
        <h3 id={`memory-${game.id}-heading`} className={styles.title}>{memory.title}</h3>
        <p className={styles.docket}><time dateTime={game.date}>{formatDate(game.date)}</time><span>{game.season} {game.seasonType === "POST" ? "postseason" : "regular season"}</span></p>
        <p className={styles.score}><span>Final{game.wentToOt ? " / OT" : ""}</span><strong>NYJ {game.jetsScore} <span aria-hidden="true">—</span> {game.opponentDisplay} {game.oppScore}</strong></p>
        <dl className={styles.evidence}><div><dt>Jets point differential</dt><dd>{game.jetsScore > game.oppScore ? "+" : ""}{game.jetsScore - game.oppScore}</dd></div><div><dt>{game.outcome === "win" ? "Lowest" : "Peak"} second-half model win probability</dt><dd>{pct(game.swing)}</dd></div></dl>
        <p className={styles.fact}><span className={styles.copyLabel}>Source account</span>{memory.fact}</p>
        <div className={styles.links}><Link href={`${href}#game-case-heading`} aria-label={`Open the ${memory.title} case`}>Open the case <span aria-hidden="true">↗</span></Link><a href={memory.source.url} aria-label={memory.source.label} target="_blank" rel="noreferrer">Read the Jets account <span aria-hidden="true">↗</span></a></div>
      </article>
    </li>)}</ol>}
  </section>;
}
