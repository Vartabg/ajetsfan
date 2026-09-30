"use client";

import { useSyncExternalStore } from "react";
import type { MatchdayReport } from "@/lib/matchday-report";
import { formatCheckedAt, formatDate } from "@/lib/current";
import styles from "./MatchdayDesk.module.css";

const subscribe = (notify: () => void) => {
  const timer = window.setInterval(notify, 60_000);
  return () => window.clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverMinute = () => 0;

export default function MatchdayDesk({ report }: { report: MatchdayReport | null }) {
  const now = useSyncExternalStore(subscribe, currentMinute, serverMinute);
  const expired = !!report && !!now && now >= Date.parse(report.expiresAt);
  const current = expired ? null : report;
  const old = !!current && !!now && now - Date.parse(current.reviewedAt) >= 24 * 60 * 60_000;

  return <aside className={styles.desk} aria-labelledby="matchday-desk-heading">
    <p className={styles.kicker}>Before kickoff</p><h3 id="matchday-desk-heading">Get your Sunday sorted.</h3>
    {current ? <>
      <dl className={styles.watch}><div><dt>At the ground</dt><dd>{current.watch.venue}</dd></div><div><dt>Television</dt><dd>{current.watch.network}<small>Availability depends on your market.</small></dd></div><div><dt>Local radio</dt><dd>{current.watch.radio}</dd></div></dl>
      <a className={styles.source} href={current.watch.url} target="_blank" rel="noopener noreferrer">Official watch &amp; listen guide <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
      <details className={styles.availability}><summary className="disclosure"><span><span className="when-closed">From the beat: availability</span><span className="when-open">Close availability notes</span><small>Dated team reporting · not final game status</small></span></summary><div>{current.availability.map((note) => <div className={styles.reportNote} key={note.title}><p className={styles.reportLabel}>Reported {formatDate(note.publishedAt.slice(0, 10))} · New York Jets</p><h4>{note.title}</h4><p>{note.body}</p><a className={styles.source} href={note.url} target="_blank" rel="noopener noreferrer">Read the team’s report <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></div>)}</div></details>
      <p className={styles.checked}>Editorial sources reviewed <time dateTime={current.reviewedAt}>{formatCheckedAt(current.reviewedAt)}</time>.</p>
      {old ? <p role="status" className={styles.notice} aria-label="Game-week reporting update status">These notes were checked more than 24 hours ago. Availability can change; check the official report for updates.</p> : null}
    </> : <p className={styles.empty}>{expired ? "This game-week briefing has expired. Check the team’s current coverage for the next update." : "Use the team’s current guides for viewing options and the latest availability."}</p>}
    <nav className={styles.links} aria-label="Official game-day sources"><a href="https://www.newyorkjets.com/team/injury-report/" target="_blank" rel="noopener noreferrer">Latest official injury report <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><a href="https://www.newyorkjets.com/watch-live-games/ways-to-watch" target="_blank" rel="noopener noreferrer">All viewing &amp; listening options <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></nav>
  </aside>;
}
