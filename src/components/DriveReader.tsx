"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/current";
import type { DriveReadFrame } from "@/lib/drive-read";
import { driveReadHref } from "@/lib/drive-read-links";
import { replayHref } from "@/lib/game-replay";
import { clockText, periodName } from "@/lib/snap-explorer";
import { chartLabel, participationProvenance } from "@/lib/snap-participation";
import { teamIdentity } from "@/lib/teams";
import { FullSnapField } from "./FullSnapField";
import styles from "./DriveReader.module.css";

// The selector and its links must update even when a fan acts during the router’s first hydration.
const selectionEvent = "drive-player-selected";
function subscribeSelection(update: () => void) {
  window.addEventListener(selectionEvent, update);
  window.addEventListener("popstate", update);
  return () => {
    window.removeEventListener(selectionEvent, update);
    window.removeEventListener("popstate", update);
  };
}
const selectedFromUrl = () => new URLSearchParams(window.location.search).get("follow") ?? "";
const downs = ["", "1st", "2nd", "3rd", "4th"];
function team(code: string) {
  const identity = teamIdentity(code);
  return identity?.nickname ?? identity?.city ?? code;
}

function Scoreboard({ frame }: { frame: DriveReadFrame }) {
  return <div className={styles.scoreboard} data-study-score aria-label={frame.scoreLabel}>
    <p className={styles.scoreLabel}>{frame.scoreLabel}</p>
    <div className={styles.scores}>
      {["NYJ", frame.game.opponent].map((code, i) => <div key={code} data-team={code}>
        <span>{team(code)}</span><strong>{frame.score?.[i] ?? "—"}</strong>
        {frame.timeouts && <small>{frame.timeouts[i]} {frame.timeouts[i] === 1 ? "timeout" : "timeouts"}</small>}
      </div>)}
      <div className={styles.clock}><span>{periodName(frame.quarter)} · At snap</span>
        <b>{frame.clock === null ? "—" : clockText(frame.clock)}</b></div>
    </div>
    <p className={styles.situation}>{frame.situation}</p>
  </div>;
}

function ThrowHistory({ rows }: { rows: DriveReadFrame["history"] }) {
  if (!rows.length) return null;
  return <section className={styles.history} aria-labelledby="throw-history">
    <h2 id="throw-history">Throws in this drive</h2>
    <table><thead><tr><th scope="col">Snap</th><th scope="col">Coverage</th><th scope="col">Rushers</th><th scope="col">Throw</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}>
        <th scope="row">{row.down ? downs[row.down] + " down" : "Throw"}
          <small>{periodName(row.quarter)}{row.clock === null ? "" : " · " + clockText(row.clock)}</small></th>
        <td>{row.coverage ?? "—"}</td><td>{row.rushers ?? "—"}</td>
        <td>{row.direction ? row.direction[0].toUpperCase() + row.direction.slice(1) : "Side unknown"}
          {row.airYards == null ? " · depth unrecorded" : " · " + row.airYards + (row.airYards === 1 ? " air yard" : " air yards")}
          {row.target && <small>{row.target}</small>}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}

export default function DriveReader({ frame }: { frame: DriveReadFrame }) {
  const requested = useSyncExternalStore(subscribeSelection, selectedFromUrl, () => frame.follow ?? "");
  const players = frame.board?.players ?? [];
  const current = players.find(p => (p.participantId ?? "slot:" + p.id) === requested);
  const known = requested && frame.followed?.id === requested ? frame.followed : undefined;
  const follow = current || known ? requested ?? "" : "";
  const absent = known && !current ? {
    label: "#" + known.number + " " + known.name + " · " + known.position,
    message: frame.verifiedLineups ? known.name + " is off the field on this snap." : "Participation is unknown for " + known.name + " on this snap.",
  } : undefined;
  const { game, phase, key, series } = frame;
  const action = phase === "action";
  const offense = team(frame.offense), defense = team(frame.defense);
  const opponent = team(game.opponent);
  const kickBlock = frame.kickKind === "fieldGoal" || frame.kickKind === "extraPoint";
  const change = frame.changes[0];
  const href = (keyToOpen: string, destination: "snap" | "action") => driveReadHref(game.id, {
    play: keyToOpen, phase: destination, series, follow: keyToOpen === key || !follow.startsWith("slot:") ? follow : undefined,
  });
  function selectPlayer(value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("follow", value);
    else url.searchParams.delete("follow");
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(selectionEvent));
  }
  const formParams: Record<string, string> = { play: key };
  if (series) formParams.series = series;
  if (action) formParams.phase = phase;
  const source = participationProvenance(Number(game.id.slice(0, 4)));
  return <article id="drive-reader" className={styles.reader} aria-labelledby="drive-title">
    <header className={styles.header}>
      <p><time dateTime={game.date}>{formatDate(game.date)}</time><span aria-hidden="true"> · </span>{game.home ? opponent + " at Jets" : "Jets at " + opponent}</p>
      <h1 id="drive-title">{series ? "Three downs at Cleveland’s 15" : "Read the drive"}</h1>
    </header>
    <Scoreboard frame={frame}/>
    <nav aria-label="Drive controls" className={styles.controls}>
      {frame.previous ? <Link prefetch={false} scroll={false} href={href(frame.previous, "action")}>Previous snap</Link>
        : <span role="link" aria-disabled="true">Previous snap</span>}
      {!action ? <Link prefetch={false} scroll={false} className={styles.advance} href={href(key, "action")}>Reveal play</Link>
        : frame.next ? <Link prefetch={false} scroll={false} className={styles.advance} href={href(frame.next, "snap")}>Next snap</Link>
        : <Link prefetch={false} scroll={false} className={styles.advance} href={driveReadHref(game.id, { series, play: frame.first })}>{series ? "Replay series" : "Replay game"}</Link>}
    </nav>
    <section aria-label="Xs & Os" className={styles.tactics}>
      <h2>{action ? (frame.headline ?? "Play result") : frame.board ? "Before the snap" : "Before the play"}</h2>
      {frame.board ? <>
        <div className={styles.units}>
          <p><b aria-hidden="true">O</b><span><strong>{offense} {frame.kicking ? "kicking" : "offense"} <span aria-label={frame.kicking ? "kick direction upfield" : "attacking upfield"}>↑</span></strong>
            {frame.formation && " · " + frame.formation}{frame.offensePersonnel && " · " + frame.offensePersonnel}</span></p>
          <p><b aria-hidden="true">X</b><span><strong>{defense} {frame.kicking ? (kickBlock ? "kick block" : "receiving") : "defense"}</strong>
            {frame.defensePersonnel && " · " + frame.defensePersonnel}{frame.box != null && " · " + frame.box + " in box"}
            {frame.coverage && " · " + frame.coverage}{frame.rushers != null && " · " + frame.rushers + (frame.rushers === 1 ? " rusher" : " rushers")}</span></p>
        </div>
        <FullSnapField id="drive-field" board={frame.board} offense={offense} defense={defense} yardline={frame.yardline}
          distance={frame.distance} kicking={frame.kicking} caption={frame.caption} verifiedLineups={frame.verifiedLineups}
          study={{ phase, traces: frame.traces, value: follow, onSelect: selectPlayer, absent, formAction: driveReadHref(game.id), formParams }}/>
      </> : <><p className={styles.account}>{frame.caption}</p>{absent && <p role="status">{absent.message}</p>}</>}
      {frame.primaryRoute && <p className={styles.chartNote}>Charted primary route · {chartLabel(frame.primaryRoute)}</p>}
      {frame.detail && <p className={styles.chartNote}>{frame.detail}</p>}
      {change && <details className={styles.changes}><summary>{change.unit === "O" ? offense : defense} substitutions · {change.entered.join(", ")} in</summary>
        {frame.changes.map(change => <div key={change.unit}><strong>{change.unit === "O" ? offense : defense}</strong>
          <p>In · {change.entered.join(", ")}</p><p>Out · {change.left.join(", ")}</p></div>)}
      </details>}
    </section>
    <ThrowHistory rows={frame.history}/>
    <footer className={styles.foot}>
      {frame.charted && <p>Formation and participation from <a href={source.sourceUrl}>{source.provider}</a> · <a href={source.licenseUrl}>{source.license}</a>.</p>}
      <div>{action && <Link prefetch={false} scroll={false} href={href(key, "snap")}>Back to the snap</Link>}
        <Link prefetch={false} href={replayHref(game.id, key, "all", true)}>Open game replay</Link>
        {action && <Link prefetch={false} href={"/plays/" + encodeURIComponent(game.id) + "/" + encodeURIComponent(key)}>Analyze this play</Link>}
      </div>
    </footer>
  </article>;
}
