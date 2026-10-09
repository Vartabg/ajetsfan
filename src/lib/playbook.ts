/**
 * An editable teaching diagram, independent of the historical film cases.
 * Coordinates are board units, not player tracking, yards or a physics model.
 * Offense moves toward decreasing y; marker centers sit 10 units behind the LOS.
 */
import { FIELD } from "./playbook-field";
export { FIELD } from "./playbook-field";
export { sampleBall, samplePlayer } from "./playbook-sampling";

export type Point = { x: number; y: number };
/** A bounded teaching interval; not measured player-tracking time. */
export type MotionWindow = { from: number; to: number };
export type PlaybookPlayer = Point & {
  id: string;
  label: string;
  side: "offense" | "defense";
  eligible: boolean;
  /** Route destinations, excluding the starting position. */
  path: Point[];
  /** Hold the start/end outside this interval; omitted means the whole board timeline. */
  motionWindow?: MotionWindow;
};
/** Explicit schematic possession changes, throws and loose-ball motion. */
export type BallEvent =
  | { at: number; kind: "carry"; carrierId: string }
  | { at: number; kind: "flight"; until: number; targetId: string }
  | { at: number; kind: "loose"; until: number; to: Point };
export type PlayDesign = {
  version: 1;
  name: string;
  offenseId: string;
  defenseId: string;
  conceptId: string;
  players: PlaybookPlayer[];
  ball: { carrierId: string; targetId: string; releaseAt: number };
  /** Optional archive association; source fidelity is checked against the canonical design. */
  archiveId?: string;
  /** Distinguishes a complete illustrative study from the source-action board. */
  studyMode?: "full-snap";
  /** Overrides the simple ball model; begins with carry at zero and permits either team. */
  ballEvents?: BallEvent[];
};
export type PlaybookFormation = {
  id: string;
  label: string;
  personnel: string;
  description: string;
  players: PlaybookPlayer[];
};

type Position = [id: string, label: string, x: number, y: number];
const lineY = FIELD.lineOfScrimmage + 10;
const offensiveLine: Position[] = [
  ["lt", "LT", 430, lineY], ["lg", "LG", 465, lineY], ["c", "C", 500, lineY],
  ["rg", "RG", 535, lineY], ["rt", "RT", 570, lineY],
];
const marker = (position: Position, side: PlaybookPlayer["side"], eligible = false): PlaybookPlayer => ({
  id: position[0], label: position[1], x: position[2], y: position[3], side, eligible, path: [],
});
const offense = (id: string, label: string, personnel: string, description: string, skill: Position[]): PlaybookFormation => ({
  id, label, personnel, description,
  players: [...offensiveLine.map((position) => marker(position, "offense")), ...skill.map((position) => marker(position, "offense", position[0] !== "qb"))],
});
const defense = (id: string, label: string, personnel: string, description: string, positions: Position[]): PlaybookFormation => ({
  id, label, personnel, description,
  players: positions.map((position, index) => marker([`d${index + 1}`, position[1], position[2], position[3]], "defense")),
});

/**
 * Fixed legal teaching alignments: five interior linemen and two eligible ends
 * on the line, plus a quarterback and three eligible backs. Personnel identifies
 * RB / TE counts; alignment names do not specify the play or protection call.
 */
export const offensiveFormations: PlaybookFormation[] = [
  offense("spread-2x2", "Spread 2×2", "11 · 1 RB / 1 TE", "Shotgun with two receiving threats on each side. The tight end is detached; personnel is still 11.", [
    ["qb", "QB", 500, 455], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, lineY],
    ["y", "Y TE", 720, 407], ["h", "H WR", 280, 407], ["rb", "RB", 425, 470],
  ]),
  offense("trips", "Trips right", "11 · 1 RB / 1 TE", "Three receiving threats to the right, with the isolated X on the left. The inside receivers are off the line.", [
    ["qb", "QB", 500, 455], ["x", "X WR", 90, lineY], ["z", "Z WR", 900, lineY],
    ["y", "Y TE", 665, 407], ["h", "H WR", 780, 415], ["rb", "RB", 425, 470],
  ]),
  offense("bunch", "Bunch right", "11 · 1 RB / 1 TE", "A three-player cluster to the right. The point receiver is on the line; the two behind it stay uncovered.", [
    ["qb", "QB", 500, 455], ["x", "X WR", 90, lineY], ["z", "Z WR", 785, 413],
    ["y", "Y TE", 695, lineY], ["h", "H WR", 675, 428], ["rb", "RB", 425, 485],
  ]),
  offense("empty", "Empty 3×2", "10 · 1 RB / 0 TE", "The running back is split out with four wide receivers. Empty describes the backfield, not zero running backs in the personnel group.", [
    ["qb", "QB", 500, 455], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, lineY],
    ["y", "Y WR", 245, 407], ["h", "H WR", 750, 407], ["rb", "RB", 355, 425],
  ]),
  offense("singleback", "Singleback", "11 · 1 RB / 1 TE", "An under-center quarterback, one deep back and a tight end on the right line end.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, 412],
    ["y", "Y TE", 625, lineY], ["h", "H WR", 270, 412], ["rb", "RB", 500, 545],
  ]),
  offense("ace", "Ace · two tight ends", "12 · 1 RB / 2 TE", "Both tight ends form eligible line ends. The two wide receivers are off the line so neither tight end is covered.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 90, 417], ["z", "Z WR", 910, 417],
    ["y", "Y TE", 395, lineY], ["h", "H TE", 605, lineY], ["rb", "RB", 500, 545],
  ]),
  offense("i-form", "I formation", "21 · 2 RB / 1 TE", "Quarterback, fullback and tailback stacked behind the center. The tight end defines the right side of this example.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, 417],
    ["y", "Y TE", 625, lineY], ["h", "FB", 500, 477], ["rb", "RB", 500, 552],
  ]),
  offense("strong-i", "Strong I", "21 · 2 RB / 1 TE", "The fullback offsets toward the tight-end side. This changes alignment without changing the 21 personnel group.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, 417],
    ["y", "Y TE", 625, lineY], ["h", "FB", 565, 477], ["rb", "RB", 500, 552],
  ]),
  offense("weak-i", "Weak I", "21 · 2 RB / 1 TE", "The fullback offsets away from the tight-end side. The tailback stays behind the quarterback.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, 417],
    ["y", "Y TE", 625, lineY], ["h", "FB", 435, 477], ["rb", "RB", 500, 552],
  ]),
  offense("pistol", "Pistol", "11 · 1 RB / 1 TE", "A short shotgun alignment with the tailback directly behind the quarterback and two threats on each side.", [
    ["qb", "QB", 500, 455], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, lineY],
    ["y", "Y TE", 655, 407], ["h", "H WR", 270, 407], ["rb", "RB", 500, 545],
  ]),
  offense("twins", "I twins left", "21 · 2 RB / 1 TE", "Two wide receivers to the left, a tight end on the right and a two-back under-center backfield.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 90, lineY], ["z", "Z WR", 265, 417],
    ["y", "Y TE", 625, lineY], ["h", "FB", 500, 477], ["rb", "RB", 500, 552],
  ]),
  offense("wing", "Wing right", "12 · 1 RB / 2 TE", "An attached tight end and an off-line wing on the right. The opposite wide receiver supplies the other eligible line end.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 90, lineY], ["z", "Z WR", 910, 417],
    ["y", "Y TE", 625, lineY], ["h", "H TE", 660, 417], ["rb", "RB", 500, 545],
  ]),
  offense("goal-line", "Goal line · heavy", "22 · 2 RB / 2 TE", "Two tight ends are the eligible line ends, with a fullback, tailback and off-line wide receiver behind them.", [
    ["qb", "QB", 500, 412], ["x", "X WR", 275, 417], ["z", "Z TE", 605, lineY],
    ["y", "Y TE", 395, lineY], ["h", "FB", 500, 477], ["rb", "RB", 500, 552],
  ]),
];

const fourDown: Position[] = [["", "LDE", 380, 341], ["", "LDT", 465, 341], ["", "RDT", 535, 341], ["", "RDE", 620, 341]];
const threeDown: Position[] = [["", "LDE", 400, 341], ["", "NT", 500, 341], ["", "RDE", 600, 341]];
const corners: Position[] = [["", "LCB", 130, 239], ["", "RCB", 870, 239]];
const safeties: Position[] = [["", "FS", 350, 145], ["", "SS", 650, 145]];
export const defensiveFormations: PlaybookFormation[] = [
  defense("four-three", "4–3", "4 DL / 3 LB / 4 DB", "Four down linemen and three linebackers. Front and personnel alone do not identify the rush count or coverage.", [
    ...fourDown, ["", "WLB", 395, 285], ["", "MLB", 500, 269], ["", "SLB", 605, 285], ...corners, ...safeties,
  ]),
  defense("three-four", "3–4", "3 DL / 4 LB / 4 DB", "Three down linemen and four linebackers. Outside linebackers can rush or drop; the teaching paths are editable.", [
    ...threeDown, ["", "LOLB", 325, 289], ["", "LILB", 440, 265], ["", "RILB", 560, 265], ["", "ROLB", 675, 289], ...corners, ...safeties,
  ]),
  defense("nickel", "Nickel · 4–2–5", "4 DL / 2 LB / 5 DB", "Five defensive backs in this four-down example. Nickel is a personnel grouping, not a coverage call.", [
    ...fourDown, ["", "WLB", 445, 275], ["", "MLB", 555, 275], ...corners, ["", "NB", 745, 280], ...safeties,
  ]),
  defense("dime", "Dime · 4–1–6", "4 DL / 1 LB / 6 DB", "Six defensive backs in this four-down example, with two inside defensive backs and one linebacker.", [
    ...fourDown, ["", "MLB", 500, 275], ...corners, ["", "LNB", 265, 280], ["", "RNB", 735, 280], ...safeties,
  ]),
  defense("three-three-five", "3–3–5", "3 DL / 3 LB / 5 DB", "Three down linemen, three linebackers and five defensive backs. Many different pressures and coverages can start here.", [
    ...threeDown, ["", "WLB", 365, 285], ["", "MLB", 500, 265], ["", "SLB", 635, 285], ...corners, ["", "NB", 745, 280], ...safeties,
  ]),
  defense("bear", "Bear · 5–2 teaching front", "5 DL / 2 LB / 4 DB", "A five-man example with the center and both guards covered. Bear describes an alignment; this is not the complete 46 defense.", [
    ["", "LDE", 330, 341], ["", "LDT", 445, 341], ["", "NT", 500, 341], ["", "RDT", 555, 341], ["", "RDE", 670, 341],
    ["", "WLB", 445, 270], ["", "MLB", 555, 270], ...corners, ...safeties,
  ]),
  defense("goal-line", "Goal line · 6–3–2", "6 DL / 3 LB / 2 DB", "A heavy six-down teaching front with three linebackers and two defensive backs. Other goal-line packages are possible.", [
    ["", "LDE", 335, 341], ["", "LT", 400, 341], ["", "LDT", 465, 341], ["", "RDT", 535, 341], ["", "RT", 600, 341], ["", "RDE", 665, 341],
    ["", "WLB", 400, 265], ["", "MLB", 500, 265], ["", "SLB", 600, 265], ...corners,
  ]),
];

export const concepts = [
  { id: "four-verts", label: "Four verticals", description: "Four eligible receivers stretch vertically; the running back releases underneath. Spacing and assignments are teaching examples." },
  { id: "mesh", label: "Mesh", description: "Two shallow crossers travel in opposite directions, with routes above and outside them. Watch where their paths intersect; no collision or separation is predicted." },
  { id: "flood", label: "Flood right", description: "A deep route, an intermediate out and a flat route stretch the right side at three depths. The backside receiver works away from that combination." },
  { id: "slants", label: "Slant / flat", description: "Inward slants pair with outward flat releases. The spacing changes with the formation; this is a route example, not a prescribed quarterback read." },
  { id: "stick", label: "Stick", description: "A short settling route pairs with a flat release and a vertical clear-out. The underneath defender’s response is something to study on actual tape." },
  { id: "inside-zone", label: "Inside zone", description: "An illustrative handoff and interior run track, with short forward line paths. Blocking fits, reads and contact are not simulated." },
  { id: "play-action", label: "Play action", description: "A schematic backfield fake accompanies a deep over route and a post. Animation timing illustrates the idea and does not reproduce an NFL play." },
  { id: "smash", label: "Smash", description: "A short outside curl sits beneath a corner route. The two routes create a vertical stretch; route depths are editable." },
] as const;

export const routePatterns = [
  { id: "go", label: "Go" }, { id: "slant", label: "Slant" }, { id: "out", label: "Out" },
  { id: "in", label: "In / dig" }, { id: "curl", label: "Curl" }, { id: "post", label: "Post" },
  { id: "corner", label: "Corner" }, { id: "flat", label: "Flat" }, { id: "stay", label: "Stay" },
] as const;
export type RoutePatternId = typeof routePatterns[number]["id"];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const destination = (x: number, y: number): Point => ({ x: clamp(x, 20, FIELD.width - 20), y: clamp(y, 20, FIELD.height - 20) });
/** Quick route shapes use the selected player's side of the field. */
export function routeForPlayer(player: PlaybookPlayer, patternId: string): Point[] {
  const inward = player.x <= FIELD.width / 2 ? 1 : -1;
  const { x, y } = player;
  switch (patternId) {
    case "go": return [destination(x, y - 100), destination(x, 45)];
    case "slant": return [destination(x, y - 45), destination(x + inward * 165, y - 170)];
    case "out": return [destination(x, y - 130), destination(x - inward * 175, y - 130)];
    case "in": return [destination(x, y - 130), destination(x + inward * 220, y - 130)];
    case "curl": return [destination(x, y - 180), destination(x + inward * 20, y - 155)];
    case "post": return [destination(x, y - 130), destination(x + inward * 220, 45)];
    case "corner": return [destination(x, y - 130), destination(x - inward * 200, 60)];
    case "flat": return [destination(x - inward * 75, Math.min(y - 30, FIELD.lineOfScrimmage - 20)), destination(x - inward * 220, Math.min(y - 30, FIELD.lineOfScrimmage - 20))];
    default: return [];
  }
}

function conceptPath(player: PlaybookPlayer, conceptId: string, receivers: PlaybookPlayer[]): Point[] {
  const { id, x, y } = player;
  const inward = x <= FIELD.width / 2 ? 1 : -1;
  if (id === "qb") {
    if (conceptId === "inside-zone") return [destination(515, y + 22), destination(475, y + 42)];
    if (conceptId === "play-action") return [destination(515, y + 32), destination(500, Math.min(y + 55, 535))];
    return [destination(x, Math.min(y + 40, 530))];
  }
  if (!player.eligible) {
    // Pass protection stays near/behind the original LOS, rather than showing an illegal downfield release.
    return conceptId === "inside-zone"
      ? [destination(x + (x < 500 ? 10 : -10), lineY - 40)]
      : [destination(x + (x < 500 ? -8 : 8), lineY + 22)];
  }
  if (conceptId === "inside-zone") {
    if (id === "rb") return [destination(510, lineY + 72), destination(515, lineY - 35), destination(540, 180)];
    if (id === "h" && player.label === "FB") return [destination(530, lineY + 25), destination(550, lineY - 35)];
    return [destination(x + inward * 12, Math.max(y - 35, 310))];
  }
  if (id === "rb") {
    if (conceptId === "play-action") return [destination(510, lineY + 72), destination(485, lineY - 25), destination(330, 280)];
    return [destination(x - inward * 85, lineY + 8), destination(x - inward * 210, 300)];
  }
  const receiverIndex = receivers.findIndex((receiver) => receiver.id === id);
  switch (conceptId) {
    case "mesh":
      if (receiverIndex === 0) return [destination(x, 265), destination(825, 245)];
      if (receiverIndex === 3) return [destination(x, 255), destination(175, 255)];
      if (receiverIndex === 2) return [destination(x, 180), destination(500, 165)];
      return routeForPlayer(player, "corner");
    case "flood":
      if (receiverIndex === 3) return [destination(Math.max(x, 725), 210), destination(875, 45)];
      if (receiverIndex === 2) return [destination(Math.max(x, 645), 205), destination(845, 205)];
      if (receiverIndex === 1) return [destination(665, 310), destination(875, 305)];
      return routeForPlayer(player, "post");
    case "slants": return receiverIndex === 0 || receiverIndex === 3 ? routeForPlayer(player, "slant") : routeForPlayer(player, "flat");
    case "stick":
      if (receiverIndex === 2) return [destination(x, 285), destination(x + inward * 30, 292)];
      if (receiverIndex === 3) return routeForPlayer(player, "go");
      if (receiverIndex === 1) return routeForPlayer(player, "flat");
      return routeForPlayer(player, "curl");
    case "play-action":
      if (receiverIndex === 2) return [destination(x, 210), destination(250, 170)];
      if (receiverIndex === 3) return routeForPlayer(player, "post");
      return receiverIndex === 0 ? routeForPlayer(player, "go") : routeForPlayer(player, "flat");
    case "smash": return receiverIndex === 0 || receiverIndex === 3 ? routeForPlayer(player, "curl") : routeForPlayer(player, "corner");
    default: return routeForPlayer(player, "go");
  }
}

const downCount: Record<string, number> = { "four-three": 4, "three-four": 3, nickel: 4, dime: 4, "three-three-five": 3, bear: 5, "goal-line": 6 };
const releaseTimes: Record<string, number> = { "four-verts": 2.6, mesh: 2.2, flood: 2.6, slants: 1.5, stick: 1.8, "inside-zone": .9, "play-action": 2.7, smash: 2.5 };

export function createPlay(offenseId = "spread-2x2", defenseId = "nickel", conceptId = "four-verts"): PlayDesign {
  const attack = offensiveFormations.find((item) => item.id === offenseId) ?? offensiveFormations[0];
  const front = defensiveFormations.find((item) => item.id === defenseId) ?? defensiveFormations.find((item) => item.id === "nickel")!;
  const concept = concepts.find((item) => item.id === conceptId) ?? concepts[0];
  const quarterback = attack.players.find((player) => player.id === "qb")!;
  const receivers = attack.players.filter((player) => player.eligible && player.id !== "rb").sort((a, b) => a.x - b.x);
  const target = concept.id === "inside-zone" ? "rb" : concept.id === "four-verts" ? "y"
    : concept.id === "mesh" || concept.id === "slants" ? receivers[0].id : receivers[2].id;
  return {
    version: 1,
    name: `${attack.label} · ${concept.label}`,
    offenseId: attack.id, defenseId: front.id, conceptId: concept.id,
    players: [
      ...attack.players.map((player) => ({ ...player, path: conceptPath(player, concept.id, receivers) })),
      ...front.players.map((player, index) => ({ ...player, path: index < downCount[front.id]
        ? [destination(player.x, lineY - 10), destination(quarterback.x + (player.x < 500 ? -65 : 65), quarterback.y - 12)]
        : [destination(player.x + (player.x < 500 ? -20 : 20), Math.max(45, player.y - 55))] })),
    ],
    ball: { carrierId: "qb", targetId: target, releaseAt: releaseTimes[concept.id] },
  };
}

/** A limited alignment check for marker drawings; not a full NFL rules ruling. */
export function formationWarnings(design: PlayDesign): string[] {
  const players = design.players.filter((player) => player.side === "offense");
  const line = players.filter((player) => Math.abs(player.y - lineY) <= 10).sort((a, b) => a.x - b.x);
  const warnings: string[] = [];
  if (players.some((player) => player.y < FIELD.lineOfScrimmage)) warnings.push("An offensive marker is across the line of scrimmage.");
  if (line.length < 7) warnings.push("This drawing has fewer than seven offensive players on the line.");
  if (line.length && (!line[0].eligible || !line[line.length - 1].eligible)) warnings.push("Both ends of the offensive line must be eligible receivers in this teaching model.");
  if (line.slice(1, -1).some((player) => player.eligible)) warnings.push("An eligible marker is covered by another player on the line; move it off the line or to an end.");
  return warnings;
}

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}
function optionalKeys(value: Record<string, unknown>, required: string[], optional: string[]): boolean {
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
function finiteTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= FIELD.duration;
}
function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value);
}
function point(value: unknown): value is Point {
  return record(value) && keys(value, ["x", "y"]) && typeof value.x === "number" && typeof value.y === "number"
    && Number.isFinite(value.x) && Number.isFinite(value.y)
    && value.x >= 0 && value.x <= FIELD.width && value.y >= 0 && value.y <= FIELD.height;
}
const known = (value: unknown, choices: readonly { id: string }[]): value is string => typeof value === "string" && choices.some((choice) => choice.id === value);

/**
 * Validate untrusted saved/shared JSON and return a fresh object with only known
 * fields. It checks data structure and bounds, not custom formation legality.
 */
export function validatePlayDesign(value: unknown): PlayDesign | null {
  if (!record(value) || !optionalKeys(value, ["version", "name", "offenseId", "defenseId", "conceptId", "players", "ball"], ["archiveId", "ballEvents", "studyMode"])
    || value.version !== 1 || !safeText(value.name, 80)
    || !known(value.offenseId, offensiveFormations) || !known(value.defenseId, defensiveFormations) || !known(value.conceptId, concepts)
    || !Array.isArray(value.players) || value.players.length !== 22) return null;
  const players: PlaybookPlayer[] = [];
  const ids = new Set<string>();
  for (const player of value.players) {
    if (!record(player) || !optionalKeys(player, ["id", "label", "side", "eligible", "x", "y", "path"], ["motionWindow"])
      || typeof player.id !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(player.id) || ids.has(player.id)
      || !safeText(player.label, 24) || (player.side !== "offense" && player.side !== "defense") || typeof player.eligible !== "boolean"
      || !point({ x: player.x, y: player.y }) || !Array.isArray(player.path) || player.path.length > 12 || !Array.from(player.path).every(point)) return null;
    ids.add(player.id);
    let motionWindow: MotionWindow | undefined;
    if (Object.hasOwn(player, "motionWindow")) {
      const window = player.motionWindow;
      if (!record(window) || !keys(window, ["from", "to"]) || !finiteTime(window.from) || !finiteTime(window.to) || window.from >= window.to) return null;
      motionWindow = { from: window.from, to: window.to };
    }
    players.push({ id: player.id, label: player.label.trim(), side: player.side, eligible: player.eligible, x: player.x as number, y: player.y as number, path: player.path.map((entry) => ({ x: entry.x, y: entry.y })), ...(motionWindow ? { motionWindow } : {}) });
  }
  const attacking = players.filter((player) => player.side === "offense");
  const defending = players.filter((player) => player.side === "defense");
  if (attacking.length !== 11 || defending.length !== 11 || attacking.filter((player) => player.eligible).length !== 5 || defending.some((player) => player.eligible)) return null;
  if (!record(value.ball) || !keys(value.ball, ["carrierId", "targetId", "releaseAt"])
    || typeof value.ball.carrierId !== "string" || typeof value.ball.targetId !== "string"
    || typeof value.ball.releaseAt !== "number" || !Number.isFinite(value.ball.releaseAt) || value.ball.releaseAt < 0 || value.ball.releaseAt > FIELD.duration - .6) return null;
  const { carrierId, targetId, releaseAt } = value.ball;
  if (!attacking.some((player) => player.id === carrierId) || !attacking.some((player) => player.id === targetId && player.eligible)) return null;
  let archiveId: string | undefined;
  if (Object.hasOwn(value, "archiveId")) {
    if (typeof value.archiveId !== "string" || !/^[a-z0-9-]{1,64}$/.test(value.archiveId)) return null;
    archiveId = value.archiveId;
  }
  if (Object.hasOwn(value, "studyMode") && (value.studyMode !== "full-snap" || !archiveId)) return null;
  let ballEvents: BallEvent[] | undefined;
  if (Object.hasOwn(value, "ballEvents")) {
    if (!Array.isArray(value.ballEvents) || !value.ballEvents.length || value.ballEvents.length > 12) return null;
    ballEvents = [];
    for (const event of value.ballEvents) {
      if (!record(event) || !finiteTime(event.at) || (ballEvents.length && event.at <= ballEvents[ballEvents.length - 1].at)) return null;
      if (event.kind === "carry") {
        if (!keys(event, ["at", "kind", "carrierId"]) || typeof event.carrierId !== "string" || !ids.has(event.carrierId)) return null;
        ballEvents.push({ at: event.at, kind: "carry", carrierId: event.carrierId });
      } else if (event.kind === "flight") {
        if (!keys(event, ["at", "kind", "until", "targetId"]) || !finiteTime(event.until) || event.until <= event.at
          || typeof event.targetId !== "string" || !ids.has(event.targetId)) return null;
        ballEvents.push({ at: event.at, kind: "flight", until: event.until, targetId: event.targetId });
      } else if (event.kind === "loose") {
        if (!keys(event, ["at", "kind", "until", "to"]) || !finiteTime(event.until) || event.until <= event.at || !point(event.to)) return null;
        ballEvents.push({ at: event.at, kind: "loose", until: event.until, to: { x: event.to.x, y: event.to.y } });
      } else return null;
    }
    if (ballEvents[0].at !== 0 || ballEvents[0].kind !== "carry"
      || ballEvents.some((event, index) => event.kind !== "carry" && ballEvents![index + 1] && event.until > ballEvents![index + 1].at)) return null;
  }
  return {
    version: 1, name: value.name.trim(), offenseId: value.offenseId, defenseId: value.defenseId, conceptId: value.conceptId, players,
    ball: { carrierId, targetId, releaseAt },
    ...(archiveId ? { archiveId } : {}), ...(value.studyMode === "full-snap" ? { studyMode: "full-snap" } : {}), ...(ballEvents ? { ballEvents } : {}),
  };
}
