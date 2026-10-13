"use client";

import { useState, useSyncExternalStore } from "react";
import styles from "./CalendarSubscribe.module.css";

const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;
const never = () => () => {};

/**
 * Subscribe to the season's games. Calendar apps need the full address, which the page only knows once it runs
 * on the reader's host; until then the one link downloads the same file.
 */
export default function CalendarSubscribe({ season }: { season: number }) {
  // The address depends on the host the page is served from, which the server render does not know.
  const origin = useSyncExternalStore(never, () => location.origin, () => null);
  const [copied, setCopied] = useState(false);
  if (!origin) return <a href="/jets.ics" className={styles.summary} data-calendar>Add the games to your calendar</a>;
  const https = `${origin}/jets.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const copy = async () => {
    try { await navigator.clipboard.writeText(https); setCopied(true); } catch { setCopied(false); }
  };
  return <details className={styles.calendar} data-calendar>
    <summary className={styles.summary}>Add the games to your calendar</summary>
    <div className={styles.options}>
      <a href={webcal}>Apple Calendar</a>
      <a href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">Google Calendar{NEW_TAB}</a>
      <a href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(`Jets ${season}`)}`} target="_blank" rel="noreferrer">Outlook{NEW_TAB}</a>
      <button type="button" onClick={copy}>{copied ? "Address copied" : "Copy the address"}</button>
    </div>
    <p className={styles.note}>Every {season} game, with kickoff times. After each game the event shows the final score. Your calendar app checks for changes on its own schedule, usually within a day.</p>
  </details>;
}
