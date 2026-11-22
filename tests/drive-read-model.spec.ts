import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { withClevelandDriveLineups } from "../src/lib/cleveland-drive-lineups";
import { buildDriveRead, type DriveReadFrame } from "../src/lib/drive-read";
import { parseParticipationSeason, withParticipation } from "../src/lib/snap-participation";
import type { Snap, SnapGame } from "../src/lib/snap-types";

function archive(id: string, charted = false): SnapGame {
  const year = Number(id.slice(0,4));
  const unpack = (dir: string) => gunzipSync(readFileSync(`public/data/${dir}/${year}.json.gz`)).toString();
  const season: {games: SnapGame[]} = JSON.parse(unpack("snaps"));
  const game = season.games.find(g => g.id === id)!;
  return withClevelandDriveLineups(charted ? withParticipation(game,parseParticipationSeason(unpack("participation"),year)) : game);
}
const cle = archive("2022_02_NYJ_CLE",true), buf = archive("2026_10_BUF_NYJ");
const series = "cleveland-15" as const;
const byKey = (g: SnapGame,key: string) => g.plays.find(p => p.key === key)!;
const slots = (frame: DriveReadFrame) => frame.board!.players.map(p => [p.participantId,p.id,p.start]).sort();

test("the Cleveland range advances by archive order across the pre-play and post-play score boundaries", () => {
  const opening = buildDriveRead(cle,{series})!;
  expect([opening.key,opening.first,opening.previous,opening.next,opening.phase]).toEqual(["4155","4155",null,"4177","snap"]);
  expect(opening).toMatchObject({score:[24,30],scoreLabel:"Score before this play",quarter:4,clock:35,down:1,formation:"Shotgun",
    verifiedLineups:true,charted:true,offense:"NYJ",defense:"CLE",history:[],traces:[]});
  for (const key of ["4155","4177","4199"]) {
    const setup = buildDriveRead(cle,{series,play:key})!, action = buildDriveRead(cle,{series,play:key,phase:"action"})!;
    expect(setup.board!.players).toHaveLength(22);
    expect(new Set(setup.board!.players.map(p => p.participantId)).size).toBe(22);
    expect(slots(setup)).toEqual(slots(action));
    expect(setup.board!.goalLineY).toBe(15.5);
    expect([setup.board!.gainLine?.y,action.board!.gainLine?.y]).toEqual([32,32]);
    expect(setup.coverage).toBeUndefined();
    expect(setup.rushers).toBeUndefined();
    expect(setup).not.toHaveProperty("primaryRoute");
    expect(action.rushers).toBe(4);
    expect(action.history.map(p => p.key)).toEqual([...setup.history.map(p => p.key),key]);
  }
  expect(buildDriveRead(cle,{series,play:"4155",phase:"action"})?.primaryRoute).toBe("OUT");
  const second = buildDriveRead(cle,{series,play:"4177",phase:"action"})!;
  expect(second.coverage).toBe("Cover 2");
  expect(second.board!.players.find(p => p.name === "Myles Garrett")?.credit).toContain("Quarterback hit");
  expect(second.detail).toBeUndefined();
  expect(second.board!.directionOnly).toBe("right");
  expect(second.board!.events).toEqual([]);
  const third = buildDriveRead(cle,{series,play:"4199"})!, result = buildDriveRead(cle,{series,play:"4199",phase:"action"})!;
  expect(third.score).toEqual([24,30]);
  expect(result).toMatchObject({score:[30,30],scoreLabel:"Score after this play",previous:"4177",next:null,coverage:"Cover 6"});
  expect(result.detail).toMatch(/post.*slant/i);
  expect(result.primaryRoute).toBeUndefined();
  expect(third.history.map(p => p.direction)).toEqual(["left","right"]);
  expect(third.traces).toHaveLength(1);
  expect(third.traces[0].key).toBe("4155");
  expect(third.traces[0].to[1]).toBeCloseTo(28.7);
});

test("changing the selected outcome, action-only charting or future data cannot change a serialized setup field", () => {
  const before = buildDriveRead(cle,{series,play:"4199"})!;
  const game = structuredClone(cle), p = byKey(game,"4199");
  p.after = [93,91]; p.description = "Future-only poisoned account"; p.type = "Sack"; p.wp = 0.001; p.delta = -0.9;
  Object.assign(p.facts!,{kind:"sack",passer:"A.Future",target:"B.Future",touchdown:false,airYards:-19,afterCatch:68,
    yards:-8,direction:"right",turnovers:["lostFumble"],defenders:[{name:"C.Future",role:"sack"}],kick:{kind:"kickoff",kicker:"D.Future"},
    timeouts:[2,3],completionProbability:0.024,epa:-9});
  Object.assign(p.facts!.charting!,{coverage:"COVER_9",manZone:"MAN_COVERAGE",rushers:11,primaryRoute:"SCREEN"});
  p.facts!.onField!.quarterbackHitBy = "00-0033868";
  game.final = [77,91];
  for (const future of game.plays.slice(game.plays.indexOf(p)+1)) Object.assign(future,{description:"A future score",after:[88,99]});
  const projected = buildDriveRead(game,{series,play:"4199"})!;
  expect(JSON.stringify(projected)).toBe(JSON.stringify(before));
  expect(projected.board!.players.every(marker => marker.path.length === 0 && !marker.credit && !marker.assignment)).toBe(true);
  const initial = JSON.stringify(buildDriveRead(cle,{series}));
  expect(initial).not.toMatch(/Myles Garrett|Jeff Smith|COVER_6|Cover 6|slant|pass defended|passer|incomplete|Touchdown|qb_hit/i);
  expect(projected.game).not.toHaveProperty("final");
});

test("a followed person is known only after their first verified appearance in the chosen range", () => {
  const garrett = "00-0033868", moore = "00-0036980";
  expect(buildDriveRead(cle,{series,play:"4155",follow:garrett})?.followed).toBeUndefined();
  expect(JSON.stringify(buildDriveRead(cle,{series,play:"4155",follow:garrett}))).not.toContain(garrett);
  expect(buildDriveRead(cle,{series,play:"4177",follow:garrett})?.followed?.name).toBe("Myles Garrett");
  const absent = buildDriveRead(cle,{series,play:"4177",follow:moore})!;
  expect(absent.followed?.name).toBe("Elijah Moore");
  expect(absent.verifiedLineups).toBe(true);
  expect(absent.board!.players.some(p => p.participantId === moore)).toBe(false);
  const unknown = buildDriveRead(cle,{play:"4255",follow:moore})!;
  expect(unknown.followed?.name).toBe("Elijah Moore");
  expect(unknown.verifiedLineups).toBe(false);
  expect(buildDriveRead(cle,{play:"4131",follow:moore})?.followed).toBeUndefined();
  expect(buildDriveRead(buf,{play:"2511",follow:"slot:O-qb"})?.follow).toBe("slot:O-qb");
  expect(buildDriveRead(buf,{play:"2511",follow:"slot:no-such-player"})?.follow).toBeUndefined();
});

test("both teams’ substitutions require two consecutive complete lineups in the same drive", () => {
  expect(buildDriveRead(cle,{series})!.changes).toEqual([]);
  expect(buildDriveRead(cle,{series,play:"4177"})!.changes).toEqual([
    { unit:"O",entered:["Braxton Berrios","Jeff Smith"],left:["Elijah Moore","Garrett Wilson"] },
    { unit:"X",entered:["Myles Garrett","Taven Bryan"],left:["Alex Wright","Chase Winovich"] },
  ]);
  const third = buildDriveRead(cle,{series,play:"4199"})!;
  expect(third.changes).toEqual([{unit:"O",entered:["Elijah Moore","Garrett Wilson"],left:["Jeff Smith","Corey Davis"]}]);
  expect(buildDriveRead(cle,{series,play:"4199",phase:"action"})!.changes).toEqual(third.changes);
  const first = byKey(cle,"4155"), next = byKey(cle,"4177");
  for (const other of [{drive:null},{drive:0},{possession:"opponent" as const},{facts:{...first.facts,turnovers:["downs" as const]}},
    {facts:{...first.facts,onField:undefined}}]) {
    const plays = [{...first,...other},next];
    expect(buildDriveRead({...cle,plays},{play:next.key})!.changes).toEqual([]);
  }
  const partial = structuredClone(next);
  partial.facts!.onField!.defense.pop();
  const missing = buildDriveRead({...cle,plays:[first,partial]},{play:partial.key})!;
  expect(missing.verifiedLineups).toBe(false);
  expect(missing.changes).toEqual([]);
});

test("prior throw endpoints follow field position, the bounded visible crop and consecutive possession", () => {
  const now = buildDriveRead(cle,{play:"4155"})!;
  const prior = now.traces.find(t => t.key === "4131")!;
  // Nine air yards from CLE27 reach CLE18, three yards behind the new line at CLE15.
  expect(prior.to[1]).toBeCloseTo(74.9);
  expect(prior.from).toBeUndefined(); // The old line is outside this drawing.
  const base = byKey(cle,"4155");
  const p = (key: string,fields: Partial<Snap>) => ({...base,key,...fields});
  const changed = p("3",{yardline:15});
  const game = {...cle,plays:[p("1",{yardline:30}),p("2",{possession:"opponent"}),changed]};
  expect(buildDriveRead(game,{play:"3"})!.history).toEqual([]);
  for (const boundary of [{drive:20},{drive:null},{possession:null}]) {
    game.plays[1] = p("2",boundary);
    expect(buildDriveRead(game,{play:"3"})!.history).toEqual([]);
  }
  game.plays[1] = p("2",{yardline:85});
  const cropped = buildDriveRead(game,{play:"3"})!;
  expect(cropped.history.map(r => r.key)).toEqual(["1","2"]);
  expect(cropped.traces.some(t => t.key === "2")).toBe(false);
});

test("missing side, target or measured depth leaves attempts in the ledger without a plotted throw", () => {
  const p = byKey(cle,"4155");
  for (const change of [{direction:undefined},{target:undefined},{airYards:undefined}]) {
    const game = {...cle,plays:[{...p,key:"1",facts:{...p.facts,...change}},{...p,key:"2"}]};
    const action = buildDriveRead(game,{play:"1",phase:"action"})!, next = buildDriveRead(game,{play:"2"})!;
    expect(action.board!.paths).toEqual([]);
    expect(action.board!.events).toEqual([]);
    expect(next.history).toHaveLength(1);
    expect(next.traces).toEqual([]);
  }
});

test("pre-play score and timeouts use only evidence from the correct side of the boundary", () => {
  const before = buildDriveRead(cle,{play:"1818"})!, after = buildDriveRead(cle,{play:"1818",phase:"action"})!;
  expect(before.timeouts).toEqual([2,3]);
  expect(after.timeouts).toEqual([1,3]);
  expect(before).not.toHaveProperty("headline");
  const p = byKey(cle,"4155");
  const gap: SnapGame = {...cle,plays:[{...p,key:"1",quarter:2},{...p,key:"2",quarter:3,before:null,after:[8,9]}]};
  const selected = buildDriveRead(gap,{play:"2"})!;
  expect(selected.score).toBeNull();
  expect(selected.scoreLabel).toMatch(/before.*unavailable/);
  expect(selected.timeouts).toBeUndefined();
  gap.plays[1].after = null;
  expect(buildDriveRead(gap,{play:"2",phase:"action"})!.scoreLabel).toMatch(/after.*unavailable/);
});

test("generic traversal includes kicks and rulings and rejects an invalid range, duplicate key or missing selection", () => {
  const start = buildDriveRead(buf,{})!, kickoff = buildDriveRead(buf,{play:"40",phase:"action"})!;
  expect(start.key).toBe(buf.plays[0].key);
  expect(start.previous).toBeNull();
  expect(buildDriveRead(buf,{play:"40"})).not.toHaveProperty("kickKind");
  expect(kickoff).toMatchObject({kicking:true,kickKind:"kickoff",offense:"NYJ",defense:"BUF"});
  expect(buildDriveRead(buf,{play:"1114",phase:"action"})?.kickKind).toBe("fieldGoal");
  expect(kickoff.board!.players).toHaveLength(22);
  const ruling = buildDriveRead(cle,{play:"776",phase:"action"})!;
  expect(ruling.board).toBeNull();
  expect(ruling.caption).toMatch(/penalty/i);
  expect(buildDriveRead(buf,{series})).toBeNull();
  expect(buildDriveRead(cle,{series,play:"4224"})).toBeNull();
  expect(buildDriveRead(cle,{play:"missing"})).toBeNull();
  expect(buildDriveRead({...cle,plays:[cle.plays[0],cle.plays[0]]},{})).toBeNull();
});
