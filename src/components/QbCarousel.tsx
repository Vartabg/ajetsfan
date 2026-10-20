"use client";

import { useId, useState, type CSSProperties } from "react";
import type { Carousel } from "@/lib/quarterbacks";
import styles from "./QbCarousel.module.css";

const result = (outcome: string, us: number, them: number) => `${outcome} ${outcome === "L" ? `${them}–${us}` : `${us}–${them}`}`;
type GameSelection = { season: number; index: number };

/**
 * Every Jets game since 1999: a row per season, a square per game, a colour per starting quarterback.
 * Native season/game fields expose the complete record without hundreds of tab stops.
 * A pointer preview never replaces the game selected with those fields.
 */
export default function QbCarousel({ carousel }: { carousel: Carousel }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [game, setGame] = useState<GameSelection | null>(null);
  const [preview, setPreview] = useState<GameSelection | null>(null);
  const [season, setSeason] = useState(carousel.to);
  const [names, setNames] = useState(false);
  const fieldsId = useId();
  const qbs = carousel.quarterbacks;
  const selection = preview ?? game;
  const at = selection ? carousel.seasons.find((row) => row.season === selection.season)?.games[selection.index] ?? null : null;
  const highlighted = at?.[0] ?? chosen;
  const games = carousel.seasons.find((row) => row.season === season)!.games;
  const pick = (selection: GameSelection | null) => {
    setPreview(null);
    setGame(selection);
    setChosen(null);
    if (selection) setSeason(selection.season);
  };
  return <>
    <div className={styles.grid} role="img" aria-label={`${carousel.games} Jets games from ${carousel.from} to ${carousel.to}, one row per season, coloured by ${qbs.length} starting quarterbacks. Choose a season and game below for each starter and result.`}
      data-chosen={highlighted !== null ? "" : undefined} onPointerLeave={() => setPreview(null)} data-focus-chart>
      {carousel.seasons.map((row) => <div key={row.season} className={styles.season}>
        <span>{row.season}</span>
        <div>{row.games.map((entry, index) => <i key={index} className={`${styles[`q${qbs[entry[0]].color}`]} ${entry[7] ? styles.playoff : ""} ${highlighted === entry[0] ? styles.on : ""}`}
          onPointerEnter={() => setPreview({ season: row.season, index })} onPointerDown={() => pick({ season: row.season, index })} />)}</div>
      </div>)}
    </div>
    <p className={styles.readout} aria-live="polite" aria-atomic="true">{at && selection
      ? <><b>{qbs[at[0]].name}</b> · {selection.season} {at[7] ? "playoffs" : `week ${at[2]}`} {at[4] ? "vs" : "at"} {at[3]} · {result(at[1], at[5], at[6])}</>
      : chosen !== null ? <><b>{qbs[chosen].name}</b> · {qbs[chosen].starts} starts, {qbs[chosen].wins}–{qbs[chosen].losses}{qbs[chosen].ties ? `–${qbs[chosen].ties}` : ""}</> : "Choose a season and game, point at a square, or show the names to see who started."}</p>
    <div className={styles.tools} data-focus-tools>
      <fieldset className={styles.findGame}>
        <legend>Find a game</legend>
        <div className={styles.fields}>
          <label htmlFor={`${fieldsId}-season`}>Season
            <select id={`${fieldsId}-season`} value={season} onChange={(event) => { setSeason(Number(event.target.value)); pick(null); }}>
              {carousel.seasons.map((row) => <option key={row.season} value={row.season}>{row.season}</option>)}
            </select>
          </label>
          <label htmlFor={`${fieldsId}-game`}>Game
            <select id={`${fieldsId}-game`} value={game?.season === season ? game.index : ""} onChange={(event) => pick(event.target.value === "" ? null : { season, index: Number(event.target.value) })}>
              <option value="">Choose a game</option>
              {games.map((entry, index) => <option key={index} value={index}>
                {entry[7] ? `Playoffs, week ${entry[2]}` : `Week ${entry[2]}`} {entry[4] ? "vs" : "at"} {entry[3]} · {qbs[entry[0]].name} · {result(entry[1], entry[5], entry[6])}
              </option>)}
            </select>
          </label>
        </div>
      </fieldset>
      <button type="button" className={styles.toggle} aria-pressed={names} onClick={() => { setNames(!names); if (names) setChosen(null); }}>{names ? "Hide the names" : "Show the names"}</button>
      {names ? <ul className={styles.names}>{qbs.map((qb, index) => <li key={qb.id}>
        <button type="button" aria-pressed={chosen === index} onClick={() => { setGame(null); setPreview(null); setChosen(chosen === index ? null : index); }} style={{ "--swatch": `var(--qb-${qb.color})` } as CSSProperties}>
          <i aria-hidden="true" />{qb.name} <small>{qb.starts}</small>
        </button>
      </li>)}</ul> : null}
    </div>
  </>;
}
