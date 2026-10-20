import test from "node:test";
import assert from "node:assert/strict";
import { REPLAY, clampReplayTime, eventAt, sampleActor, sampleBall } from "../src/lib/wilson-replay.mjs";

const distance = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);

test("the bounded replay is bound to the collected source record and immutable edition", () => {
  const row = REPLAY.record;
  assert.equal(row.canonicalPlayId, `${row.game_id}:${row.play_id}`);
  assert.equal(row.canonicalPlayId, "2022_02_NYJ_CLE:4199");
  assert.equal(row.desc, "(:25) (Shotgun) 19-J.Flacco pass short middle to 17-G.Wilson for 15 yards, TOUCHDOWN.");
  assert.deepEqual([row.qtr, row.time, row.down, row.ydstogo, row.yardline_100, row.yards_gained, row.pass_touchdown], [4, "00:25", 3, 10, 15, 15, 1]);
  assert.equal(row.source.url, "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2022.parquet");
  assert.equal(row.source.sha256, "931121d8897779d7944e2a293e92ed8799c8e5cceef84096ac42339003fedc09");
  assert.equal(row.corpusEdition, "3487ecae1418953352a56fb6c08db56bb1f44a3de171897c60132eae2eb4f8fc");
  assert.deepEqual([row.source.bytes, row.source.originalColumnCount], [20426548, 372]);
  assert.deepEqual([row.total_home_score, row.total_away_score], [30, 30]);
  assert.match(row.scoreNote, /subsequent extra point/);
});

test("there are 11 actors per team; only source-recorded identities receive names and numbers", () => {
  assert.equal(REPLAY.actors.length, 22);
  assert.equal(new Set(REPLAY.actors.map((actor) => actor.id)).size, 22);
  assert.equal(REPLAY.actors.filter((actor) => actor.team === "NYJ").length, 11);
  assert.equal(REPLAY.actors.filter((actor) => actor.team === "CLE").length, 11);
  const recorded = REPLAY.actors.filter((actor) => actor.identityBasis === "recorded");
  assert.deepEqual(recorded.map(({ name, number, gsisId }) => [name, number, gsisId]), [["Joe Flacco", "19", "00-0026158"], ["Garrett Wilson", "17", "00-0037740"]]);
  assert.equal(recorded[0].gsisId, REPLAY.record.passer_player_id);
  assert.equal(recorded[1].gsisId, REPLAY.record.receiver_player_id);
  for (const actor of REPLAY.actors.filter((actor) => actor.identityBasis !== "recorded")) {
    assert.equal(actor.number, null);
    assert.equal(actor.gsisId, null);
    assert.match(actor.name, /role/);
  }
  assert.ok(REPLAY.actors.every((actor) => actor.motionBasis === "inferred"));
});

test("evidence separates the recorded outcome, reported concepts and all authored geometry", () => {
  assert.equal(REPLAY.tracking.available, false);
  assert.match(REPLAY.timeBasis, /Not synchronized/);
  assert.match(REPLAY.tracking.detail, /Every player's alignment/);
  assert.equal(REPLAY.evidence.find((item) => item.id === "slant").basis, "reported");
  assert.equal(REPLAY.evidence.find((item) => item.id === "window").basis, "reported");
  const film = REPLAY.evidence.find((item) => item.id === "baldinger");
  assert.equal(film.videoReviewed, false);
  assert.equal(film.basis, "unreviewed");
  assert.match(film.locator, /game-level link only/);
  for (const event of REPLAY.events) {
    assert.ok(event.evidenceIds.includes("model"), `${event.id} must disclose authored model timing`);
    for (const id of event.evidenceIds) assert.ok(REPLAY.evidence.some((item) => item.id === id));
  }
});

test("the authored offense has seven on the line and five eligible receiving targets", () => {
  const offense = REPLAY.actors.filter((actor) => actor.team === "NYJ");
  const line = offense.filter((actor) => Math.abs(actor.path[0].z - 15) < 0.05);
  assert.equal(line.length, 7, "teaching alignment has seven players on the line of scrimmage");
  const blockers = ["lt", "lg", "c", "rg", "rt"];
  assert.ok(blockers.every((id) => line.some((actor) => actor.id === id)));
  const targets = offense.filter((actor) => !blockers.includes(actor.id) && actor.id !== "qb");
  assert.equal(targets.length, 5);
  const leftEnd = Math.min(...line.map((actor) => actor.path[0].x));
  const rightEnd = Math.max(...line.map((actor) => actor.path[0].x));
  for (const target of targets) {
    const start = target.path[0];
    if (line.includes(target)) {
      assert.ok(start.x === leftEnd || start.x === rightEnd, `${target.id} is an uncovered line end`);
    } else {
      assert.ok(start.z > 15.5, `${target.id} is clearly in the backfield`);
    }
  }
  assert.equal(targets.filter((actor) => line.includes(actor)).length, 2);
  assert.equal(targets.filter((actor) => !line.includes(actor)).length, 3);
});

test("the inspected photograph supports Wilson's appearance without upgrading movement evidence", () => {
  const appearance = REPLAY.evidence.find((item) => item.id === "appearance");
  assert.equal(appearance.basis, "recorded");
  assert.equal(appearance.url, "https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win");
  assert.match(appearance.summary, /Wilson #17.*green helmet, white jersey and white pants/);
  assert.match(appearance.locator, /lead photograph/);
  assert.match(appearance.summary, /no tracking, pose sequence, assignments or additional player identities/);
  assert.equal(REPLAY.tracking.available, false);
  assert.ok(REPLAY.actors.every((actor) => actor.motionBasis === "inferred"));
});

test("observed highlight locators supply related context without synchronizing authored motion", () => {
  assert.deepEqual(REPLAY.sourceFrames.map(({ id, seconds }) => [id, seconds]), [["setup", 251], ["pocket", 253], ["flight", 254], ["finish", 255]]);
  assert.match(REPLAY.sourceFrameContext, /separate from teaching seconds/);
  assert.match(REPLAY.sourceFrameContext, /do not establish or synchronize/);
  const highlights = REPLAY.evidence.find((item) => item.id === "official-highlights");
  assert.equal(highlights.basis, "observed");
  assert.equal(highlights.videoReviewed, true);
  assert.equal(highlights.limitedStillReview, true);
  assert.equal(highlights.reviewMode, "limited-paused-stills");
  assert.match(highlights.summary, /no transcript was reviewed/);
  const expectedContext = { snap: "setup", break: "pocket", release: "flight", catch: "finish", finish: "finish" };
  for (const event of REPLAY.events) {
    assert.equal(event.sourceFrameId, expectedContext[event.id]);
    const source = REPLAY.sourceFrames.find((frame) => frame.id === event.sourceFrameId);
    assert.ok(source);
    assert.ok(source.seconds > REPLAY.duration, "a video locator cannot be mistaken for a teaching event offset");
    assert.notEqual(source.seconds, event.at);
    assert.equal(new URL(source.url).searchParams.get("t"), `${source.seconds}s`);
    assert.ok(event.evidenceIds.includes("official-highlights"));
    assert.ok(event.evidenceIds.includes("model"));
  }
  assert.match(REPLAY.sourceFrames.find((frame) => frame.id === "flight").observation, /intended target is not fully in view/);
  assert.match(REPLAY.sourceFrames.find((frame) => frame.id === "finish").observation, /exact catch instant is not established/);
  assert.ok(REPLAY.actors.every((actor) => actor.motionBasis === "inferred"));
  assert.equal(REPLAY.tracking.available, false);
  assert.deepEqual(REPLAY.events.map(({ at }) => at), [0, 1, 1.7, 2.4, 3]);
  assert.equal(REPLAY.record.corpusEdition, "3487ecae1418953352a56fb6c08db56bb1f44a3de171897c60132eae2eb4f8fc");
});

test("authored paths stay within the field and form a complete finite teaching timeline", () => {
  for (const actor of REPLAY.actors) {
    assert.equal(actor.path[0].t, 0);
    assert.equal(actor.path.at(-1).t, REPLAY.duration);
    for (let i = 0; i < actor.path.length; i++) {
      const point = actor.path[i];
      assert.ok(Number.isFinite(point.t) && Number.isFinite(point.x) && Number.isFinite(point.z));
      assert.ok(Math.abs(point.x) <= 80 / 3);
      assert.ok(point.z >= -10 && point.z <= 30);
      if (i > 0) assert.ok(point.t > actor.path[i - 1].t);
    }
  }
  assert.ok(sampleActor("wilson", 0).z > 15);
  assert.ok(sampleActor("wilson", 2.4).z > 0);
  assert.ok(sampleActor("wilson", 3).z < 0);
});

test("seeking backwards and in arbitrary order gives the same poses and ball with no hidden state", () => {
  const times = Array.from({ length: 46 }, (_, i) => i / 10);
  const snapshot = (time) => ({ actors: REPLAY.actors.map((actor) => sampleActor(actor, time)), ball: sampleBall(time), event: eventAt(time).id });
  const reference = new Map(times.map((time) => [time, snapshot(time)]));
  for (const time of [...times].reverse()) assert.deepEqual(snapshot(time), reference.get(time));
  for (const time of [2.4, 0, 4.5, 1.7, 1, 3, 0.2, 2.4, 1.7]) assert.deepEqual(snapshot(time), reference.get(time));
  assert.ok(Object.isFrozen(REPLAY.actors[0].path[0]));
});

test("boundary and invalid inputs produce finite clamped results", () => {
  for (const input of [NaN, Infinity, -Infinity, undefined, null, "2", {}]) {
    assert.equal(clampReplayTime(input), 0);
    assert.deepEqual(sampleBall(input), sampleBall(0));
    assert.deepEqual(sampleActor("wilson", input), sampleActor("wilson", 0));
  }
  assert.deepEqual(sampleBall(-10), sampleBall(0));
  assert.deepEqual(sampleBall(100), sampleBall(REPLAY.duration));
  assert.deepEqual(sampleActor("wilson", 100), sampleActor("wilson", REPLAY.duration));
  for (const actor of REPLAY.actors) {
    for (const t of [-1, 0, 1, 1.7, 2.4, 4.5, 99]) {
      assert.ok(Object.values(sampleActor(actor, t)).every(Number.isFinite));
    }
    assert.equal(sampleActor(actor, REPLAY.duration).speed, 0);
  }
  assert.throws(() => sampleActor("unverified-player", 0), /Unknown replay actor/);
});

test("yaw follows the mesh's local +z convention and preserves deterministic stationary heading", () => {
  const moving = { team: "NYJ", path: [{ t: 0, x: 0, z: 0 }, { t: 1, x: 1, z: 0 }, { t: 4.5, x: 1, z: 0 }] };
  assert.equal(sampleActor(moving, 0.5).yaw, Math.PI / 2);
  assert.equal(sampleActor(moving, 3).yaw, Math.PI / 2);
  assert.equal(sampleActor("wilson", 0.5).yaw, Math.PI);
  assert.equal(sampleActor("qb", 0.5).yaw, Math.PI, "backpedaling does not turn the quarterback away from the defense");
});

test("release and catch are continuous; after catch the ball follows the receiver without teleporting", () => {
  const epsilon = 1e-7;
  for (const t of [1.4, 1.7, 2.4, 3, 3.6, REPLAY.duration]) {
    assert.ok(distance(sampleBall(t - epsilon), sampleBall(t)) < 0.0001, `left continuity at ${t}`);
    assert.ok(distance(sampleBall(t), sampleBall(t + epsilon)) < 0.0001, `right continuity at ${t}`);
  }
  const from = sampleActor("qb", 1.7);
  assert.ok(distance(sampleBall(1.7), { x: from.x + 0.25, y: 1.45, z: from.z - 0.15 }) < 1e-12);
  for (const t of [2.4, 2.5, 3, 4.5]) {
    const receiver = sampleActor("wilson", t);
    assert.deepEqual(sampleBall(t), { x: receiver.x + 0.25, y: 1.15, z: receiver.z - 0.15 });
  }
  assert.ok(sampleBall(2.05).y > sampleBall(1.7).y);
});

test("event boundaries are inclusive and use teaching seconds", () => {
  assert.deepEqual(REPLAY.events.map(({ id, at, time }) => [id, at, time]), [["snap", 0, 0], ["break", 1, 1], ["release", 1.7, 1.7], ["catch", 2.4, 2.4], ["finish", 3, 3]]);
  for (let i = 1; i < REPLAY.events.length; i++) {
    const event = REPLAY.events[i];
    assert.equal(eventAt(event.at - 0.00001).id, REPLAY.events[i - 1].id);
    assert.equal(eventAt(event.at).id, event.id);
  }
  assert.equal(eventAt(-1).id, "snap");
  assert.equal(eventAt(999).id, "finish");
});
