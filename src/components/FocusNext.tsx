"use client";

import { useState } from "react";
import Link from "./IntentLink";
import FocusMoment from "./FocusMoment";
import { etDay, noon, on, record } from "@/lib/focus-format";
import { useMinuteClock } from "@/lib/use-minute-clock";
import styles from "./Focus.module.css";

export type FocusNextGame = { week: number; postseason: boolean; place: string; home: boolean; date: string; kickoff: string | null; overdue: boolean };

/** The next game as the week it falls in: today is marked once the browser knows the date. */
export default function FocusNext({ id = "next", first = false, next, wins, losses, ties, stakes = true, go }: {
  id?: string; first?: boolean; next: FocusNextGame; wins: number; losses: number; ties: number; stakes?: boolean; go: { href: string; label: string };
}) {
  const [meaning, setMeaning] = useState(false);
  const now = useMinuteClock();
  const kickoff = next.kickoff ?? `${next.date}T17:00:00Z`;
  const passed = now ? now >= Date.parse(kickoff) : next.overdue;
  const gameDay = etDay(kickoff);
  const today = now ? etDay(now) : null;
  const days = today ? Math.round((noon(gameDay) - noon(today)) / 86_400_000) : null;
  const when = days === null ? on(kickoff, { weekday: "long", month: "short", day: "numeric" }) : days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  const strip = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(noon(gameDay) - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    return { key: day, letter: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "narrow" }).format(new Date(noon(day))), game: index === 6, today: day === today, past: today !== null && day < today };
  });
  return <FocusMoment id={id} first={first}
    label={`Next game · ${next.postseason ? "Playoffs" : `Week ${next.week}`}`}
    heading={<>{next.home ? next.place : `At ${next.place}`}, {on(kickoff, { weekday: "long" })} <em>{next.kickoff ? `${on(kickoff, { hour: "numeric", minute: "2-digit" })} ET` : on(kickoff, { month: "short", day: "numeric" })}</em></>}
    actions={<>{stakes ? <button type="button" className={styles.button} aria-pressed={meaning} onClick={() => setMeaning(!meaning)}>{meaning ? "Hide" : "What each result means"}</button> : null}<Link href={go.href} className={styles.go}>{go.label} <span aria-hidden="true">→</span></Link></>}>
    <figure className={styles.shape}>
      <div className={styles.week} role="img" aria-label={`The week before the game. Game day is ${on(kickoff, { weekday: "long", month: "long", day: "numeric" })}.`}>
        {strip.map((day) => <span key={day.key} className={`${styles.day} ${day.game ? styles.gameDay : ""} ${day.today ? styles.today : ""} ${day.past ? styles.past : ""}`}><i />{day.letter}</span>)}
      </div>
      <figcaption>{passed ? "Kickoff has passed. The final score appears here once it is recorded." : `${when}, ${next.home ? "at home" : "on the road"}. The filled circle is game day.`}</figcaption>
      {stakes && meaning ? <p className={styles.reveal} data-focus-reveal>A win makes them {record(wins + 1, losses, ties)}. A loss makes them {record(wins, losses + 1, ties)}.</p> : null}
    </figure>
  </FocusMoment>;
}
