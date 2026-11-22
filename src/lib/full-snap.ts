import { defensiveFormations, offensiveFormations, type PlaybookPlayer } from "./playbook";
import { personnel, type Chalkboard, type ChalkFrame, type ChalkMark, type ChalkPath } from "./snap-chalkboard";
import type { Snap, SnapGame, SnapParticipant } from "./snap-types";

export type FullSnapPoint = [number, number];
type Unit = "O" | "X";
type Game = Pick<SnapGame, "id" | "source" | "opponent">;
export type FullSnapPlayer = {
  id: string; unit: Unit; group: string; role: string; name?: string; number?: number; credit?: string;
  participantId?: string; position?: string;
  start: FullSnapPoint; path: FullSnapPoint[];
  duty: "block" | "route" | "rush" | "cover" | "pass" | "carry" | "kick" | "return" | "support"; assignment: string;
};
export type FullSnapBoard = {
  players: FullSnapPlayer[]; paths: ChalkPath[]; events: ChalkMark[]; note: string;
  lineY: number; yardsToY: number; gainLine?: ChalkFrame["gainLine"]; goalLineY?: number;
  directionOnly?: "left" | "middle" | "right";
  unplacedThrow?: { depth?: number; targetKnown: boolean };
};

const lineY = 65;
const positions: Record<string, string> = {
  C: "OL", G: "OL", T: "OL", LT: "OL", LG: "OL", RT: "OL", RG: "OL", OT: "OL", OG: "OL", OL: "OL",
  QB: "QB", RB: "RB", HB: "RB", FB: "FB", WR: "WR", TE: "TE", DL: "DL", DE: "DL", DT: "DL", NT: "DL",
  EDGE: "DL", LB: "LB", ILB: "LB", OLB: "LB", MLB: "LB", CB: "DB", S: "DB", SS: "DB", FS: "DB", DB: "DB",
};
const groupNames: Record<string, string> = {
  OL: "Offensive line", QB: "Quarterback", TE: "Tight end", WR: "Receiver", RB: "Running back", FB: "Fullback",
  DL: "Defensive line", LB: "Linebacker", DB: "Defensive back",
};
const point = (x: number, y: number): FullSnapPoint => [Math.max(3, Math.min(97, x)), Math.max(4, Math.min(94, y))];
const end = (p: FullSnapPlayer) => p.path.at(-1) ?? p.start;
const rowX = (i: number, n: number, left: number, right: number) => n === 1 ? (left + right) / 2 : left + (right - left) * i / (n - 1);
const slot = (id: string, unit: Unit, group: string, role: string, start: FullSnapPoint): FullSnapPlayer =>
  ({ id: unit + "-" + id, unit, group, role, start, path: [], duty: "support", assignment: "" });

function templateGroup(p: PlaybookPlayer): string {
  if (p.side === "offense") return positions[p.label.split(" ").at(-1)!] ?? "OL";
  return p.label.endsWith("LB") ? "LB" : /(?:CB|NB|FS|SS)$/.test(p.label) ? "DB" : "DL";
}

function fromTemplate(p: PlaybookPlayer): FullSnapPlayer {
  const unit = p.side === "offense" ? "O" : "X";
  const x = Math.abs(p.x - 500) <= 120 ? 50 + (p.x - 500) * .145 : p.x / 10;
  const y = 65 + (p.y - 360) * .14 + (unit === "O" ? 2.5 : -1.5);
  return slot(p.id, unit, templateGroup(p), p.label, point(x, y));
}

function recordedGroups(unit: Unit, season: number, source?: string, members?: SnapParticipant[]): string[] {
  const full = members?.map(p => positions[p.position]);
  if (full?.length === 11 && full.every(Boolean)) return full;
  return personnel(unit, source, season).map(p => p.tag!);
}

function offensiveUnit(groups: string[], formation: string | undefined, shotgun: boolean, elliott: boolean): FullSnapPlayer[] {
  const tight = groups.filter(g => g === "TE").length, backs = groups.filter(g => g === "RB" || g === "FB").length;
  const family = elliott || formation === "JUMBO" ? "goal-line" : formation === "EMPTY" ? "empty" :
    formation === "PISTOL" ? "pistol" : formation === "I_FORM" ? "i-form" : formation === "SHOTGUN" || shotgun ? "spread-2x2" :
    tight > 1 ? "ace" : backs > 1 ? "i-form" : "singleback";
  const players = offensiveFormations.find(d => d.id === family)!.players.map(fromTemplate);
  if (elliott) {
    const tackle = players.find(p => p.id === "O-y")!;
    tackle.role = "Eligible tackle"; tackle.group = "OL";
  } else if (groups.length) {
    const wanted = [...groups];
    // The playbook's empty template calls its Y a WR. Preserve the charted TE when he is split out.
    const open: FullSnapPlayer[] = [];
    for (const p of [...players].sort((a, b) => Number(a.id === "O-y") - Number(b.id === "O-y"))) {
      const i = wanted.indexOf(p.group);
      if (i >= 0) wanted.splice(i, 1);
      else open.push(p);
    }
    for (const [i, p] of open.entries()) {
      p.group = wanted[i]; p.role = groupNames[p.group];
    }
    const linemen = players.filter(p => p.group === "OL");
    if (linemen.length !== 5) linemen.forEach((p,i) => { p.start = point(rowX(i, linemen.length, 35, 65), 69); });
  }
  return players;
}

function defensiveUnit(groups: string[]): FullSnapPlayer[] {
  if (!groups.length) return defensiveFormations.find(d => d.id === "nickel")!.players.map(fromTemplate);
  const counts = ["DL", "LB", "DB"].map(g => groups.filter(v => v === g).length);
  const scheme = defensiveFormations.find(f => counts.every((n,i) => f.players.filter(p => templateGroup(p) === ["DL", "LB", "DB"][i]).length === n));
  if (scheme) return scheme.players.map(fromTemplate);
  const [dl, lb, db] = counts;
  const players: FullSnapPlayer[] = [];
  for (let i = 0; i < dl; i++) players.push(slot("line" + i, "X", "DL", i === 0 || i === dl-1 ? "DE" : "DT", point(rowX(i, dl, 30, 70), 59)));
  for (let i = 0; i < lb; i++) players.push(slot("backer" + i, "X", "LB", "LB", point(rowX(i, lb, 24, 76), 48)));
  const high = Math.min(2, Math.floor(db / 2));
  for (let i = 0; i < db; i++) {
    const deep = i < high;
    players.push(slot("back" + i, "X", "DB", deep ? "S" : "CB", deep ? point(rowX(i, high, 31, 69), 27) : point(rowX(i-high, db-high, 8, 92), 44)));
  }
  return players;
}

type KickKind = "kickoff" | "punt" | "fieldGoal" | "extraPoint";
function kickUnits(kind: KickKind, modern: boolean): FullSnapPlayer[] {
  const players: FullSnapPlayer[] = [];
  const add = (id: string, side: Unit, role: string, x: number, y: number) => players.push(slot(id, side, "ST", role, point(x, y)));
  if (kind === "kickoff") {
    add("kicker", "O", "Kicker", 50, 82);
    for (let i = 0; i < 10; i++) add("lane" + i, "O", "Kick coverage", rowX(i, 10, 6, 94), modern ? 48 : 71);
    for (let i = 0; i < 9; i++) add("block" + i, "X", "Return blocker", rowX(i, 9, 7, 93), modern ? 39 : i % 2 ? 40 : 48);
    add("returner", "X", "Returner", 43, 17); add("deep", "X", "Second returner", 65, 20);
  } else if (kind === "punt") {
    add("kicker", "O", "Punter", 50, 89); add("snapper", "O", "Long snapper", 50, 68);
    for (let i = 0; i < 6; i++) add("line" + i, "O", "Punt protection", i < 3 ? 30 + 6*i : 58 + 6*(i-3), 69);
    add("shield", "O", "Upback", 55, 78); add("wide0", "O", "Gunner", 9, 68); add("wide1", "O", "Gunner", 91, 68);
    for (let i = 0; i < 7; i++) add("front" + i, "X", "Rush or hold-up", rowX(i, 7, 14, 86), 59);
    for (let i = 0; i < 3; i++) add("block" + i, "X", "Return blocker", rowX(i, 3, 20, 80), 43);
    add("returner", "X", "Punt returner", 50, 17);
  } else {
    add("kicker", "O", "Kicker", 37, 88); add("holder", "O", "Holder", 50, 80);
    for (let i = 0; i < 9; i++) add("line" + i, "O", i === 4 ? "Long snapper" : "Kick protection", rowX(i, 9, 21, 79), 68 + Math.abs(i-4));
    for (let i = 0; i < 9; i++) add("rush" + i, "X", "Kick rush", rowX(i, 9, 17, 83), 59);
    add("trail0", "X", "Contain", 22, 48); add("trail1", "X", "Contain", 78, 48);
  }
  return players;
}

function rosterMatch(raw: string, person: Pick<SnapParticipant,"name">): boolean {
  const clean = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:jr|sr|iii|ii|iv)\.?$/i, "").replace(/[^a-z]/g, "");
  if (clean(raw) === clean(person.name)) return true;
  const dot = raw.indexOf(".");
  if (dot < 1) return false;
  const parts = person.name.split(" ");
  return clean(parts[0]).startsWith(clean(raw.slice(0, dot))) && clean(parts.slice(1).join(" ")) === clean(raw.slice(dot+1));
}

function fitsRole(position: string, role: string): boolean {
  if (position === role) return true;
  if (position === "T" || position === "G" || position === "DE" || position === "DT" || position === "CB") return role.endsWith(position);
  if (position === "S" || position === "SS" || position === "FS") return role === "FS" || role === "SS" || role === "S";
  return false;
}

function assignMembership(players: FullSnapPlayer[], members: SnapParticipant[] | undefined, outsideId?: string) {
  if (members?.length !== 11 || new Set(members.map(p => p.id)).size !== 11) return;
  const priority = (p: SnapParticipant) => outsideId === p.id ? -2 : p.position === positions[p.position] ? 1 : 0;
  const pairs: [FullSnapPlayer, SnapParticipant][] = [];
  const available = [...players];
  for (const p of [...members].sort((a,b) => priority(a)-priority(b) || a.number-b.number)) {
    const candidates = available.filter(s => s.group === positions[p.position]);
    const matched = outsideId === p.id ? candidates.find(s => s.start[0] <= 15 || s.start[0] >= 85) :
      candidates.find(s => fitsRole(p.position, s.role));
    const slot = matched ?? candidates[0];
    if (!slot) return;
    pairs.push([slot, p]); available.splice(available.indexOf(slot), 1);
  }
  for (const [slot, p] of pairs) Object.assign(slot, { name: p.name, number: p.number, position: p.position, participantId: p.id });
}

function assignCredit(players: FullSnapPlayer[], raw: string | undefined, credit: string, candidates: FullSnapPlayer[]): FullSnapPlayer | undefined {
  if (!raw) return;
  const named = players.filter(p => p.name && rosterMatch(raw, { name:p.name }));
  let player = named.length === 1 ? named[0] : undefined;
  if (!player && !players.some(p => p.participantId)) player = candidates.find(p => !p.name);
  if (player) {
    player.name ??= raw.replace(/^(\p{L}{1,4})\.(?=\p{L})/u, "$1. ");
    if (!player.credit?.split(" · ").includes(credit)) player.credit = player.credit ? player.credit + " · " + credit : credit;
  }
  return player;
}

function coverageTrack(p: FullSnapPlayer, coverage: string | undefined) {
  const [x,y] = p.start, left = x < 50, inside = left ? 1 : -1;
  const side = left ? "left" : "right";
  let finish: FullSnapPoint = point(x+inside*3,y-(p.group === "DB" ? 13 : 9));
  let job = p.group === "DL" ? "Drop into the underneath area." : "Hold a coverage lane and react to the throw.";
  if (coverage === "COVER_6" || coverage === "COVER_2") {
    const quarters = coverage === "COVER_6" && left;
    if (p.group === "DB" && p.role.endsWith("S")) {
      finish = point(quarters ? 36 : left ? 25 : 75, quarters ? 16 : 20);
      job = quarters ? "Carry the deep inside quarter on the illustrated quarters side." : "Protect the deep " + side + " half.";
    } else if (p.group === "DB" && p.role.endsWith("CB")) {
      finish = point(quarters ? 11 : left ? 13 : 87, quarters ? 17 : 49);
      job = quarters ? "Carry the deep outside quarter on the illustrated quarters side." : "Stay underneath in the " + side + " outside flat.";
    } else {
      finish = point(x+inside*(quarters ? 5 : 2), p.group === "LB" ? 40 : 45);
      job = p.group === "DL" || p.group === "LB" ? "Take an underneath hook zone between the numbers." : "Widen through the curl into the flat.";
    }
  }
  p.duty = "cover"; p.assignment = job;
  p.path = [point((x+finish[0])/2,(y+finish[1])/2-2),finish];
}

function teachingPaths(players: FullSnapPlayer[], pass: boolean, rushers: number, coverage?: string) {
  const defenders = players.filter(p => p.unit === "X");
  const rank = (p: FullSnapPlayer) => /sack|quarterback hit/i.test(p.credit ?? "") ? -1 : ["DL","LB","DB"].indexOf(p.group);
  const rush = new Set([...defenders].sort((a,b) => rank(a)-rank(b)).slice(0, rushers));
  for (const p of players) {
    const [x,y] = p.start, inside = x < 50 ? 1 : -1;
    if (p.unit === "X") {
      if (pass && rush.has(p)) {
        p.duty = "rush"; p.assignment = "Attack a pocket lane.";
        p.path = [point(x-inside*2, y+6), point(50+(x-50)*.58, 72+Math.min(6, Math.abs(x-50)*.15))];
      } else if (pass) coverageTrack(p, coverage);
      else {
        p.duty = "support"; p.assignment = p.group === "DL" ? "Close a running lane." : "Read the run and pursue.";
        p.path = [point(x+inside*3, y+4), point(x+inside*6, y+8)];
      }
    } else if (p.group === "OL") {
      p.duty = "block"; p.assignment = pass ? p.role.endsWith("T") ? "Set the outside edge of the passing pocket." :
        "Protect an inside gap in the pocket." : "Work forward to open a running lane.";
      p.path = pass ? [point(x+(x-50)*.10, y+3), point(x+(x-50)*.18, y+4+Math.abs(x-50)*.22)] :
        [point(x+inside*1.5,y-4),point(x+inside*3,y-8)];
    } else if (p.group === "QB") {
      p.duty = pass ? "pass" : "support"; p.assignment = pass ? "Set behind the line to deliver." : "Handle the snap and carry out the exchange.";
      p.path = [point(x+2, Math.min(89, y+(pass?4:2)))];
    } else if (pass) {
      p.duty = "route"; p.assignment = "Release into an example receiving lane.";
      const outside = x < 19 || x > 81;
      p.path = [point(x,y-10),point(x+(outside ? inside*5 : -inside*8), y-(outside ? 34 : p.group === "RB" ? 23 : 29))];
    } else {
      p.duty = "block"; p.assignment = "Work toward an example run block.";
      p.path = [point(x+inside*2,y-4),point(x+inside*5,y-9)];
    }
  }
}

function specialPaths(players: FullSnapPlayer[], kind: KickKind) {
  for (const p of players) {
    const [x,y] = p.start;
    if (p.id === "O-kicker") { p.duty = "kick"; p.assignment = "Approach and kick."; p.path = [point(50, kind === "kickoff" ? 65 : kind === "punt" ? 85 : 80)]; }
    else if (p.unit === "O") {
      const covers = kind === "kickoff" || kind === "punt";
      p.duty = covers ? "support" : "block"; p.assignment = covers ? "Advance in an example kick-coverage lane." : "Protect the kick.";
      p.path = [point(x,y-5), point(x+(50-x)*.16, y-(covers ? 17 : 7))];
    } else if (p.id === "X-returner") {
      p.duty = "return"; p.assignment = "Track the kick from a deep receiving position."; p.path = [point(x+3,y+3)];
    } else {
      const kickRush = kind === "fieldGoal" || kind === "extraPoint";
      p.duty = kickRush ? "rush" : "block"; p.assignment = kickRush ? "Attack an example kick-block lane." : "Set up the return.";
      p.path = [point(x+(50-x)*.12,y+(kickRush ? 8 : 4))];
    }
  }
}

function cleveland15(game: Game, p: Snap) {
  return game.source === "nflverse" && game.id === "2022_02_NYJ_CLE" && game.opponent === "CLE" && p.possession === "jets" &&
    p.quarter === 4 && p.yardline === 15 && p.distance === 10 && ["4155","4177","4199"].includes(p.key);
}

function scaleFor(game: Game, p: Snap, old: Chalkboard) {
  const f = p.facts!, k = f.kick;
  if (cleveland15(game,p)) return 3.3;
  if (old.studyId === "sanchez-thanksgiving") return .75;
  const distances = [f.airYards ?? 0, f.simpleAdvance || f.kind === "sack" ? f.yards ?? 0 : 0,
    (f.airYards ?? 0) - (f.interceptionReturnYards ?? 0), k?.kickYards ?? 0, (k?.kickYards ?? 0) - (k?.returnYards ?? 0)];
  return Math.min(4, 52 / Math.max(1,...distances), 23 / Math.max(1,...distances.map(n => -n)));
}

const defenderCredits = { soloTackle: "Solo tackle", tackleWithAssist: "Tackle with help", assistTackle: "Tackle assist", sack: "Sack", halfSack: "Half sack", passDefended: "Pass defended" };

function lineup(game: Game, play: Snap, elliott = false, sanchez = false) {
  const f = play.facts;
  const season = Number(game.id.slice(0,4));
  const o = recordedGroups("O", season, f?.charting?.offensePersonnel, f?.onField?.offense);
  const d = recordedGroups("X", season, f?.charting?.defensePersonnel, f?.onField?.defense);
  const offense = offensiveUnit(o, sanchez ? "I_FORM" : f?.charting?.formation, !!f?.shotgun, elliott);
  const defense = defensiveUnit(d);
  // PFF reported Wilson lined up outside on this snap. Neither his absolute side nor the illustrated release is known.
  const outsideId = cleveland15(game,play) && play.key === "4199" && play.clock === 25 && play.down === 3 ? "00-0037740" : undefined;
  assignMembership(offense, f?.onField?.offense, outsideId);
  assignMembership(defense, f?.onField?.defense);
  return { players:[...offense,...defense], offenseGroups:o, defenseGroups:d };
}

function fieldLines(play: Snap, scale: number): Pick<FullSnapBoard,"gainLine" | "goalLineY"> {
  const lines: Pick<FullSnapBoard,"gainLine" | "goalLineY"> = {};
  if (play.yardline == null || play.yardline <= 0) return lines;
  const goal = lineY - play.yardline * scale;
  if (goal >= 4 && goal < lineY) lines.goalLineY = goal;
  if (play.down && play.distance && play.distance > 0) {
    const goalToGo = play.facts?.goalToGo || play.distance >= play.yardline;
    const gain = goalToGo ? goal : lineY - play.distance * scale;
    if (gain >= 4 && gain < lineY) lines.gainLine = { y:gain, label:goalToGo ? "Goal line" : "Line to gain" };
  }
  return lines;
}

/** Only starting information is read here. No action board, credited player or post-play fact is projected. */
export function beforeFullSnap(game: Game, play: Snap): FullSnapBoard | null {
  if (!play.possession || !play.down || play.distance == null || play.yardline == null) return null;
  const {players,offenseGroups,defenseGroups} = lineup(game,play);
  const scale = cleveland15(game,play) ? 3.3 : Math.min(4,52 / Math.max(12,play.distance));
  const note = players.every(p => p.participantId) ? "The roster identifies all 22 players. Their starting spots are illustrated." :
    offenseGroups.length && defenseGroups.length ? "The charted personnel groups are shown in an example alignment." :
    "Player positions are illustrated. Unrecorded personnel use example units.";
  return { players,lineY,yardsToY:scale,paths:[],events:[],note,...fieldLines(play,scale) };
}

export function fullSnapBoard(game: Game, play: Snap, board: Chalkboard): FullSnapBoard | null {
  const f = play.facts;
  const elliott = board.studyId === "elliott-miami", sanchez = board.studyId === "sanchez-thanksgiving";
  if (!play.possession || !f || (board.kind === "other" && !elliott && !sanchez)) return null;
  const kick = f.kick;
  const scale = scaleFor(game, play, board), y = (d: number) => lineY - d * scale;
  const {players,offenseGroups:o,defenseGroups:d} = kick ? { players:kickUnits(kick.kind, Number(game.id.slice(0,4)) >= 2024),offenseGroups:[],defenseGroups:[] } :
    lineup(game,play,elliott,sanchez);
  const offense = players.filter(p => p.unit === "O"), defense = players.filter(p => p.unit === "X");
  const pass = f.kind === "completion" || f.kind === "incompletion" || f.kind === "interception" || f.kind === "sack";
  const qb = offense.filter(p => p.group === "QB");
  const eligible = offense.filter(p => p.group !== "OL" && p.group !== "QB" || elliott && p.id === "O-y");
  const passer = assignCredit(offense, f.passer, f.kind === "sack" ? "Sacked passer" : "Passer", qb);
  const receiver = assignCredit(offense, f.target, f.kind === "completion" ? "Receiver" : "Intended receiver",
    elliott ? eligible.filter(p => p.id === "O-y") : [...eligible.filter(p => p.group === "WR"), ...eligible]);
  const rusher = assignCredit(offense, sanchez ? "M.Sanchez" : f.rusher, "Ball carrier",
    (sanchez || /\b(?:scrambl\w*|sneak)\b/i.test(play.description)) ? qb : [...eligible.filter(p => p.group === "RB"), ...eligible, ...qb]);
  const taker = assignCredit(defense, sanchez ? "S.Gregory" : f.interceptor, sanchez ? "Fumble recovery and touchdown" : "Interceptor",
    [...defense.filter(p => p.group === "DB"),...defense]);
  const kicker = assignCredit(offense,kick?.kicker,kick?.kind === "punt" ? "Punter" : "Kicker",offense.filter(p => p.id === "O-kicker"));
  const returner = assignCredit(defense,kick?.returner,"Kick receiver",defense.filter(p => p.id === "X-returner"));
  for (const c of f.defenders ?? []) {
    const unit = kick ? offense : defense;
    const preferred = unit.filter(p => kick ? p.id !== "O-kicker" : p.group === (c.role === "passDefended" ? "DB" : c.role === "sack" || c.role === "halfSack" ? "DL" : "LB"));
    assignCredit(unit,c.name,defenderCredits[c.role],[...preferred,...unit]);
  }
  const hit = defense.find(p => !!p.participantId && p.participantId === f.onField?.quarterbackHitBy);
  if (hit) hit.credit = hit.credit ? hit.credit + " · Quarterback hit" : "Quarterback hit";
  if (elliott && receiver) Object.assign(receiver, { position: "Eligible tackle", number: 76 });
  if (sanchez) {
    const guard = offense.find(p => p.id === "O-rg");
    if (guard) Object.assign(guard, { name: "Brandon Moore", position: "RG", number: 65, credit: "Lineman in the collision" });
    if (rusher) Object.assign(rusher, { position: "QB", number: 6, credit: "Run and fumble" });
    if (taker) taker.number = 28;
  }
  if (kick) specialPaths(players,kick.kind);
  else teachingPaths(players,pass, f.charting?.rushers ?? 4, f.charting?.coverage);

  const model: FullSnapBoard = { players, paths: [], events: [], lineY, yardsToY:scale,
    note: kick ? "Example special-teams alignment and assignments. Named credits come from the play account." :
      "Player spacing, routes, blocks and coverage duties are examples. " +
      (players.every(p => p.participantId) ? "The participation and weekly roster records identify all 22 players." :
      o.length && d.length ? "The personnel groups are charted." : !o.length && !d.length ? "The personnel packages are examples." :
        (o.length ? "The offense" : "The defense") + " has recorded personnel. The other unit uses an example package.") };
  if (f.charting?.coverage === "COVER_6") model.note += " The diagram puts quarters on the left and a deep half on the right as one example of Cover 6.";
  else if (f.charting?.coverage === "COVER_2") model.note += " Two deep halves and two outside flats illustrate Cover 2.";
  if (elliott) model.note += " The gamebook records Testaverde’s three-yard touchdown to eligible tackle Jumbo Elliott and the upheld ruling. Catch depth is unavailable.";
  if (sanchez) model.note += " Sanchez’s account identifies the collision with Brandon Moore. The gamebook credits Steve Gregory’s recovery and 32-yard touchdown return.";
  if (!kick) Object.assign(model,fieldLines(play,scale));
  const x = f.direction === "left" ? 23 : f.direction === "right" ? 77 : 50;
  const at = (x: number, yards: number): FullSnapPoint => [x,y(yards)];
  const event = ([x,y]: FullSnapPoint, label: string, shortLabel = label) => model.events.push({ x,y,unit:"ball", label,shortLabel });
  const movement = (from: FullSnapPoint, to: FullSnapPoint, kind: ChalkPath["kind"]) => model.paths.push({ from,to,kind });
  if (sanchez && rusher && taker) {
    const loose = at(50,1), td = at(50,-31);
    model.goalLineY = td[1];
    rusher.path = [loose]; rusher.duty = "carry"; rusher.assignment = "Carry into the documented fumble.";
    taker.path = [loose,td]; taker.duty = "return"; taker.assignment = "Recover the fumble and return it.";
    movement(at(50,0),loose,"carry"); movement(loose,td,"return");
    event(loose,"Fumble and recovery","Recovery"); event(td,"Return touchdown","TD");
  } else if (kick) {
    if (!kicker || kick.kickYards == null) return model;
    const spot = at(50,kick.kickYards);
    movement(end(kicker),spot,"kick");
    if (returner) returner.path = [spot];
    event(spot,kick.touchback ? "Touchback" : kick.outcome === "made" ? "Good" : kick.outcome === "missed" ? "Missed" : "Kick received");
    if (returner && kick.returnYards != null && kick.returnYards !== 0 && !kick.touchback) {
      const finish = at(50,kick.kickYards-kick.returnYards);
      movement(spot,finish,"return"); event(finish,"End of return","Finish");
    }
  } else if (f.kind === "rush" && rusher && f.simpleAdvance && f.yards != null) {
    const finish = at(x,f.yards);
    rusher.duty = "carry"; rusher.assignment = "Carry the ball into the recorded running lane."; rusher.path = [at(50,0),finish];
    movement(at(50,0),finish,"carry"); event(finish,f.touchdown?"Touchdown":"End of run",f.touchdown?"TD":"Finish");
  } else if (f.kind === "sack" && passer && f.yards != null) {
    const finish = at(50,f.yards);
    passer.path = [finish]; event(finish,"Sack spot","Sack");
  } else if (pass && passer) {
    const interception = f.kind === "interception";
    if (!f.direction || f.airYards == null || !receiver || (interception && !taker)) {
      model.directionOnly = f.direction;
      model.unplacedThrow = { depth: f.airYards, targetKnown: !!f.target };
      return model;
    }
    const spot = at(x,f.airYards);
    movement(end(passer),spot,interception ? "interception" : f.kind === "completion" ? "pass" : "incomplete");
    if (interception) {
      taker!.path.push(spot); taker!.assignment = "Break toward the recorded interception.";
      event(spot,"Interception","INT");
      if (f.interceptionReturnYards != null && f.interceptionReturnYards !== 0) {
        const finish = at(x,f.airYards-f.interceptionReturnYards);
        movement(spot,finish,"return"); event(finish,"End of interception return","Finish");
      }
    } else {
      if (f.kind === "completion") receiver!.path = [receiver!.path[0] ?? receiver!.start,spot];
      if (board.wilsonStudy) receiver!.assignment = "Release from an outside alignment and break inside. The route label is disputed.";
      event(spot,f.kind === "completion" ? "Catch" : "Incomplete pass",f.kind === "completion" ? "Catch" : "Incomplete");
      if (f.kind === "completion" && f.simpleAdvance && f.afterCatch != null && f.airYards + f.afterCatch === f.yards) {
        if (f.afterCatch !== 0) {
          const finish = at(x,f.yards);
          movement(spot,finish,"carry"); event(finish,f.touchdown?"Touchdown":"End of carry",f.touchdown?"TD":"Finish");
        } else if (f.touchdown) model.events[0] = {...model.events[0],label:"Touchdown catch",shortLabel:"TD"};
      }
    }
  }
  return model;
}
