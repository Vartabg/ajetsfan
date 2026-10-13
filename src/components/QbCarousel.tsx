"use client";

import { useState, type CSSProperties } from "react";
import type { Carousel } from "@/lib/quarterbacks";
import styles from "./QbCarousel.module.css";

const result = (outcome: string, us: number, them: number) => `${outcome} ${outcome === "L" ? `${them}–${us}` : `${us}–${them}`}`;

/**
 * Every Jets game since 1999: a row per season, a square per game, a colour per starting quarterback.
 * Pointing at a square, or choosing a name, picks out that quarterback's games.
 */
export default function QbCarousel({ carousel }: { carousel: Carousel }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [game, setGame] = useState<{ season: number; index: number } | null>(null);
  const [names, setNames] = useState(false);
  const qbs = carousel.quarterbacks;
  const at = game ? carousel.seasons.find((row) => row.season === game.season)?.games[game.index] ?? null : null;
  const point = (season: number, index: number) => {
    const entry = carousel.seasons.find((row) => row.season === season)!.games[index];
    setGame({ season, index });
    setChosen(entry[0]);
  };
  return <>
    <div className={styles.grid} role="img" aria-label={`${carousel.games} Jets games from ${carousel.from} to ${carousel.to}, one row per season, coloured by ${qbs.length} starting quarterbacks.`}
      data-chosen={chosen !== null ? "" : undefined} onPointerLeave={() => { setGame(null); if (!names) setChosen(null); }} data-focus-chart>
      {carousel.seasons.map((row) => <div key={row.season} className={styles.season}>
        <span>{row.season}</span>
        <div>{row.games.map((entry, index) => <i key={index} className={`${styles[`q${qbs[entry[0]].color}`]} ${entry[7] ? styles.playoff : ""} ${chosen === entry[0] ? styles.on : ""}`}
          onPointerEnter={() => point(row.season, index)} onPointerDown={() => point(row.season, index)} />)}</div>
      </div>)}
    </div>
    <p className={styles.readout} aria-live="polite">{at && game
      ? <><b>{qbs[at[0]].name}</b> · {game.season} {at[7] ? "playoffs" : `week ${at[2]}`} {at[4] ? "vs" : "at"} {at[3]} · {result(at[1], at[5], at[6])}</>
      : chosen !== null ? <><b>{qbs[chosen].name}</b> · {qbs[chosen].starts} starts, {qbs[chosen].wins}–{qbs[chosen].losses}{qbs[chosen].ties ? `–${qbs[chosen].ties}` : ""}</> : "Point at a square, or show the names, to see who started."}</p>
    <div className={styles.tools} data-focus-tools>
      <button type="button" className={styles.toggle} aria-pressed={names} onClick={() => { setNames(!names); if (names) setChosen(null); }}>{names ? "Hide the names" : "Show the names"}</button>
      {names ? <ul className={styles.names}>{qbs.map((qb, index) => <li key={qb.id}>
        <button type="button" aria-pressed={chosen === index} onClick={() => { setGame(null); setChosen(chosen === index ? null : index); }} style={{ "--swatch": `var(--qb-${qb.color})` } as CSSProperties}>
          <i aria-hidden="true" />{qb.name} <small>{qb.starts}</small>
        </button>
      </li>)}</ul> : null}
    </div>
  </>;
}
