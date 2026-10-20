import test from "node:test";
import assert from "node:assert/strict";
import { REPLAY, clampReplayTime, eventAt, sampleActor, sampleBall, samplePose } from "../src/lib/wilson-replay.mjs";

const distance = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
const releaseAt = REPLAY.events.find(({ id }) => id === "release").at;
const catchAt = REPLAY.events.find(({ id }) => id === "catch").at;
const finishAt = REPLAY.events.find(({ id }) => id === "finish").at;
const carryAnchor = (id, time, height) => {
  const actor = sampleActor(id, time);
  return { x: actor.x - 0.25 * Math.cos(actor.yaw) + 0.15 * Math.sin(actor.yaw), y: height, z: actor.z + 0.25 * Math.sin(actor.yaw) + 0.15 * Math.cos(actor.yaw) };
};

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
  assert.deepEqual(REPLAY.events.map(({ at }) => at), [0, 1.15, 2.05, 2.85, 3.65]);
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
  assert.equal(sampleActor("wilson", 0).z, 15);
  assert.ok(sampleActor("wilson", catchAt).z > 0);
  assert.ok(sampleActor("wilson", finishAt).z < 0);
});

test("seeking backwards and in arbitrary order gives the same poses and ball with no hidden state", () => {
  const times = [...Array.from({ length: 61 }, (_, i) => i / 10), releaseAt, catchAt, finishAt];
  const snapshot = (time) => ({ actors: REPLAY.actors.map((actor) => sampleActor(actor, time)), poses: REPLAY.actors.map((actor) => samplePose(actor, time)), ball: sampleBall(time), event: eventAt(time).id });
  const reference = new Map(times.map((time) => [time, snapshot(time)]));
  for (const time of [...times].reverse()) assert.deepEqual(snapshot(time), reference.get(time));
  for (const time of [catchAt, 0, 6, releaseAt, 1, finishAt, 0.2, catchAt, releaseAt]) assert.deepEqual(snapshot(time), reference.get(time));
  assert.ok(Object.isFrozen(REPLAY.actors[0].path[0]));
});

test("boundary and invalid inputs produce finite clamped results", () => {
  for (const input of [NaN, Infinity, -Infinity, undefined, null, "2", {}]) {
    assert.equal(clampReplayTime(input), 0);
    assert.deepEqual(sampleBall(input), sampleBall(0));
    assert.deepEqual(sampleActor("wilson", input), sampleActor("wilson", 0));
    assert.deepEqual(samplePose("wilson", input), samplePose("wilson", 0));
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
  for (const t of [releaseAt - 0.35, releaseAt, catchAt, finishAt, 4.3, REPLAY.duration]) {
    assert.ok(distance(sampleBall(t - epsilon), sampleBall(t)) < 0.0001, `left continuity at ${t}`);
    assert.ok(distance(sampleBall(t), sampleBall(t + epsilon)) < 0.0001, `right continuity at ${t}`);
  }
  assert.ok(distance(sampleBall(releaseAt), carryAnchor("qb", releaseAt, 1.8)) < 1e-12);
  for (const t of [catchAt, catchAt + 0.2, finishAt, REPLAY.duration]) {
    assert.deepEqual(sampleBall(t), carryAnchor("wilson", t, 1.15));
  }
  assert.ok(sampleBall((releaseAt + catchAt) / 2).y > sampleBall(releaseAt).y);
});

test("event boundaries are inclusive and use teaching seconds", () => {
  assert.deepEqual(REPLAY.events.map(({ id, at, time }) => [id, at, time]), [["snap", 0, 0], ["break", 1.15, 1.15], ["release", 2.05, 2.05], ["catch", 2.85, 2.85], ["finish", 3.65, 3.65]]);
  for (let i = 1; i < REPLAY.events.length; i++) {
    const event = REPLAY.events[i];
    assert.equal(eventAt(event.at - 0.00001).id, REPLAY.events[i - 1].id);
    assert.equal(eventAt(event.at).id, event.id);
  }
  assert.equal(eventAt(-1).id, "snap");
  assert.equal(eventAt(999).id, "finish");
});

test("smooth authored motion has bounded speed, acceleration and field positions without body overlaps", () => {
  const step = 0.02;
  for (let t = step; t < REPLAY.duration; t += step) {
    const poses = REPLAY.actors.map((actor) => ({ ...sampleActor(actor, t), id: actor.id }));
    for (const pose of poses) {
      assert.ok(Math.abs(pose.x) <= 80 / 3 && pose.z >= -10 && pose.z <= 30);
      assert.ok(pose.speed <= 10.5, `${pose.id} exceeds the authored speed budget at ${t}`);
      const before = sampleActor(pose.id, t - 0.005), after = sampleActor(pose.id, t + 0.005);
      const acceleration = Math.hypot(after.vx - before.vx, after.vz - before.vz) / 0.01;
      assert.ok(acceleration <= 20, `${pose.id} has an implausible authored velocity jump at ${t}: ${acceleration}`);
      const left = sampleActor(pose.id, t - 1e-5), right = sampleActor(pose.id, t + 1e-5);
      assert.ok(Math.abs(pose.vx - (right.x - left.x) / 2e-5) < 0.001);
      assert.ok(Math.abs(pose.vz - (right.z - left.z) / 2e-5) < 0.001);
    }
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        assert.ok(distance(poses[i], poses[j]) >= 0.8, `${poses[i].id}/${poses[j].id} bodies overlap at ${t}`);
      }
    }
  }
});

test("five blockers keep a coordinated pocket against four paired rushers through the throw", () => {
  assert.equal(REPLAY.actors.filter(({ roleFamily }) => roleFamily === "blocker").length, 5);
  assert.equal(REPLAY.actors.filter(({ roleFamily }) => roleFamily === "rusher").length, 4);
  for (const [blocker, rusher] of [["lt", "d1"], ["lg", "d2"], ["rg", "d3"], ["rt", "d4"]]) {
    for (let t = 1; t <= 3.4; t += 0.1) {
      const a = sampleActor(blocker, t), b = sampleActor(rusher, t), qb = sampleActor("qb", t);
      assert.ok(distance(a, b) >= 0.9 && distance(a, b) <= 1.35, `${blocker}/${rusher} lose contact spacing`);
      assert.ok(a.z < qb.z && b.z < qb.z, "rush/protection do not run through the passer");
      assert.equal(samplePose(blocker, t).engagementTarget, rusher);
      assert.equal(samplePose(rusher, t).engagementTarget, blocker);
      assert.ok(samplePose(blocker, t).engagement > 0.5);
    }
  }
  assert.ok(sampleActor("rt", releaseAt).z > sampleActor("lt", releaseAt).z + 0.5, "the edge sets are deliberately asymmetric");
  assert.equal(samplePose("c", 1.5).action, "brace");
  assert.equal(samplePose("c", 1.5).engagementTarget, null);
});

test("all 22 continue through the snap with differentiated, deterministic action and footwork", () => {
  const families = new Set();
  for (const actor of REPLAY.actors) {
    families.add(actor.roleFamily);
    assert.ok(distance(sampleActor(actor, 3), sampleActor(actor, 5.5)) > 0.5, `${actor.id} freezes before the finish`);
    const actions = new Set();
    for (let t = 0; t <= REPLAY.duration; t += 0.1) {
      const pose = samplePose(actor, t);
      actions.add(pose.action);
      assert.equal(pose.basis, "inferred");
      assert.equal(pose.roleFamily, actor.roleFamily);
      assert.ok(pose.actionLabel.length > 4 && pose.actionDetail.length > 15);
      assert.ok(["run", "shuffle", "backpedal", "plant", "dive"].includes(pose.footMode));
      for (const key of ["gait", "engagement", "reach", "dive", "catch", "throw", "carry"]) assert.ok(pose[key] >= 0 && pose[key] <= 1);
      assert.equal(pose.cadence, actor.cadence);
      const next = samplePose(actor, t + 0.01);
      if (t + 0.01 < REPLAY.duration) assert.ok(Math.abs(next.stridePhase - pose.stridePhase - pose.cadence * 0.01) < 1e-10);
      if (pose.engagementTarget) assert.ok(REPLAY.actors.some(({ id }) => id === pose.engagementTarget));
    }
    assert.ok(actions.size >= 3, `${actor.id} repeats one generic gait for the entire snap`);
  }
  assert.equal(families.size, 6);
  assert.equal(samplePose("d7", 0.5).footMode, "backpedal");
  assert.equal(samplePose("d7", 1.5).action, "turn");
  assert.equal(samplePose("d7", 3.5).action, "pursuit");
  assert.ok(samplePose("d6", catchAt).dive > 0.5, "the authored dive reaches toward the reception window");
  assert.equal(samplePose("d6", 4.8).action, "recover");
  assert.equal(samplePose("wilson", catchAt).catch, 1);
  assert.equal(samplePose("wilson", catchAt).carry, 1);
  assert.equal(samplePose("qb", releaseAt).throw, 1);
});

test("cubic sampling preserves position and velocity through every authored waypoint", () => {
  for (const actor of REPLAY.actors) {
    for (const point of actor.path.slice(1, -1)) {
      const exact = sampleActor(actor, point.t), before = sampleActor(actor, point.t - 1e-7), after = sampleActor(actor, point.t + 1e-7);
      assert.ok(distance(exact, point) < 1e-10);
      assert.ok(distance(before, after) < 0.00001);
      assert.ok(Math.hypot(after.vx - before.vx, after.vz - before.vz) < 0.00001);
    }
  }
});

test("the snap accelerates from a stance and the slant gathers before reaccelerating", () => {
  for (const actor of REPLAY.actors) {
    assert.equal(sampleActor(actor, 0).speed, 0, `${actor.id} starts in a stance rather than sliding at full speed`);
    assert.ok(sampleActor(actor, 0.25).speed > 0.1, `${actor.id} responds to the authored snap`);
  }
  for (const id of ["wilson", "x", "z", "y"]) {
    assert.ok(sampleActor(id, 0.5).speed > sampleActor(id, 0.1).speed + 1, `${id} accelerates into the release`);
  }
  const stem = sampleActor("wilson", 0.5), gathered = sampleActor("wilson", 0.95), burst = sampleActor("wilson", 1.8);
  assert.ok(gathered.speed < stem.speed - 0.3, "the break includes real speed reduction");
  assert.ok(burst.speed > gathered.speed + 2, "the receiver accelerates out of the cut");
  assert.ok(samplePose("wilson", 1.2).compression > samplePose("wilson", 1.8).compression + 0.3);
  assert.ok(samplePose("wilson", 1.2).cut > 0.9);
  assert.ok(samplePose("wilson", 1.2).brake > 0.5);
});

test("contact and defensive turns have distinct reactions and continuous body mechanics", () => {
  const contact = ["lt", "lg", "rg", "rt"].map((id) => samplePose(id, 0.7).engagement);
  assert.ok(new Set(contact.map((value) => value.toFixed(2))).size === 4, "the protection does not engage on one shared beat");
  const reactions = ["d5", "d6", "d7", "d8", "d9", "d10", "d11"].map((id) => Array.from({ length: 301 }, (_, i) => i / 100).find((time) => Math.abs(samplePose(id, time).hipOpen) > 0.1));
  assert.ok(reactions.every((time) => Number.isFinite(time)));
  assert.ok(new Set(reactions).size === 7, "defenders do not share one reactive hip-turn onset");
  const keys = ["compression", "drive", "brake", "cut", "contactPulse", "handFight"];
  const angles = ["facingYaw", "pelvisYaw", "torsoYaw"];
  for (const actor of REPLAY.actors) {
    let previous = samplePose(actor, 0);
    for (let i = 1; i <= 1200; i++) {
      const current = samplePose(actor, i * 0.005);
      for (const key of keys) {
        assert.ok(current[key] >= 0 && current[key] <= 1, `${actor.id}/${key} is bounded`);
        assert.ok(Math.abs(current[key] - previous[key]) < 0.06, `${actor.id}/${key} changes without a phase reset`);
      }
      assert.ok(Math.abs(current.bodyRoll) <= 0.16);
      assert.ok(Math.abs(current.hipOpen) <= 1);
      assert.ok(Math.abs(current.hipOpen - previous.hipOpen) < 0.08, `${actor.id} does not flip the hip-opening sign`);
      for (const key of angles) {
        const angle = Math.atan2(Math.sin(current[key] - previous[key]), Math.cos(current[key] - previous[key]));
        assert.ok(Math.abs(angle) < 0.06, `${actor.id}/${key} has no 180-degree shortest-angle branch flip`);
      }
      assert.ok(Math.abs(current.pelvisYaw - current.facingYaw) <= 0.32 + 1e-12);
      assert.ok(Math.abs(current.torsoYaw - current.facingYaw) <= 0.32 + 1e-12);
      previous = current;
    }
  }
});

test("the authored alignment keeps Wilson outside and the anonymous short option settles beneath the throw", () => {
  const wilson = REPLAY.actors.find(({ id }) => id === "wilson");
  const x = REPLAY.actors.find(({ id }) => id === "x");
  const offense = REPLAY.actors.filter(({ team }) => team === "NYJ");
  assert.equal(wilson.path[0].z, 15);
  assert.equal(wilson.path[0].x, Math.min(...offense.map((actor) => actor.path[0].x)), "Wilson occupies the outside end rather than the inside slot");
  assert.ok(x.path[0].x > wilson.path[0].x && x.path[0].z > 15.5);
  assert.equal(offense.filter((actor) => actor.path[0].z === 15).length, 7);
  assert.equal(sampleActor("wilson", catchAt).z, 1, "the authored catch sits near the goal after a 14-yard gain in depth");
  assert.match(wilson.role, /in-breaking route/);
  assert.equal(wilson.motionBasis, "inferred");
  const atThrow = sampleActor("y", releaseAt), atCatch = sampleActor("y", catchAt);
  assert.ok(distance(atThrow, atCatch) < 0.2, "the short option gathers rather than running through the window");
  for (let time = releaseAt; time <= catchAt; time += 0.1) {
    assert.equal(samplePose("y", time).action, "settle");
    assert.ok(sampleActor("y", time).speed < 0.25);
    assert.ok(sampleActor("y", time).z >= 10, "the authored stop remains below the throwing window");
  }
  assert.ok(sampleActor("y", 4.35).speed > 1, "the short option resumes controlled movement after the throw");
  assert.equal(REPLAY.actors.find(({ id }) => id === "y").identityBasis, "inferred");
});
