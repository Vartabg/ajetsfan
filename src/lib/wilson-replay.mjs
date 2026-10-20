/**
 * A bounded teaching reconstruction, bound to an immutable collected PBP edition.
 * No sampled position, rotation, speed or model time below is observed tracking.
 * Coordinate units are yards: x lateral, y up, z distance to Cleveland's goal.
 * Cleveland's goal is z=0; the LOS is z=15. Offense advances toward decreasing z.
 * Player meshes face local +z: yaw = atan2(dx, dz), in radians.
 */

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const DURATION = 6;
const RELEASE = 2.05;
const CATCH = 2.85;
const FINISH = 3.65;
const sourceUrl = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2022.parquet";
const accountUrl = "https://www.newyorkjets.com/news/jets-joe-cool-puts-cleveland-in-the-deep-freeze-with-a-stirring-comeback-victory";
const highlightsUrl = "https://www.youtube.com/watch?v=LR1zPFNjOMM";
const modelNote = "Authored teaching positions and movement; not measured tracking or a verified assignment.";
const path = (points) => points.map(([t, x, z]) => ({ t, x, z }));
const anonymous = (id, name, team, role, points, note = modelNote) => ({
  id, name, team, role, number: null, gsisId: null,
  identityBasis: "inferred", motionBasis: "inferred", note, path: path(points),
});

const actors = [
  {
    id: "qb", name: "Joe Flacco", team: "NYJ", number: "19", role: "Quarterback",
    gsisId: "00-0026158", identityBasis: "recorded", motionBasis: "inferred",
    note: "Passer and jersey number are recorded. Drop, pocket, footwork and throw mechanics are authored.",
    path: path([[0, 0, 20], [0.65, 0, 21.6], [1.2, 0.2, 22.1], [1.7, 0.35, 22.25], [2.05, 0.35, 22.25], [2.4, 0.4, 22.2], [3.65, 0.7, 21.9], [4.6, 0.85, 21.5], [6, 1.2, 20.8]]),
  },
  {
    id: "wilson", name: "Garrett Wilson", team: "NYJ", number: "17", role: "Target receiver · reported slant",
    gsisId: "00-0037740", identityBasis: "recorded", motionBasis: "inferred",
    note: "Receiver, jersey and touchdown are recorded; the slant is reported in the Jets account. Starting side, route geometry, catch position and timing are authored.",
    path: path([[0, -7, 16.2], [0.5, -7, 13.5], [0.85, -6.65, 11.9], [1.15, -5.8, 10.4], [1.55, -4.2, 8.6], [2.05, -1.7, 6.6], [2.85, 3, 2.2], [3.65, 5.1, -1.4], [4.3, 6, -4], [5.1, 8, -5], [6, 8.6, -6]]),
  },
  anonymous("lt", "Left tackle · role", "NYJ", "Anonymous protection role", [[0, -3.2, 15], [0.55, -3.45, 15.8], [1.15, -3.65, 16.6], [2.05, -3.9, 17.4], [2.85, -4.4, 18], [3.65, -4.8, 18.1], [4.35, -4.6, 17.7], [5.1, -4, 16.2], [6, -3.2, 14.5]]),
  anonymous("lg", "Left guard · role", "NYJ", "Anonymous protection role", [[0, -1.6, 15], [0.55, -1.7, 15.7], [1.15, -1.8, 16.4], [2.05, -2, 17], [2.85, -2.2, 17.5], [3.65, -2.3, 17.8], [4.35, -2.1, 17.6], [5.1, -1.6, 16.6], [6, -1, 15]]),
  anonymous("c", "Center · role", "NYJ", "Anonymous protection role", [[0, 0, 15], [0.55, -0.1, 15.7], [1.15, -0.15, 16.2], [2.05, -0.35, 16.8], [2.85, -0.5, 17.1], [3.65, -0.6, 17.3], [4.35, -0.4, 17], [5.1, -0.2, 16.5], [6, 0, 15.9]]),
  anonymous("rg", "Right guard · role", "NYJ", "Anonymous protection role", [[0, 1.6, 15], [0.55, 1.7, 15.7], [1.15, 1.8, 16.4], [2.05, 2, 17], [2.85, 2.2, 17.5], [3.65, 2.3, 17.8], [4.35, 2.1, 17.6], [5.1, 1.6, 16.6], [6, 1, 15]]),
  anonymous("rt", "Right tackle · role", "NYJ", "Anonymous protection role", [[0, 3.2, 15], [0.55, 3.6, 16], [1.15, 3.95, 17], [2.05, 4.6, 18.2], [2.85, 5, 18.7], [3.65, 5.1, 18.9], [4.35, 5, 18.3], [5.1, 4.6, 16.8], [6, 3.8, 15]]),
  anonymous("x", "Outside receiver A · role", "NYJ", "Anonymous complementary route", [[0, -20, 15], [0.5, -20.2, 12.4], [1.15, -20, 9], [2.05, -18, 4.5], [2.85, -14.5, 0], [3.65, -10.5, -3], [4.35, -7.8, -4.1], [5.1, -5.5, -4.7], [6, -3.5, -5]]),
  anonymous("z", "Outside receiver B · role", "NYJ", "Anonymous complementary route", [[0, 21, 15], [0.5, 21.1, 12], [1.15, 20.8, 8], [2.05, 20.5, 3.3], [2.85, 20, -1], [3.65, 17.5, -3], [4.35, 15.6, -4.3], [5.1, 13.5, -5], [6, 12.2, -5.4]]),
  anonymous("y", "Eligible receiver · role", "NYJ", "Anonymous outlet", [[0, 6, 16.2], [0.5, 6.8, 14.8], [1.15, 8.2, 13.3], [2.05, 11.5, 10.5], [2.85, 14.3, 7.5], [3.65, 15.5, 4.7], [4.35, 14.8, 2.6], [5.1, 13.5, 0.5], [6, 12.2, -0.9]]),
  anonymous("rb", "Backfield player · role", "NYJ", "Anonymous check and outlet", [[0, -3, 21], [0.5, -3.3, 19.8], [1.15, -4.6, 18.2], [2.05, -7.3, 16.3], [2.85, -10, 12.4], [3.65, -11.4, 8], [4.35, -10.5, 5.4], [5.1, -8.5, 3.3], [6, -7.2, 2.1]]),
  anonymous("d1", "Edge defender A · role", "CLE", "Anonymous rush example", [[0, -4.3, 14], [0.55, -4.4, 15], [1.15, -4.45, 15.95], [2.05, -4.7, 16.65], [2.85, -5.2, 17.2], [3.65, -5.6, 17.3], [4.35, -5.8, 16.7], [5.1, -6.2, 15.2], [6, -5.5, 12.5]]),
  anonymous("d2", "Interior defender A · role", "CLE", "Anonymous rush example", [[0, -1.8, 14], [0.55, -2.1, 14.8], [1.15, -2.3, 15.4], [2.05, -2.6, 16], [2.85, -2.9, 16.5], [3.65, -3, 16.8], [4.35, -3.1, 16.4], [5.1, -3.5, 15.2], [6, -3.3, 13]]),
  anonymous("d3", "Interior defender B · role", "CLE", "Anonymous rush example", [[0, 1.8, 14], [0.55, 2.1, 14.8], [1.15, 2.3, 15.4], [2.05, 2.6, 16], [2.85, 2.9, 16.5], [3.65, 3, 16.8], [4.35, 3.1, 16.4], [5.1, 3.5, 15.2], [6, 3.3, 13]]),
  anonymous("d4", "Edge defender B · role", "CLE", "Anonymous rush example", [[0, 4.3, 14], [0.55, 4.6, 15.2], [1.15, 4.75, 16.25], [2.05, 5.4, 17.45], [2.85, 5.8, 17.9], [3.65, 5.9, 18.1], [4.35, 6.2, 17.2], [5.1, 6.4, 15.6], [6, 5.9, 13]]),
  anonymous("d5", "Underneath defender A · role", "CLE", "Anonymous reaction example", [[0, -4, 10], [0.55, -4.3, 8.8], [1.15, -4.5, 7], [2.05, -3, 5.5], [2.85, -1, 3.5], [3.65, 2.5, 0], [4.35, 4.2, -1.8], [5.1, 5.7, -3.3], [6, 6.6, -4.1]], "Underneath reaction illustrates Flacco's reported window. Identity, depth, leverage and responsibility are unverified; this is not an identified linebacker or coverage call."),
  anonymous("d6", "Underneath defender B · role", "CLE", "Anonymous reaction example", [[0, 3, 10], [0.55, 3.2, 8.6], [1.15, 3.4, 7], [2.05, 3.7, 5.5], [2.85, 4.2, 3.2], [3.25, 4.8, 1.6], [3.65, 5.3, 0.2], [4.35, 5.9, -0.5], [5.1, 6.2, -0.9], [6, 6.7, -1.5]], "An anonymous authored pursuit, dive and recovery supplies the qualitative finish visible in the reviewed broadcast. It does not identify the actual defender, exact dive time or assignment."),
  anonymous("d7", "Outside defender A · role", "CLE", "Anonymous coverage reaction", [[0, -19, 10], [0.55, -19.2, 8], [1.15, -19, 6], [2.05, -17.2, 2.2], [2.85, -13.7, -1], [3.65, -9.8, -3.7], [4.35, -6.8, -4.9], [5.1, -3.8, -5.6], [6, -1.5, -6.1]]),
  anonymous("d8", "Outside defender B · role", "CLE", "Anonymous coverage reaction", [[0, 20, 10], [0.55, 20.1, 7.8], [1.15, 19.8, 5.2], [2.05, 19.5, 0.8], [2.85, 18.5, -3], [3.65, 15.7, -4.2], [4.35, 13.4, -5.5], [5.1, 11.5, -6.4], [6, 10.5, -7]]),
  anonymous("d9", "Inside defensive back · role", "CLE", "Anonymous outlet reaction", [[0, 8, 11], [0.55, 8.8, 10.5], [1.15, 10, 10], [2.05, 12.5, 8], [2.85, 14.1, 5.8], [3.65, 13.8, 3.5], [4.35, 12.1, 1.1], [5.1, 10.2, -1], [6, 9.2, -2.3]]),
  anonymous("d10", "Deep defender A · role", "CLE", "Anonymous deep reaction", [[0, -7, 1], [0.55, -6.7, 0.6], [1.15, -6, 0.2], [2.05, -3, 0.3], [2.85, 0.8, 0.1], [3.65, 3.8, -2.1], [4.35, 5.2, -4], [5.1, 6.4, -5.2], [6, 7, -6.5]], "Deep alignment illustrates relatively soft safeties in Flacco's account. Exact depth, player identity, rotation and path are authored."),
  anonymous("d11", "Deep defender B · role", "CLE", "Anonymous deep reaction", [[0, 7, 1], [0.55, 7.1, 0.6], [1.15, 7.2, 0.2], [2.05, 6.8, -0.1], [2.85, 6.5, -0.6], [3.65, 7.5, -2.4], [4.35, 9, -3.5], [5.1, 10.2, -4.3], [6, 11, -5]]),
];

const engagementPairs = { lt: "d1", lg: "d2", rg: "d3", rt: "d4", d1: "lt", d2: "lg", d3: "rg", d4: "rt" };
for (const [index, actor] of actors.entries()) {
  actor.roleFamily = actor.id === "qb" ? "quarterback" : ["lt", "lg", "c", "rg", "rt"].includes(actor.id) ? "blocker" : ["d1", "d2", "d3", "d4"].includes(actor.id) ? "rusher" : actor.id === "rb" ? "back" : actor.team === "NYJ" ? "receiver" : "coverage";
  actor.engagementTarget = engagementPairs[actor.id] ?? null;
  actor.cadence = ({ quarterback: 1.65, blocker: 2.3, rusher: 2.15, receiver: 2.05, back: 1.95, coverage: 1.85 })[actor.roleFamily] + (index % 3) * 0.06;
  actor.strideSeed = (index * 0.173) % 1;
}

const event = (id, at, label, detail, basis, evidenceIds, sourceFrameId) => ({ id, at, time: at, label, detail, basis, evidenceIds, sourceFrameId });

export const REPLAY = deepFreeze({
  id: "wilson-cleveland-2022", title: "Wilson finishes the Cleveland comeback",
  duration: DURATION,
  timeBasis: "Authored teaching seconds. Not synchronized to video or measured elapsed time. The recorded :25 start and reported :22 after the score do not validate model offsets.",
  sourceFrameContext: "Related paused source context only. Video locators are separate from teaching seconds; they do not establish or synchronize the authored model's event boundaries.",
  sourceFrames: [
    { id: "setup", seconds: 251, label: "4:11 · shotgun setup", observation: "The paused still shows a pre-snap shotgun alignment with receivers split on both sides. The scorebug shows NYJ 24, CLE 30, Q4 :25 and 3rd-and-10. The recorded play and game context corroborate the play identity.", url: `${highlightsUrl}&t=251s` },
    { id: "pocket", seconds: 253, label: "4:13 · pocket context", observation: "Passer #19 is upright in the pocket behind line engagements. Focused frame-advance review shows five offensive linemen forming a changing pocket against four visible rushers, with an edge engagement deeper than the interior. Flacco's identity is corroborated by the recorded play and game context; individual protection assignments remain unverified.", url: `${highlightsUrl}&t=253s` },
    { id: "flight", seconds: 254, label: "4:14 · airborne ball", observation: "The ball is visibly airborne. The intended target is not fully in view; this paused still does not establish the exact release instant or target location.", url: `${highlightsUrl}&t=254s` },
    { id: "finish", seconds: 255, label: "4:15 · finish context", observation: "A receiving player is upright with the ball near the goal-line area, with a Cleveland defender extended on the turf behind him. The scorebug shows :22. Wilson's identity is corroborated by the recorded play and game context, not solely jersey pixels. The exact catch instant is not established.", url: `${highlightsUrl}&t=255s` },
  ],
  coordinates: { units: "yards", x: "Lateral; sideline bounds ±26⅔", y: "Height", z: "Distance to Cleveland goal; LOS 15, goal 0, back of end zone −10", forward: "Offense moves toward decreasing z; mesh faces local +z; yaw atan2(dx,dz)." },
  tracking: { available: false, label: "No tracking coordinates", detail: "Every player's alignment, path, speed, facing and animation, plus the ball trajectory and teaching timing, is inferred/authored. Only two player identities are established here." },
  record: {
    canonicalPlayId: "2022_02_NYJ_CLE:4199", game_id: "2022_02_NYJ_CLE", play_id: 4199,
    season: 2022, season_type: "REG", week: 2, game_date: "2022-09-18",
    home_team: "CLE", away_team: "NYJ", posteam: "NYJ", defteam: "CLE",
    qtr: 4, time: "00:25", quarter_seconds_remaining: 25,
    down: 3, ydstogo: 10, yardline_100: 15, yards_gained: 15,
    play_type: "pass", touchdown: 1, pass_touchdown: 1,
    desc: "(:25) (Shotgun) 19-J.Flacco pass short middle to 17-G.Wilson for 15 yards, TOUCHDOWN.",
    passer_player_id: "00-0026158", passer_player_name: "J.Flacco",
    receiver_player_id: "00-0037740", receiver_player_name: "G.Wilson",
    total_home_score: 30, total_away_score: 30, home_score: 30, away_score: 31,
    scoreNote: "This touchdown tied the game 30–30. The subsequent extra point provided the 31–30 winning margin.",
    corpusEdition: "3487ecae1418953352a56fb6c08db56bb1f44a3de171897c60132eae2eb4f8fc",
    source: {
      url: sourceUrl, name: "play_by_play_2022.parquet", fetchedAt: "2026-10-20T17:40:02.751Z",
      sha256: "931121d8897779d7944e2a293e92ed8799c8e5cceef84096ac42339003fedc09",
      bytes: 20426548, originalColumnCount: 372,
    },
  },
  evidence: [
    { id: "pbp", label: "Recorded · play-by-play", basis: "recorded", title: "nflverse 2022 play-by-play", url: sourceUrl, summary: "Third-and-10 at CLE 15, Q4 :25. Shotgun. Flacco to Wilson for a 15-yard touchdown.", locator: "game_id 2022_02_NYJ_CLE · play_id 4199", reviewedAt: "2026-10-20T17:48:38.013Z" },
    { id: "slant", label: "Reported · slant", basis: "reported", title: "Jack Bell's Jets game account", url: accountUrl, summary: "Jack Bell describes the winning Flacco-to-Wilson touchdown as a 15-yard slant.", locator: "Opening account, paragraph describing the winning score.", reviewedAt: "2026-10-20T17:27:16Z" },
    { id: "window", label: "Reported · Flacco's account", basis: "reported", title: "Joe Flacco, quoted by Jack Bell", url: accountUrl, summary: "Flacco said he wanted the ball behind the linebackers against relatively soft safeties, through a small window to Wilson.", locator: "Final Flacco answer about the play called through his headset.", reviewedAt: "2026-10-20T17:27:16Z", note: "Participant recollection, not measured defender positions or an independently verified coverage call." },
    { id: "baldinger", label: "Source link · video unreviewed", basis: "unreviewed", title: "Baldy's Breakdown · Garrett Wilson's Big Day Against the Browns", url: "https://www.newyorkjets.com/video/baldy-s-breakdown-garrett-wilson-s-big-day-against-the-browns", summary: "Publisher metadata links Brian Baldinger's analysis to this game and Wilson. The collected edition did not inspect the video or verify this exact snap or any offsets.", locator: "Publisher title, description and publication date; game-level link only.", publishedAt: "2022-09-20", reviewedAt: "2026-10-20T17:27:16Z", videoReviewed: false },
    { id: "appearance", label: "Recorded · original photograph", basis: "recorded", title: "Jets game recap · Wilson photograph", url: "https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win", summary: "The inspected published still shows Wilson #17 wearing a green helmet, white jersey and white pants. It supplies no tracking, pose sequence, assignments or additional player identities.", locator: "Original game recap · lead photograph (inspected still)." },
    { id: "official-highlights", label: "Observed · official highlight stills", basis: "observed", title: "New York Jets Top Plays vs. Cleveland Browns | 2022 Regular Season Week 2", url: highlightsUrl, summary: "Limited review of four indexed paused views and focused frame advances around 4:12–4:15 in the New York Jets' official 4:58 highlight upload, whose description identifies 09/18/2022. The views show a changing five-player pocket against four rushers, releases on both sides, a back moving laterally, and an extended defender behind the receiving finish. The 4:11, 4:13, 4:14 and 4:15 links are video locators, not measured animation events. The exact catch instant, full routes, assignments and tracking coordinates are unestablished; no transcript was reviewed.", locator: "Indexed paused views at video locators 251, 253, 254 and 255 seconds, plus focused frame-advance study around 252–255 seconds; related qualitative context only.", videoReviewed: true, limitedStillReview: true, reviewMode: "limited-paused-stills", note: "Later visual evidence reviewed for this replay task; the collected corpus edition and source hash are unchanged. Play/player identity is corroborated by the existing PBP and game context. The anonymous pairing and dive in the teaching model remain authored rather than identified historical assignments." },
    { id: "model", label: "Inferred · all movement", basis: "inferred", title: "Authored 3D teaching reconstruction", url: null, summary: "All 22 paths, positions, body animation, ball height, camera views and event offsets are authored. The other 20 players are anonymous roles. Complementary routes, protection and defensive jobs are illustrative.", locator: "This replay's authored model; no tracking or verified video timecodes." },
  ],
  events: [
    event("snap", 0, "Shotgun start", "The PBP records shotgun. Teaching time begins with the ball in Flacco's hands; snap mechanics and alignment are illustrative.", "inferred", ["pbp", "model", "official-highlights"], "setup"),
    event("break", 1.15, "Find the slant", "Wilson's slant is reported. The break point and angle shown here are authored; follow the highlighted receiver toward the middle.", "reported", ["slant", "model", "official-highlights"], "pocket"),
    event("release", RELEASE, "Throwing window", "Flacco recalled a window behind the linebackers against soft safeties. These anonymous defender positions illustrate that account.", "reported", ["window", "model", "official-highlights"], "flight"),
    event("catch", CATCH, "Catch and finish", "The source records a completed 15-yard touchdown to Wilson. This catch location, ball arc and receiver's remaining steps are inferred.", "recorded", ["pbp", "model", "official-highlights"], "finish"),
    event("finish", FINISH, "Touchdown · 30–30", "Wilson's touchdown ties the game. Zuerlein's following extra point supplies the winning 31–30 margin; it is outside this replay.", "recorded", ["pbp", "model", "official-highlights"], "finish"),
  ],
  actors,
});

/** Non-finite or non-number input resets to the teaching start. */
export function clampReplayTime(time) {
  return typeof time === "number" && Number.isFinite(time) ? Math.min(DURATION, Math.max(0, time)) : 0;
}

const tangentCache = new WeakMap();
const smooth01 = (from, to, t) => {
  const u = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return u * u * (3 - 2 * u);
};
const mixAngle = (a, b, weight) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * weight;
function resolveActor(actor) {
  const selected = typeof actor === "string" ? REPLAY.actors.find((candidate) => candidate.id === actor) : actor;
  if (!selected?.path?.length) throw new Error(`Unknown replay actor: ${typeof actor === "string" ? actor : "missing path"}`);
  return selected;
}

function tangents(points, key) {
  if (points.length < 2) return [0];
  const gaps = points.slice(1).map((point, i) => point.t - points[i].t);
  const slopes = points.slice(1).map((point, i) => (point[key] - points[i][key]) / gaps[i]);
  const values = [slopes[0]];
  // Shape-preserving cubic Hermite slopes avoid overshoot and keep velocity
  // continuous through authored waypoints, rather than stopping at every key.
  for (let i = 1; i < points.length - 1; i++) {
    const before = slopes[i - 1], after = slopes[i];
    const a = 2 * gaps[i] + gaps[i - 1], b = gaps[i] + 2 * gaps[i - 1];
    values.push(before * after <= 0 ? 0 : (a + b) / (a / before + b / after));
  }
  values.push(0); // Settle at the end of the complete teaching snap.
  return values;
}

function sampleMotion(actor, time) {
  const points = actor.path;
  const t = clampReplayTime(time);
  if (points.length === 1 || t >= points.at(-1).t) return { x: points.at(-1).x, z: points.at(-1).z, vx: 0, vz: 0 };
  let prepared = Object.isFrozen(points) ? tangentCache.get(points) : undefined;
  if (!prepared) {
    prepared = { x: tangents(points, "x"), z: tangents(points, "z") };
    if (Object.isFrozen(points)) tangentCache.set(points, prepared);
  }
  let index = points.findIndex((point, i) => i < points.length - 1 && t < points[i + 1].t);
  if (index < 0) index = points.length - 2;
  const start = points[index], end = points[index + 1], gap = end.t - start.t;
  const u = Math.min(1, Math.max(0, (t - start.t) / gap));
  const result = {};
  for (const key of ["x", "z"]) {
    const a = start[key], b = end[key], ma = prepared[key][index], mb = prepared[key][index + 1];
    result[key] = (2 * u ** 3 - 3 * u ** 2 + 1) * a + (u ** 3 - 2 * u ** 2 + u) * gap * ma + (-2 * u ** 3 + 3 * u ** 2) * b + (u ** 3 - u ** 2) * gap * mb;
    result[`v${key}`] = ((6 * u ** 2 - 6 * u) * a + (3 * u ** 2 - 4 * u + 1) * gap * ma + (-6 * u ** 2 + 6 * u) * b + (3 * u ** 2 - 2 * u) * gap * mb) / gap;
  }
  return result;
}

function movementHeading(actor, t, motion) {
  if (Math.hypot(motion.vx, motion.vz) > 0.05) return Math.atan2(motion.vx, motion.vz);
  const before = sampleMotion(actor, t - 0.12), after = sampleMotion(actor, t + 0.12);
  const dx = after.x - before.x, dz = after.z - before.z;
  if (Math.hypot(dx, dz) > 1e-6) return Math.atan2(dx, dz);
  for (let index = actor.path.length - 1; index > 0; index--) {
    const last = actor.path[index], previous = actor.path[index - 1];
    if (Math.hypot(last.x - previous.x, last.z - previous.z) > 1e-6) return Math.atan2(last.x - previous.x, last.z - previous.z);
  }
  return actor.team === "NYJ" ? Math.PI : 0;
}

function facingHeading(actor, t, motion) {
  const heading = movementHeading(actor, t, motion);
  if (actor.facingYaw !== undefined) return actor.facingYaw;
  const toward = (id) => {
    const target = sampleMotion(resolveActor(id), t);
    return Math.atan2(target.x - motion.x, target.z - motion.z);
  };
  if (actor.roleFamily === "quarterback") return mixAngle(Math.PI, toward("wilson"), smooth01(1.2, 1.85, t));
  if (actor.roleFamily === "blocker") return mixAngle(actor.engagementTarget ? toward(actor.engagementTarget) : Math.PI, heading, smooth01(3.7, 4.7, t));
  if (actor.roleFamily === "rusher") return mixAngle(toward(actor.engagementTarget), heading, smooth01(3.55, 4.45, t));
  if (actor.roleFamily === "coverage") {
    const turn = ["d7", "d8"].includes(actor.id) ? [1.1, 1.95] : actor.id === "d9" ? [0.6, 1.5] : [1.65, 2.4];
    return mixAngle(toward("qb"), heading, smooth01(turn[0], turn[1], t));
  }
  return heading;
}

/** Pure absolute-time sampling with continuous authored position/velocity. */
export function sampleActor(actor, time) {
  const selected = resolveActor(actor), t = clampReplayTime(time), motion = sampleMotion(selected, t);
  return { ...motion, yaw: facingHeading(selected, t, motion), speed: Math.hypot(motion.vx, motion.vz) };
}

const actionCopy = {
  drop: ["Drop into the pocket", "Take controlled backward steps while keeping the shoulders toward the play."],
  set: ["Set to throw", "Gather the feet and keep the inside receiver in view."],
  throw: ["Deliver the pass", "Plant, turn the shoulders and send the ball toward Wilson."],
  "follow-through": ["Follow the throw", "Complete the throwing motion and watch the ball travel."],
  watch: ["Watch the finish", "Turn toward the result and settle the feet."],
  release: ["Release off the line", "Accelerate into the route and establish space."],
  stem: ["Run the stem", "Carry the route upfield before the inward break."],
  break: ["Break inside", "Plant and turn inward toward the middle of the field."],
  route: ["Continue the route", "Run the complementary lane as the pass develops."],
  catch: ["Receive the ball", "Reach, secure the ball and prepare to continue forward."],
  carry: ["Carry across the goal", "Keep the ball secure and run through the finish."],
  finish: ["Continue through the finish", "Follow the play into the end-zone area and ease the stride."],
  "pass-set": ["Set the pocket", "Retreat with short balanced steps and raise the hands."],
  engage: ["Maintain the engagement", "Keep a bent base, active feet and hands against the nearby opponent."],
  brace: ["Hold the pocket's middle", "Stay balanced in the interior while the other pairs work around the pocket."],
  disengage: ["Release from the engagement", "Turn away from the contact example and find the developing finish."],
  pursuit: ["Pursue the finish", "Turn the hips and follow the receiver's direction."],
  "first-step": ["Start the rush", "Drive forward toward the protection before meeting contact."],
  counter: ["Work through the rush", "Change the body angle and keep the feet moving against the protection."],
  backpedal: ["Backpedal with eyes inside", "Gain depth while keeping the quarterback in front of the shoulders."],
  turn: ["Turn and react", "Open the hips and change from reading the play to running with it."],
  read: ["Read from underneath", "Keep a balanced base before reacting toward the throw."],
  cover: ["Move with the route", "Carry depth or width alongside the complementary route example."],
  check: ["Check the pocket", "Step toward the pocket before moving laterally into the outlet."],
  dive: ["Reach for the receiver", "Extend into an authored diving attempt behind the finish."],
  recover: ["Recover from the dive", "Slide, roll and gather the body before getting back up."],
};

/**
 * Pure authored body/action state. stridePhase is an unwrapped cycle count;
 * cadence is constant cycles/second per actor, so planted-foot anchors can be
 * reconstructed at any seek time. All weights are 0..1; lean/yaw are radians.
 */
export function samplePose(actor, time) {
  const selected = resolveActor(actor), t = clampReplayTime(time), motion = sampleActor(selected, t);
  const family = selected.roleFamily ?? "receiver";
  let action = "route", footMode = "run";
  if (family === "quarterback") {
    action = t < 0.8 ? "drop" : t < RELEASE - 0.3 ? "set" : t < RELEASE + 0.3 ? "throw" : t < FINISH ? "follow-through" : "watch";
    footMode = t < 0.8 ? "backpedal" : t < 3.7 ? "plant" : "shuffle";
  } else if (family === "blocker") {
    action = t < 0.75 ? "pass-set" : t < 3.7 ? selected.engagementTarget ? "engage" : "brace" : t < 4.5 ? "disengage" : "watch";
    footMode = t < 4.5 ? "shuffle" : "run";
  } else if (family === "rusher") {
    action = t < 0.6 ? "first-step" : t < 2.55 ? "engage" : t < 3.7 ? "counter" : t < 4.4 ? "disengage" : "pursuit";
    footMode = t < 0.6 || t >= 4.4 ? "run" : "shuffle";
  } else if (selected.id === "wilson") {
    action = t < 0.4 ? "release" : t < 1.15 ? "stem" : t < 1.55 ? "break" : t < CATCH - 0.25 ? "route" : t < CATCH + 0.2 ? "catch" : t < 4.3 ? "carry" : "finish";
  } else if (family === "back") {
    action = t < 0.65 ? "check" : t < FINISH ? "route" : "finish";
    footMode = t < 0.65 ? "shuffle" : "run";
  } else if (family === "receiver") {
    action = t < 0.4 ? "release" : t < FINISH ? "route" : "finish";
  } else {
    const turning = ["d7", "d8"].includes(selected.id) ? [1.1, 1.95] : selected.id === "d9" ? [0.6, 1.5] : [1.65, 2.4];
    action = t < turning[0] ? ["d7", "d8", "d10", "d11"].includes(selected.id) ? "backpedal" : "read" : t < turning[1] ? "turn" : t < CATCH ? "cover" : "pursuit";
    footMode = action === "backpedal" ? "backpedal" : action === "read" || action === "turn" ? "shuffle" : "run";
    if (selected.id === "d6" && t >= 2.55) {
      action = t < 4.2 ? "dive" : t < 5.8 ? "recover" : "watch";
      footMode = t < 5.8 ? "dive" : "shuffle";
    }
  }
  const engagement = selected.engagementTarget ? smooth01(0.45, 0.95, t) * (1 - smooth01(3.5, 4.3, t)) : 0;
  const catching = selected.id === "wilson" ? smooth01(CATCH - 0.3, CATCH, t) * (1 - smooth01(CATCH + 0.1, CATCH + 0.5, t)) : 0;
  const throwing = family === "quarterback" ? smooth01(RELEASE - 0.35, RELEASE, t) * (1 - smooth01(RELEASE, RELEASE + 0.45, t)) : 0;
  const diving = selected.id === "d6" ? smooth01(2.55, 2.95, t) * (1 - smooth01(4.2, 5.8, t)) : 0;
  const activeBase = ["set", "engage", "brace", "read"].includes(action) ? 0.16 : 0;
  const gait = Math.max(activeBase, Math.min(1, motion.speed / (family === "blocker" ? 2.5 : family === "rusher" ? 3.5 : 6.5)));
  const lean = family === "blocker" ? 0.3 + 0.12 * engagement : family === "rusher" ? 0.23 + 0.17 * engagement : footMode === "backpedal" ? -0.08 : family === "quarterback" ? 0.035 : 0.08 + 0.09 * gait;
  const cadence = selected.cadence ?? 2;
  const [actionLabel, actionDetail] = actionCopy[action];
  return {
    basis: "inferred", phase: t < 0.4 ? "snap" : t < RELEASE ? "develop" : t < CATCH ? "flight" : t < FINISH ? "finish" : t < 5.2 ? "pursuit" : "settle",
    action, actionLabel, actionDetail, roleFamily: family, footMode, gait, cadence,
    stridePhase: t * cadence + (selected.strideSeed ?? 0), lean, facingYaw: motion.yaw,
    engagementTarget: engagement > 0 ? selected.engagementTarget : null, engagement,
    reach: Math.max(engagement * 0.85, catching, diving), dive: diving, catch: catching, throw: throwing,
    carry: selected.id === "qb" && t <= RELEASE || selected.id === "wilson" && t >= CATCH ? 1 : 0,
  };
}

function ballAnchor(actorId, time, height) {
  const actor = sampleActor(actorId, time);
  // Anatomical right is local -x for a mesh facing +z. Rotate the carry side
  // with the player's torso-facing direction rather than pinning it in world space.
  return { x: actor.x - 0.25 * Math.cos(actor.yaw) + 0.15 * Math.sin(actor.yaw), y: height, z: actor.z + 0.25 * Math.sin(actor.yaw) + 0.15 * Math.cos(actor.yaw) };
}

/** Continuous carry → authored flight arc → carry; not a measured ball trajectory. */
export function sampleBall(time) {
  const t = clampReplayTime(time);
  if (t <= RELEASE) {
    const lift = smooth01(RELEASE - 0.35, RELEASE, t);
    return ballAnchor("qb", t, 1.05 + 0.75 * lift);
  }
  if (t >= CATCH) return ballAnchor("wilson", t, 1.15);
  const u = (t - RELEASE) / (CATCH - RELEASE);
  const from = ballAnchor("qb", RELEASE, 1.8);
  const to = ballAnchor("wilson", CATCH, 1.15);
  return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + 4 * 1.6 * u * (1 - u), z: from.z + (to.z - from.z) * u };
}

/** The most recent teaching event, not a claim about the original film's clock. */
export function eventAt(time) {
  const t = clampReplayTime(time);
  return REPLAY.events.findLast((event) => event.at <= t) ?? REPLAY.events[0];
}
