"use client";

import { useState } from "react";
import { spot, type Drive } from "@/lib/drives";
import shared from "./Focus.module.css";
import styles from "./DriveChart.module.css";

const quarter = (q: number) => q > 4 ? "OT" : `Q${q}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const SHORT: Record<string, string> = { Touchdown: "TD", "Field goal": "FG", "Missed field goal": "Missed FG", Punt: "Punt", Turnover: "Turnover", "Turnover on downs": "Downs", "Opp touchdown": "Return TD", Safety: "Safety", "End of half": "Half", "Not recorded": "—" };

/**
 * One row per drive across a field drawn from the Jets' goal line (left) to the opponent's (right).
 * The Jets' drives come first; their opponent's can be shown alongside, running the other way.
 */
/** `opponent` reads in a sentence: "the Browns", "Washington". */
export default function DriveChart({ drives, opponent }: { drives: Drive[]; opponent: string }) {
  const [both, setBoth] = useState(false);
  const shown = both ? drives : drives.filter((drive) => drive.jets);
  const theirs = opponent.endsWith("s") ? `${opponent}’` : `${opponent}’s`;
  const goal = theirs.replace(/^the /, "");
  return <>
    <div className={`${styles.field} ${both ? styles.both : ""}`} role="img" aria-label={`${shown.length} drives drawn across the field from the Jets’ goal line to ${theirs}.`} data-drive-chart>
      <div className={styles.lines} aria-hidden="true">{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((x) => <i key={x} style={{ left: `${x}%` }} />)}</div>
      {shown.map((drive, index) => {
        const left = Math.min(drive.start, drive.end), width = Math.abs(drive.end - drive.start);
        // Colour is from the Jets' side: their score is bad news, their giveaway good news.
        const kind = drive.jets ? drive.kind : drive.kind === "score" ? "giveaway" : drive.kind === "giveaway" ? "score" : "empty";
        return <div key={index} className={`${styles.row} ${drive.jets ? "" : styles.them}`} data-kind={kind}>
          <span className={styles.when}>{quarter(drive.quarter)}</span>
          <span className={styles.track}>
            <i className={styles.bar} style={{ left: `${left}%`, width: `max(3px, ${width}%)` }} />
            <i className={styles.cap} style={{ left: `${drive.end}%` }} />
          </span>
          <span className={styles.result}>{SHORT[drive.result] ?? drive.result}</span>
        </div>;
      })}
      <div className={styles.ends} aria-hidden="true"><span>Jets goal line</span><span>50</span><span>{goal} goal line</span></div>
    </div>
    <ol className="sr-only">{shown.map((drive, index) => <li key={index}>
      {drive.jets ? "Jets" : opponent.replace(/^the /, "")}, {quarter(drive.quarter)} {clock(drive.clock)}: from {spot(drive.start, drive.jets)} to {drive.result === "Touchdown" ? "the end zone" : spot(drive.end, drive.jets)}, {drive.plays} plays, {drive.result.toLowerCase()}.
    </li>)}</ol>
    <div className={styles.legend} aria-hidden="true">{both
      ? <><span data-kind="score">Good for the Jets</span><span data-kind="empty">Neither</span><span data-kind="giveaway">Bad for the Jets</span></>
      : <><span data-kind="score">Scored</span><span data-kind="empty">Punt, downs or half</span><span data-kind="giveaway">Gave it away</span></>}</div>
    <button type="button" className={`${shared.button} ${styles.toggle}`} aria-pressed={both} onClick={() => setBoth(!both)}>{both ? `Hide ${theirs} drives` : `Show ${theirs} drives too`}</button>
  </>;
}
