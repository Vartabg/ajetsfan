import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { withClevelandDriveLineups } from "../src/lib/cleveland-drive-lineups";
import { fullSnapBoard, type FullSnapBoard } from "../src/lib/full-snap";
import { snapChalkboard } from "../src/lib/snap-chalkboard";
import { parseParticipationSeason, withParticipation } from "../src/lib/snap-participation";
import type { Snap, SnapGame } from "../src/lib/snap-types";

function archive(id: string, charted = false): SnapGame {
  const year = Number(id.slice(0,4));
  const unpack = (dir: string) => gunzipSync(readFileSync(`public/data/${dir}/${year}.json.gz`)).toString();
  const season: {games: SnapGame[]} = JSON.parse(unpack("snaps"));
  const game = season.games.find(g => g.id === id)!;
  return withClevelandDriveLineups(charted ? withParticipation(game, parseParticipationSeason(unpack("participation"), year)) : game);
}
const cle = archive("2022_02_NYJ_CLE",true), buf = archive("2026_10_BUF_NYJ"), early = archive("1999_01_NE_NYJ");
const selected = (g: SnapGame, key: string) => g.plays.find(p => p.key === key)!;
const project = (g: SnapGame, p: Snap) => fullSnapBoard(g,p,snapChalkboard(g,p));
const board = (g: SnapGame, key: string) => project(g,selected(g,key))!;

function bothUnits(b: FullSnapBoard) {
  for (const unit of ["O","X"]) expect(b.players.filter(p => p.unit === unit)).toHaveLength(11);
  expect(new Set(b.players.map(p => p.id)).size).toBe(22);
  expect(b.players.every(p => p.path.length && p.assignment && p.role)).toBe(true);
  expect(b.events.every(m => m.unit === "ball")).toBe(true);
  for (const p of b.players) for (const [x,y] of [p.start,...p.path]) {
    expect(x >= 0 && x <= 100 && y >= 0 && y <= 100).toBe(true);
  }
}

test("all three Cleveland downs keep their own 22 people, substitutions and shared field", () => {
  const first = board(cle,"4155"), second = board(cle,"4177"), third = board(cle,"4199");
  for (const b of [first,second,third]) {
    bothUnits(b);
    expect(b.players.every(p => p.participantId && p.position && p.name && Number.isInteger(p.number))).toBe(true);
    expect(b.players.filter(p => p.duty === "rush")).toHaveLength(4);
    expect([b.lineY,b.yardsToY,b.gainLine?.y,b.goalLineY]).toEqual([65,3.3,32,15.5]);
  }
  const wide = (b: FullSnapBoard) => b.players.filter(p => p.group === "WR").map(p => p.name).sort();
  expect(wide(first)).toEqual(["Corey Davis","Elijah Moore","Garrett Wilson"]);
  expect(wide(second)).toEqual(["Braxton Berrios","Corey Davis","Jeff Smith"]);
  expect(wide(third)).toEqual(["Braxton Berrios","Elijah Moore","Garrett Wilson"]);
  expect(first.players.find(p => p.name === "Elijah Moore")).toMatchObject({ credit:"Intended receiver",number:8,unit:"O" });
  expect(second.players.find(p => p.name === "Myles Garrett")).toMatchObject({ credit:"Quarterback hit",duty:"rush",unit:"X" });
  expect(third.players.find(p => p.name === "Myles Garrett")?.credit).toBeUndefined();
  const wilson = third.players.find(p => p.name === "Garrett Wilson")!;
  expect(wilson.group).toBe("WR");
  expect(Math.abs(wilson.start[0]-50)).toBeGreaterThan(32);
  expect(wilson.assignment).toMatch(/outside.*disputed/);
  expect(third.paths.map(p => p.kind)).toEqual(["pass","carry"]);
  expect(third.paths[0].to[1]).toBeCloseTo(65-14*3.3);
  expect(third.events.find(m => m.shortLabel === "TD")?.y).toBe(15.5);
  for (const [name,group] of [["Tyler Conklin","TE"],["Michael Carter","RB"]]) {
    const actor = second.players.find(p => p.name === name)!;
    expect(actor.group).toBe(group);
    expect(Math.abs(actor.start[0]-50)).toBeGreaterThan(11);
  }
  expect(second.directionOnly).toBe("right");
  expect(second.unplacedThrow).toMatchObject({ targetKnown:false });
  expect(second.unplacedThrow?.depth).toBeUndefined();
  expect([second.paths.length,second.events.length]).toEqual([0,0]);
  expect(second.players.filter(p => p.duty === "route")).toHaveLength(5);
});

test("the coverage examples distinguish a quarter side from deep halves over the same personnel", () => {
  const six = board(cle,"4155"), two = board(cle,"4177");
  const cover = (b: FullSnapBoard) => b.players.filter(p => p.duty === "cover");
  expect(cover(six).filter(p => p.assignment.includes("quarter"))).toHaveLength(2);
  expect(cover(six).filter(p => p.assignment.includes("deep right half"))).toHaveLength(1);
  expect(cover(two).filter(p => /deep .* half/.test(p.assignment))).toHaveLength(2);
  expect(cover(two).filter(p => p.assignment.includes("outside flat"))).toHaveLength(2);
  const corner = cover(six).find(p => p.assignment.includes("deep outside quarter"))!;
  expect(corner.path.at(-1)![1]).toBeLessThan(cover(two).find(p => p.id === corner.id)!.path.at(-1)![1]);
  expect(six.note).toContain("example");
  const zero = board(archive("2023_09_LAC_NYJ",true),"4356");
  bothUnits(zero);
  expect(zero.players.filter(p => p.duty === "rush")).toHaveLength(0);
  expect(zero.players.filter(p => p.duty === "cover")).toHaveLength(11);
  expect(zero.players.filter(p => p.group === "OL" && p.duty === "block")).toHaveLength(5);
});

test("recorded pass and turnover events stay separate from all 22 illustrative tracks", () => {
  const catchPlay = board(buf,"2511"), pick = board(cle,"4276"), sack = board(cle,"1331");
  [catchPlay,pick,sack].forEach(bothUnits);
  expect(catchPlay.paths.map(p => p.kind)).toEqual(["pass","carry"]);
  expect(catchPlay.paths[1].to[1]).toBeCloseTo(65-54*catchPlay.yardsToY);
  expect(catchPlay.players.filter(p => p.credit === "Receiver")).toHaveLength(1);
  const davis = pick.players.filter(p => p.name?.endsWith("Davis"));
  expect(davis).toHaveLength(1);
  expect(davis[0]).toMatchObject({unit:"X",credit:"Interceptor · Pass defended"});
  expect(pick.paths.map(p => p.kind)).toEqual(["interception","return"]);
  expect(pick.paths[0].to).toEqual(davis[0].path.at(-1));
  expect(pick.paths[1].to[1]).toBeGreaterThan(pick.paths[1].from[1]);
  expect(sack.players.find(p => p.name?.includes("Garrett"))?.duty).toBe("rush");
  expect(sack.events[0].y).toBeGreaterThan(sack.lineY);
});

test("routine kicks have the kicking and receiving units, with credits scoped to the correct side", () => {
  for (const [game,key] of [[buf,"40"],[cle,"1686"],[buf,"1114"],[cle,"4224"]] as const) bothUnits(board(game,key));
  const kick = board(buf,"40");
  expect(kick.players.find(p => p.name?.endsWith("Beck"))).toMatchObject({unit:"O",duty:"kick"});
  expect(kick.players.find(p => p.name?.endsWith("Dortch"))).toMatchObject({unit:"X",duty:"return"});
  expect(kick.players.find(p => p.name?.endsWith("Davis"))).toMatchObject({unit:"O",credit:"Solo tackle"});
  expect(kick.paths.map(p => p.kind)).toEqual(["kick","return"]);
  expect(kick.paths[1].to[1]).toBeGreaterThan(kick.paths[1].from[1]);
  expect(board(cle,"4240").paths.map(p => p.kind)).toEqual(["kick"]);
});

test("the two verified compound studies keep their credited actors and turnover direction", () => {
  const elliott = board(archive("2000_08_MIA_NYJ"),"4658"), sanchez = board(archive("2012_12_NE_NYJ"),"1401");
  bothUnits(elliott); bothUnits(sanchez);
  expect(elliott.players.find(p => p.credit === "Receiver")).toMatchObject({position:"Eligible tackle",number:76});
  expect(elliott.unplacedThrow).toMatchObject({targetKnown:true});
  expect(elliott.events).toEqual([]);
  expect(sanchez.players.find(p => p.number === 65)).toMatchObject({name:"Brandon Moore",unit:"O"});
  expect(sanchez.players.find(p => p.number === 28)).toMatchObject({duty:"return",unit:"X"});
  expect(sanchez.paths.map(p => p.kind)).toEqual(["carry","return"]);
  expect(sanchez.paths[1].to[1]).toBeGreaterThan(sanchez.lineY);
  expect(sanchez.goalLineY).toBe(sanchez.paths[1].to[1]);
});

test("unplaced passes, non-11 and legacy packages, and nullified plays retain their evidence boundaries", () => {
  const a = board(early,"57");
  bothUnits(a);
  expect(a.paths).toEqual([]);
  expect(a.unplacedThrow).toMatchObject({targetKnown:true});
  expect(a.unplacedThrow?.depth).toBeUndefined();
  const p = selected(cle,"4177"), missingTarget = project(cle,{...p,facts:{...p.facts,airYards:4}})!;
  expect(missingTarget.unplacedThrow).toEqual({depth:4,targetKnown:false});
  expect(missingTarget.events).toEqual([]);
  const sample = board(archive("2016_02_NYJ_BUF",true),"603");
  bothUnits(sample);
  expect(sample.note).toMatch(/defense has recorded personnel.*other unit uses an example/i);
  const rush = board(early,"97");
  expect(rush.paths[0].to[1]).toBeGreaterThan(rush.paths[0].from[1]);
  expect(project(cle,selected(cle,"776"))).toBeNull();
  expect(project(cle,{...p,possession:null})).toBeNull();
});
