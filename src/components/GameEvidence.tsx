import "server-only";
import Link from "next/link";
import type { Game } from "@/lib/games";
import type { SeasonAnalytics } from "@/lib/analytics";
import { epaLabel, rateLabel } from "@/lib/analytics";
import { formatDate } from "@/lib/current";
import { evidenceBar, gameEvidence, type EvidenceDatum, type EvidenceRow } from "@/lib/game-evidence";
import styles from "./GameEvidence.module.css";

function Offense({ team, sample, row, jets = false }: { team: string; sample: EvidenceDatum; row: EvidenceRow; jets?: boolean }) {
  const bar = evidenceBar(sample.value, row.axis);
  const value = sample.value === null ? "Unavailable" : row.kind === "epa" ? epaLabel(sample.value, 3) : rateLabel(sample.value);
  return <div className={styles.offense}>
    <dt>{team}<span>Offense</span></dt>
    <dd>
      <div className={styles.readout}><strong className={sample.value === null ? styles.unavailable : undefined}>{value}</strong><span>{sample.plays === null ? "Sample unavailable" : `${sample.plays.toLocaleString("en-US")} ${row.unit}`}</span></div>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.zero} style={{ left: `${row.axis.zero}%` }} />
        {bar ? <span className={`${styles.bar} ${jets ? styles.jetsBar : styles.opponentBar} ${bar.zeroValue ? styles.zeroValue : ""}`} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} /> : <span className={styles.noSample}>No plotted value</span>}
      </div>
    </dd>
  </div>;
}

export default function GameEvidence({ game, statistics }: { game: Game; statistics: SeasonAnalytics["games"][number] | null }) {
  const evidence = gameEvidence(game, statistics);
  if (!evidence) return null;
  return <section id="game-evidence" className={styles.evidence} aria-labelledby="game-evidence-heading">
    <header className={styles.heading}>
      <div><p className={styles.kicker}>Measured game evidence</p><h2 id="game-evidence-heading">What each offense produced.</h2></div>
      <p>Jets {game.atHome ? "vs" : "at"} {game.opponentDisplay}<span>Week {game.week} · <time dateTime={game.date}>{formatDate(game.date)}</time></span></p>
    </header>
    <div className={styles.measures}>{evidence.rows.map((row) => <figure key={row.metric} className={styles.measure} data-evidence-metric={row.metric}>
      <figcaption><h3>{row.label}</h3><span>{row.kind === "epa" ? "Expected points added" : "Included plays with EPA above zero"}</span></figcaption>
      <dl className={styles.offenses}><Offense team="Jets" sample={row.jets} row={row} jets /><Offense team={game.opponentDisplay} sample={row.opponent} row={row} /></dl>
      <div className={styles.axis} aria-hidden="true"><span>{row.kind === "epa" ? epaLabel(row.axis.minimum, 3) : "0%"}</span><span>{row.kind === "epa" ? "0" : "50%"}</span><span>{row.kind === "epa" ? epaLabel(row.axis.maximum, 3) : "100%"}</span></div>
    </figure>)}</div>
    <footer className={styles.notes}>
      <p>{evidence.hasEpa ? "EPA charts share one signed scale. " : ""}Play rate uses 0–100%. Dropbacks include sacks and scrambles; rush sample excludes scrambles, kneels and spikes.</p>
      <p>Observed offense against the opposing defense. EPA is a model estimate; these measures describe this game, not a cause or prediction.</p>
      <div><a href="https://github.com/nflverse/nflverse-data/releases/tag/pbp" target="_blank" rel="noreferrer">Source: nflverse play-by-play<span className="sr-only"> (opens in a new tab)</span></a><Link href="/how-made#efficiency">Method &amp; included plays <span aria-hidden="true">↗</span></Link></div>
    </footer>
  </section>;
}
