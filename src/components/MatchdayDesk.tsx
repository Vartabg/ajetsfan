"use client";

import { useMinuteClock } from "@/lib/use-minute-clock";
import type { MatchdayReport } from "@/lib/matchday-report";
import { formatCheckedAt, formatDate } from "@/lib/current";
import shared from "./Focus.module.css";
import styles from "./MatchdayDesk.module.css";

/** Where to watch and listen: reviewed reporting for this fixture when there is some, and the team's own guides always. */
export default function MatchdayDesk({ report }: { report: MatchdayReport | null }) {
  const now = useMinuteClock();
  const expired = !!report && !!now && now >= Date.parse(report.expiresAt);
  const current = expired ? null : report;
  const old = !!current && !!now && now - Date.parse(current.reviewedAt) >= 24 * 60 * 60_000;

  return <aside className={styles.desk} aria-labelledby="matchday-desk-heading">
    <h3 id="matchday-desk-heading">Where to watch and listen.</h3>
    {current ? <>
      <dl className={styles.watch}><div><dt>At the ground</dt><dd>{current.watch.venue}</dd></div><div><dt>Television</dt><dd>{current.watch.network}<small>Availability depends on your market.</small></dd></div><div><dt>Local radio</dt><dd>{current.watch.radio}</dd></div></dl>
      <a className={shared.go} href={current.watch.url} target="_blank" rel="noopener noreferrer">Official watch &amp; listen guide <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
      <details className={styles.availability}><summary className="disclosure"><span><span className="when-closed">From the beat: availability</span><span className="when-open">Close availability notes</span><small>Dated team reporting · not final game status</small></span></summary><div>{current.availability.map((note) => <div className={styles.reportNote} key={note.title}><p className={styles.reportLabel}>Reported {formatDate(note.publishedAt.slice(0, 10))} · New York Jets</p><h4>{note.title}</h4><p>{note.body}</p><a className={shared.go} href={note.url} target="_blank" rel="noopener noreferrer">Read the team’s report <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></div>)}</div></details>
      <p className={shared.note}>Editorial sources reviewed <time dateTime={current.reviewedAt}>{formatCheckedAt(current.reviewedAt)}</time>.</p>
      {old ? <p role="status" className={shared.stale} aria-label="Game-week reporting update status">These notes were checked more than 24 hours ago. Availability can change; check the official report for updates.</p> : null}
    </> : <p className={shared.caption}>{expired ? "This game-week briefing has expired. Check the team’s current coverage for the next update." : "The team’s own guides list the broadcast, the radio call and who is available."}</p>}
    <nav className={styles.links} aria-label="Official game-day sources"><a className={shared.go} href="https://www.newyorkjets.com/team/injury-report/" target="_blank" rel="noopener noreferrer">Latest official injury report <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><a className={shared.go} href="https://www.newyorkjets.com/watch-live-games/ways-to-watch" target="_blank" rel="noopener noreferrer">All viewing &amp; listening options <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></nav>
  </aside>;
}
