import { fullSnapBoard } from "@/lib/full-snap";
import { FullSnapField } from "./FullSnapField";
import { snapChalkboard } from "@/lib/snap-chalkboard";
import { chartLabel, participationProvenance } from "@/lib/snap-participation";
import type { Snap, SnapCharting, SnapGame } from "@/lib/snap-types";
import { teamIdentity } from "@/lib/teams";
import styles from "./SnapChalkboard.module.css";

type Board = ReturnType<typeof snapChalkboard>;
const nickname = (code: string) => teamIdentity(code)?.nickname ?? teamIdentity(code)?.city ?? code;

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

function UnitSummary({ board, chart, shotgun, kicking }: { board: Board; chart?: SnapCharting; shotgun: boolean; kicking: boolean }) {
  const formation = chartLabel(chart?.formation) ?? (shotgun ? "Shotgun" : null);
  const kickDefense = board.kind === "fieldGoal" || board.kind === "extraPoint" ? "kick block" : "receive";
  const defense = [chartLabel(chart?.coverage), chartLabel(chart?.manZone)].filter(Boolean).join(" · ");
  const rush = chart?.rushers != null ? chart.rushers + (chart.rushers === 1 ? " pass rusher" : " pass rushers") : null;
  const box = chart?.box != null ? chart.box + (chart.box === 1 ? " defender in the box" : " defenders in the box") : null;
  return <div className={styles.matchup}>
    <div><span><b className={styles.offense}>O</b> {nickname(board.offense)} {kicking ? "kick" : "offense"}</span>
      {formation && <strong>{formation}</strong>}
      {chart?.offensePersonnel && <small>Offensive personnel · {chart.offensePersonnel}</small>}</div>
    <div><span><b className={styles.defense}>X</b> {nickname(board.defense)} {kicking ? kickDefense : "defense"}</span>
      {defense && <strong>{defense}</strong>}
      {chart?.defensePersonnel && <small>Defensive personnel · {chart.defensePersonnel}</small>}
      {(box || rush) && <small>{[box, rush].filter(Boolean).join(" · ")}</small>}</div>
  </div>;
}

export function SnapChalkboard({ game, play }: { game: Pick<SnapGame,"id" | "opponent" | "source">; play: Snap }) {
  const board = snapChalkboard(game, play);
  const full = fullSnapBoard(game, play, board);
  const id = "chalk-" + game.id + "-" + play.key;
  const kicking = ["kickoff", "punt", "fieldGoal", "extraPoint"].includes(board.kind);
  const provenance = board.charted ? participationProvenance(Number(game.id.slice(0, 4))) : null;
  return <section aria-label="Xs & Os" className={styles.board}>
    <p className={styles.basis}>{board.basis}{full && " · Schematic spacing"}</p>
    {full && <fieldset className={styles.phases}><legend className="sr-only">Diagram phase</legend>
      <input id={id + "-snap"} name={id} type="radio" value="snap"/><label htmlFor={id + "-snap"}>{board.kind === "kickoff" ? "Before the kick" : "At the snap"}</label>
      <input id={id + "-action"} name={id} type="radio" value="action" defaultChecked/><label htmlFor={id + "-action"}>Play action</label>
    </fieldset>}
    {full && <>
      <UnitSummary board={board} chart={play.facts?.charting} shotgun={!!play.facts?.shotgun} kicking={kicking}/>
      <p className={styles.orientation}>{kicking ? "Kick direction ↑" : "Offense attacks ↑"}</p>
    </>}
    {full ? <FullSnapField key={id} board={full} id={id} offense={nickname(board.offense)} defense={nickname(board.defense)}
      yardline={play.yardline} distance={play.distance} kicking={kicking} caption={board.kind === "other" && board.studyId ? play.description : board.action.caption} verifiedLineups={!!play.facts?.onField} /> : <p data-phase="action">{board.action.caption}</p>}
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
