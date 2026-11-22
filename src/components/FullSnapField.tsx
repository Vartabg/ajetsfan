"use client";

import { useState } from "react";
import type { PriorThrowTrace } from "@/lib/drive-read";
import type { FullSnapBoard, FullSnapPlayer, FullSnapPoint } from "@/lib/full-snap";
import type { ChalkPath } from "@/lib/snap-chalkboard";
import styles from "./FullSnapField.module.css";

export type DriveFieldOptions = {
  phase: "snap" | "action";
  traces: PriorThrowTrace[];
  value: string;
  onSelect: (value: string) => void;
  absent?: { label: string; message: string };
  formAction: string;
  formParams: Record<string, string>;
};

type Props = {
  board: FullSnapBoard;
  id: string;
  offense: string;
  defense: string;
  yardline: number | null;
  distance: number | null;
  kicking: boolean;
  caption: string;
  verifiedLineups: boolean;
  study?: DriveFieldOptions;
};

// Shared by the alignment, the teaching assignments and the recorded ball. Keep a small sideline gutter.
const x = (percent: number) => 19 + percent * 4.12;
const y = (percent: number) => 10 + percent * 2.8;
const xy = (point: FullSnapPoint) => x(point[0]) + " " + y(point[1]);
const shirt = (player: FullSnapPlayer) => player.number == null ? "" : "#" + player.number + " ";
const label = (player: FullSnapPlayer) => player.name
  ? shirt(player) + player.name + (player.position ? " · " + player.position : "")
  : player.role;

function playerLabel(player: FullSnapPlayer, players: FullSnapPlayer[]) {
  if (player.name) return label(player);
  const peers = players.filter(other => other.unit === player.unit && other.role === player.role);
  return label(player) + (peers.length > 1 ? " " + (peers.indexOf(player) + 1) : "");
}

function MarkerDefs({ id }: { id: string }) {
  return <defs>
    {["offense", "defense", "ball"].map(kind => <marker key={kind} id={id + "-" + kind}
      viewBox="0 0 10 10" refX="8" refY="5" markerWidth={kind === "ball" ? 9 : 7} markerHeight={kind === "ball" ? 9 : 7}
      markerUnits="userSpaceOnUse" orient="auto">
      <path d="M1 1L8 5 1 9" fill="none" stroke={"var(--fs-" + kind + ")"} strokeWidth={kind === "ball" ? 2.4 : 1.6} strokeLinejoin="round"/>
    </marker>)}
    <marker id={id + "-block"} viewBox="0 0 10 14" refX="5" refY="7" markerWidth="10" markerHeight="12"
      markerUnits="userSpaceOnUse" orient="auto">
      <path d="M5 1v12" stroke="var(--fs-offense)" strokeWidth="2.1"/>
    </marker>
  </defs>;
}

function Stripe({ level, kind, text }: { level: number; kind: "goal" | "gain" | "scrimmage"; text?: string }) {
  return <g data-line={kind}>
    <line x1="0" x2="450" y1={y(level)} y2={y(level)} />
    {text && <text x="5" y={y(level) - 4}>{text}</text>}
  </g>;
}

function FieldLines({ board, yardline, distance, kicking }: Pick<Props, "board" | "yardline" | "distance" | "kicking">) {
  const fieldNumber = (spot: number | null) => spot == null ? undefined : String(Math.min(spot, 100 - spot));
  const goal = board.goalLineY ?? (board.gainLine?.label === "Goal line" ? board.gainLine.y : undefined);
  // Mark ten-yard stripes relative to the actual spot, only within the pictured playing field.
  const stripes: number[] = [];
  if (yardline != null && !kicking) {
    for (let yard = 10; yard < 100; yard += 10) {
      const level = board.lineY - (yardline - yard) * board.yardsToY;
      if (level > 1 && level < 99 && Math.abs(level - board.lineY) > 2 &&
          Math.abs(level - (board.gainLine?.y ?? -100)) > 2) stripes.push(level);
    }
  }
  return <g className={styles.lines} aria-hidden="true">
    {goal != null && <rect x="0" y="0" width="450" height={y(goal)} className={styles.endZone}/>}
    {stripes.map(level => <path key={level} d={"M0 " + y(level) + "h450"} className={styles.yardStripe}/>)}
    {goal != null && <Stripe level={goal} kind="goal" text="G"/>}
    {board.gainLine?.label === "Line to gain" && <Stripe level={board.gainLine.y} kind="gain"
      text={fieldNumber(yardline == null || distance == null ? null : yardline - distance)}/>}
    {!kicking && <Stripe level={board.lineY} kind="scrimmage" text={fieldNumber(yardline)}/>}
  </g>;
}

function PlayerTrail({ player, id, focus }: { player: FullSnapPlayer; id: string; focus: string }) {
  if (!player.path.length) return null;
  const unit = player.unit === "O" ? "offense" : "defense";
  const end = player.duty === "block" ? "block" : unit;
  return <polyline data-duty={player.duty} data-trail-for={player.id} data-unit-trail={unit}
    data-focus={focus === player.id || undefined} points={[player.start, ...player.path].map(xy).join(" ")}
    fill="none" markerEnd={"url(#" + id + "-" + end + ")"}/>;
}

/** Offset a returning kick just enough to read both directions on the same lane. */
function BallPath({ path, id, kick }: { path: ChalkPath; id: string; kick: boolean }) {
  const { from, to, kind } = path;
  if (from[0] === to[0] && from[1] === to[1]) return null;
  const bend = kick && kind === "return" && Math.abs(from[0] - to[0]) < 1;
  const d = "M" + xy(from) + (bend ? "Q" + (x(from[0]) + 18) + " " + y((from[1] + to[1]) / 2) + " " : "L") + xy(to);
  return <path d={d} data-path={kind} data-from={from.join(",")} data-to={to.join(",")}
    className={styles.ballPath} fill="none" markerEnd={"url(#" + id + "-ball)"}/>;
}

function BallEvents({ board }: { board: FullSnapBoard }) {
  return board.events.map((event, index) => {
    const touchdown = /touchdown/i.test(event.label);
    return <g key={index} data-unit="ball" data-label={event.label} transform={"translate(" + xy([event.x, event.y]) + ")"}>
      <title>{event.label}</title>
      {touchdown ? <path d="M0 1v-11l8 2-8 3" className={styles.scoreFlag}/> :
        <g transform="rotate(-28)"><ellipse rx="5.5" ry="3.3" className={styles.ball}/><path d="M-2.5 0h5" className={styles.lace}/></g>}
      {touchdown && <text className={styles.eventLabel} x="11" y="-5">TD</text>}
    </g>;
  });
}

function PlayerMark({ p, selected, select }: { p: FullSnapPlayer; selected: boolean; select: (player: FullSnapPlayer) => void }) {
  return <g transform={"translate(" + xy(p.start) + ")"} className={styles.player}
    data-unit={p.unit} data-tag={p.group} data-player-id={p.id} data-participant-id={p.participantId} data-label={label(p)} data-selected={selected || undefined}
    onClick={() => select(p)}>
    <title>{label(p)}</title>
    <circle r="12" fill="transparent" />
    {selected && <circle r="12" className={styles.ring}/>}
    {p.unit === "O" ? <circle r="7.5" className={styles.o}/> :
      <path d="M-5.7 -5.7l11.4 11.4m0 -11.4L-5.7 5.7" className={styles.x}/>}
    {p.number != null && <text className={styles.number} x={p.unit === "O" ? 0 : 8} y={p.unit === "O" ? .5 : -7}
      textAnchor={p.unit === "O" ? "middle" : "start"} dominantBaseline="middle">{p.number}</text>}
  </g>;
}

// A few directly labeled people anchor the play. The jerseys and player key cover the remaining lineup.
function Nameplates({ players, action, selected }: { players: FullSnapPlayer[]; action: boolean; selected: string }) {
  const captions = [];
  const occupied = players.map(p => ({ x: x(p.start[0]), y: y(p.start[1]), w: 10, h: 11 }));
  const candidates = players.filter(p => p.name && (p.id === selected || (action ? p.credit : p.group === "QB")));
  candidates.sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  for (const p of candidates.slice(0, 4)) {
    const name = p.name!.replace(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i, "").split(" ").at(-1)!;
    const half = 5 * name.length + 3;
    const side = p.start[0] > 50 ? -1 : 1;
    const step = half + 12;
    const offsets = [[0, 21], [side * step, 0], [-side * step, 0], [0, -20], [side * step, 16]];
    for (const [dx, dy] of offsets) {
      const cx = x(p.start[0]) + dx, cy = y(p.start[1]) + dy;
      if (cx < half + 2 || cx > 448 - half || cy < 10 || cy > 289 ||
          occupied.some(r => Math.abs(cx - r.x) < half + r.w && Math.abs(cy - r.y) < 8 + r.h)) continue;
      occupied.push({ x: cx, y: cy, w: half, h: 9 });
      captions.push(<text key={p.id} x={cx} y={cy} dominantBaseline="middle" textAnchor="middle">{name}</text>);
      break;
    }
  }
  return <g className={styles.nameplates} aria-hidden="true">{captions}</g>;
}

function EarlierThrow({ trace }: { trace: PriorThrowTrace }) {
  const cx = x(trace.to[0]), cy = y(trace.to[1]);
  const labelOnLeft = trace.to[0] > 50;
  return <g className={styles.priorThrow} data-prior-throw={trace.key} data-to={trace.to.join(",")} data-from={trace.from?.join(",")}>
    <title>{"Earlier throw · " + trace.label}</title>
    {trace.from && <line x1={x(trace.from[0])} y1={y(trace.from[1])} x2={cx} y2={cy}/>}
    <circle cx={cx} cy={cy} r="4"/>
    <text x={cx + (labelOnLeft ? -7 : 7)} y={cy < 24 ? cy + 14 : cy - 5} textAnchor={labelOnLeft ? "end" : "start"}>{trace.label}</text>
  </g>;
}

function Field({ board, id, phase, selected, select, ...props }: Props & {
  phase: "snap" | "action"; selected: string; select: (player: FullSnapPlayer) => void;
}) {
  const action = phase === "action";
  const svgId = id + "-" + phase;
  const traces = props.study?.traces;
  return <figure className={styles.frame} data-phase={phase}>
    <svg viewBox="0 0 450 300" className={styles.field} data-full-field={phase} data-focused={!!selected || undefined}
      role="img" aria-label={props.offense + " and " + props.defense + ", eleven players each. " +
      (action ? "Illustrated assignments and recorded play action." : "Illustrated starting positions.")}>
      {(action || !props.study) && <MarkerDefs id={svgId}/>}
      <FieldLines board={board} yardline={props.yardline} distance={props.distance} kicking={props.kicking}/>
      {traces?.map(trace => <EarlierThrow key={trace.key} trace={trace}/>)}
      {action && <g className={styles.trails}>
        {board.players.map(p => <PlayerTrail key={p.id} player={p} id={svgId} focus={selected}/>)}
      </g>}
      {action && <g className={styles.ballLayer}>
        {board.paths.map((path, i) => <BallPath key={i} path={path} id={svgId} kick={props.kicking}/>)}
        <BallEvents board={board}/>
      </g>}
      {board.players.map(p => <PlayerMark key={p.id} p={p} selected={selected === p.id} select={select}/>)}
      <Nameplates players={board.players} action={action} selected={selected}/>
    </svg>
    <figcaption>
      {action && board.directionOnly && <p className={styles.direction} data-direction-only={board.directionOnly}>
        Throw {board.directionOnly === "middle" ? "over the middle" : "to the " + board.directionOnly}{" "}
        {board.directionOnly === "right" ? "→" : board.directionOnly === "left" ? "←" : "↑"}
        {" · "}{board.unplacedThrow?.depth == null ? "Depth unrecorded" : board.unplacedThrow.depth + " air yards"}
        {board.unplacedThrow?.targetKnown === false && " · Target unrecorded"}
      </p>}
      <div className={styles.legend}>
        {!props.kicking && <span><i data-key="line"/>Scrimmage</span>}
        {board.gainLine?.label === "Line to gain" && <span><i data-key="sticks"/>Line to gain</span>}
        {board.goalLineY != null || board.gainLine?.label === "Goal line" ? <span><i data-key="goal"/>Goal line</span> : null}
        {action && board.paths.length > 0 && <span><i data-key="ball"/>Recorded ball</span>}
        {traces?.length ? <span><i data-key="prior"/>Earlier {traces.length === 1 ? "throw" : "throws"} · {traces.map(trace => trace.label).join(", ")}</span> : null}
      </div>
      {action && <p className={styles.account}>{props.caption}</p>}
      {action && board.players.filter(p => p.credit?.includes("Quarterback hit")).map(p =>
        <p className={styles.account} key={p.id}>Quarterback hit by {p.name}.</p>)}
    </figcaption>
  </figure>;
}

export function FullSnapField(props: Props) {
  const [localSelection, setLocalSelection] = useState("");
  const { board, id, study } = props;
  const value = study?.value ?? localSelection;
  const select = study?.onSelect ?? setLocalSelection;
  const playerValue = (p: FullSnapPlayer) => study ? (p.participantId ?? "slot:" + p.id) : p.id;
  const current = board.players.find(p => playerValue(p) === value);
  const selected = current?.id ?? "";
  const absent = !current && value ? study?.absent : undefined;
  const showAssignments = study?.phase !== "snap";
  const units = [
    { title: props.offense, unit: "O", players: board.players.filter(p => p.unit === "O") },
    { title: props.defense, unit: "X", players: board.players.filter(p => p.unit === "X") },
  ];
  const phases = study ? [study.phase] : ["snap", "action"] as const;
  const picker = <>
    <label htmlFor={id + "-player"}>Follow a player</label>
    <select id={id + "-player"} name={study ? "follow" : undefined} value={value} onChange={event => select(event.target.value)}>
      <option value="">Entire formation</option>
      {absent && <option value={value}>{absent.label}</option>}
      {units.map(unit => <optgroup key={unit.unit} label={unit.unit + " · " + unit.title}>
        {unit.players.map(p => <option value={playerValue(p)} key={p.id}>{playerLabel(p, board.players)}</option>)}
      </optgroup>)}
    </select>
    {study && <noscript><button type="submit" className={styles.apply}>Follow</button></noscript>}
    <div role="status" aria-live="polite" className={styles.choice}>
      {current && <><strong>{playerLabel(current, board.players)}</strong>
        {showAssignments && current.credit && <span>Recorded · {current.credit}</span>}
        {showAssignments && <span>Example assignment · {current.assignment}</span>}</>}
      {absent && <><strong>{absent.label}</strong><span>{absent.message}</span></>}
    </div>
  </>;
  return <div className={styles.diagram} data-full-snap>
    {phases.map(phase => <Field key={phase} {...props} phase={phase} selected={selected} select={p => select(playerValue(p))}/>)}
    <div className={styles.explanation}>
      {showAssignments ? <>
        <p>{board.note}{board.paths.length > 0 && " Ball lines show the reported play using schematic lateral positions."}</p>
        <p className={styles.assignmentKey}><span className={styles.routeKey}>↗</span> Release or movement
          <span className={styles.blockKey}>⊣</span> Block
          <span className={styles.defenseKey}>⇢</span> Defensive assignment</p>
      </> : <p>{props.verifiedLineups
        ? "Participation records identify all 22 players. Starting positions are illustrated."
        : "Starting positions are illustrated. Players without confirmed participation are shown by role."}</p>}
    </div>
    {study ? <form action={study.formAction} method="get" className={styles.lookup} data-player-lookup>
      {["play", "phase", "series"].map(name => study.formParams[name] !== undefined &&
        <input type="hidden" key={name} name={name} value={study.formParams[name]}/>)}
      {picker}
    </form> : <>
      <div className={styles.lookup} data-player-lookup>{picker}</div>
      <noscript><style>{"div[data-player-lookup]{display:none}"}</style></noscript>
    </>}
    <details className={styles.roster}><summary>All 22 players</summary>
      <div className={styles.teams}>{units.map(unit => <section key={unit.unit} aria-label={unit.title + " lineup"}>
        <h4>{unit.unit} · {unit.title}</h4>
        <ul>{unit.players.map(p => <li key={p.id}><strong>{playerLabel(p, board.players)}</strong>
          {showAssignments && p.credit && <span>Recorded · {p.credit}</span>}
          {showAssignments && <span>Example · {p.assignment}</span>}</li>)}</ul>
      </section>)}</div>
    </details>
    {props.verifiedLineups && <p className={styles.sources}>Lineups from participation records. Names, numbers and positions checked against the{" "}
      <a href="https://static.www.nfl.com/image/upload/v1677628106/gamecenter/7ae81ee8-d24c-11ec-b23d-d15a91047884.pdf">NFL gamebook</a>.</p>}
  </div>;
}
