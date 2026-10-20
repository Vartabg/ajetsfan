import test from "node:test";
import assert from "node:assert/strict";
import { ANALYSIS, studyAt } from "../src/lib/wilson-analysis.mjs";
import { REPLAY } from "../src/lib/wilson-replay.mjs";

test("the three exact rows agree on play identity and remain distinct provider claims", () => {
  assert.equal(ANALYSIS.canonicalPlayId, REPLAY.record.canonicalPlayId);
  assert.equal(ANALYSIS.corpusEdition, REPLAY.record.corpusEdition);
  const { pbp, participation, ftn } = ANALYSIS.charting.raw;
  assert.equal(pbp.game_id, "2022_02_NYJ_CLE");
  assert.equal(pbp.play_id, 4199);
  assert.equal(participation.nflverse_game_id, pbp.game_id);
  assert.equal(participation.play_id, pbp.play_id);
  assert.equal(ftn.nflverse_game_id, pbp.game_id);
  assert.equal(ftn.nflverse_play_id, pbp.play_id);
  assert.equal(participation.number_of_pass_rushers, ftn.n_pass_rushers);
  assert.equal(ftn.n_blitzers, 0);
  assert.equal(participation.defense_coverage_type, "COVER_6");
  assert.equal(participation.defense_man_zone_type, "ZONE_COVERAGE");
  assert.equal(participation.time_to_throw, 2.036);
  assert.equal(participation.was_pressure, false);
  assert.equal(ftn.is_qb_out_of_pocket, false);
});

test("ambiguous historical read encoding stays in provenance and route terminology remains disputed", () => {
  assert.equal(ANALYSIS.charting.raw.ftn.read_thrown, "1");
  assert.equal(ANALYSIS.charting.fields.find((field) => field.key === "read"), undefined);
  assert.equal(ANALYSIS.provenance.readCode.rawValue, "1");
  assert.equal(ANALYSIS.provenance.readCode.status, "Historical 2022 encoding remains unconfirmed.");
  assert.match(ANALYSIS.provenance.readCode.detail, /PR 319/);
  assert.match(ANALYSIS.provenance.readCode.detail, /issue 325 remained open/);
  for (const visible of [ANALYSIS.charting.fields, ANALYSIS.charting.conflicts, ANALYSIS.conclusions, ANALYSIS.roleStudies]) {
    assert.doesNotMatch(JSON.stringify(visible), /(?:first|second|third)[ -]read|read_thrown/);
  }
  assert.equal(ANALYSIS.charting.raw.participation.route, "POST");
  const conflict = ANALYSIS.charting.conflicts.find((entry) => entry.title === "Slant or post?");
  assert.deepEqual(conflict.sourceIds, ["jets-flacco", "participation", "jetx-film"]);
  assert.match(conflict.text, /Bell reports a slant/);
  assert.match(conflict.text, /POST/);
});

test("targeted role questions make conditional decisions without inventing assignments", () => {
  const tackle = studyAt("lt", 1.3);
  assert.equal(tackle.key, "Protect the throwing spot");
  assert.match(tackle.read, /continue outside, counter inside or exchange/);
  assert.match(tackle.technique, /coordinate with the guard/);
  assert.match(tackle.test, /direct inside path.*opens.*retained or redirected/);
  assert.match(tackle.alternative, /actual rules.*unknown/);
  const quarterback = studyAt("qb", 1.3);
  assert.match(quarterback.read, /Conklin underneath and Wilson.*stay occupied or gain depth/);
  assert.match(quarterback.technique, /if the defender closes it/);
  assert.equal(studyAt("qb", 2.3).key, "Review the earlier release");
  assert.match(studyAt("qb", 2.3).read, /^Did the earlier release/);
  assert.doesNotMatch(studyAt("qb", 2.3).technique, /across the body/);
  const deepHelp = studyAt("d11", 2.3);
  assert.equal(deepHelp.key, "When can deeper help leave its threat?");
  assert.match(deepHelp.read, /vertical threat.*rules release/);
  assert.match(deepHelp.hypothesis, /distance from the catch alone does not establish an error/);
  assert.ok(deepHelp.sourceIds.includes("cason-quarters"));
});

test("PBP model metrics preserve probability units and outcome arithmetic", () => {
  const values = Object.fromEntries(ANALYSIS.metrics.map((metric) => [metric.key, metric.value]));
  assert.deepEqual(Object.keys(values).sort(), ["air_yards", "cp", "cpoe", "epa", "wp_after", "wp_before", "wpa", "yac"].sort());
  assert.equal(values.air_yards + values.yac, 15);
  assert.ok(Math.abs(values.wp_after - values.wp_before - values.wpa) < 1e-12);
  assert.ok(Math.abs(100 * (1 - values.cp) - values.cpoe) < 1e-10);
  assert.ok(Math.abs(values.epa - 3.933165545167867) < 1e-12);
  assert.equal(ANALYSIS.metrics.find((metric) => metric.key === "cpoe").unit, "percentage points");
  assert.match(ANALYSIS.metrics.find((metric) => metric.key === "cp").limit, /not Next Gen Stats/);
});

test("22 participant identities do not assign unverified figures or responsibilities", () => {
  assert.equal(ANALYSIS.participants.offense.length, 11);
  assert.equal(ANALYSIS.participants.defense.length, 11);
  const people = [...ANALYSIS.participants.offense, ...ANALYSIS.participants.defense];
  assert.equal(new Set(people.map((person) => person.gsisId)).size, 22);
  assert.ok(people.every((person) => person.figureId === null));
  assert.ok(people.every((person) => Number.isInteger(person.number) && person.number > 0));
  assert.equal(people.find((person) => person.gsisId === REPLAY.record.passer_player_id).name, "Joe Flacco");
  assert.equal(people.find((person) => person.gsisId === REPLAY.record.receiver_player_id).number, 17);
  assert.equal(ANALYSIS.participants.offense.filter((person) => person.position === "OL").length, 5);
  assert.equal(ANALYSIS.participants.defense.filter((person) => person.position === "DB").length, 5);
});

test("every actor gets distinct phase questions, hypotheses and a way to challenge them", () => {
  assert.deepEqual(Object.keys(ANALYSIS.roleStudies).sort(), REPLAY.actors.map((actor) => actor.id).sort());
  for (const phase of ["pre", "develop", "flight", "finish"]) {
    const cards = Object.values(ANALYSIS.roleStudies).map((role) => role.phases[phase]);
    assert.equal(new Set(cards.map((card) => card.read)).size, 22);
    for (const card of cards) {
      assert.equal(card.basis, "inferred");
      for (const field of ["key", "read", "technique", "hypothesis", "test", "alternative", "limit"]) assert.ok(card[field].length > 8, `${card.actorId}/${phase}/${field}`);
      assert.ok(card.sourceIds.includes("model"));
    }
  }
  assert.equal(studyAt("qb", -1).phase, "pre");
  assert.equal(studyAt("qb", NaN).phase, "pre");
  assert.equal(studyAt("qb", 0.799).phase, "pre");
  assert.equal(studyAt("qb", 0.8).phase, "develop");
  assert.equal(studyAt("qb", 2.05).phase, "flight");
  assert.equal(studyAt("qb", 2.85).phase, "finish");
  assert.equal(studyAt("qb", 100).phase, "finish");
  assert.equal(studyAt("not-a-player", 1), null);
  assert.strictEqual(studyAt("wilson", 1), studyAt("wilson", 1));
});

test("sources resolve, editorial limitations stay visible and data provenance is immutable", () => {
  const sourceIds = new Set(ANALYSIS.sources.map((source) => source.id));
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    assert.ok(Object.isFrozen(node));
    if (Array.isArray(node.sourceIds)) for (const id of node.sourceIds) assert.ok(sourceIds.has(id), `Missing source ${id}`);
    for (const value of Object.values(node)) visit(value);
  };
  visit(ANALYSIS);
  assert.match(ANALYSIS.sources.find((source) => source.id === "pff-coverage").limit, /Corey Davis's separate/);
  assert.match(ANALYSIS.conclusions.find((entry) => entry.sourceIds.includes("pff-coverage")).limit, /public assessment does not identify/);
  assert.match(ANALYSIS.conclusions.find((entry) => entry.sourceIds.includes("pff-alignment")).limit, /inference/);
  assert.equal(ANALYSIS.provenance.license.label, "CC BY-SA 4.0");
  assert.equal(Object.keys(ANALYSIS.provenance.sourceHashes).length, 4);
  for (const hash of Object.values(ANALYSIS.provenance.sourceHashes)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.throws(() => { ANALYSIS.charting.raw.ftn.read_thrown = "0"; }, TypeError);
});
