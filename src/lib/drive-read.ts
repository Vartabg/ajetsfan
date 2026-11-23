import { beforeFullSnap, fullSnapBoard, type FullSnapBoard, type FullSnapPoint } from "./full-snap";
import { defenseCriteria, defenseMatchHref } from "./defense-match";
import { hasComplexRuling, snapChalkboard } from "./snap-chalkboard";
import { fieldSpot, snapAccount, snapHeadline, snapSituation } from "./snap-context";
import { chartLabel } from "./snap-participation";
import type { Snap, SnapGame, SnapKick, SnapParticipant, SnapScore } from "./snap-types";
import { teamIdentity } from "./teams";

export type DriveReadOptions = { play?: string; phase?: "snap" | "action"; series?: "cleveland-15"; follow?: string };
export type DriveHistoryRow = {
  key: string; down: number | null; quarter: number; clock: number | null;
  coverage?: string; rushers?: number; direction?: string; target?: string; airYards?: number;
};
export type PriorThrowTrace = { key: string; label: string; to: FullSnapPoint; from?: FullSnapPoint };
export type DriveLineupChange = { unit: "O" | "X"; entered: string[]; left: string[] };
export type DriveReadFrame = {
  game: Pick<SnapGame,"id" | "date" | "home" | "opponent">;
  key: string; phase: "snap" | "action"; series?: "cleveland-15"; first: string; previous: string | null; next: string | null;
  score: SnapScore | null; scoreLabel: string; quarter: number; clock: number | null; down: number | null; distance: number | null;
  yardline: number | null; timeouts?: SnapScore; situation: string; offense: string; defense: string; kicking: boolean; kickKind?: SnapKick["kind"];
  formation?: string; offensePersonnel?: string; defensePersonnel?: string; coverage?: string; rushers?: number; box?: number; primaryRoute?: string;
  board: FullSnapBoard | null; caption: string; headline?: string; detail?: string;
  defenseMatch?: string;
  verifiedLineups: boolean; charted: boolean; changes: DriveLineupChange[];
  history: DriveHistoryRow[]; traces: PriorThrowTrace[]; followed?: SnapParticipant; follow?: string;
};

const downs = ["", "1st", "2nd", "3rd", "4th"];
const seriesKeys = ["4155", "4177", "4199"];
const participantId = /^00-\d{7}$/;
const readableName = (value: string) => value.replace(/^(\p{L}{1,4})\.(?=\p{L})/u, "$1. ");

function seriesPlays(game: SnapGame): Snap[] | null {
  if (game.source !== "nflverse" || game.id !== "2022_02_NYJ_CLE" || game.date !== "2022-09-18" || game.home || game.opponent !== "CLE") return null;
  const plays = game.plays.filter(p => seriesKeys.includes(p.key));
  const first = game.plays.indexOf(plays[0]);
  return plays.length === 3 && plays.every((p,i) => p === game.plays[first+i] && p.key === seriesKeys[i] && p.possession === "jets" && p.quarter === 4 &&
    p.clock === [35,30,25][i] && p.down === i+1 && p.distance === 10 && p.yardline === 15 && p.drive === 19) ? plays : null;
}

function previousTimeouts(game: SnapGame, play: Snap): SnapScore | undefined {
  const previous = game.plays[game.plays.indexOf(play)-1];
  if (!previous) return;
  const sameHalf = previous.quarter === play.quarter || previous.quarter === 1 && play.quarter === 2 || previous.quarter === 3 && play.quarter === 4;
  return sameHalf ? previous.facts?.timeouts : undefined;
}

function setupSituation(game: SnapGame, play: Snap) {
  if (!play.possession || !play.down) return "Before the recorded event";
  const offense = play.possession === "jets" ? "Jets" : teamIdentity(game.opponent)?.nickname ?? game.opponent;
  const distance = play.facts?.goalToGo ? "goal" : play.distance;
  const down = downs[play.down] + (distance == null ? " down" : " & " + distance);
  const spot = play.yardline == null ? "" : " at " + fieldSpot(game,play,play.yardline);
  return offense + " ball · " + down + spot;
}

function completeLineup(play: Snap) {
  const groups = play.facts?.onField;
  if (!groups || groups.offense.length !== 11 || groups.defense.length !== 11) return;
  const all = [...groups.offense,...groups.defense];
  if (all.every(p => participantId.test(p.id) && p.name.trim()) && new Set(all.map(p => p.id)).size === 22) return groups;
}

function sameDrive(previous: Snap, current: Snap) {
  return current.drive != null && current.possession != null && previous.drive === current.drive &&
    previous.possession === current.possession && !previous.facts?.turnovers?.length;
}

function lineupChanges(previous: Snap | undefined, current: Snap): DriveLineupChange[] {
  if (!previous || !sameDrive(previous,current)) return [];
  const before = completeLineup(previous), now = completeLineup(current);
  if (!before || !now) return [];
  const changes: DriveLineupChange[] = [];
  for (const side of ["offense","defense"] as const) {
    const previousIds = new Set(before[side].map(p => p.id)), currentIds = new Set(now[side].map(p => p.id));
    const entered = now[side].filter(p => !previousIds.has(p.id)).map(p => p.name);
    const left = before[side].filter(p => !currentIds.has(p.id)).map(p => p.name);
    if (entered.length) changes.push({ unit:side === "offense" ? "O" : "X", entered, left });
  }
  return changes;
}

function followedThrough(plays: Snap[], selected: number, id: string): SnapParticipant | undefined {
  if (!participantId.test(id)) return;
  for (let i = selected; i >= 0; i--) {
    const membership = completeLineup(plays[i]);
    if (!membership) continue;
    const person = [...membership.offense,...membership.defense].find(p => p.id === id);
    if (person) return { id:person.id, name:person.name, position:person.position, number:person.number };
  }
}

function throwHistory(plays: Snap[], index: number, phase: DriveReadFrame["phase"], board: FullSnapBoard | null) {
  const history: DriveHistoryRow[] = [], traces: PriorThrowTrace[] = [];
  const current = plays[index];
  if (current.drive == null || !current.possession) return { history,traces };
  let start = index;
  while (start > 0) {
    const prior = plays[start-1];
    if (!sameDrive(prior,current)) break;
    start--;
  }
  const limit = phase === "action" ? index+1 : index;
  for (let i = start; i < limit; i++) {
    const p = plays[i], f = p.facts;
    if (!f || (f.kind !== "completion" && f.kind !== "incompletion" && f.kind !== "interception")) continue;
    // Penalties, reviews and compound plays can supersede the raw fields. Prefer their adjudicated account.
    if (hasComplexRuling(p)) continue;
    const chart = f.charting;
    history.push({ key:p.key, down:p.down, quarter:p.quarter, clock:p.clock, coverage:chartLabel(chart?.coverage) ?? undefined, rushers:chart?.rushers,
      direction:f.direction, target:f.target && readableName(f.target), airYards:f.airYards });
    if (i === index || !board || !f.target || !f.direction || f.airYards == null || current.yardline == null || p.yardline == null) continue;
    const absoluteSpot = p.yardline - f.airYards;
    if (absoluteSpot < -10 || absoluteSpot > 110) continue;
    const x = f.direction === "left" ? 23 : f.direction === "right" ? 77 : 50;
    const to: FullSnapPoint = [x, board.lineY - (current.yardline - absoluteSpot) * board.yardsToY];
    if (to[1] < 4 || to[1] > 96) continue;
    const fromY = board.lineY - (current.yardline - p.yardline) * board.yardsToY;
    const trace: PriorThrowTrace = { key:p.key, label:p.down ? downs[p.down] : "Earlier", to };
    if (fromY >= 4 && fromY <= 96) trace.from = [50,fromY];
    traces.push(trace);
  }
  return { history,traces:traces.slice(-3) };
}

/** Construct the browser's selected reading boundary on the server. The setup branch reads only pre-play evidence. */
export function buildDriveRead(game: SnapGame, options: DriveReadOptions): DriveReadFrame | null {
  if (!game.plays.length || new Set(game.plays.map(p => p.key)).size !== game.plays.length ||
      options.play !== undefined && typeof options.play !== "string" || options.follow !== undefined && typeof options.follow !== "string" ||
      options.phase !== undefined && options.phase !== "snap" && options.phase !== "action" ||
      options.series !== undefined && options.series !== "cleveland-15") return null;
  const plays = options.series ? seriesPlays(game) : game.plays;
  if (!plays?.length) return null;
  const index = options.play === undefined ? 0 : plays.findIndex(p => p.key === options.play);
  if (index < 0) return null;
  const p = plays[index], phase = options.phase ?? "snap", chart = p.facts?.charting;
  const {id,date,opponent,home} = game;
  const teamsKnown = !!p.possession && !!p.down;
  const formation = chartLabel(chart?.formation) ?? (p.facts?.shotgun ? "Shotgun" : undefined);
  const frame: DriveReadFrame = {
    game:{id,date,opponent,home}, key:p.key, phase, series:options.series, first:plays[0].key,
    previous:plays[index-1]?.key ?? null, next:plays[index+1]?.key ?? null,
    score:p.before, scoreLabel:p.before ? "Score before this play" : "Score before this play unavailable",
    quarter:p.quarter, clock:p.clock, down:p.down, distance:p.distance, yardline:p.yardline, timeouts:previousTimeouts(game,p),
    situation:setupSituation(game,p), offense:teamsKnown ? p.possession === "jets" ? "NYJ" : opponent : "Offense",
    defense:teamsKnown ? p.possession === "jets" ? opponent : "NYJ" : "Defense", kicking:false,
    formation, offensePersonnel:chart?.offensePersonnel, defensePersonnel:chart?.defensePersonnel, box:chart?.box,
    board:null,caption:"",verifiedLineups:!!completeLineup(p), charted:!!(chart?.formation || chart?.offensePersonnel || chart?.defensePersonnel || chart?.box != null),
    changes:lineupChanges(plays[index-1],p), history:[],traces:[],
  };
  if (phase === "snap") {
    frame.board = beforeFullSnap(game,p);
    frame.caption = frame.board ? "Read the alignment before revealing the play." : "The starting alignment is unavailable for this event.";
  } else {
    const evidence = snapChalkboard(game,p);
    frame.board = fullSnapBoard(game,p,evidence);
    const kick = p.facts?.kick;
    if (kick && evidence.kind === kick.kind) { frame.kickKind = kick.kind; frame.kicking = true; }
    frame.offense = evidence.offense; frame.defense = evidence.defense;
    frame.score = p.after;
    frame.scoreLabel = p.after ? "Score after this play" : "Score after this play unavailable";
    frame.timeouts = p.facts?.timeouts;
    frame.coverage = chartLabel(chart?.coverage) ?? undefined; frame.rushers = chart?.rushers; frame.charted = evidence.charted;
    if (evidence.route) frame.primaryRoute = evidence.route;
    frame.situation = snapSituation(game,p);
    frame.headline = snapHeadline(game,p);
    frame.caption = frame.board && evidence.kind !== "other" ? evidence.action.caption : snapAccount(game,p);
    if (evidence.wilsonStudy) frame.detail = evidence.notes[0];
    if (game.source === "nflverse" && defenseCriteria(p)) frame.defenseMatch = defenseMatchHref(id, p.key);
  }
  Object.assign(frame,throwHistory(plays,index,phase,frame.board));
  if (options.follow) {
    const member = followedThrough(plays,index,options.follow);
    if (member) { frame.followed = member; frame.follow = member.id; }
    else if (options.follow.startsWith("slot:") && frame.board?.players.some(p => options.follow === "slot:"+p.id)) frame.follow = options.follow;
  }
  return frame;
}
