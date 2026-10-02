import { test, expect } from "@playwright/test";
import { getJetsPlayDesign, jetsPlays } from "../src/lib/jets-playbook";
import { getJetsStudy } from "../src/lib/jets-snap-study";
import { FIELD, sampleBall, samplePlayer, validatePlayDesign, type Point } from "../src/lib/playbook";

const inBounds = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= 0 && point.x <= FIELD.width && point.y >= 0 && point.y <= FIELD.height;
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);

test("every Jets full-snap study has a valid portable diagram and an assignment for each of the 22 players", () => {
  for (const play of jetsPlays) {
    const study = getJetsStudy(play.id);
    expect(study, play.id).not.toBeNull();
    const { design, assignments, summary, questions } = study!;
    expect(design.studyMode).toBe("full-snap");
    expect(design.archiveId).toBe(play.id);
    expect(validatePlayDesign(design)).toEqual(design);
    expect(design.players).toHaveLength(22);
    expect(design.players.filter((player) => player.side === "offense")).toHaveLength(11);
    expect(design.players.filter((player) => player.side === "defense")).toHaveLength(11);
    expect(assignments).toHaveLength(22);
    expect(new Set(assignments.map((assignment) => assignment.playerId)).size).toBe(22);
    expect(assignments.map((assignment) => assignment.playerId).sort()).toEqual(design.players.map((player) => player.id).sort());
    expect(summary.trim().length).toBeGreaterThan(30);
    expect(questions.length).toBeGreaterThanOrEqual(2);
    for (const question of questions) expect(question.trim().length).toBeGreaterThan(15);
    for (const assignment of assignments) {
      expect(assignment.role.trim().length).toBeGreaterThan(1);
      expect(assignment.action.trim().length).toBeGreaterThan(3);
      expect(assignment.detail.trim().length).toBeGreaterThan(20);
      expect(["source-supported", "illustrative"]).toContain(assignment.basis);
    }
  }
  expect(getJetsStudy("missing-archive-entry")).toBeNull();
});

test("all 22 positions take a purposeful path rather than remaining stationary", () => {
  const stationary: string[] = [];
  for (const play of jetsPlays) {
    const { design } = getJetsStudy(play.id)!;
    for (const player of design.players) {
      const points = [{ x: player.x, y: player.y }, ...player.path];
      const travel = player.path.reduce((total, point, index) => total + distance(points[index], point), 0);
      const displacement = Math.max(...Array.from({ length: 61 }, (_, index) => distance(points[0], samplePlayer(player, index / 10))));
      if (travel <= 6 || displacement <= 6) stationary.push(`${play.id}/${player.id}`);
    }
  }
  expect(stationary).toEqual([]);
});

test("full-snap playback remains finite and on the field at every tenth of a diagram second", () => {
  const failures: string[] = [];
  for (const play of jetsPlays) {
    const { design } = getJetsStudy(play.id)!;
    for (let tick = 0; tick <= FIELD.duration * 10; tick += 1) {
      const seconds = tick / 10;
      if (!inBounds(sampleBall(design, seconds))) failures.push(`${play.id}/ball at ${seconds}`);
      for (const player of design.players) {
        if (!inBounds(samplePlayer(player, seconds))) failures.push(`${play.id}/${player.id} at ${seconds}`);
      }
    }
    expect(sampleBall(design, Number.NaN)).toEqual(sampleBall(design, 0));
    expect(sampleBall(design, Infinity)).toEqual(sampleBall(design, FIELD.duration));
  }
  expect(failures).toEqual([]);
});

test("a full-snap study preserves the recorded central action and labels unverified assignments as illustrative", () => {
  for (const play of jetsPlays) {
    const source = getJetsPlayDesign(play.id)!;
    const study = getJetsStudy(play.id)!;
    expect(source.studyMode).toBeUndefined();
    expect(study.design.ball).toEqual(source.ball);
    expect(study.design.ballEvents).toEqual(source.ballEvents);
    const existingMovers = source.players.filter((player) => player.path.length > 0);
    for (const actor of existingMovers) {
      const updated = study.design.players.find((player) => player.id === actor.id)!;
      // Gregory gains the approach missing from the source-only board. Its
      // endpoint at the recovery time is checked separately for continuity.
      if (play.id === "sanchez-thanksgiving" && actor.id === "d11") continue;
      expect(updated.path, `${play.id}/${actor.id}`).toEqual(actor.path);
      expect(updated.motionWindow).toEqual(actor.motionWindow);
      for (const time of [0, 1, 2, 3, 4, 5, 6]) expect(samplePlayer(updated, time)).toEqual(samplePlayer(actor, time));
    }
    for (const assignment of study.assignments) {
      if (!play.focusPlayerIds.includes(assignment.playerId)) expect(assignment.basis).toBe("illustrative");
      else {
        expect(assignment.detail).toMatch(/illustrative|schematic|not (?:reproduce|established|measured|verified)/i);
        expect(assignment.sourceLabels!.length).toBeGreaterThan(0);
      }
    }
    expect(sampleBall(study.design, FIELD.duration)).toEqual(sampleBall(source, FIELD.duration));
    expect(study.assignments.filter((assignment) => assignment.basis === "illustrative").length).toBeGreaterThanOrEqual(18);
  }
});

test("the study assigns offensive line protection and defensive responsibilities without claiming a verified play call", () => {
  for (const play of jetsPlays) {
    const study = getJetsStudy(play.id)!;
    for (const id of ["lt", "lg", "c", "rg", "rt"]) {
      const note = study.assignments.find((assignment) => assignment.playerId === id)!;
      if (!(play.id === "sanchez-thanksgiving" && id === "rg")) expect(note.basis).toBe("illustrative");
      expect(`${note.action} ${note.detail}`).toMatch(/protect|block|set|fit|engage/i);
    }
    const defenders = study.design.players.filter((player) => player.side === "defense");
    const defensiveNotes = defenders.map((player) => study.assignments.find((assignment) => assignment.playerId === player.id)!);
    expect(defensiveNotes.some((note) => /rush|pressure|pocket|contain/i.test(`${note.action} ${note.detail}`))).toBe(true);
    expect(defensiveNotes.some((note) => /cover|leverage|trail|zone|pursu|recover|react/i.test(`${note.action} ${note.detail}`))).toBe(true);
    expect(study.summary).toMatch(/illustrative|schematic|hypothesis|inferred|teaching|authored study|not (?:identify|established)|unknown/i);
    expect(`${study.summary} ${study.questions.join(" ")}`).not.toMatch(/verified (?:All.?22|coverage|protection|play call)|measured (?:player|NFL) tracking/i);
  }
});

test("the fumble retains continuous ball recovery and the fake spike retains the correct offensive perspective", () => {
  const fumble = getJetsStudy("sanchez-thanksgiving")!.design;
  const carry = fumble.ballEvents!.find((event) => event.kind === "carry" && event.at > 0)!;
  expect(carry.kind).toBe("carry");
  if (carry.kind !== "carry") throw new Error("No recovery carrier");
  const returner = fumble.players.find((player) => player.id === carry.carrierId)!;
  expect(returner.side).toBe("defense");
  expect(returner.label).toMatch(/Gregory/);
  expect(sampleBall(fumble, carry.at)).toEqual(samplePlayer(returner, carry.at));
  expect(distance(sampleBall(fumble, carry.at - .000001), sampleBall(fumble, carry.at))).toBeLessThan(.01);
  expect(sampleBall(fumble, FIELD.duration)).toEqual(samplePlayer(returner, FIELD.duration));
  expect(sampleBall(fumble, FIELD.duration).y).toBeGreaterThan(sampleBall(fumble, carry.at).y);
  const spike = getJetsStudy("fake-spike")!.design;
  expect(jetsPlays.find((play) => play.id === "fake-spike")!.jetsSide).toBe("defense");
  expect(spike.players.find((player) => player.id === spike.ball.carrierId)!.label).toBe("Marino");
  const receiver = spike.players.find((player) => player.id === spike.ball.targetId)!;
  expect(receiver.label).toBe("Ingram");
  expect(receiver.side).toBe("offense");
  expect(sampleBall(spike, FIELD.duration)).toEqual(samplePlayer(receiver, FIELD.duration));
});

test("saved and shared studies round-trip their mode, motion windows, all 22 paths and staged ball events within size limits", () => {
  for (const play of jetsPlays) {
    const { design } = getJetsStudy(play.id)!;
    const json = JSON.stringify(design);
    expect(json.length).toBeLessThan(32000);
    expect(Buffer.from(json, "utf8").toString("base64url").length).toBeLessThan(40000);
    const copy = validatePlayDesign(JSON.parse(json))!;
    expect(copy).toEqual(design);
    expect(copy.studyMode).toBe("full-snap");
    expect(copy.players.every((player) => player.path.length > 0)).toBe(true);
    expect(copy.players).not.toBe(design.players);
    expect(copy.players[0].path).not.toBe(design.players[0].path);
  }
});

test("full-snap metadata cannot be smuggled into anonymous or malformed designs", () => {
  const design = getJetsStudy("wilson-cleveland")!.design;
  const { archiveId: _archive, ...withoutArchive } = design;
  void _archive;
  expect(validatePlayDesign(withoutArchive)).toBeNull();
  expect(validatePlayDesign({ ...design, studyMode: "verified-film" })).toBeNull();
  expect(validatePlayDesign({ ...design, studyMode: undefined })).toBeNull();
  expect(validatePlayDesign({ ...design, studyMode: null })).toBeNull();
  expect(validatePlayDesign({ ...design, archiveId: "" })).toBeNull();
});

test("editing study diagrams or assignment notes never mutates the archive or another study copy", () => {
  for (const play of jetsPlays) {
    const sourceBefore = JSON.stringify(play);
    const first = getJetsStudy(play.id)!;
    const before = structuredClone(first);
    const second = getJetsStudy(play.id)!;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.design.players[0]).not.toBe(second.design.players[0]);
    expect(first.assignments[0]).not.toBe(second.assignments[0]);
    first.design.players[0].path[0].x += 1;
    first.design.name = "Edited board";
    first.assignments[0].detail = "My revised assignment";
    first.questions.push("My additional film question?");
    expect(second).toEqual(before);
    expect(getJetsStudy(play.id)).toEqual(before);
    expect(JSON.stringify(play)).toBe(sourceBefore);
  }
});
