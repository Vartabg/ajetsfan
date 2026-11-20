import type { MouseEvent } from "react";
import { snapChalkboard } from "@/lib/snap-chalkboard";
import { participationProvenance } from "@/lib/snap-participation";
import type { Snap, SnapCharting, SnapGame } from "@/lib/snap-types";
import { teamIdentity } from "@/lib/teams";
import styles from "./SnapChalkboard.module.css";

type DiagramProps = {
  chalk: boolean;
  fieldHref: string;
  chalkHref: string;
  onChoose?: (event: MouseEvent<HTMLAnchorElement>, chalk: boolean) => void;
};

export function DiagramLinks({ chalk, fieldHref, chalkHref, onChoose }: DiagramProps) {
  return <nav className={styles.views} aria-label="Play diagram">
    <a href={fieldHref} aria-current={!chalk || undefined} onClick={onChoose && (e => onChoose(e, false))}>Field position</a>
    <a href={chalkHref} aria-current={chalk || undefined} onClick={onChoose && (e => onChoose(e, true))}>Xs &amp; Os</a>
  </nav>;
}

type Board = ReturnType<typeof snapChalkboard>;
type Frame = Board["action"];
const x = (value: number) => 12 + value * 3.96;
const y = (value: number) => 12 + value * 1.96;
const lineY = y(65);
const pathNames: Record<string, string> = {
  pass: "Throw", carry: "Carry", kick: "Kick", return: "Return", incomplete: "Incomplete throw", interception: "Intercepted throw",
};
const nickname = (code: string) => teamIdentity(code)?.nickname ?? teamIdentity(code)?.city ?? code;
const isThrow = (kind: string) => ["pass", "kick", "incomplete", "interception"].includes(kind);

type Rect = { left: number; top: number; right: number; bottom: number };
function fieldLabels(marks: Frame["marks"]) {
  const occupied: Rect[] = marks.map(m => ({ left: x(m.x) - 9, right: x(m.x) + 9, top: y(m.y) - 9, bottom: y(m.y) + 9 }));
  const labels: { text: string; cx: number; cy: number }[] = [];
  // Place credited players first. The transcript also names any event that cannot fit on the field.
  const ordered = [...marks.filter(m => m.unit !== "ball"), ...marks.filter(m => m.unit === "ball")];
  for (const m of ordered) {
    const text = m.shortLabel ?? m.tag;
    if (!text) continue;
    const half = Math.max(13, text.length * 4.8);
    const side = m.x > 65 ? -1 : 1, step = half + 13;
    const offsets = [[side * step, 0], [-side * step, 0], [0, -21], [0, 21], [side * step, -18], [-side * step, 18]];
    for (const [dx, dy] of offsets) {
      const cx = x(m.x) + dx, cy = y(m.y) + dy;
      const box = { left: cx - half, right: cx + half, top: cy - 9, bottom: cy + 9 };
      if (box.left < 2 || box.right > 418 || box.top < 2 || box.bottom > 218) continue;
      if (occupied.some(r => box.left < r.right + 2 && box.right > r.left - 2 && box.top < r.bottom + 2 && box.bottom > r.top - 2)) continue;
      occupied.push(box);
      labels.push({ text, cx, cy });
      break;
    }
  }
  return labels;
}

function FrameDrawing({ frame, phase, id, groups, scrimmage }: {
  frame: Frame; phase: "snap" | "action"; id: string; groups: boolean; scrimmage: boolean;
}) {
  const grouped = phase === "snap" && groups;
  const compact = grouped && frame.marks.length > 10;
  const groupLabels = new Map<string, { tag: string; count: number; left: number; right: number; bottom: number }>();
  if (grouped) for (const mark of frame.marks) {
    if (!mark.tag) continue;
    const key = mark.unit + mark.tag;
    const prior = groupLabels.get(key);
    groupLabels.set(key, { tag: mark.tag, count: (prior?.count ?? 0) + 1, left: Math.min(prior?.left ?? 100, mark.x), right: Math.max(prior?.right ?? 0, mark.x),
      bottom: Math.max(prior?.bottom ?? 0, mark.y) });
  }
  const lineKinds = [...new Set(frame.paths.map(path => path.kind))];
  const neutral = frame.marks.length === 0 && frame.paths.length === 0;
  return <figure className={styles.frame} data-phase={phase}>
    {!neutral && <svg viewBox="0 0 420 220" className={styles.field} role="img"
      aria-label={grouped ? "Charted personnel grouped by position" : phase === "snap" ? "Schematic pre-snap alignment" : "Schematic of the recorded play"}>
      <defs>{["flight", "ground"].map(style => <marker key={style} id={id + "-" + style} viewBox="0 0 12 12" markerWidth="6" markerHeight="6"
        refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
        <path d="M2 2l8 4-8 4" fill="none" stroke={style === "flight" ? "var(--flight)" : "var(--ground)"} strokeWidth="2.4" strokeLinejoin="round"/>
      </marker>)}</defs>
      {grouped ? <path d="M10 110h400" className={styles.groupRule}/> : <>
        {[36, 70, 104, 171, 205].map(row => <path key={row} d={`M8 ${row}h404`} className={styles.grid}/>)}
        {scrimmage && <path d={`M0 ${lineY}h420`} className={styles.scrimmage}/>}
      </>}
      {frame.goalLineY != null && <g data-line="goal">
        <rect x="0" y="0" width="420" height={y(frame.goalLineY)} className={styles.endZone}/>
        <line x1="0" x2="420" y1={y(frame.goalLineY)} y2={y(frame.goalLineY)} className={styles.goalLine}/>
      </g>}
      {frame.gainLine && (frame.goalLineY == null || frame.gainLine.label !== "Goal line") &&
        <line x1="0" x2="420" y1={y(frame.gainLine.y)} y2={y(frame.gainLine.y)} className={styles.gainLine} data-line="gain"/>}
      {frame.paths.map((path, i) => {
        const sx = x(path.from[0]), sy = y(path.from[1]), tx = x(path.to[0]), ty = y(path.to[1]);
        const dx = tx - sx, dy = ty - sy, length = Math.hypot(dx, dy);
        if (!length) return null;
        // Leave the head of the arrow visible beside its event or player symbol.
        const inset = Math.min(10, length * .14) / length;
        const flight = isThrow(path.kind);
        const ex = tx - dx * inset, ey = ty - dy * inset;
        // Two arrows on the same kick lane need separate visible strokes.
        const parallelReturn = path.kind === "return" && frame.paths.some(p => p.kind === "kick") && Math.abs(dx) < 1;
        const vector = parallelReturn ? `M${sx} ${sy}Q${sx + 19} ${(sy + ey) / 2} ${ex} ${ey}` : `M${sx} ${sy}L${ex} ${ey}`;
        return <path key={i} data-path={path.kind} data-from={path.from.join(",")} data-to={path.to.join(",")}
          d={vector} className={flight ? styles.flight : styles.ground}
          markerEnd={`url(#${id}-${flight ? "flight" : "ground"})`}/>;
      })}
      {frame.marks.map((mark, i) => {
        const r = compact ? 5.4 : 7.4;
        return <g key={i} transform={`translate(${x(mark.x)},${y(mark.y)})`} data-unit={mark.unit} data-label={mark.label} data-tag={mark.tag}>
          <title>{mark.label}</title>
          {mark.unit === "O" ? <circle r={r} className={styles.o}/> : mark.unit === "X" ?
            <path d={`M-${r} -${r}l${2*r} ${2*r}m0 -${2*r}l-${2*r} ${2*r}`} className={styles.x}/> :
            <g transform="rotate(-32)"><ellipse rx="6.8" ry="3.9" className={styles.ball}/><path d="M-3 0h6" className={styles.lace}/></g>}
        </g>;
      })}
      {grouped ? Array.from(groupLabels.entries(), ([key, m]) => <text key={key} x={x((m.left + m.right) / 2)} y={Math.min(216, y(m.bottom) + 18)}
        className={styles.groupLabel} textAnchor="middle">{m.count} {m.tag}</text>) :
        fieldLabels(frame.marks).map((label, i) => <text key={i} x={label.cx} y={label.cy + 4} textAnchor="middle" className={styles.name}>{label.text}</text>)}
    </svg>}
    <figcaption>
      {!neutral && (lineKinds.length > 0 || scrimmage && !grouped) && <div className={styles.lines}>
        {scrimmage && !grouped && <span><i className={styles.scrimmageKey}/>Line of scrimmage</span>}
        {frame.gainLine && (frame.goalLineY == null || frame.gainLine.label !== "Goal line") && <span><i className={styles.gainKey}/>{frame.gainLine.label}</span>}
        {frame.goalLineY != null && <span><i className={styles.goalKey}/>Goal line</span>}
        {lineKinds.map(kind => <span key={kind}><i className={isThrow(kind) ? styles.flightKey : styles.groundKey}/>{pathNames[kind] ?? kind}</span>)}
      </div>}
      <p>{frame.caption}</p>
      {phase === "action" && frame.marks.length > 0 && <ul className={styles.actors} aria-label="Recorded participants and ball spots">
        {frame.marks.map((m, i) => <li key={i}><b aria-hidden="true" className={m.unit === "X" ? styles.defense : styles.offense}>
          {m.unit === "ball" ? "•" : m.unit}</b> {m.label}</li>)}
      </ul>}
    </figcaption>
  </figure>;
}

// Icons show a route family's shape independently of the selected player's field position.
const routes: Record<string, string> = {
  "GO": "M22 49V8", "POST": "M12 48V29L38 8", "SLANT": "M14 48V40L45 15", "CORNER": "M35 49V30L12 8",
  "DEEP OUT": "M37 49V15H7", "QUICK OUT": "M35 48V32H8", "IN/DIG": "M13 49V17H46",
  "HITCH/CURL": "M15 48V12L27 25", "SHALLOW CROSS/DRAG": "M8 47Q12 31 23 31H48",
  "SWING": "M43 42Q23 53 10 38L6 28", "TEXAS/ANGLE": "M31 47L13 37L40 12",
  "WHEEL": "M38 47Q24 44 15 34Q10 29 10 8", "SCREEN": "M35 36Q24 44 8 39",
  "ANGLE": "M31 47L13 37L40 12", "CROSS": "M8 48Q14 29 24 24L47 16", "FLAT": "M38 46Q29 33 9 33",
  "HITCH": "M15 48V23L24 31", "IN": "M13 49V22H46", "OUT": "M37 49V22H7",
};
function RouteConcept({ route, id, label = "Charted primary route" }: { route: string; id: string; label?: string }) {
  const path = routes[route];
  const start = path?.match(/^M(\d+) (\d+)/);
  return <div className={styles.route}>
    {path && start && <svg viewBox="0 0 56 58" aria-hidden="true">
      <defs><marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
        <path d="M1 1l7 4-7 4" fill="none" stroke="currentColor" strokeWidth="2"/></marker></defs>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" markerEnd={"url(#" + id + ")"}/>
      <circle cx={Number(start[1])} cy={Number(start[2])} r="3.5"/></svg>}
    <div><span>{label}</span><b>{route.toLowerCase().replaceAll("/", " / ")}</b>{path && <small>Illustrative route shape</small>}</div>
  </div>;
}

function chartLabel(value?: string) {
  if (!value) return null;
  if (value === "I_FORM") return "I formation";
  if (value === "2_MAN") return "2-Man";
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function UnitSummary({ board, chart, shotgun, kicking }: { board: Board; chart?: SnapCharting; shotgun: boolean; kicking: boolean }) {
  const formation = chartLabel(chart?.formation) ?? (shotgun ? "Shotgun" : null);
  const defense = [chartLabel(chart?.coverage), chartLabel(chart?.manZone)].filter(Boolean).join(" · ");
  const rush = chart?.rushers != null ? chart.rushers + (chart.rushers === 1 ? " pass rusher" : " pass rushers") : null;
  const box = chart?.box != null ? chart.box + (chart.box === 1 ? " defender in the box" : " defenders in the box") : null;
  return <div className={styles.matchup}>
    <div><span><b className={styles.offense}>O</b> {nickname(board.offense)} {kicking ? "kick" : "offense"}</span>
      {formation && <strong>{formation}</strong>}
      {chart?.offensePersonnel && <small>Offensive personnel · {chart.offensePersonnel}</small>}</div>
    <div><span><b className={styles.defense}>X</b> {nickname(board.defense)} {kicking ? "receive" : "defense"}</span>
      {defense && <strong>{defense}</strong>}
      {chart?.defensePersonnel && <small>Defensive personnel · {chart.defensePersonnel}</small>}
      {(box || rush) && <small>{[box, rush].filter(Boolean).join(" · ")}</small>}</div>
  </div>;
}

export function SnapChalkboard({ game, play }: { game: Pick<SnapGame,"id" | "opponent" | "source">; play: Snap }) {
  const board = snapChalkboard(game, play);
  const id = "chalk-" + game.id + "-" + play.key;
  const kicking = ["kickoff", "punt", "fieldGoal", "extraPoint"].includes(board.kind);
  const groups = board.snap.marks.length > 2 && board.charted;
  const provenance = board.charted ? participationProvenance(Number(game.id.slice(0, 4))) : null;
  return <section aria-label="Xs & Os" className={styles.board}>
    <p className={styles.basis}>{board.basis}{(board.action.marks.length > 0 || board.canShowSnap) && " · Schematic spacing"}</p>
    {board.canShowSnap && <fieldset className={styles.phases}><legend className="sr-only">Diagram phase</legend>
      <input id={id + "-snap"} name={id} type="radio" value="snap"/><label htmlFor={id + "-snap"}>At the snap</label>
      <input id={id + "-action"} name={id} type="radio" value="action" defaultChecked/><label htmlFor={id + "-action"}>Play action</label>
    </fieldset>}
    {(board.action.marks.length > 0 || board.canShowSnap) && <>
      <UnitSummary board={board} chart={play.facts?.charting} shotgun={!!play.facts?.shotgun} kicking={kicking}/>
      <p className={styles.orientation}>{kicking ? "Kick direction ↑" : "Offense attacks ↑"}</p>
    </>}
    {board.canShowSnap && <FrameDrawing id={id + "-pre"} phase="snap" frame={board.snap} groups={groups} scrimmage={!kicking}/>}
    <FrameDrawing id={id + "-result"} phase="action" frame={board.action} groups={false} scrimmage={!kicking}/>
    {board.route && !board.wilsonStudy && <RouteConcept route={board.route} id={id + "-route"}/>}
    {board.wilsonStudy && <div className={styles.readings} aria-label="Two readings of Wilson’s inside break">
      <RouteConcept route="POST" label="Next Gen Stats chart" id={id + "-post"}/>
      <RouteConcept route="SLANT" label="Jets’ game account" id={id + "-slant"}/>
    </div>}
    {board.notes.length > 0 && <div className={styles.notes}>{board.notes.map(note => <p key={note}>{note}</p>)}</div>}
    {board.studyId && <div className={styles.studies}>
      <a href={"/film-room#jets-play:" + board.studyId}>Open the 22-player teaching board</a>
      {board.wilsonStudy && <a href="/film-room/replay/wilson-cleveland">Wilson’s touchdown in the Film Room · postgame study</a>}
    </div>}
    {provenance && <p className={styles.credit}>Charting adapted from <a href={provenance.sourceUrl}>{provenance.provider}</a>.
      Adapted data licensed under <a href={provenance.licenseUrl}>{provenance.license}</a>.</p>}
  </section>;
}
