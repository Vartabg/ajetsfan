import test from "node:test";
import assert from "node:assert/strict";
import { REPLAY } from "../src/lib/wilson-replay.mjs";
import { TEACHING } from "../src/lib/wilson-teaching.mjs";

const actorIds = new Set(REPLAY.actors.map(({ id }) => id));
const evidenceIds = new Set(REPLAY.evidence.map(({ id }) => id));

test("every replay actor has exactly one bound teaching entry on the same canonical play", () => {
  assert.equal(TEACHING.canonicalPlayId, REPLAY.record.canonicalPlayId);
  assert.equal(TEACHING.players.length, 22);
  assert.deepEqual(new Set(TEACHING.players.map(({ id }) => id)), actorIds);
  for (const player of TEACHING.players) {
    const actor = REPLAY.actors.find(({ id }) => id === player.id);
    assert.equal(player.unit, actor.team === "NYJ" ? "offense" : "defense");
    assert.match(player.code, /^[A-Z]{1,3}$/);
    for (const key of ["position", "group", "title", "lesson", "teachingJob"]) assert.ok(player[key].trim().length > 4);
  }
  assert.equal(TEACHING.players.filter(({ unit }) => unit === "offense").length, 11);
  assert.equal(TEACHING.players.filter(({ unit }) => unit === "defense").length, 11);
});

test("only the two recorded identities receive source actions, outcomes and result assessments", () => {
  const supported = TEACHING.players.filter(({ sourceAction, result }) => sourceAction !== null || result !== null);
  assert.deepEqual(supported.map(({ id }) => id), ["qb", "wilson"]);
  for (const player of supported) {
    const actor = REPLAY.actors.find(({ id }) => id === player.id);
    assert.equal(actor.identityBasis, "recorded");
    assert.equal(player.roleBasis, "recorded");
    assert.ok(player.title.includes(actor.name));
    assert.match(player.sourceAction, /15-yard touchdown/);
    assert.match(player.result, /15-yard touchdown/);
    assert.equal(player.assessment.basis, "recorded");
    assert.equal(player.assessment.label, "Recorded result");
    assert.ok(player.assessment.evidenceIds.includes("pbp"));
  }
  const qb = supported.find(({ id }) => id === "qb");
  assert.ok(qb.evidenceIds.includes("window"));
  assert.match(qb.reportedIntent, /Joe Flacco said.*behind the linebackers.*relatively soft safeties/);
  assert.match(qb.reportedConcept, /Flacco said.*window behind the linebackers.*soft safeties/);
  assert.match(qb.result, /tied the score 30–30/);
  const wilson = supported.find(({ id }) => id === "wilson");
  assert.ok(wilson.evidenceIds.includes("slant"));
  assert.match(wilson.reportedIntent, /Jets' written account.*slant/);
  assert.match(wilson.reportedIntent, /not an account of Wilson's personal intent/);
  assert.match(wilson.reportedConcept, /Jets’ account describes a slant: an inward break toward the middle/);
  assert.match(wilson.result, /subsequent extra point/);
  assert.match(wilson.assessment.detail, /exact catch instant is unestablished/);
});

test("anonymous roles carry no invented identities, historical responsibilities or performance grades", () => {
  const anonymous = TEACHING.players.filter(({ roleBasis }) => roleBasis === "inferred");
  assert.equal(anonymous.length, 20);
  for (const player of anonymous) {
    const actor = REPLAY.actors.find(({ id }) => id === player.id);
    assert.equal(actor.number, null);
    assert.equal(actor.gsisId, null);
    assert.match(player.title, /teaching role$/);
    assert.equal(player.sourceAction, null);
    assert.equal(player.reportedIntent, null);
    assert.equal(player.reportedConcept, null);
    assert.equal(player.result, null);
    assert.equal(player.assessment.label, "Not established");
    assert.equal(player.assessment.basis, "unknown");
    assert.match(player.assessment.detail, /actual assignment or individual outcome/);
    assert.deepEqual(player.evidenceIds, ["model"]);
    assert.deepEqual(player.assessment.evidenceIds, ["model"]);
    assert.match(player.teachingJob, /^In this study,/);
    for (const key of ["name", "number", "gsisId", "grade", "score", "rating"]) assert.equal(Object.hasOwn(player, key), false);
    for (const key of ["grade", "score", "rating", "missedAssignment", "overperformance"]) assert.equal(Object.hasOwn(player.assessment, key), false);
    assert.doesNotMatch(JSON.stringify(player), /Joe Flacco|Garrett Wilson|#[0-9]/);
  }
  assert.equal(TEACHING.players.find(({ id }) => id === "y").code, "TE");
  assert.equal(TEACHING.players.find(({ id }) => id === "rb").code, "RB");
  assert.match(TEACHING.legend.roles, /anonymous teaching roles/);
  assert.match(TEACHING.legend.assessments, /Anonymous players are not graded/);
});

test("every evidence reference resolves, without upgrading limited stills into assignments", () => {
  for (const player of TEACHING.players) {
    assert.ok(player.evidenceIds.includes("model"));
    for (const id of [...player.evidenceIds, ...player.assessment.evidenceIds]) assert.ok(evidenceIds.has(id), `${player.id}: ${id}`);
    if (player.roleBasis === "inferred") assert.equal(player.evidenceIds.includes("official-highlights"), false);
  }
  assert.match(TEACHING.legend.sourceActions, /four reviewed stills provide limited context/);
  assert.match(TEACHING.legend.sourceActions, /without supplying full routes, tracking or exact event timing/);
  assert.equal(REPLAY.tracking.available, false);
  assert.ok(REPLAY.actors.every(({ motionBasis }) => motionBasis === "inferred"));
});

test("relationship endpoints are valid and every visual relationship remains explicitly authored", () => {
  assert.equal(new Set(TEACHING.relationships.map(({ id }) => id)).size, TEACHING.relationships.length);
  assert.ok(TEACHING.relationships.length <= 14, "keep the selected-actor teaching scheme bounded");
  for (const line of TEACHING.relationships) {
    assert.ok(actorIds.has(line.from) && actorIds.has(line.to));
    assert.notEqual(line.from, line.to);
    assert.ok(["protection", "coverage", "pass"].includes(line.kind));
    assert.equal(line.basis, "inferred");
    assert.match(line.label, /^Authored /);
    assert.ok(line.evidenceIds.includes("model"));
    for (const id of line.evidenceIds) assert.ok(evidenceIds.has(id));
    if (line.kind !== "pass") assert.deepEqual(line.evidenceIds, ["model"]);
    const from = TEACHING.players.find(({ id }) => id === line.from);
    const to = TEACHING.players.find(({ id }) => id === line.to);
    if (line.kind === "coverage") assert.deepEqual([from.unit, to.unit], ["defense", "offense"]);
    if (line.kind === "protection") assert.equal(from.unit, "offense");
  }
  const pass = TEACHING.relationships.filter(({ kind }) => kind === "pass");
  assert.equal(pass.length, 1);
  assert.deepEqual([pass[0].from, pass[0].to], ["qb", "wilson"]);
  assert.deepEqual(pass[0].evidenceIds, ["pbp", "model"]);
  assert.match(TEACHING.legend.relationships, /do not establish actual matchups/);
});

test("teaching selections cannot mutate the shared model or evidence catalog", () => {
  assert.ok(Object.isFrozen(TEACHING));
  assert.ok(Object.isFrozen(TEACHING.players[0].assessment.evidenceIds));
  assert.ok(Object.isFrozen(TEACHING.relationships[0]));
  assert.throws(() => { TEACHING.players[0].assessment.label = "Elite"; }, TypeError);
  assert.equal(REPLAY.record.canonicalPlayId, "2022_02_NYJ_CLE:4199");
});
