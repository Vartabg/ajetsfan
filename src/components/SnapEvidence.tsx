import Link from "next/link";
import { BUFFALO, CLEVELAND, chance, clockText, periodName, snapPath, snapTime } from "@/lib/snap-explorer";
import type { Snap, SnapGame } from "@/lib/snap-types";
import styles from "./SnapReader.module.css";

export function snapHeadline(game: SnapGame, play: Snap): string {
  if (game.id === BUFFALO && play.key === "2511" && /J\.Allen pass.*D\.Kincaid.*54 yards/i.test(play.description)) return "Allen to Kincaid for 54 yards.";
  if (game.id === CLEVELAND && play.key === "4199" && /G\.Wilson for 15 yards, TOUCHDOWN/i.test(play.description)) return "Garrett Wilson catches the touchdown.";
  if (game.id === CLEVELAND && play.key === "4276" && /INTERCEPTED by (?:\d+-)?A\.Davis/i.test(play.description)) return "Ashtyn Davis intercepts Brissett.";
  return "The play at " + snapTime(play) + ".";
}

export function SituationLine({ play, opponent }: { play: Snap; opponent: string }) {
  const side = play.possession === "jets" ? "Jets" : play.possession === "opponent" ? opponent : null;
  const downs = ["", "1st", "2nd", "3rd", "4th"];
  const pieces = [side && side + " ball", play.down && downs[play.down] + " down",
    play.distance !== null && play.distance + (play.distance === 1 ? " yard to go" : " yards to go"),
    play.yardline !== null && play.yardline + " yards from goal"];
  return <p className={styles.context}>{pieces.filter(Boolean).join(" · ") || "Pre-play field position unavailable."}</p>;
}

export function ClockPicker({ gameId, play }: { gameId: string; play?: Pick<Snap, "quarter" | "clock"> }) {
  return <form className={styles.clockForm} method="get" action={snapPath(gameId, "clock")}>
    <div><label htmlFor="snap-period">Period</label><select id="snap-period" name="quarter" defaultValue={play?.quarter ?? 1}>
      {[1, 2, 3, 4, 5, 6].map(q => <option value={q} key={q}>{periodName(q)}</option>)}
    </select></div>
    <div><label htmlFor="snap-clock">Time remaining</label><input id="snap-clock" name="time" type="text" maxLength={5} required pattern="[0-9]{1,2}:[0-5][0-9]" placeholder="9:54" defaultValue={clockText(play?.clock ?? 900)} /></div>
    <button className={styles.clockButton} type="submit">Find this clock</button>
  </form>;
}

export function DriveSoFar({ plays, gameId }: { plays: Snap[]; gameId: string }) {
  const selected = plays.at(-1)!;
  if (selected.drive === null) return <p className={styles.context}>Drive number unavailable for this play.</p>;
  const drive = plays.filter(play => play.drive === selected.drive);
  return <details className={styles.drive}>
    <summary>Drive {selected.drive} through this play · {drive.length} recorded {drive.length === 1 ? "play" : "plays"}</summary>
    <ol className={styles.driveList}>{drive.map(play => <li key={play.key}>
      {play.key === selected.key ? <strong>{snapTime(play)}</strong> : <Link prefetch={false} href={snapPath(gameId, play.key)}>{snapTime(play)}</Link>}
      <p>{play.description}</p>
    </li>)}</ol>
  </details>;
}

export function ProbabilityTrace({ plays, live }: { plays: Snap[]; live: boolean }) {
  const values = plays.map(play => live ? play.postWp ?? null : play.wp);
  if (!values.some(value => value !== null)) return <p className={styles.context}>A win-probability estimate is unavailable through this play.</p>;
  const x = (i: number) => 5 + i / Math.max(1, values.length - 1) * 590;
  const y = (wp: number) => 105 - wp * 100;
  const path = values.map((wp, i) => wp === null ? "" : (i === 0 || values[i - 1] === null ? "M" : "L") + x(i).toFixed(1) + " " + y(wp).toFixed(1)).join(" ");
  const selected = values.at(-1);
  const label = "Estimated Jets win probability " + (live ? "after" : "before") + " each recorded play through " + snapTime(plays.at(-1)!) + ".";
  return <figure className={styles.trace}>
    <svg viewBox="0 0 600 110" preserveAspectRatio="none" aria-label={label} role="img">
      <line x1="5" x2="595" y1="55" y2="55" stroke="var(--faint)" strokeDasharray="4 5" />
      <path d={path} fill="none" stroke="var(--green)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
      {selected != null && <circle cx={x(values.length - 1)} cy={y(selected)} r="4" fill="var(--green)" />}
    </svg>
    <figcaption>{label} {selected != null && <>Selected play · {chance(selected)}.</>}</figcaption>
  </figure>;
}
