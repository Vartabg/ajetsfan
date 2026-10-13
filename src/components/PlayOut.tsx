"use client";

import { useEffect, useState } from "react";
import FocusMoment from "./FocusMoment";
import type { SeasonWeeks } from "@/lib/focus";
import { playoffSentence, type PlayoffRow } from "@/lib/league-history";
import { record } from "@/lib/focus-format";
import { teamIdentity } from "@/lib/teams";
import shared from "./Focus.module.css";
import styles from "./PlayOut.module.css";

type Pick = "win" | "loss";
const storageKey = (year: number) => `ajetsfan:play-out:${year}`;
const nickname = (code: string) => teamIdentity(code)?.nickname ?? teamIdentity(code)?.city ?? code;

/** The rest of the regular season, picked by the reader. Picks stay in this browser; nothing is sent anywhere. */
export default function PlayOut({ season, rows, seasons }: { season: SeasonWeeks; rows: PlayoffRow[]; seasons: number[] }) {
  const open = season.weeks.filter((week) => week.state === "next" || week.state === "upcoming");
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  // Restore saved picks after hydration, keeping only weeks that are still to play.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(season.year)) ?? "{}") as Record<string, Pick>;
      const kept = Object.fromEntries(open.flatMap((week) => saved[week.week] === "win" || saved[week.week] === "loss" ? [[week.week, saved[week.week]]] : []));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (Object.keys(kept).length) setPicks(kept);
    } catch { /* storage unavailable: start empty */ }
  // The open weeks only change with a new edition.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.year]);
  const save = (next: Record<number, Pick>) => {
    setPicks(next);
    try { localStorage.setItem(storageKey(season.year), JSON.stringify(next)); } catch { /* not saved; the picks still work */ }
  };
  const cycle = (week: number) => {
    const next = { ...picks };
    if (!next[week]) next[week] = "win";
    else if (next[week] === "win") next[week] = "loss";
    else delete next[week];
    save(next);
  };
  const picked = open.filter((week) => picks[week.week]).length;
  const wins = season.wins + open.filter((week) => picks[week.week] === "win").length;
  const losses = season.losses + open.filter((week) => picks[week.week] === "loss").length;
  const done = picked === open.length;
  const most = Math.max(...rows.map((row) => row.wins), 17);

  return <FocusMoment id="play-out" label={`The rest of ${season.year}`}
    heading={done ? <>{record(wins, losses, season.ties)} <em>is your final record.</em></> : <>Play out the season. <em>{open.length - picked === open.length ? `Pick the ${open.length} games left.` : `${open.length - picked} of ${open.length} still to pick.`}</em></>}
    actions={picked ? <button type="button" className={shared.button} onClick={() => save({})}>Clear my picks</button> : null}>
    <figure className={shared.shape}>
      <ol className={styles.marks} aria-label={`${season.year} regular season. Tap a game still to play to pick a win, then a loss, then clear it.`}>
        {season.weeks.map((week) => {
          if (week.state === "bye") return <li key={week.week} className={styles.bye}><i aria-hidden="true" /><span>Bye</span></li>;
          const pick = picks[week.week];
          const played = week.state === "win" || week.state === "loss" || week.state === "tie";
          const name = `Week ${week.week}, ${week.home ? "vs" : "at"} ${nickname(week.opponent!)}`;
          if (played) return <li key={week.week} className={styles[week.state]}><i aria-hidden="true" /><span>{week.opponent}</span><span className="sr-only">{name}: {week.state} {week.score}</span></li>;
          return <li key={week.week} className={pick ? styles[pick] : styles.open}>
            <button type="button" onClick={() => cycle(week.week)} aria-label={`${name}: ${pick ? `your pick is a ${pick}` : "not picked"}. Change pick.`}>
              <i aria-hidden="true">{pick === "win" ? "W" : pick === "loss" ? "L" : ""}</i><span>{week.opponent}</span>
            </button>
          </li>;
        })}
      </ol>
      <p className={styles.tally} role="status">{done ? playoffSentence(rows, seasons, wins) : `${record(wins, losses, season.ties)} with your picks so far.`}</p>
      {done ? <div className={styles.odds} role="img" aria-label={`Share of clubs reaching the playoffs by win total since ${seasons[0]}. Your pick: ${wins} wins.`}>
        {Array.from({ length: most + 1 }, (_, total) => {
          const row = rows.find((entry) => entry.wins === total);
          const share = row ? row.playoffs / row.clubs : 0;
          return <span key={total} className={total === wins ? styles.yours : undefined}><i style={{ height: `${Math.max(share * 100, row ? 3 : 0)}%` }} /><small>{total}</small></span>;
        })}
      </div> : null}
      <figcaption>{done
        ? `Each bar is the share of clubs with that many wins that reached the playoffs, over the ${seasons.length} complete 17-game seasons since ${seasons[0]}. Counts from the NFL schedule record, not a forecast. Your picks stay in this browser.`
        : "Tap a game once for a win, twice for a loss, three times to clear it. Your picks stay in this browser."}</figcaption>
    </figure>
  </FocusMoment>;
}
