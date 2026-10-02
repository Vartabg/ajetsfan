import "server-only";
import Link from "next/link";
import type { Game } from "@/lib/games";
import { formatCheckedAt, formatDate, type CurrentSnapshot } from "@/lib/current";
import { rivalryLedger, rivalryRecord, rivalrySeasons } from "@/lib/rivalries";
import styles from "./RivalryDesk.module.css";

export default function RivalryDesk({ games, snapshot }: { games: Game[]; snapshot: CurrentSnapshot | null }) {
  const ledger = rivalryLedger(games, snapshot);
  return <section id="rivalry-desk" className={styles.desk} aria-labelledby="rivalry-heading">
    <header className={styles.header}>
      <div><p className="label">The rivalry ledger</p><h2 id="rivalry-heading" className="hed">AFC East <br />record.</h2></div>
      <p>Today’s AFC East opponents. The Jets’ regular-season results against Buffalo, Miami and New England in this archive.</p>
    </header>
    <div className={styles.columns}>
      {ledger.entries.map((rival) => <article className={styles.rival} key={rival.opponent} aria-labelledby={`rival-${rival.opponent}`}>
        <p className={styles.abbreviation} aria-hidden="true">NYJ / {rival.opponent}</p>
        <h3 id={`rival-${rival.opponent}`}>{rival.name}</h3>
        {rival.count ? <div className={styles.record}>
          <p className="label">Sample {rival.ties ? "W–L–T" : "W–L"}</p>
          <strong aria-label={`${rival.wins} wins, ${rival.losses} losses${rival.ties ? `, ${rival.ties} ties` : ""}`}>{rivalryRecord(rival)}</strong>
          <p>{rival.count} meetings · {rivalrySeasons(rival.firstSeason, rival.lastSeason)}</p>
        </div> : <p className={styles.noResults}>No regular-season results in this sample yet.</p>}
        {rival.latest ? <div className={styles.meeting}>
          <p className="label">Latest included meeting</p>
          <p className={styles.score}><span className={rival.latest.outcome === "win" ? styles.win : styles.result}>{rival.latest.outcome === "win" ? "W" : rival.latest.outcome === "loss" ? "L" : "T"}</span> NYJ {rival.latest.jetsScore} · {rival.opponent} {rival.latest.oppScore}</p>
          <time dateTime={rival.latest.date}>{formatDate(rival.latest.date)}</time>
          {rival.latestAnalysisHref ? <Link href={rival.latestAnalysisHref} aria-label={`Explore the latest included ${rival.name} meeting`}>Explore the game <span aria-hidden="true">↗</span></Link> : null}
        </div> : null}
        <div className={styles.meeting}>
          <p className="label">{rival.next?.overdue ? "Awaiting a final" : "Next on the checked schedule"}</p>
          {rival.next ? <><p className={styles.fixture}>Week {rival.next.game.week} · {rival.next.game.atHome ? "Home" : "Away"}</p><time dateTime={rival.next.game.date}>{formatDate(rival.next.game.date)}</time>{rival.next.overdue ? <p className={styles.pending}>{rival.next.kickoffKnown ? "Kickoff had passed at the schedule check. No final was confirmed." : "The meeting date had arrived at the schedule check. Kickoff and final remain unconfirmed."}</p> : null}</> : <p className={styles.pending}>{ledger.checkedAt ? "No remaining meeting listed in this season’s schedule." : "No checked schedule is available."}</p>}
        </div>
        <Link className={styles.archive} href={rival.archiveHref}>Browse {rival.name} losses <span aria-hidden="true">↗</span></Link>
      </article>)}
    </div>
    <p className={styles.scope}>{ledger.throughDate ? <>Included results: {rivalrySeasons(ledger.firstSeason, ledger.lastSeason)}, through <time dateTime={ledger.throughDate}>{formatDate(ledger.throughDate)}</time>. </> : "No usable regular-season results are available. "}Sampled archive plus confirmed current results; postseason excluded. {ledger.excludedArchiveResults ? `${ledger.excludedArchiveResults} flagged or invalid archived ${ledger.excludedArchiveResults === 1 ? "result is" : "results are"} omitted until confirmed. ` : ""}<Link href="/how-made#rivalries">Where the scores come from</Link>.</p>
    {ledger.checkedAt ? <p className={styles.scope}>Next meetings reflect the {ledger.scheduleSource ? <a href={ledger.scheduleSource}>source schedule</a> : "source schedule"} checked <time dateTime={ledger.checkedAt}>{formatCheckedAt(ledger.checkedAt)}</time>.</p> : null}
  </section>;
}
