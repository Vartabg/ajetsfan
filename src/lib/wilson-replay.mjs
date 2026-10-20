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

const DURATION = 4.5;
const RELEASE = 1.7;
const CATCH = 2.4;
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
    path: path([[0, 0, 20], [0.7, 0, 21.4], [1.4, 0.25, 22], [1.7, 0.25, 22], [3, 0.25, 22], [4.5, 0.25, 22]]),
  },
  {
    id: "wilson", name: "Garrett Wilson", team: "NYJ", number: "17", role: "Target receiver · reported slant",
    gsisId: "00-0037740", identityBasis: "recorded", motionBasis: "inferred",
    note: "Receiver, jersey and touchdown are recorded; the slant is reported in the Jets account. Starting side, route geometry, catch position and timing are authored.",
    path: path([[0, -7, 16.2], [1, -7, 10.5], [1.7, -2.3, 6.2], [2.4, 3, 2], [3, 5, -1.2], [3.6, 5.6, -2.8], [4.5, 5.6, -2.8]]),
  },
  anonymous("lt", "Left tackle · role", "NYJ", "Anonymous protection role", [[0, -3.2, 15], [0.7, -3.7, 16.5], [1.7, -4, 17.1], [4.5, -4, 17.1]]),
  anonymous("lg", "Left guard · role", "NYJ", "Anonymous protection role", [[0, -1.6, 15], [0.7, -1.8, 16.5], [1.7, -2, 17], [4.5, -2, 17]]),
  anonymous("c", "Center · role", "NYJ", "Anonymous protection role", [[0, 0, 15], [0.7, 0, 16.4], [1.7, 0, 16.8], [4.5, 0, 16.8]]),
  anonymous("rg", "Right guard · role", "NYJ", "Anonymous protection role", [[0, 1.6, 15], [0.7, 1.8, 16.5], [1.7, 2, 17], [4.5, 2, 17]]),
  anonymous("rt", "Right tackle · role", "NYJ", "Anonymous protection role", [[0, 3.2, 15], [0.7, 3.7, 16.5], [1.7, 4, 17.1], [4.5, 4, 17.1]]),
  anonymous("x", "Outside receiver A · role", "NYJ", "Anonymous complementary route", [[0, -20, 15], [1, -20, 9], [2.4, -15, 2], [3.5, -11, -2], [4.5, -11, -2]]),
  anonymous("z", "Outside receiver B · role", "NYJ", "Anonymous complementary route", [[0, 21, 15], [1.7, 20.5, 5], [3.5, 20, -3], [4.5, 20, -3]]),
  anonymous("y", "Eligible receiver · role", "NYJ", "Anonymous outlet", [[0, 6, 16.2], [1, 8, 13], [2.4, 13, 9], [3.5, 15, 8], [4.5, 15, 8]]),
  anonymous("rb", "Backfield player · role", "NYJ", "Anonymous check and outlet", [[0, -3, 21], [0.8, -3, 18.6], [1.7, -5, 17], [3, -10, 11], [4.5, -10, 11]]),
  anonymous("d1", "Edge defender A · role", "CLE", "Anonymous rush example", [[0, -4.3, 14], [1, -5.1, 16], [2.5, -5.2, 18.8], [4.5, -5.2, 18.8]]),
  anonymous("d2", "Interior defender A · role", "CLE", "Anonymous rush example", [[0, -1.8, 14], [1, -2.2, 15.5], [2.5, -2.8, 16.1], [4.5, -2.8, 16.1]]),
  anonymous("d3", "Interior defender B · role", "CLE", "Anonymous rush example", [[0, 1.8, 14], [1, 2.2, 15.5], [2.5, 2.8, 16.1], [4.5, 2.8, 16.1]]),
  anonymous("d4", "Edge defender B · role", "CLE", "Anonymous rush example", [[0, 4.3, 14], [1, 5.1, 16], [2.5, 5.2, 18.8], [4.5, 5.2, 18.8]]),
  anonymous("d5", "Underneath defender A · role", "CLE", "Anonymous reaction example", [[0, -4, 10], [1, -4.5, 7], [1.7, -3, 5.5], [2.4, -1, 3.5], [3.3, 3.2, -0.5], [4.5, 3.2, -0.5]], "Underneath reaction illustrates Flacco's reported window. Identity, depth, leverage and responsibility are unverified; this is not an identified linebacker or coverage call."),
  anonymous("d6", "Underneath defender B · role", "CLE", "Anonymous reaction example", [[0, 3, 10], [1, 3.5, 6.5], [1.7, 4, 5], [2.4, 5.5, 2.8], [3.3, 6, -0.7], [4.5, 6, -0.7]]),
  anonymous("d7", "Outside defender A · role", "CLE", "Anonymous coverage reaction", [[0, -19, 10], [1, -19, 6], [2.4, -14, 1], [3.5, -10, -1], [4.5, -10, -1]]),
  anonymous("d8", "Outside defender B · role", "CLE", "Anonymous coverage reaction", [[0, 20, 10], [1.7, 20, 1], [3.5, 19, -4], [4.5, 19, -4]]),
  anonymous("d9", "Inside defensive back · role", "CLE", "Anonymous outlet reaction", [[0, 8, 11], [1, 10, 10], [2.4, 13.5, 8], [3.5, 14, 7], [4.5, 14, 7]]),
  anonymous("d10", "Deep defender A · role", "CLE", "Anonymous deep reaction", [[0, -7, 1], [1, -6, 0], [1.7, -3, 0], [2.4, 0.8, 0.3], [3.3, 4, -2.5], [4.5, 4, -2.5]], "Deep alignment illustrates relatively soft safeties in Flacco's account. Exact depth, player identity, rotation and path are authored."),
  anonymous("d11", "Deep defender B · role", "CLE", "Anonymous deep reaction", [[0, 7, 1], [1, 7, 0], [1.7, 6.5, -0.2], [2.4, 6, 0], [3.3, 6.8, -2.8], [4.5, 6.8, -2.8]]),
];

// Pocket players face the defense while retreating; this is authored body posing.
for (const actor of actors) {
  if (["qb", "lt", "lg", "c", "rg", "rt"].includes(actor.id)) actor.facingYaw = Math.PI;
}

const event = (id, at, label, detail, basis, evidenceIds, sourceFrameId) => ({ id, at, time: at, label, detail, basis, evidenceIds, sourceFrameId });

export const REPLAY = deepFreeze({
  id: "wilson-cleveland-2022", title: "Wilson finishes the Cleveland comeback",
  duration: DURATION,
  timeBasis: "Authored teaching seconds. Not synchronized to video or measured elapsed time. The recorded :25 start and reported :22 after the score do not validate model offsets.",
  sourceFrameContext: "Related paused source context only. Video locators are separate from teaching seconds; they do not establish or synchronize the authored model's event boundaries.",
  sourceFrames: [
    { id: "setup", seconds: 251, label: "4:11 · shotgun setup", observation: "The paused still shows a pre-snap shotgun alignment with receivers split on both sides. The scorebug shows NYJ 24, CLE 30, Q4 :25 and 3rd-and-10. The recorded play and game context corroborate the play identity.", url: `${highlightsUrl}&t=251s` },
    { id: "pocket", seconds: 253, label: "4:13 · pocket context", observation: "Passer #19 is upright in the pocket behind line engagements. His identity as Flacco is corroborated by the recorded play and game context; individual protection assignments remain unverified.", url: `${highlightsUrl}&t=253s` },
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
    { id: "official-highlights", label: "Observed · official highlight stills", basis: "observed", title: "New York Jets Top Plays vs. Cleveland Browns | 2022 Regular Season Week 2", url: highlightsUrl, summary: "Limited review of four paused stills in the New York Jets' official 4:58 highlight upload, whose description identifies 09/18/2022: shotgun setup at 4:11, pocket context at 4:13, an airborne ball at 4:14 and finish context at 4:15. These are video locators, not measured animation events. The exact catch instant, full routes, assignments and tracking coordinates are unestablished; no transcript was reviewed.", locator: "Paused source stills at video locators 251, 253, 254 and 255 seconds; related context only.", videoReviewed: true, limitedStillReview: true, reviewMode: "limited-paused-stills", note: "Later visual evidence reviewed for this replay task; the collected corpus edition and source hash are unchanged. Play/player identity is corroborated by the existing PBP and game context." },
    { id: "model", label: "Inferred · all movement", basis: "inferred", title: "Authored 3D teaching reconstruction", url: null, summary: "All 22 paths, positions, body animation, ball height, camera views and event offsets are authored. The other 20 players are anonymous roles. Complementary routes, protection and defensive jobs are illustrative.", locator: "This replay's authored model; no tracking or verified video timecodes." },
  ],
  events: [
    event("snap", 0, "Shotgun start", "The PBP records shotgun. Teaching time begins with the ball in Flacco's hands; snap mechanics and alignment are illustrative.", "inferred", ["pbp", "model", "official-highlights"], "setup"),
    event("break", 1, "Find the slant", "Wilson's slant is reported. The break point and angle shown here are authored; follow the highlighted receiver toward the middle.", "reported", ["slant", "model", "official-highlights"], "pocket"),
    event("release", RELEASE, "Throwing window", "Flacco recalled a window behind the linebackers against soft safeties. These anonymous defender positions illustrate that account.", "reported", ["window", "model", "official-highlights"], "flight"),
    event("catch", CATCH, "Catch and finish", "The source records a completed 15-yard touchdown to Wilson. This catch location, ball arc and receiver's remaining steps are inferred.", "recorded", ["pbp", "model", "official-highlights"], "finish"),
    event("finish", 3, "Touchdown · 30–30", "Wilson's touchdown ties the game. Zuerlein's following extra point supplies the winning 31–30 margin; it is outside this replay.", "recorded", ["pbp", "model", "official-highlights"], "finish"),
  ],
  actors,
});

/** Non-finite or non-number input resets to the teaching start. */
export function clampReplayTime(time) {
  return typeof time === "number" && Number.isFinite(time) ? Math.min(DURATION, Math.max(0, time)) : 0;
}

/** Pure absolute-time sampling: scrubbing/reversing never advances hidden state. */
export function sampleActor(actor, time) {
  const selected = typeof actor === "string" ? REPLAY.actors.find((candidate) => candidate.id === actor) : actor;
  if (!selected?.path?.length) throw new Error(`Unknown replay actor: ${typeof actor === "string" ? actor : "missing path"}`);
  const points = selected.path;
  const t = clampReplayTime(time);
  let index = points.findIndex((point, i) => i < points.length - 1 && t < points[i + 1].t);
  if (index < 0) index = Math.max(0, points.length - 2);
  const start = points[index];
  const end = points[Math.min(index + 1, points.length - 1)];
  const interval = end.t - start.t;
  const progress = interval > 0 ? Math.min(1, Math.max(0, (t - start.t) / interval)) : 0;
  let dx = end.x - start.x;
  let dz = end.z - start.z;
  const speed = t < points.at(-1).t && interval > 0 ? Math.hypot(dx, dz) / interval : 0;
  // Keep a stationary player's last heading, including when the timeline is sought backwards.
  if (Math.hypot(dx, dz) < 1e-8) {
    for (let i = index - 1; i >= 0; i--) {
      dx = points[i + 1].x - points[i].x;
      dz = points[i + 1].z - points[i].z;
      if (Math.hypot(dx, dz) >= 1e-8) break;
    }
  }
  const yaw = selected.facingYaw ?? (Math.hypot(dx, dz) > 1e-8 ? Math.atan2(dx, dz) : (selected.team === "NYJ" ? Math.PI : 0));
  return { x: start.x + (end.x - start.x) * progress, z: start.z + (end.z - start.z) * progress, yaw, speed };
}

function ballAnchor(actorId, time, height) {
  const actor = sampleActor(actorId, time);
  return { x: actor.x + 0.25, y: height, z: actor.z - 0.15 };
}

/** Continuous carry → authored flight arc → carry; not a measured ball trajectory. */
export function sampleBall(time) {
  const t = clampReplayTime(time);
  if (t <= RELEASE) {
    const lift = Math.min(1, Math.max(0, (t - 1.4) / (RELEASE - 1.4)));
    return ballAnchor("qb", t, 1.05 + 0.4 * lift);
  }
  if (t >= CATCH) return ballAnchor("wilson", t, 1.15);
  const u = (t - RELEASE) / (CATCH - RELEASE);
  const from = ballAnchor("qb", RELEASE, 1.45);
  const to = ballAnchor("wilson", CATCH, 1.15);
  return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + 4 * 1.6 * u * (1 - u), z: from.z + (to.z - from.z) * u };
}

/** The most recent teaching event, not a claim about the original film's clock. */
export function eventAt(time) {
  const t = clampReplayTime(time);
  return REPLAY.events.findLast((event) => event.at <= t) ?? REPLAY.events[0];
}
