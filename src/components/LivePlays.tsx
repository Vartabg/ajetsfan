"use client";

import { useEffect, useState } from "react";
import WinLine from "./WinLine";
import { clockLine, gamePlayed, LIVE_POLL_MS, type LivePlays as Plays } from "@/lib/live-plays";
import styles from "./LivePlays.module.css";

const pct = (wp: number) => `${Math.round(wp * 100)}%`;
const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

/**
 * A Jets game in progress, checked every 20 seconds while the page is visible: the score, ESPN's clock,
 * the down and distance, the last play, and ESPN's win chance after each play. It starts from the football
 * edition's score and keeps the last good answer when a check fails.
 */
export default function LivePlays({ event, nickname, us, them, clock }: { event: string; nickname: string; us: number | null; them: number | null; clock: string }) {
  const [plays, setPlays] = useState<Plays | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false, busy = false;
    const check = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const response = await fetch(`/api/football/plays?event=${encodeURIComponent(event)}`);
        if (!response.ok) throw new Error(String(response.status));
        const next = await response.json() as Plays;
        if (next.state !== "in" && next.state !== "post") throw new Error(next.state);
        setPlays(next); setFailed(false);
        if (next.state === "post") stopped = true;
      } catch { setFailed(true); } finally { busy = false; }
    };
    // The first check runs whatever the visibility, so a page opened in a background tab still fills in.
    void check();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void check(); }, LIVE_POLL_MS);
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [event]);

  const score = plays ? { us: plays.us ?? null, them: plays.them ?? null } : { us, them };
  const line = plays?.line && plays.line.length >= 2 ? plays.line : null;
  const final = plays?.state === "post";
  return <div className={styles.live} data-live-plays={event} data-live-state={plays?.state ?? "loading"}>
    {score.us !== null && score.them !== null ? <p className={styles.score} aria-live="polite" aria-atomic="true" data-football-score>
      Jets {score.us} <span>–</span> {nickname} {score.them}
    </p> : null}
    <p className={styles.clock}>{final ? "Final" : plays ? clockLine(plays.detail) : clock}</p>
    {!final && (plays?.situation || plays?.lastPlay) ? <p className={styles.play} aria-live="polite">
      {plays.situation ? <b>{plays.ball === "jets" ? "Jets ball" : plays.ball === "them" ? `${nickname} ball` : "Ball"} · {plays.situation}</b> : null}
      {plays.lastPlay ? <span>Last play: {plays.lastPlay}</span> : null}
    </p> : null}
    {line ? <WinLine line={line} played={final ? 1 : gamePlayed(plays?.detail)} end={final ? "Final" : "Now"} label={`ESPN's Jets win chance, play by play: ${pct(line[0][0])} at kickoff, ${pct(line.at(-1)![0])} ${final ? "at the end" : "now"}.`} /> : null}
    <p className={styles.note}>
      {final ? "ESPN’s final. The site’s own game report, from the official play-by-play, follows when that is published. "
        : `Score, plays and win chance from ESPN, checked every ${LIVE_POLL_MS / 1000} seconds${plays ? ` (last at ${time(plays.updatedAt)} ET)` : ""}. The line is ESPN’s estimate of the Jets’ chance to win, not this site’s model. `}
      {failed && plays ? "The latest check failed, so this is the last update. " : null}
      <a href={`https://www.espn.com/nfl/game/_/gameId/${event}`} target="_blank" rel="noopener noreferrer">ESPN game feed<span className="sr-only"> (opens in a new tab)</span></a>
    </p>
  </div>;
}
