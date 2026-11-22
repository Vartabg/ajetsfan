import type { Snap, SnapDefender, SnapFacts, SnapGame, SnapKick } from "./snap-types";

type Game = Pick<SnapGame, "id" | "opponent" | "source">;
type Point = [number, number];
type Unit = "O" | "X" | "ball";
type Action = "completion" | "incompletion" | "interception" | "rush" | "sack";
export type ChalkMark = { x: number; y: number; unit: Unit; label: string; tag?: string; shortLabel?: string };
export type ChalkPath = { from: Point; to: Point; kind: "pass" | "carry" | "kick" | "return" | "incomplete" | "interception" };
export type ChalkFrame = {
  marks: ChalkMark[]; paths: ChalkPath[]; caption: string;
  gainLine?: { y: number; label: "Line to gain" | "Goal line" };
  goalLineY?: number;
};
export type Chalkboard = {
  offense: string; defense: string; kind: Action | SnapKick["kind"] | "other";
  basis: string; charted: boolean; canShowSnap: boolean; snap: ChalkFrame; action: ChalkFrame;
  notes: string[]; route: string | null; wilsonStudy: boolean; studyId: string | null;
};

const line = 65;
const origin: Point = [50, line];
const blank = (caption: string): ChalkFrame => ({ marks: [], paths: [], caption });
const mark = (unit: Unit, [x, y]: Point, label: string, shortLabel?: string): ChalkMark => ({ unit, x, y, label, shortLabel });
const yards = (n: number) => Math.abs(n) + (Math.abs(n) === 1 ? " yard" : " yards");
const gain = (n: number) => n < 0 ? "a loss of " + yards(n) : n === 0 ? "no gain" : yards(n);
const name = (raw: string) => raw.replace(/^(\p{L}{1,4})\.(?=\p{L})/u, "$1. ");

function person(unit: "O" | "X", spot: Point, raw: string, role: string): ChalkMark {
  const full = name(raw);
  const short = full.replace(/^(?:\p{L}{1,4}\.\s*)+/u, "").split(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i)[0];
  return mark(unit, spot, full + " · " + role, short.length <= 16 ? short : role);
}

// Each half lists a unit's personnel. These rows do not assign anyone a spot on the field.
const positions = {
  O: { OL: "OL", C: "OL", G: "OL", T: "OL", QB: "QB", RB: "RB", FB: "FB", TE: "TE", WR: "WR" },
  X: { DL: "DL", DE: "DL", DT: "DL", NT: "DL", LB: "LB", ILB: "LB", OLB: "LB", MLB: "LB",
    DB: "DB", CB: "DB", FS: "DB", SS: "DB", S: "DB" },
} as const;
const groups = {
  OL: "Offensive lineman", QB: "Quarterback", RB: "Running back", FB: "Fullback", TE: "Tight end", WR: "Wide receiver",
  DL: "Defensive lineman", LB: "Linebacker", DB: "Defensive back",
} as const;
type Group = keyof typeof groups;

export function personnel(unit: "O" | "X", source: string | undefined, season: number): ChalkMark[] {
  if (!source) return [];
  const counts = new Map<Group, number>(), seen = new Set<string>();
  const table: Readonly<Record<string, Group>> = positions[unit];
  for (const token of source.split(",")) {
    const entry = /^(\d{1,2})\s+([A-Z]{1,3})$/.exec(token.trim());
    if (!entry || !Object.hasOwn(table, entry[2]) || seen.has(entry[2]) || Number(entry[1]) > 11) return [];
    seen.add(entry[2]);
    const group = table[entry[2]];
    counts.set(group, (counts.get(group) ?? 0) + Number(entry[1]));
  }
  // NGS offensive personnel may list skill players only, or explicitly give an extra lineman.
  if (unit === "O" && season >= 2016 && season <= 2022) {
    if (!counts.has("OL")) counts.set("OL", 5);
    if (!counts.has("QB")) counts.set("QB", 1);
  }
  if ([...counts.values()].reduce((a, b) => a + b, 0) !== 11) return [];
  const order: Group[] = unit === "O" ? ["OL", "QB", "RB", "FB", "TE", "WR"] : ["DL", "LB", "DB"];
  const listed = order.filter(group => counts.get(group));
  const gap = 3.5, spacing = (84 - gap * (listed.length - 1)) / 10;
  const marks: ChalkMark[] = [];
  for (const [index, group] of listed.entries()) {
    for (let i = 0; i < counts.get(group)!; i++) marks.push({
      unit, tag: group, label: groups[group], x: 8 + marks.length * spacing + gap * index, y: unit === "O" ? 76 : 35,
    });
  }
  return marks;
}

function beforeSnap(facts: SnapFacts, year: number): ChalkFrame {
  const chart = facts.charting;
  const offense = personnel("O", chart?.offensePersonnel, year), defense = personnel("X", chart?.defensePersonnel, year);
  if (offense.length || defense.length) {
    const who = offense.length && defense.length ? "Both units are" : offense.length ? "The offense is" : "The defense is";
    const shorthand = offense.length && year <= 2022 && chart?.offensePersonnel && !/\bQB\b/.test(chart.offensePersonnel);
    return { marks: [...offense, ...defense], paths: [], caption: who + " grouped by position. Spacing is schematic." +
      (shorthand ? " The offensive personnel shorthand includes the usual quarterback and line." : "") };
  }
  const shotgun = chart?.formation === "SHOTGUN" || (facts.shotgun && !chart?.formation);
  if (shotgun) return {
    marks: [mark("ball", origin, "Ball at the snap", "Ball"), mark("O", [50, 84], "Player receiving the shotgun snap", "Shotgun")],
    paths: [], caption: "The shotgun snap travels back from the center. The record does not identify a starting spot for each player.",
  };
  if (chart?.formation === "UNDER CENTER" && !facts.shotgun) return {
    marks: [mark("ball", origin, "Ball at the snap", "Ball"), mark("O", [50, 73], "Player taking the snap under center", "Under center")],
    paths: [], caption: "The snap is taken under center. The record does not give the other players’ starting spots.",
  };
  return blank("Pre-snap alignment was not recorded.");
}

const roles: Record<SnapDefender["role"], string> = {
  soloTackle: "solo tackle", tackleWithAssist: "tackle with an assist", assistTackle: "tackle assist",
  sack: "sack", halfSack: "half sack", passDefended: "pass defended",
};

function credits(frame: ChalkFrame, players: SnapDefender[] | undefined, spot: Point, unit: "O" | "X", already?: string) {
  const others = (players ?? []).filter(player => player.name !== already);
  const side = spot[0] < 50 ? 1 : -1;
  for (const [index, player] of others.slice(0, 2).entries()) {
    const point: Point = [spot[0] + side * (15 + index * 18), spot[1]];
    frame.marks.push(person(unit, point, player.name, roles[player.role]));
  }
  const additional = others.slice(2);
  if (additional.length) frame.caption += " Additional credit went to " + additional.map(p => name(p.name) + " (" + roles[p.role] + ")").join(", ") + ".";
}

// The same scale is used for a throw and its return or carry. An endpoint represents
// longitudinal progress. The provider's broad direction supplies the only lateral information.
function depth(...distances: number[]): (n: number) => number {
  const scale = Math.min(4, 52 / Math.max(1, ...distances), 23 / Math.max(1, ...distances.map(n => -n)));
  return n => line - n * scale;
}

function gainLine(play: Snap, y: (n: number) => number): ChalkFrame["gainLine"] {
  const { down, distance, yardline } = play;
  if (down == null || down < 1 || down > 4 || distance == null || distance <= 0 || yardline == null || yardline < 1 || yardline > 99) return;
  const goal = play.facts?.goalToGo === true || distance >= yardline;
  const position = y(goal ? yardline : distance);
  if (position > 4 && position < line) return { y: position, label: goal ? "Goal line" : "Line to gain" };
}

function across(facts: SnapFacts) {
  const offset = facts.runGap === "guard" ? 12 : facts.runGap === "tackle" ? 20 : 28;
  return 50 + (facts.direction === "left" ? -offset : facts.direction === "right" ? offset : 0);
}

function passAction(play: Snap, f: SnapFacts, kind: "completion" | "incompletion" | "interception"): ChalkFrame {
  if (!f.passer || (kind === "completion" && !f.target) || (kind === "interception" && !f.interceptor))
    return blank("The play record does not identify the participants needed to draw this pass.");
  const passer = name(f.passer), target = f.target && name(f.target);
  const depthText = f.airYards === 0 ? " The throw reached the line of scrimmage." : f.airYards != null ?
    " The throw was " + yards(f.airYards) + (f.airYards < 0 ? " behind the line." : " downfield.") : "";
  const direction = f.direction ? (f.direction === "middle" ? " over the middle" : " on the " + f.direction) : "";
  const yac = kind === "completion" && f.simpleAdvance && f.airYards != null && f.afterCatch != null &&
    f.yards === f.airYards + f.afterCatch ? f.afterCatch : undefined;
  const returned = kind === "interception" ? f.interceptionReturnYards : undefined;
  const action = kind === "interception" ? name(f.interceptor!) + " intercepts " + passer + "’s pass" + direction +
    (target ? " intended for " + target : "") : kind === "completion" ? passer + " completes the pass to " + target + direction :
    passer + "’s pass" + (target ? " to " + target : "") + direction + " falls incomplete";
  const frame = blank(action + "." + depthText);
  if (kind === "completion" && f.simpleAdvance && f.yards != null && yac == null) frame.caption += " The play went for " + gain(f.yards) + ".";
  if (yac != null) frame.caption += yac < 0 ? " The receiver lost " + yards(yac) + " after the catch." : " " + yards(yac) + " after the catch.";
  if (returned != null) frame.caption += " The interception return went for " + gain(returned) + ".";
  // Historical accounts can identify both people without recording where the throw went.
  const air = f.airYards ?? (f.passLength === "deep" ? 25 : f.passLength === "short" ? 7 : undefined);
  if (air == null && !f.direction) {
    frame.marks.push(person("O", [25, 73], f.passer, "passer"));
    if (kind === "interception") frame.marks.push(person("X", [72, 73], f.interceptor!, "interceptor"));
    else if (f.target) frame.marks.push(person("O", [72, 73], f.target, kind === "completion" ? "receiver" : "intended receiver"));
    frame.caption += " The record gives no throw location.";
    const unplaced = (f.defenders ?? []).filter(p => p.name !== f.interceptor);
    if (unplaced.length) frame.caption += " Defensive credit went to " + unplaced.map(p => name(p.name) + " (" + roles[p.role] + ")").join(", ") + ".";
    return frame;
  }
  const catchDepth = air ?? 0;
  const endDepth = catchDepth + (yac ?? 0) - (returned ?? 0);
  const y = depth(catchDepth, endDepth), x = across(f), spot: Point = [x, y(catchDepth)];
  if (f.airYards != null) frame.gainLine = gainLine(play, y);
  const start: Point = [50, Math.max(line + 10, Math.min(91, spot[1] + 10))];
  frame.marks.push(person("O", start, f.passer, "passer"));
  frame.paths.push({ from: start, to: spot, kind: kind === "completion" ? "pass" : kind === "interception" ? "interception" : "incomplete" });
  if (kind === "interception") {
    frame.marks.push(person("X", spot, f.interceptor!, "interceptor"));
    if (f.target) frame.marks.push(person("O", [x + (x > 50 ? -17 : 17), spot[1]], f.target, "intended receiver"));
  } else if (f.target) {
    frame.marks.push(person("O", spot, f.target, kind === "completion" ? "receiver at the catch" : "intended receiver"));
  } else frame.marks.push(mark("ball", spot, "Incomplete pass", "Incomplete"));
  if (f.airYards == null) frame.caption += f.passLength ? " The record classifies the pass as " + f.passLength + "." : " Throw depth was not recorded.";
  if (!f.direction) frame.caption += " The side of the throw was not recorded.";
  const end: Point = [x, y(endDepth)];
  if (endDepth !== catchDepth) {
    frame.paths.push({ from: spot, to: end, kind: kind === "interception" ? "return" : "carry" });
    if (Math.abs(end[1] - spot[1]) >= 8) frame.marks.push(mark("ball", end, kind === "interception" ? "End of the return" : "End of the carry", "Finish"));
  }
  credits(frame, f.defenders, end, "X", kind === "interception" ? f.interceptor : undefined);
  return frame;
}

function groundAction(play: Snap, f: SnapFacts, kind: "rush" | "sack"): ChalkFrame {
  const runner = kind === "sack" ? f.passer : f.rusher;
  if (!runner || f.yards == null || (kind === "rush" && !f.simpleAdvance) || (kind === "sack" && f.yards > 0))
    return blank("The play record does not establish a ball carrier and finish for this play.");
  const y = depth(f.yards);
  const to: Point = [kind === "sack" ? 50 : across(f), y(f.yards)];
  const lane = f.direction === "middle" ? " up the middle" : f.direction ? " " + f.direction + (f.runGap ? " " + f.runGap : "") : "";
  const frame = blank(name(runner) + (kind === "sack" ? " is sacked" : " runs" + lane) + " for " + gain(f.yards) + ".");
  frame.gainLine = gainLine(play, y);
  if (kind === "rush" && !f.direction) frame.caption += " The side of the run was not recorded.";
  if (kind === "sack") {
    frame.marks.push(person("O", to, runner, "sacked passer"));
    if (f.yards !== 0) frame.marks.push(mark("ball", origin, "Line of scrimmage", "Snap"));
  } else {
    frame.marks.push(person("O", origin, runner, "ball carrier"));
    if (f.yards !== 0 || to[0] !== origin[0]) {
      frame.paths.push({ from: origin, to, kind: "carry" });
      if (Math.abs(to[0] - origin[0]) + Math.abs(to[1] - origin[1]) >= 9) frame.marks.push(mark("ball", to, "End of the run", "Finish"));
    }
  }
  credits(frame, f.defenders, to, "X");
  return frame;
}

function markTouchdown(frame: ChalkFrame, play: Snap, f: SnapFacts) {
  if (!f.simpleAdvance || !f.touchdown || f.turnovers?.length) return;
  frame.caption += " Touchdown.";
  if (f.yards == null || f.yards <= 0 || f.yards !== play.yardline) return;
  if (f.kind === "completion" && (f.airYards == null || f.afterCatch == null || f.airYards + f.afterCatch !== f.yards)) return;
  const last = frame.paths.at(-1);
  if (last?.kind !== "carry" && last?.kind !== "pass") return;
  frame.goalLineY = last.to[1];
  // A scoring catch already has a receiver symbol. Only a carry needs a separate ball at the goal.
  if (last.kind === "carry") {
    const finish = frame.marks.find(m => m.unit === "ball" && m.x === last.to[0] && m.y === last.to[1]);
    if (finish) {
      finish.label = "Touchdown";
      finish.shortLabel = "TD";
    } else frame.marks.push(mark("ball", last.to, "Touchdown", "TD"));
  }
}

function kickAction(f: SnapFacts, k: SnapKick): ChalkFrame {
  if (!k.kicker) return blank("The kicker is not identified in the play record.");
  const goal = k.kind === "fieldGoal" || k.kind === "extraPoint";
  const title = k.kind === "fieldGoal" ? "field goal" : k.kind === "extraPoint" ? "extra point" : k.kind;
  const attempt = k.kind === "fieldGoal" && k.kickYards != null ? "a " + k.kickYards + "-yard field goal" : "the " + title;
  const frame = blank(goal && k.outcome ? name(k.kicker) + (k.outcome === "made" ? " makes " : " misses ") + attempt + "." :
    name(k.kicker) + (k.kind === "punt" ? " punts" : " kicks") + (k.kickYards == null ? "" : " " + yards(k.kickYards)) + ".");
  frame.marks.push(person("O", origin, k.kicker, k.kind === "punt" ? "punter" : "kicker"));
  const returned = !goal && !k.touchback && k.returner ? k.returnYards : undefined;
  if (k.touchback) frame.caption += " Touchback.";
  if (k.returner && !k.touchback) frame.caption += returned == null ? " " + name(k.returner) + " receives the kick." :
    " " + name(k.returner) + " returns it for " + gain(returned) + ".";
  if (k.kickYards == null && !goal && !k.touchback && !k.returner) return frame;
  const distanceDrawn = k.kickYards ?? 40, finish = distanceDrawn - (returned ?? 0);
  const y = depth(distanceDrawn, finish), spot: Point = [50, y(distanceDrawn)], end: Point = [50, y(finish)];
  frame.paths.push({ from: origin, to: spot, kind: "kick" });
  if (k.returner && !k.touchback) frame.marks.push(person("X", spot, k.returner, "kick receiver"));
  else {
    const result = k.touchback ? "Touchback" : k.outcome === "made" ? "Good" : k.outcome === "missed" ? "Missed" : "Kick endpoint";
    frame.marks.push(mark("ball", spot, result, result));
  }
  if (returned != null && returned !== 0) {
    frame.paths.push({ from: spot, to: end, kind: "return" });
    if (Math.abs(end[1] - spot[1]) >= 8) frame.marks.push(mark("ball", end, "End of the kick return", "Finish"));
  }
  if (returned != null) credits(frame, f.defenders, end, "O");
  return frame;
}

export function isWilsonStudy(game: Game, play: Snap): boolean {
  const f = play.facts;
  return game.source === "nflverse" && game.id === "2022_02_NYJ_CLE" && game.opponent === "CLE" && play.key === "4199" &&
    play.possession === "jets" && play.quarter === 4 && play.clock === 25 && play.down === 3 && play.distance === 10 && play.yardline === 15 &&
    play.type === "pass" && f?.kind === "completion" && f.passer === "J.Flacco" && f.target === "G.Wilson" && f.yards === 15 && f.touchdown === true &&
    /^\(:25\) \(Shotgun\) (?:19-)?J\.Flacco pass short middle to (?:17-)?G\.Wilson for 15 yards, TOUCHDOWN\.?$/i.test(play.description);
}

function playbookStudy(game: Game, play: Snap, wilsonStudy: boolean): string | null {
  if (wilsonStudy) return "wilson-cleveland";
  const f = play.facts;
  if (game.source !== "nflverse" || play.possession !== "jets" || !f || !play.before || !play.after) return null;
  const jetsPoints = play.after[0] - play.before[0], otherPoints = play.after[1] - play.before[1];
  if (game.id === "2012_12_NE_NYJ" && game.opponent === "NE" && play.key === "1401" && play.quarter === 2 && play.clock === 550 &&
      play.type === "run" && f.kind === "rush" && f.turnovers?.length === 1 && f.turnovers[0] === "lostFumble" &&
      (f.rusher == null || f.rusher === "M.Sanchez") && (f.yards == null || f.yards === 1) && f.touchdown !== true &&
      jetsPoints === 0 && otherPoints === 6 && play.description === "(9:10) 6-M.Sanchez up the middle to NYJ 32 for 1 yard. FUMBLES, RECOVERED by NE-28-S.Gregory at NYJ 32. 28-S.Gregory for 32 yards, TOUCHDOWN.")
    return "sanchez-thanksgiving";
  if (play.quarter !== 4 || play.type !== "pass" || f.kind !== "completion" || !f.touchdown || jetsPoints !== 6 || otherPoints !== 0) return null;
  if (game.id === "2022_02_NYJ_CLE" && game.opponent === "CLE" && play.key === "3890" && play.clock === 92 &&
      f.passer === "J.Flacco" && f.target === "C.Davis" && f.yards === 66 &&
      play.description === "(1:32) (No Huddle, Shotgun) 19-J.Flacco pass deep right to 84-C.Davis for 66 yards, TOUCHDOWN.")
    return "davis-cleveland";
  if (game.id === "2000_08_MIA_NYJ" && game.opponent === "MIA" && play.key === "4658" && play.clock === 80 &&
      f.passer === "V.Testaverde" && f.target === "J.Elliott" && f.yards === 3 &&
      play.description === "(1:20) NY #76 Elliott reports eligible. Play action fake. V.Testaverde pass to J.Elliott for 3 yards, TOUCHDOWN. Play Challenged by Replay Official and Upheld.")
    return "elliott-miami";
  return null;
}

export function hasComplexRuling(play: Snap): boolean {
  return /\b(?:penalt(?:y|ies)|no play|fumbl\w*|muff\w*|lateral\w*|backwards? pass|reverse|review(?:ed)?|challeng\w*|overturned|reversed|aborted|on[ -]?side|blocked|safety|fake[sd]?|turnover on downs)\b/i.test(play.description) ||
    !!play.facts?.turnovers?.some(t => t !== "interception");
}

/** Project a single selected snap. Coordinates are percentages; the initial offense attacks toward decreasing y. */
export function snapChalkboard(game: Game, play: Snap): Chalkboard {
  const facts = play.facts ?? {}, kick = facts.kick;
  const k = facts.kind;
  const scrimmage = k === "completion" || k === "incompletion" || k === "interception" || k === "rush" || k === "sack";
  const recordedKickoff = kick?.kind === "kickoff" || /^(?:kickoff|kick off|onside kick)$/i.test(play.type ?? "");
  const recordedKick = kick || recordedKickoff || /^(?:punt|field[ _]goal|extra[ _]point)$/i.test(play.type ?? "");
  const invert = game.source === "nflverse" && recordedKickoff;
  const jetsO = play.possession === "jets" ? !invert : play.possession === "opponent" ? invert : null;
  const offense = jetsO === null ? recordedKick ? "Kicking team" : "Offense" : jetsO ? "NYJ" : game.opponent;
  const defense = jetsO === null ? recordedKick ? "Receiving team" : "Defense" : jetsO ? game.opponent : "NYJ";
  const complex = hasComplexRuling(play);
  const kind = complex || !play.possession ? "other" : kick?.kind ?? (scrimmage ? k : "other");
  const notes: string[] = [];
  const route = facts.charting?.primaryRoute ?? null;
  const charted = Object.values(facts.charting ?? {}).some(value => value != null && value !== "");
  const wilsonStudy = isWilsonStudy(game, play);
  if (wilsonStudy) notes.push("NFL Next Gen Stats calls the primary route a post. The Jets’ account calls Wilson’s route a slant.");
  let action: ChalkFrame;
  if (kind === "other") action = blank(complex ? "The recorded ruling involves more than a routine play. See the play account." :
    !play.possession ? "The record does not identify the two units for this event. See the play account." :
      "This event has no recorded player action to diagram. See the play account.");
  else if (kick) action = kickAction(facts, kick);
  else if (kind === "rush" || kind === "sack") action = groundAction(play, facts, kind);
  else if (kind === "completion" || kind === "incompletion" || kind === "interception") action = passAction(play, facts, kind);
  else action = blank("See the recorded play account.");
  if (kind === "rush" || kind === "completion") markTouchdown(action, play, facts);
  const snap = kind === "other" || kick ? blank("Pre-snap personnel are unavailable for this event.") : beforeSnap(facts, Number(game.id.slice(0, 4)));
  return { offense, defense, kind, snap, action, canShowSnap: snap.marks.length > 0, charted,
    basis: charted ? "Play-by-play and participation charting" : action.marks.length ? "Recorded play-by-play" : "Recorded play account",
    notes, route: wilsonStudy || kind === "other" ? null : route, wilsonStudy, studyId: playbookStudy(game, play, wilsonStudy) };
}
