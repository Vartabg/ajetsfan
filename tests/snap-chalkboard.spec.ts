import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { snapChalkboard, type ChalkFrame } from "../src/lib/snap-chalkboard";
import { parseParticipationSeason, withParticipation } from "../src/lib/snap-participation";
import type { Snap, SnapGame } from "../src/lib/snap-types";

function archive(id: string, charted = false): SnapGame {
  const year = Number(id.slice(0, 4));
  const unpack = (dir: string) => gunzipSync(readFileSync(`public/data/${dir}/${year}.json.gz`)).toString();
  const season: { games: SnapGame[] } = JSON.parse(unpack("snaps"));
  const game = season.games.find(g => g.id === id)!;
  return charted ? withParticipation(game, parseParticipationSeason(unpack("participation"), year)) : game;
}

const cle = archive("2022_02_NYJ_CLE", true), buf = archive("2026_10_BUF_NYJ");
const old = archive("1999_01_NE_NYJ"), sf = archive("2024_01_NYJ_SF", true);
const snap = (game: SnapGame, key: string) => game.plays.find(p => p.key === key)!;
const board = (game: SnapGame, key: string) => snapChalkboard(game, snap(game, key));
const actor = (frame: ChalkFrame, short: string) => frame.marks.find(m => m.shortLabel === short)!;

test("Wilson’s touchdown has two charted personnel bands and a source disagreement specific to this snap", () => {
  const play = snap(cle, "4199"), b = board(cle, "4199");
  expect([b.offense, b.defense, b.kind, b.charted, b.canShowSnap]).toEqual(["NYJ", "CLE", "completion", true, true]);
  for (const [unit, tags] of [["O", ["OL", "OL", "OL", "OL", "OL", "QB", "RB", "TE", "WR", "WR", "WR"]],
    ["X", ["DL", "DL", "DL", "DL", "LB", "LB", "DB", "DB", "DB", "DB", "DB"]]] as const) {
    const marks = b.snap.marks.filter(m => m.unit === unit);
    expect(marks.map(m => m.tag)).toEqual(tags);
    expect(new Set(marks.map(m => m.y)).size).toBe(1);
    const gaps = marks.slice(1).map((m, i) => m.x - marks[i].x);
    expect(gaps[tags.findIndex(tag => tag === (unit === "O" ? "QB" : "LB")) - 1]).toBeGreaterThan(gaps[0]);
  }
  expect(b.snap.paths).toEqual([]);
  expect(play.facts?.charting).toMatchObject({ coverage: "COVER_6", manZone: "ZONE_COVERAGE", rushers: 4, box: 5 });
  expect([b.wilsonStudy, b.route]).toEqual([true, null]);
  expect(b.notes.join(" ")).toMatch(/post.*slant/i);
  for (const change of [{ key: "4198" }, { clock: 22 }, { possession: "opponent" as const }, { description: "G.Wilson for 15 yards, TOUCHDOWN." },
    { facts: { ...play.facts, target: "E.Moore" } }]) {
    expect(snapChalkboard(cle, { ...play, ...change }).wilsonStudy).toBe(false);
  }
  expect(snapChalkboard({ ...cle, source: "espn" }, play).wilsonStudy).toBe(false);
});

test("full playbook studies require the exact credited event and ruling", () => {
  const mia = archive("2000_08_MIA_NYJ"), ne = archive("2012_12_NE_NYJ");
  for (const [g, key, slug] of [
    [cle, "4199", "wilson-cleveland"], [cle, "3890", "davis-cleveland"], [mia, "4658", "elliott-miami"], [ne, "1401", "sanchez-thanksgiving"],
  ] as const) {
    const p = snap(g, key);
    expect(snapChalkboard(g, p).studyId).toBe(slug);
    expect(snapChalkboard(g, { ...p, clock: 0 }).studyId).toBeNull();
    expect(snapChalkboard({ ...g, source: "espn" }, p).studyId).toBeNull();
  }
  const decoy = snap(mia, "3744");
  expect(decoy.description).toContain("Elliott reports eligible");
  expect(snapChalkboard(mia, decoy).studyId).toBeNull();
  expect(snapChalkboard(mia, { ...decoy, key: "4658", clock: 80 }).studyId).toBeNull();
  const davis = snap(cle, "3890"), sanchez = snap(ne, "1401");
  expect(snapChalkboard(cle, { ...davis, facts: { ...davis.facts, target: "A.Davis" } }).studyId).toBeNull();
  expect(snapChalkboard(ne, { ...sanchez, after: sanchez.before }).studyId).toBeNull();
  expect(snapChalkboard(ne, { ...sanchez, description: sanchez.description.replace("NE-28-S.Gregory", "NYJ-6-M.Sanchez") }).studyId).toBeNull();
  expect(board(cle, "4276").studyId).toBeNull();
});

test("Kincaid’s catch separates the deep-right throw and the 33-yard carry with a shotgun-only pre-snap view", () => {
  const b = board(buf, "2511"), [throwPath, carry] = b.action.paths;
  expect([b.offense, b.defense, b.charted, b.canShowSnap]).toEqual(["BUF", "NYJ", false, true]);
  expect(b.snap.marks.map(m => m.unit).sort()).toEqual(["O", "ball"]);
  expect(b.snap.caption).toMatch(/shotgun/i);
  expect([throwPath.kind, carry.kind]).toEqual(["pass", "carry"]);
  expect(throwPath.to).toEqual(carry.from);
  expect(throwPath.to[0]).toBeGreaterThan(throwPath.from[0]);
  expect(carry.to[1]).toBeLessThan(carry.from[1]);
  expect(b.action.gainLine?.label).toBe("Line to gain");
  expect(b.action.gainLine?.y).toBeCloseTo(65 - (65 - throwPath.to[1]) * 10 / 21);
  expect(b.action.caption).toMatch(/21 yards downfield.*33 yards after the catch/);
  expect(actor(b.action, "Allen").unit).toBe("O");
  expect(actor(b.action, "Kincaid")).toMatchObject({ unit: "O", x: throwPath.to[0], y: throwPath.to[1] });
  expect(actor(b.action, "Belton").label).toContain("tackle assist");
  expect(actor(b.action, "Kincaid").tag).toBeUndefined();
  expect(b.action.caption).not.toContain("Belton");
});

test("scoring carries end at the measured goal line, including Wilson’s final yard", () => {
  const wilson = board(cle, "4199").action, catchY = actor(wilson, "Wilson").y;
  expect(wilson.caption).toMatch(/1 yard after the catch\. Touchdown\.$/);
  expect(wilson.gainLine?.label).toBe("Line to gain");
  expect(wilson.gainLine!.y).toBeGreaterThan(catchY);
  expect(wilson.goalLineY).toBeLessThan(catchY);
  expect(wilson.goalLineY).toBeCloseTo(65 - (65 - catchY) * 15 / 14);
  for (const frame of [wilson, board(buf, "2886").action, board(cle, "3890").action, board(buf, "737").action]) {
    const finish = frame.paths.at(-1)!;
    expect(finish.kind).toBe("carry");
    expect(frame.marks.filter(m => m.unit === "ball")).toEqual([
      expect.objectContaining({ x: finish.to[0], y: finish.to[1], shortLabel: "TD", label: "Touchdown" }),
    ]);
    expect(frame.goalLineY).toBe(finish.to[1]);
    expect(frame.caption).toMatch(/Touchdown\.$/);
  }
  const direct = board(cle, "930").action;
  expect(direct.goalLineY).toBe(actor(direct, "Wilson").y);
  expect(direct.gainLine?.y).toBe(direct.goalLineY);
  expect(direct.marks.some(m => m.unit === "ball")).toBe(false);
  const p = snap(cle, "4199");
  const unmeasured = snapChalkboard(cle, { ...p, facts: { ...p.facts, afterCatch: undefined } }).action;
  expect(unmeasured.caption).toMatch(/Touchdown\.$/);
  for (const frame of [unmeasured, board(buf, "2511").action, board(cle, "4276").action,
    snapChalkboard(cle, { ...p, description: p.description + " FUMBLES." }).action]) {
    expect(frame.goalLineY).toBeUndefined();
    expect(frame.marks.some(m => m.shortLabel === "TD")).toBe(false);
  }
});

test("an interception lands on Davis and reverses direction for the recorded return", () => {
  const b = board(cle, "4276"), [throwPath, back] = b.action.paths;
  expect([b.offense, b.defense, throwPath.kind, back.kind]).toEqual(["CLE", "NYJ", "interception", "return"]);
  const davis = actor(b.action, "Davis"), cooper = actor(b.action, "Cooper");
  expect(throwPath.to).toEqual([davis.x, davis.y]);
  expect(davis.unit).toBe("X");
  expect(cooper.unit).toBe("O");
  expect(throwPath.to).not.toEqual([cooper.x, cooper.y]);
  expect(throwPath.to[0]).toBeLessThan(throwPath.from[0]);
  expect(back.from).toEqual(throwPath.to);
  expect(back.to[1]).toBeGreaterThan(back.from[1]);
  expect(b.action.marks.filter(m => m.shortLabel === "Davis")).toHaveLength(1);
  expect(b.action.caption).toMatch(/intended for A\. Cooper.*14 yards/);
  expect(b.route).toBe("POST");
  const p = snap(cle, "4276");
  expect(snapChalkboard(cle, { ...p, facts: { ...p.facts, interceptionReturnYards: undefined } }).action.paths.map(v => v.kind)).toEqual(["interception"]);
});

test("runs, sacks and incompletions retain the credited participants and the gain or loss", () => {
  const scramble = board(cle, "4255").action, loss = board(cle, "885").action, sack = board(cle, "1331").action;
  expect(scramble.paths[0].to[0]).toBeLessThan(scramble.paths[0].from[0]);
  expect(scramble.paths[0].to[1]).toBeLessThan(scramble.paths[0].from[1]);
  expect(actor(scramble, "Brissett").unit).toBe("O");
  expect(actor(scramble, "Carter").unit).toBe("X");
  expect(loss.paths[0].to[0]).toBeGreaterThan(loss.paths[0].from[0]);
  expect(loss.paths[0].to[1]).toBeGreaterThan(loss.paths[0].from[1]);
  expect(loss.caption).toMatch(/right end.*loss of 1 yard/);
  expect(loss.gainLine).toEqual({ y: 41, label: "Goal line" });
  expect(actor(sack, "Flacco").y).toBeGreaterThan(actor(sack, "Snap").y);
  expect(sack.gainLine?.label).toBe("Line to gain");
  expect(actor(sack, "Garrett")).toMatchObject({ unit: "X", label: "M. Garrett · sack" });
  expect(sack.paths).toEqual([]);
  const incomplete = board(buf, "198").action;
  expect(incomplete.paths.map(p => p.kind)).toEqual(["incomplete"]);
  expect(incomplete.paths[0].to[1]).toBeGreaterThan(65);
  expect(actor(incomplete, "Bailey").label).toContain("pass defended");
  expect(incomplete.caption).toMatch(/on the right falls incomplete.*4 yards behind the line/);
});

test("on home kickoffs and away punts the kicking side supplies both the kicker and the tackler", () => {
  for (const [g, key, team, receiving, kicker, returner, tackler] of [
    [buf, "40", "NYJ", "BUF", "Beck", "Dortch", "Davis"], [cle, "1686", "CLE", "NYJ", "Bojorquez", "Berrios", "Kunaszyk"],
  ] as const) {
    const b = board(g, key), [kick, back] = b.action.paths;
    expect([b.offense, b.defense]).toEqual([team, receiving]);
    expect([actor(b.action, kicker).unit, actor(b.action, returner).unit, actor(b.action, tackler).unit]).toEqual(["O", "X", "O"]);
    expect([kick.kind, back.kind]).toEqual(["kick", "return"]);
    expect(back.from).toEqual(kick.to);
    expect(back.to[1]).toBeGreaterThan(back.from[1]);
  }
  const loss = board(buf, "3118").action.paths[1];
  expect(loss.to[1]).toBeLessThan(loss.from[1]);
  for (const [key, kind, result] of [["4240", "kickoff", "Touchback"], ["4224", "extraPoint", "Good"]] as const) {
    const b = board(cle, key);
    expect([b.kind, b.offense, b.defense]).toEqual([kind, "NYJ", "CLE"]);
    expect(b.action.paths.map(p => p.kind)).toEqual(["kick"]);
    expect(actor(b.action, result).unit).toBe("ball");
    expect(b.action.marks.some(m => m.unit === "X")).toBe(false);
  }
  const fg = board(buf, "1114");
  expect([fg.kind, fg.offense, fg.defense]).toEqual(["fieldGoal", "NYJ", "BUF"]);
  expect(fg.action.caption).toBe("J. Sanders makes a 41-yard field goal.");
  expect(fg.action.gainLine).toBeUndefined();
});

test("the FTN eleven, partial personnel, zero rushers and missing alignment are independent", () => {
  const b = board(sf, "312"), p = snap(sf, "312");
  expect(b.snap.marks.filter(m => m.tag === "OL")).toHaveLength(5);
  expect(b.snap.marks.filter(m => m.tag === "FB")).toHaveLength(1);
  expect(b.snap.marks.filter(m => m.unit === "X")).toHaveLength(11);
  expect(b.route).toBe("SLANT");
  const charting = { rushers: 0, offensePersonnel: "1 RB, 1 TE, 3 WR", defensePersonnel: "4 DL, 2 LB, 5 DB" };
  const partial = snapChalkboard(sf, { ...p, facts: { ...p.facts, charting } });
  expect(partial.charted).toBe(true);
  expect(partial.snap.marks).toHaveLength(11);
  expect(partial.snap.marks.every(m => m.unit === "X")).toBe(true);
  const failed = snapChalkboard(sf, { ...p, facts: { ...p.facts, shotgun: true, charting: { ...charting,
    defensePersonnel: "4 DL, 2 LB, 5 LB", formation: "UNDER CENTER" } } });
  expect(failed.charted).toBe(true);
  expect(failed.canShowSnap).toBe(false);
  expect(failed.action.paths[0].kind).toBe("incomplete");
  expect(snapChalkboard(sf, { ...p, facts: { ...p.facts, charting: { rushers: 0 } } }).charted).toBe(true);
});

test("early seasons and rulings degrade to the facts available on the selected play", () => {
  const early = board(old, "57");
  expect([early.charted, early.canShowSnap]).toEqual([false, false]);
  expect(early.action.paths).toEqual([]);
  expect(early.action.marks.map(m => m.shortLabel)).toEqual(["Bledsoe", "Jefferson"]);
  expect(early.action.caption).toContain("no throw location");
  expect(early.action.caption).toMatch(/8 yards.*A\. Glenn \(solo tackle\)/);
  const partial = snap(old, "57");
  const noSide = snapChalkboard(old, { ...partial, facts: { ...partial.facts, airYards: 3 } });
  expect(noSide.action.paths.map(p => p.kind)).toEqual(["pass"]);
  expect(noSide.action.caption).toContain("side of the throw was not recorded");
  expect(snapChalkboard(old, { ...partial, facts: { ...partial.facts, passLength: "short" } }).action.gainLine).toBeUndefined();
  expect(snapChalkboard(old, { ...partial, distance: 32, facts: { ...partial.facts, airYards: 3 } }).action.gainLine).toBeUndefined();
  expect(snapChalkboard(old, { ...partial, down: null, facts: { ...partial.facts, airYards: 3 } }).action.gainLine).toBeUndefined();
  const nullified = board(cle, "776");
  expect([nullified.kind, nullified.canShowSnap]).toEqual(["other", false]);
  expect(nullified.action.marks).toEqual([]);
  expect(nullified.action.caption).toContain("ruling");
  const noTeam: Snap = { ...partial, possession: null };
  expect(snapChalkboard(old, noTeam)).toMatchObject({ offense: "Offense", defense: "Defense", kind: "other" });
});
