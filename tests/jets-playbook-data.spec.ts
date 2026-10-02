import { test, expect } from "@playwright/test";
import { getJetsPlayDesign, jetsPlays, type JetsPlay } from "../src/lib/jets-playbook";
import { FIELD, sampleBall, samplePlayer, validatePlayDesign, type PlayDesign, type Point } from "../src/lib/playbook";

const inBounds = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= 0 && point.x <= FIELD.width && point.y >= 0 && point.y <= FIELD.height;
const findPlay = (name: RegExp): JetsPlay => {
  const matches = jetsPlays.filter((play) => name.test(play.title));
  expect(matches).toHaveLength(1);
  return matches[0];
};
const player = (design: PlayDesign, id: string) => {
  const result = design.players.find((entry) => entry.id === id);
  expect(result).toBeDefined();
  return result!;
};

test("the Jets archive has six distinct dated plays and primary source links for every record", () => {
  expect(jetsPlays).toHaveLength(6);
  expect(new Set(jetsPlays.map((play) => play.id)).size).toBe(6);
  expect(jetsPlays.filter((play) => play.category === "great")).toHaveLength(4);
  expect(jetsPlays.filter((play) => play.category === "painful")).toHaveLength(2);
  for (const play of jetsPlays) {
    expect(play.id).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(play.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${play.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(play.date);
    expect(play.opponent.length).toBeGreaterThan(3);
    expect(play.situation.length).toBeGreaterThan(10);
    expect(play.result.length).toBeGreaterThan(10);
    expect(play.summary.length).toBeGreaterThan(20);
    expect(play.confirmed.length).toBeGreaterThanOrEqual(2);
    expect(play.illustrative.length).toBeGreaterThanOrEqual(2);
    expect(play.sources.length).toBeGreaterThanOrEqual(2);
    expect(new Set(play.sources.map((source) => source.url)).size).toBe(play.sources.length);
    for (const source of play.sources) {
      expect(source.label.trim().length).toBeGreaterThan(3);
      const url = new URL(source.url);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toMatch(/(^|\.)(nfl\.com|newyorkjets\.com|patriots\.com|miamidolphins\.com|youtube\.com)$/);
    }
  }
});

test("every archive board has 22 valid players and a source association that survives JSON sharing", () => {
  for (const play of jetsPlays) {
    const design = getJetsPlayDesign(play.id)!;
    expect(design).not.toBeNull();
    expect(design.archiveId).toBe(play.id);
    expect(design.players).toHaveLength(22);
    expect(new Set(design.players.map((entry) => entry.id)).size).toBe(22);
    expect(design.players.filter((entry) => entry.side === "offense")).toHaveLength(11);
    expect(design.players.filter((entry) => entry.side === "defense")).toHaveLength(11);
    expect(validatePlayDesign(design)).toEqual(design);
    const shared = validatePlayDesign(JSON.parse(JSON.stringify(design)));
    expect(shared).toEqual(design);
    expect(shared!.archiveId).toBe(play.id);
    expect(shared!.players).not.toBe(design.players);
    expect(shared!.ball).not.toBe(design.ball);
    if (design.ballEvents) expect(shared!.ballEvents).not.toBe(design.ballEvents);
  }
  expect(getJetsPlayDesign("not-a-jets-play")).toBeNull();
});

test("only named central actors move; unknown historical assignments remain stationary", () => {
  for (const play of jetsPlays) {
    const design = getJetsPlayDesign(play.id)!;
    expect(play.focusPlayerIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(play.focusPlayerIds).size).toBe(play.focusPlayerIds.length);
    for (const id of play.focusPlayerIds) {
      const actor = player(design, id);
      expect(actor.label).not.toMatch(/^(QB|RB|FB|[XYZH] (WR|TE)|[LR]?(CB|DE|DT|LB)|[A-Z]*LB|[FN]?S|SS)$/);
    }
    const movers = design.players.filter((entry) => entry.path.length > 0);
    expect(movers.length).toBeGreaterThan(0);
    expect(movers.every((entry) => play.focusPlayerIds.includes(entry.id))).toBe(true);
    for (const anonymous of design.players.filter((entry) => !play.focusPlayerIds.includes(entry.id))) {
      expect(anonymous.path).toEqual([]);
      expect(samplePlayer(anonymous, FIELD.duration)).toEqual({ x: anonymous.x, y: anonymous.y });
    }
    expect(play.illustrative.join(" ")).toMatch(/illustrative|schematic/i);
    expect(play.illustrative.join(" ")).toMatch(/not (?:measured|verified|established)|unverified/i);
  }
});

test("all archived players and ball trajectories stay finite and bounded throughout playback", () => {
  const failures: string[] = [];
  for (const play of jetsPlays) {
    const design = getJetsPlayDesign(play.id)!;
    for (let tick = 0; tick <= FIELD.duration * 10; tick += 1) {
      const time = tick / 10;
      if (!inBounds(sampleBall(design, time)) || design.players.some((entry) => !inBounds(samplePlayer(entry, time)))) {
        failures.push(`${play.id} at ${time}`);
      }
    }
    expect(sampleBall(design, 0)).toEqual(samplePlayer(player(design, design.ball.carrierId), 0));
    expect(sampleBall(design, Number.NaN)).toEqual(sampleBall(design, 0));
    expect(sampleBall(design, Infinity)).toEqual(sampleBall(design, FIELD.duration));
  }
  expect(failures).toEqual([]);
});

test("positive touchdown diagrams finish with possession on their named offensive receiver", () => {
  const expected = [
    { title: /Wilson/i, receiver: /Wilson/i },
    { title: /Corey Davis/i, receiver: /Davis/i },
    { title: /Jumbo Elliott/i, receiver: /Elliott/i },
    { title: /Wesley Walker/i, receiver: /Walker/i },
  ];
  for (const entry of expected) {
    const play = findPlay(entry.title);
    const design = getJetsPlayDesign(play.id)!;
    const receiver = player(design, design.ball.targetId);
    expect(play.category).toBe("great");
    expect(receiver.side).toBe("offense");
    expect(receiver.eligible).toBe(true);
    expect(receiver.label).toMatch(entry.receiver);
    expect(receiver.path.length).toBeGreaterThan(0);
    expect(sampleBall(design, FIELD.duration)).toEqual(samplePlayer(receiver, FIELD.duration));
    expect(sampleBall(design, FIELD.duration)).not.toEqual(sampleBall(design, 0));
  }
});

test("archive dates, touchdown distances and outcomes agree with the recorded Jets moments", () => {
  const expected = [
    { title: /Wilson/i, date: "2022-09-18", facts: [/15-yard/i, /31[–-]30/, /22 seconds|0:22|:22/] },
    { title: /Corey Davis/i, date: "2022-09-18", facts: [/66-yard/i, /30[–-]17/, /31[–-]30/] },
    { title: /Jumbo Elliott/i, date: "2000-10-23", facts: [/3-yard/i, /40[–-]37/, /42 seconds|0:42|:42/] },
    { title: /Wesley Walker/i, date: "1986-09-21", facts: [/43-yard/i, /51[–-]45/, /four|fourth|4th/i] },
    { title: /Butt Fumble|Thanksgiving/i, date: "2012-11-22", facts: [/32-yard/i, /Sanchez/i, /Gregory/i, /Moore/i] },
    { title: /Fake Spike/i, date: "1994-11-27", facts: [/8-yard/i, /28[–-]24/, /22 seconds|0:22|:22/, /Ingram/i] },
  ];
  for (const entry of expected) {
    const play = findPlay(entry.title);
    expect(play.date).toBe(entry.date);
    const record = [play.situation, play.result, play.summary, ...play.confirmed].join(" ");
    for (const fact of entry.facts) expect(record).toMatch(fact);
  }
});

test("editing or importing a study copy cannot mutate canonical actors, paths or ball events", () => {
  for (const play of jetsPlays) {
    const before = JSON.stringify(play);
    const first = getJetsPlayDesign(play.id)!;
    const second = getJetsPlayDesign(play.id)!;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.players).not.toBe(second.players);
    expect(first.players[0]).not.toBe(second.players[0]);
    first.name = "My edited study";
    first.ball.releaseAt = 0;
    first.players[0].x += 1;
    first.players[0].path.push({ x: 15, y: 20 });
    const movingActor = first.players.find((entry) => entry.motionWindow);
    if (movingActor) movingActor.motionWindow!.from += .01;
    const loose = first.ballEvents?.find((event) => event.kind === "loose");
    if (loose) loose.to.x += 1;
    if (first.ballEvents) first.ballEvents[0].at += .01;
    expect(getJetsPlayDesign(play.id)).toEqual(second);
    const imported = validatePlayDesign(JSON.parse(JSON.stringify(second)))!;
    imported.players[0].path.push({ x: 25, y: 30 });
    imported.ball.releaseAt = 1;
    const importedLoose = imported.ballEvents?.find((event) => event.kind === "loose");
    if (importedLoose) importedLoose.to.y += 1;
    expect(getJetsPlayDesign(play.id)).toEqual(second);
    expect(JSON.stringify(play)).toBe(before);
  }
});

test("the Thanksgiving fumble changes possession and carries Gregory toward the Jets' end zone", () => {
  const play = findPlay(/Butt Fumble|Thanksgiving/i);
  const design = getJetsPlayDesign(play.id)!;
  expect(play.jetsSide).toBe("offense");
  expect(play.situation).toMatch(/Q2 9:10.*1st-and-10.*NYJ 31.*0[–-]14/);
  const quarterback = player(design, design.ball.carrierId);
  expect(quarterback.label).toMatch(/6 Sanchez/);
  const moore = design.players.find((entry) => /65 Moore/.test(entry.label))!;
  expect(moore).toBeDefined();
  expect(moore.path).toEqual([]);
  expect(samplePlayer(quarterback, FIELD.duration)).not.toEqual(samplePlayer(quarterback, 0));

  const events = design.ballEvents!;
  expect(events.map((event) => event.kind)).toEqual(["carry", "loose", "carry"]);
  const loose = events.find((event) => event.kind === "loose")!;
  const recovery = events.find((event) => event.kind === "carry" && player(design, event.carrierId).side === "defense");
  expect(loose.kind).toBe("loose");
  expect(recovery?.kind).toBe("carry");
  if (loose.kind !== "loose" || recovery?.kind !== "carry") throw new Error("Missing fumble or defensive recovery");
  const gregory = player(design, recovery.carrierId);
  expect(gregory.label).toMatch(/28 Gregory/);
  expect(gregory.side).toBe("defense");
  expect(loose.until).toBe(recovery.at);
  expect(loose.to).toEqual(samplePlayer(gregory, recovery.at));
  expect(sampleBall(design, recovery.at)).toEqual(samplePlayer(gregory, recovery.at));
  expect(sampleBall(design, FIELD.duration)).toEqual(samplePlayer(gregory, FIELD.duration));
  expect(sampleBall(design, FIELD.duration).y).toBeGreaterThan(sampleBall(design, recovery.at).y);
  for (let tick = Math.ceil(recovery.at * 10); tick <= FIELD.duration * 10; tick += 1) {
    expect(sampleBall(design, tick / 10)).toEqual(samplePlayer(gregory, tick / 10));
  }
  expect(play.illustrative.join(" ")).toMatch(/approach.*not reconstructed/i);
});

test("the fake spike correctly makes Miami the offense and ends with Ingram receiving Marino's pass", () => {
  const play = findPlay(/Fake Spike/i);
  const design = getJetsPlayDesign(play.id)!;
  expect(play.jetsSide).toBe("defense");
  expect(play.opponent).toBe("Miami Dolphins");
  expect(play.situation).toMatch(/1st-and-goal at NYJ 8.*24[–-]21/);
  expect(play.result).toMatch(/0:22.*after score/);
  const quarterback = player(design, design.ball.carrierId);
  const receiver = player(design, design.ball.targetId);
  expect(quarterback.label).toBe("Marino");
  expect(receiver.label).toBe("Ingram");
  expect(quarterback.side).toBe("offense");
  expect(receiver.side).toBe("offense");
  expect(receiver.eligible).toBe(true);
  expect(design.players.filter((entry) => entry.side === "defense").every((entry) => entry.path.length === 0)).toBe(true);
  const throwEvent = design.ballEvents!.find((event) => event.kind === "flight");
  expect(throwEvent?.kind).toBe("flight");
  if (throwEvent?.kind !== "flight") throw new Error("Missing fake-spike pass");
  expect(throwEvent.targetId).toBe(receiver.id);
  const release = samplePlayer(quarterback, throwEvent.at);
  const catchPoint = samplePlayer(receiver, throwEvent.until);
  const midpoint = sampleBall(design, (throwEvent.at + throwEvent.until) / 2);
  expect(midpoint.x).toBeCloseTo((release.x + catchPoint.x) / 2);
  expect(midpoint.y).toBeCloseTo((release.y + catchPoint.y) / 2);
  expect(sampleBall(design, throwEvent.until)).toEqual(catchPoint);
  expect(sampleBall(design, FIELD.duration)).toEqual(samplePlayer(receiver, FIELD.duration));
  expect(play.illustrative.join(" ")).toMatch(/pre-snap clock.*after the touchdown/i);
});

test("each teaching moment is ordered on the board timeline and labels its sourced context", () => {
  for (const play of jetsPlays) {
    expect(play.moments.length).toBeGreaterThanOrEqual(3);
    expect(play.moments[0].at).toBe(0);
    expect(play.moments[play.moments.length - 1].at).toBe(FIELD.duration);
    for (let index = 0; index < play.moments.length; index += 1) {
      const moment = play.moments[index];
      expect(Number.isFinite(moment.at)).toBe(true);
      expect(moment.at).toBeGreaterThanOrEqual(0);
      expect(moment.at).toBeLessThanOrEqual(FIELD.duration);
      if (index) expect(moment.at).toBeGreaterThan(play.moments[index - 1].at);
      expect(moment.label.trim().length).toBeGreaterThan(3);
      expect(moment.detail.trim().length).toBeGreaterThan(15);
      expect(inBounds(sampleBall(play.design, moment.at))).toBe(true);
    }
  }
});
