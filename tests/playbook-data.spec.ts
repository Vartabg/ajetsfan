import { test, expect } from "@playwright/test";
import { isDeepStrictEqual } from "node:util";
import {
  FIELD, concepts, createPlay, defensiveFormations, formationWarnings, offensiveFormations,
  routeForPlayer, routePatterns, sampleBall, samplePlayer, validatePlayDesign,
  type PlayDesign, type PlaybookPlayer, type Point,
} from "../src/lib/playbook";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const inBounds = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= 0 && point.x <= FIELD.width && point.y >= 0 && point.y <= FIELD.height;
const receiverIds = ["h", "rb", "x", "y", "z"];
const sortedReceivers = (play: PlayDesign) => play.players.filter((player) => player.side === "offense" && player.eligible && player.id !== "rb").sort((a, b) => a.x - b.x);
const last = (player: PlaybookPlayer) => player.path[player.path.length - 1];

test("each offense family has seven on the line with eligible ends and personnel matching its players", () => {
  expect(offensiveFormations).toHaveLength(13);
  expect(new Set(offensiveFormations.map((formation) => formation.id)).size).toBe(offensiveFormations.length);
  for (const formation of offensiveFormations) {
    const players = formation.players;
    expect(players).toHaveLength(11);
    expect(new Set(players.map((player) => player.id)).size).toBe(11);
    expect(players.every((player) => player.side === "offense" && inBounds(player) && !player.path.length)).toBe(true);
    expect(players.filter((player) => player.eligible).map((player) => player.id).sort()).toEqual(receiverIds);
    const line = players.filter((player) => player.y === FIELD.lineOfScrimmage + 10).sort((a, b) => a.x - b.x);
    expect(line).toHaveLength(7);
    expect(line[0].eligible).toBe(true);
    expect(line[6].eligible).toBe(true);
    expect(line.slice(1, -1).map((player) => player.id)).toEqual(["lt", "lg", "c", "rg", "rt"]);
    expect(players.filter((player) => player.y > FIELD.lineOfScrimmage + 20)).toHaveLength(4);
    expect(formationWarnings(createPlay(formation.id))).toEqual([]);
    const runningBacks = players.filter((player) => player.label === "RB" || player.label === "FB").length;
    const tightEnds = players.filter((player) => player.label.endsWith(" TE")).length;
    expect(formation.personnel.slice(0, 2)).toBe(`${runningBacks}${tightEnds}`);
    expect(players.filter((player) => player.label.endsWith(" WR")).length).toBe(5 - runningBacks - tightEnds);
  }
  const empty = offensiveFormations.find((formation) => formation.id === "empty")!;
  expect(empty.personnel.startsWith("10")).toBe(true);
  expect(empty.players.find((player) => player.id === "rb")!.x).not.toBe(500);
  expect(empty.players.filter((player) => player.label.endsWith(" TE"))).toHaveLength(0);
});

test("defensive personnel counts match the named fronts without claiming a coverage call", () => {
  const expected: Record<string, number[]> = {
    "four-three": [4, 3, 4], "three-four": [3, 4, 4], nickel: [4, 2, 5], dime: [4, 1, 6],
    "three-three-five": [3, 3, 5], bear: [5, 2, 4], "goal-line": [6, 3, 2],
  };
  expect(defensiveFormations).toHaveLength(7);
  for (const formation of defensiveFormations) {
    expect(formation.players).toHaveLength(11);
    expect(formation.players.map((player) => player.id)).toEqual(Array.from({ length: 11 }, (_, index) => `d${index + 1}`));
    expect(formation.players.every((player) => player.side === "defense" && !player.eligible && inBounds(player) && player.y < FIELD.lineOfScrimmage)).toBe(true);
    const linebackers = formation.players.filter((player) => player.label.endsWith("LB")).length;
    const defensiveBacks = formation.players.filter((player) => /CB$|NB$|^(FS|SS)$/.test(player.label)).length;
    expect([11 - linebackers - defensiveBacks, linebackers, defensiveBacks]).toEqual(expected[formation.id]);
  }
  expect(defensiveFormations.find((formation) => formation.id === "bear")!.description).toContain("not the complete 46");
});

test("every formation / front / concept combination validates and samples inside the field", () => {
  const before = JSON.stringify([offensiveFormations, defensiveFormations]);
  const failures: string[] = [];
  for (const attack of offensiveFormations) for (const front of defensiveFormations) for (const concept of concepts) {
    const design = createPlay(attack.id, front.id, concept.id);
    const validDesign = design.players.length === 22 && isDeepStrictEqual(validatePlayDesign(design), design)
      && !formationWarnings(design).length && design.players.find((player) => player.id === design.ball.targetId)?.eligible;
    const validSamples = design.players.every((player) => {
      const start = samplePlayer(player, 0);
      const finish = samplePlayer(player, FIELD.duration);
      const end = player.path.length ? last(player) : player;
      return player.path.length <= 12 && player.path.every(inBounds)
        && start.x === player.x && start.y === player.y && finish.x === end.x && finish.y === end.y
        && [1.2, 3, 5.4].every((time) => inBounds(samplePlayer(player, time)));
    });
    const validBall = [0, design.ball.releaseAt, design.ball.releaseAt + .3, design.ball.releaseAt + .6, FIELD.duration].every((time) => inBounds(sampleBall(design, time)));
    if (!validDesign || !validSamples || !validBall) failures.push(`${attack.id} / ${front.id} / ${concept.id}`);
  }
  expect(failures).toEqual([]);
  expect(JSON.stringify([offensiveFormations, defensiveFormations])).toBe(before);
  expect(createPlay("unknown", "unknown", "unknown")).toEqual(createPlay());
  const changed = createPlay();
  changed.players[0].x = 25;
  changed.players[0].path[0].y = 35;
  expect(createPlay().players[0].x).toBe(430);
  expect(createPlay().players[0].path[0].y).toBe(392);
});

test("player playback follows distance rather than treating unequal segments as equal time", () => {
  const player: PlaybookPlayer = { id: "x", label: "X", side: "offense", eligible: true, x: 100, y: 100, path: [{ x: 200, y: 100 }, { x: 200, y: 400 }] };
  expect(samplePlayer(player, 1.5)).toEqual({ x: 200, y: 100 });
  expect(samplePlayer(player, 3)).toEqual({ x: 200, y: 200 });
  expect(samplePlayer(player, -10)).toEqual({ x: 100, y: 100 });
  expect(samplePlayer(player, Number.NaN)).toEqual({ x: 100, y: 100 });
  expect(samplePlayer(player, -Infinity)).toEqual({ x: 100, y: 100 });
  expect(samplePlayer(player, 60)).toEqual({ x: 200, y: 400 });
  expect(samplePlayer(player, Infinity)).toEqual({ x: 200, y: 400 });
  expect(samplePlayer({ ...player, path: [] }, 3)).toEqual({ x: 100, y: 100 });
  expect(samplePlayer({ ...player, path: [{ x: 100, y: 100 }, ...player.path] }, 3)).toEqual({ x: 200, y: 200 });
  expect(samplePlayer({ ...player, path: [{ x: 100, y: 100 }] }, 3)).toEqual({ x: 100, y: 100 });
});

test("ball playback follows the carrier, interpolates to the catch point, then follows the target", () => {
  const design = createPlay();
  Object.assign(design.players.find((player) => player.id === "qb")!, { x: 0, y: 0, path: [{ x: 600, y: 0 }] });
  Object.assign(design.players.find((player) => player.id === "y")!, { x: 100, y: 100, path: [{ x: 100, y: 500 }] });
  design.ball.releaseAt = 2.4;
  expect(sampleBall(design, 1.2)).toEqual({ x: 120, y: 0 });
  expect(sampleBall(design, 2.4)).toEqual({ x: 240, y: 0 });
  const middle = sampleBall(design, 2.7);
  expect(middle.x).toBeCloseTo(170);
  expect(middle.y).toBeCloseTo(150);
  expect(sampleBall(design, 3)).toEqual({ x: 100, y: 300 });
  expect(sampleBall(design, 6)).toEqual({ x: 100, y: 500 });
  expect(sampleBall(design, 99)).toEqual({ x: 100, y: 500 });
  expect(sampleBall(design, Number.NaN)).toEqual({ x: 0, y: 0 });
  const run = createPlay("i-form", "goal-line", "inside-zone");
  expect(run.ball.targetId).toBe("rb");
  expect(sampleBall(run, 6)).toEqual(samplePlayer(run.players.find((player) => player.id === "rb")!, 6));
});

test("quick routes mirror breaks, clamp extreme alignments and hold still when asked", () => {
  const player = createPlay().players.find((item) => item.id === "x")!;
  for (const pattern of routePatterns) for (const position of [{ x: 1, y: 1 }, { x: 999, y: 619 }, { x: 500, y: 370 }]) {
    const path = routeForPlayer({ ...player, ...position }, pattern.id);
    expect(path.length).toBeLessThanOrEqual(12);
    expect(path.every(inBounds)).toBe(true);
  }
  const left = routeForPlayer({ ...player, x: 100, y: 400 }, "slant");
  const right = routeForPlayer({ ...player, x: 900, y: 400 }, "slant");
  expect(left[1].x).toBe(265);
  expect(right[1].x).toBe(735);
  expect(left[1].y).toBe(right[1].y);
  expect(routeForPlayer(player, "stay")).toEqual([]);
  expect(routeForPlayer(player, "malformed")).toEqual([]);
});

test("mesh and flood preserve their shapes when receivers start in twins or heavy alignments", () => {
  for (const formation of offensiveFormations) {
    const mesh = createPlay(formation.id, "nickel", "mesh");
    const crossing = sortedReceivers(mesh);
    expect(last(crossing[0]).x).toBeGreaterThan(crossing[0].x);
    expect(last(crossing[3]).x).toBeLessThan(crossing[3].x);
    expect(last(crossing[0]).y).toBe(245);
    expect(last(crossing[3]).y).toBe(255);
    const flood = createPlay(formation.id, "nickel", "flood");
    const levels = sortedReceivers(flood);
    expect(last(levels[3])).toEqual({ x: 875, y: 45 });
    expect(last(levels[2])).toEqual({ x: 845, y: 205 });
    expect(last(levels[1])).toEqual({ x: 875, y: 305 });
    expect(flood.ball.targetId).toBe(levels[2].id);
  }
  for (const concept of concepts.filter((item) => item.id !== "inside-zone")) {
    const play = createPlay("goal-line", "bear", concept.id);
    for (const player of play.players.filter((item) => item.side === "offense" && !item.eligible && item.id !== "qb")) {
      expect(player.path.every((point) => point.y >= FIELD.lineOfScrimmage)).toBe(true);
    }
  }
});

test("untrusted designs reject malformed structure, unsafe text, oversized paths and illegal ball references", () => {
  const valid = createPlay();
  const replacePlayer = (change: Record<string, unknown>, index = 0) => ({ ...valid, players: valid.players.map((player, playerIndex) => playerIndex === index ? { ...player, ...change } : player) });
  const replaceBall = (change: Record<string, unknown>) => ({ ...valid, ball: { ...valid.ball, ...change } });
  const sparsePath = new Array(2) as Point[];
  const malformed: unknown[] = [
    undefined, null, [], 12, "play", { ...valid, version: 2 }, { ...valid, name: "" }, { ...valid, name: "   " },
    { ...valid, name: "x".repeat(81) }, { ...valid, name: "<script>" }, { ...valid, name: "bad\nname" },
    { ...valid, offenseId: "other" }, { ...valid, defenseId: "other" }, { ...valid, conceptId: "other" },
    { ...valid, extra: true }, { ...valid, players: valid.players.slice(1) }, { ...valid, players: [...valid.players, valid.players[0]] },
    { ...valid, players: "players" }, { ...valid, ball: null }, replacePlayer({ id: valid.players[1].id }), replacePlayer({ id: "../file" }),
    replacePlayer({ id: "x".repeat(33) }), replacePlayer({ label: "" }), replacePlayer({ label: "x".repeat(25) }), replacePlayer({ label: "<img>" }),
    replacePlayer({ side: "spectator" }), replacePlayer({ side: "defense" }), replacePlayer({ eligible: true }), replacePlayer({ eligible: "false" }),
    replacePlayer({ x: -1 }), replacePlayer({ x: 1001 }), replacePlayer({ x: "430" }), replacePlayer({ x: NaN }), replacePlayer({ y: Infinity }),
    replacePlayer({ y: -1 }), replacePlayer({ y: 621 }), replacePlayer({ path: null }), replacePlayer({ path: sparsePath }),
    replacePlayer({ path: Array.from({ length: 13 }, () => ({ x: 20, y: 20 })) }), replacePlayer({ path: [{ x: 20, y: -1 }] }),
    replacePlayer({ path: [{ x: 20, y: Infinity }] }), replacePlayer({ path: [{ x: 20, y: 20, extra: true }] }), replacePlayer({ extra: true }),
    replaceBall({ targetId: "lt" }), replaceBall({ targetId: "d1" }), replaceBall({ targetId: "missing" }), replaceBall({ carrierId: "d1" }),
    replaceBall({ carrierId: "missing" }), replaceBall({ releaseAt: -.1 }), replaceBall({ releaseAt: 5.5 }), replaceBall({ releaseAt: NaN }),
    replaceBall({ releaseAt: Infinity }), replaceBall({ releaseAt: "2" }), replaceBall({ extra: true }),
    replacePlayer({ eligible: true }, 11),
    Object.assign(Object.create({ inherited: true }) as object, valid),
  ];
  for (const value of malformed) expect(validatePlayDesign(value)).toBeNull();
  const validName = { ...valid, name: "Jets · 2×2 — test (custom)" };
  expect(validatePlayDesign(validName)?.name).toBe(validName.name);
  for (const time of [0, 5.4]) expect(validatePlayDesign(replaceBall({ releaseAt: time }))).not.toBeNull();
  expect(validatePlayDesign(replacePlayer({ path: Array.from({ length: 12 }, (_, index) => ({ x: 20 + index, y: 20 })) }))).not.toBeNull();
});

test("saved designs round-trip independently and warn about covered or missing line players after custom edits", () => {
  const original = createPlay("ace", "three-four", "mesh");
  const saved = validatePlayDesign(JSON.parse(JSON.stringify(original)))!;
  expect(saved).toEqual(original);
  saved.players[0].x = 30;
  saved.players[0].path[0].y = 25;
  expect(original.players[0].x).toBe(430);
  expect(original.players[0].path[0].y).toBe(392);
  const missing = clone(original);
  missing.players.find((player) => player.id === "y")!.y = 420;
  expect(validatePlayDesign(missing)).not.toBeNull();
  expect(formationWarnings(missing).join(" ")).toContain("fewer than seven");
  const covered = clone(original);
  covered.players.find((player) => player.id === "x")!.y = FIELD.lineOfScrimmage + 10;
  expect(formationWarnings(covered).join(" ")).toContain("covered");
  const crossing = clone(original);
  crossing.players.find((player) => player.id === "rb")!.y = FIELD.lineOfScrimmage - 5;
  expect(formationWarnings(crossing).join(" ")).toContain("across the line");
});
