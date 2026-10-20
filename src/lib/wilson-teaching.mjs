import { REPLAY } from "./wilson-replay.mjs";

/**
 * Explanations for the authored study, not recovered personnel or assignments.
 * Evidence can verify a result without supplying a performance grade or matchup.
 */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function supporting(id, code, position, group, teachingJob) {
  const actor = REPLAY.actors.find((candidate) => candidate.id === id);
  if (!actor) throw new Error(`Unknown teaching actor: ${id}`);
  return {
    id, code, position, unit: actor.team === "NYJ" ? "offense" : "defense", group,
    title: `${actor.name.replace(" · role", "")} · teaching role`,
    roleBasis: "inferred", teachingJob,
    sourceAction: null, reportedIntent: null, result: null,
    assessment: {
      label: "Not established", basis: "unknown",
      detail: "This anonymous role and its movement are authored. The available sources do not identify this actor or establish the actual assignment or individual outcome; a performance judgment is unavailable.",
      evidenceIds: ["model"],
    },
    evidenceIds: ["model"],
  };
}

const lessons = {
  qb: "Set behind the line, find the inside receiver, and throw through the window.",
  wilson: "Run upfield, break inward toward the middle, and finish across the goal line.",
  lt: "Retreat to the left edge of the pocket and meet an outside rush.",
  lg: "Set inside the left tackle and hold the pocket's left interior.",
  c: "Hold the middle of the pocket in front of the quarterback.",
  rg: "Set inside the right tackle and hold the pocket's right interior.",
  rt: "Retreat to the right edge of the pocket and meet an outside rush.",
  x: "Run up the left outside lane, then angle inward to create space.",
  z: "Run up the right outside lane and keep the defense wide.",
  y: "Release from behind the line into the right underneath space as an outlet.",
  rb: "Step toward the pocket, then release to the left as an underneath outlet.",
  d1: "Rush around the outside of the left protection edge.",
  d2: "Push toward the left interior of the pocket.",
  d3: "Push toward the right interior of the pocket.",
  d4: "Rush around the outside of the right protection edge.",
  d5: "Gain depth, then close toward the slant window.",
  d6: "Hold the middle underneath, then converge toward the receiver's finish.",
  d7: "Retreat with the left outside route and follow its inward angle.",
  d8: "Retreat with the right outside route and preserve depth.",
  d9: "Widen toward the right underneath outlet.",
  d10: "Stay deep, then react toward the receiver's finish.",
  d11: "Hold opposite-side depth, then close toward the finish.",
};
const reportedConcepts = {
  qb: "Flacco said he looked for a small window behind the linebackers against soft safeties.",
  wilson: "The Jets’ account describes a slant: an inward break toward the middle of the field.",
};

const players = [
  {
    id: "qb", code: "QB", position: "Quarterback", unit: "offense", group: "Backfield",
    title: "Joe Flacco · quarterback", roleBasis: "recorded",
    teachingJob: "Set behind the line, find the inside receiver and deliver through the illustrated window. The drop, read order, release point and teaching timing are authored.",
    sourceAction: "The play record credits Flacco with a completed shotgun pass to Wilson for a 15-yard touchdown.",
    reportedIntent: "Joe Flacco said he wanted the ball behind the linebackers against relatively soft safeties and expected a small throwing window for Wilson.",
    result: "Completed 15-yard touchdown pass; the touchdown tied the score 30–30.",
    assessment: {
      label: "Recorded result", basis: "recorded",
      detail: "The recorded completion and touchdown establish the result. Neither that result nor the limited still review grades Flacco's progression, technique, ball placement or response to pressure.",
      evidenceIds: ["pbp"],
    },
    evidenceIds: ["pbp", "window", "model"],
  },
  {
    id: "wilson", code: "WR", position: "Wide receiver", unit: "offense", group: "Receivers",
    title: "Garrett Wilson · target receiver", roleBasis: "recorded",
    teachingJob: "Stem toward the defense, break inside on the reported slant and finish across the goal. His starting side, release, break, catch point and steps remain authored.",
    sourceAction: "The play record credits Wilson with the 15-yard touchdown reception.",
    reportedIntent: "The Jets' written account identifies the route as a slant. This is a reported route description, not an account of Wilson's personal intent.",
    result: "15-yard touchdown reception; the subsequent extra point provided the 31–30 winning margin.",
    assessment: {
      label: "Recorded result", basis: "recorded",
      detail: "The touchdown reception is recorded and the slant is reported. The exact catch instant is unestablished in the reviewed stills. The evidence does not provide a route-running grade, measured separation or a judgment about a named defender's coverage.",
      evidenceIds: ["pbp", "slant"],
    },
    evidenceIds: ["pbp", "slant", "official-highlights", "model"],
  },
  supporting("lt", "LT", "Left tackle", "Offensive line", "In this study, retreat to the left edge of the pocket and meet the outside rush example. Watch the space beside the quarterback; the actual blocker and matchup are unverified."),
  supporting("lg", "LG", "Left guard", "Offensive line", "In this study, set inside the left tackle and form the pocket's left interior boundary against a nearby rush example. The actual protection assignment is unknown."),
  supporting("c", "C", "Center", "Offensive line", "In this study, hold the middle of the protection and settle in front of the quarterback. The animation begins with the ball in the passer's hands; snapping mechanics and any help assignment are unestablished."),
  supporting("rg", "RG", "Right guard", "Offensive line", "In this study, set inside the right tackle and form the pocket's right interior boundary against a nearby rush example. The actual protection assignment is unknown."),
  supporting("rt", "RT", "Right tackle", "Offensive line", "In this study, retreat to the right edge of the pocket and meet the outside rush example. The real blocker, leverage and matchup are unverified."),
  supporting("x", "X", "Outside wide receiver", "Receivers", "In this study, release from the left outside lane and angle inward to provide complementary spacing. This receiver's actual route and its effect on the defense are unknown."),
  supporting("z", "Z", "Outside wide receiver", "Receivers", "In this study, carry an outside lane toward the end zone and keep width opposite Wilson. The real receiver and route combination are unverified."),
  supporting("y", "TE", "Tight end / eligible receiver", "Receivers", "In this study, release from an off-line alignment into the right underneath space as an outlet. Tight end is a teaching role here; the real personnel and route are unknown."),
  supporting("rb", "RB", "Running back / backfield player", "Backfield", "In this study, step toward the pocket, then release to the left underneath as a check-and-outlet example. The real back, pickup and release decision are unverified."),
  supporting("d1", "DE", "Defensive end / edge", "Defensive line", "In this study, approach the outside of the left protection set to make the pocket edge visible. The real rusher, rush move and matchup are unknown."),
  supporting("d2", "DT", "Defensive tackle / interior", "Defensive line", "In this study, advance toward the left interior protection example. This supplies an interior pocket boundary without identifying a real gap, technique or pass-rush outcome."),
  supporting("d3", "DT", "Defensive tackle / interior", "Defensive line", "In this study, advance toward the right interior protection example. No actual stunt, technique, matchup or individual outcome is established."),
  supporting("d4", "DE", "Defensive end / edge", "Defensive line", "In this study, approach the outside of the right protection set to show the other pocket edge. The actual rusher and protection responsibility are unverified."),
  supporting("d5", "LB", "Linebacker / underneath defender", "Linebackers", "In this study, gain underneath depth and then close toward the slant window. The linebacker label and reaction are illustrative; the real defender, leverage and responsibility are unknown."),
  supporting("d6", "LB", "Linebacker / underneath defender", "Linebackers", "In this study, keep another underneath body near the middle, then converge toward the receiver's finish. This does not identify a man assignment, zone landmark or actual coverage decision."),
  supporting("d7", "CB", "Cornerback / outside defender", "Secondary", "In this study, retreat alongside the left outside route example and follow its inward angle. This authored reaction is not a recovered matchup or proof of man coverage."),
  supporting("d8", "CB", "Cornerback / outside defender", "Secondary", "In this study, retreat alongside the right outside release to preserve depth. The actual cornerback, leverage and coverage responsibility are unknown."),
  supporting("d9", "NB", "Nickel back / inside defensive back", "Secondary", "In this study, widen toward the right underneath outlet. Nickel back is a teaching role; the real package, identity and assignment are unverified."),
  supporting("d10", "S", "Safety / deep defender", "Secondary", "In this study, begin deeper than the underneath roles, then react toward Wilson's finish. The position and path illustrate space for the throwing-window explanation; no real safety rotation is identified."),
  supporting("d11", "S", "Safety / deep defender", "Secondary", "In this study, hold opposite-side depth and close toward the finish. Safety is a teaching role here; the actual defender's location, read and responsibility are unverified."),
].map((player) => ({ ...player, lesson: lessons[player.id], reportedConcept: reportedConcepts[player.id] ?? null }));

const relationship = (id, from, to, kind, label, evidenceIds = ["model"]) => ({
  id, from, to, kind, label, basis: "inferred", evidenceIds,
});

export const TEACHING = deepFreeze({
  schemaVersion: 1,
  canonicalPlayId: REPLAY.record.canonicalPlayId,
  players,
  // The studio can show this bounded scheme, emphasizing the selected actor's relationships.
  // Even the pass line's geometry is authored; PBP verifies only its participants/result.
  relationships: [
    relationship("pass", "qb", "wilson", "pass", "Authored pass path · recorded Flacco-to-Wilson connection", ["pbp", "model"]),
    relationship("left-edge", "lt", "d1", "protection", "Authored left-edge protection example"),
    relationship("left-interior", "lg", "d2", "protection", "Authored left-interior protection example"),
    relationship("middle-pocket", "c", "qb", "protection", "Authored middle-pocket support"),
    relationship("right-interior", "rg", "d3", "protection", "Authored right-interior protection example"),
    relationship("right-edge", "rt", "d4", "protection", "Authored right-edge protection example"),
    relationship("backfield-check", "rb", "qb", "protection", "Authored backfield protection check"),
    relationship("left-underneath", "d5", "wilson", "coverage", "Authored underneath reaction toward the slant"),
    relationship("right-underneath", "d6", "wilson", "coverage", "Authored second underneath reaction"),
    relationship("left-outside", "d7", "x", "coverage", "Authored reaction to the left outside route"),
    relationship("right-outside", "d8", "z", "coverage", "Authored reaction to the right outside route"),
    relationship("outlet-reaction", "d9", "y", "coverage", "Authored reaction to the underneath outlet"),
    relationship("left-deep", "d10", "wilson", "coverage", "Authored deep reaction toward the finish"),
    relationship("right-deep", "d11", "wilson", "coverage", "Authored opposite deep reaction"),
  ],
  legend: {
    roles: "Only Flacco and Wilson have established identities. All other position labels are anonymous teaching roles; the actual personnel, formation and individual assignments remain unverified.",
    relationships: "Every relationship line is authored and inferred, including the geometry of the recorded pass. Protection and coverage lines illustrate a teaching scheme; they do not establish actual matchups, coverage calls or responsibilities.",
    assessments: "A recorded result can be stated without grading how a player performed. Anonymous players are not graded; the evidence does not establish missed assignments, wins, losses or overperformance.",
    sourceActions: "Recorded actions and results are supplied only for Flacco and Wilson. The reported slant and quarterback account add explanation; four reviewed stills provide limited context without supplying full routes, tracking or exact event timing.",
  },
});
