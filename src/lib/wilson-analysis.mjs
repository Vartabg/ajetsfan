/**
 * Exact-play evidence and bounded film-study questions. Charting describes the
 * historical play; body mechanics and the four teaching phases remain authored.
 * Participation establishes names on the snap, not names at reconstructed positions.
 */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const sources = [
  { id: "pbp", title: "nflverse 2022 play-by-play", url: "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2022.parquet", attribution: "nflverse / nflfastR", locator: "game_id 2022_02_NYJ_CLE; play_id 4199", basis: "recorded", limit: "Event fields and statistical models do not recover footwork, read order or assignments.", sha256: "931121d8897779d7944e2a293e92ed8799c8e5cceef84096ac42339003fedc09" },
  { id: "participation", title: "2022 participation and Next Gen Stats charting", url: "https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2022.parquet", attribution: "NFL Next Gen Stats via nflverse", locator: "nflverse_game_id 2022_02_NYJ_CLE; play_id 4199", basis: "charted", limit: "Provider classifications and participant IDs are not tracking coordinates or a recovered defensive playbook.", sha256: "5f8d349316bf68de487ee0eb926706e65f5a8e37078c1faa37cb07cda2bf9e5e" },
  { id: "participation-dictionary", title: "Participation data dictionary", url: "https://nflreadr.nflverse.com/articles/dictionary_participation.html", attribution: "nflreadr", locator: "route, time_to_throw, was_pressure and coverage fields", basis: "definition", limit: "Definitions explain the provider fields; they do not independently verify this snap." },
  { id: "ftn", title: "FTN 2022 play charting", url: "https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_2022.parquet", attribution: "FTN Data via nflverse", locator: "nflverse_game_id 2022_02_NYJ_CLE; nflverse_play_id 4199; ftn_play_id 967050", basis: "charted", limit: "A charted read or pressure label is an analyst classification, not access to Flacco's progression or the protection call.", sha256: "2846ef9bcc5f7298a5c783fb9a5edc85b3820c0b4943bf60a1217398e412985b" },
  { id: "ftn-dictionary", title: "FTN charting data dictionary", url: "https://nflreadr.nflverse.com/articles/dictionary_ftn_charting.html", attribution: "nflreadr", locator: "Current read_thrown field description", basis: "definition", limit: "Its numeric definitions were added in 2026. Historical 2022 encoding remains unconfirmed; the raw code is retained only in provenance." },
  { id: "ftn-dictionary-2022", title: "Earlier FTN dictionary snapshot", url: "https://raw.githubusercontent.com/nflverse/nflreadr/v1.5.0/data-raw/dictionary_ftn_charting.csv", attribution: "nflreadr v1.5.0", locator: "read_thrown row", basis: "definition", limit: "This snapshot describes the field without a numeric mapping; it cannot establish a progression from the 2022 code." },
  { id: "ftn-dictionary-change", title: "FTN dictionary definition change", url: "https://github.com/nflverse/nflreadr/pull/319", attribution: "nflreadr maintainers", locator: "Merged September 1, 2026; read_thrown definitions added", basis: "definition", limit: "The change does not supply a cited historical 2022 encoding key." },
  { id: "ftn-read-clarification", title: "FTN read-code clarification request", url: "https://github.com/nflverse/nflreadr/issues/325", attribution: "nflreadr upstream issue", locator: "Open as reviewed October 20, 2026; numeric semantics and season consistency", basis: "definition", limit: "An unresolved question, not an authoritative alternative mapping. The Film Room assigns no progression to the raw code." },
  { id: "weekly-rosters", title: "2022 weekly rosters", url: "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2022.parquet", attribution: "nflverse weekly rosters", locator: "2022 REG week 2; GSIS join to the exact-play participant lists", basis: "recorded", limit: "Roster positions and numbers identify the 22 listed participants; they do not establish each participant's location or responsibility.", sha256: "063c0da93f612811e1c4a4c12727a56fd2716197864795f15aa2f10a591b00c0" },
  { id: "jets-flacco", title: "Jack Bell's game account and Flacco interview", url: "https://www.newyorkjets.com/news/jets-joe-cool-puts-cleveland-in-the-deep-freeze-with-a-stirring-comeback-victory", attribution: "Jack Bell, New York Jets; Joe Flacco's attributed account", locator: "Winning-score account; final Flacco answer about the call", basis: "reported", limit: "Bell calls the route a slant. Flacco describes a small window behind linebackers against relatively soft safeties; this does not name the coverage or establish a progression." },
  { id: "fox-flacco", title: "Flacco on the winning throw", url: "https://www.foxsports.com/stories/nfl/how-patriots-won-despite-mac-jones-struggles-is-garrett-wilson-ascending", attribution: "Henry McKenna, FOX Sports; Joe Flacco's attributed account", locator: "Garrett Wilson/Breece Hall section; game-winning touchdown paragraph and following Flacco quote", basis: "reported", limit: "Flacco describes contemplating linebacker manipulation using an underneath target. This is stated intent, not a verified gaze sequence or recovered progression." },
  { id: "official-highlights", title: "Jets official Cleveland highlights", url: "https://www.youtube.com/watch?v=LR1zPFNjOMM", attribution: "New York Jets", locator: "Approximately 4:12–4:15; snap through touchdown finish", basis: "observed", limit: "Broadcast review shows the changing pocket and finish; occlusion and camera movement prevent full 22-player tracking or verified assignments." },
  { id: "jetx-wide-film", title: "Winning touchdown · wider sideline film", url: "https://player.vimeo.com/video/752328113?dnt=1&app_id=122963", attribution: "Jets X-Factor · winning-play embed", locator: "11-second publisher clip: setup, developing pocket, inward break, underneath receiver and finish. Source clip clock is separate from teaching seconds.", basis: "observed", limit: "The wider view supports the deeper/underneath spatial relationship. Three-player jersey identification, measured trajectories and complete assignments are not established; names in that interaction remain attributed to Boord's analysis." },
  { id: "jetx-film", title: "Quarterback film review: Weeks 1–2", url: "https://jetsxfactor.com/2022/09/21/zach-wilson-weeks-1-2-jets/", attribution: "Rivka Boord, Jets X-Factor", locator: "Game-winning touchdown drive; paragraph on its final play", basis: "reported", limit: "Boord attributes an underneath hold to Conklin's stop and calls Wilson's route a post. This is analyst interpretation; it is not a mapping of reconstructed positions to named players." },
  { id: "pff-coverage", title: "Week 2 coverage update", url: "https://www.pff.com/news/week-2-coverage-update", attribution: "Haley English, PFF", locator: "Noteworthy Stats; Wilson's winning touchdown", basis: "reported", limit: "The passage discusses three unnamed defenders and negative grades. It supplies no individual mapping or numeric grades; nearby Ward criticism concerns Corey Davis's separate 66-yard touchdown." },
  { id: "pff-alignment", title: "Jets–Browns Week 2 recap", url: "https://www.pff.com/news/nfl-week-2-game-recap-new-york-jets-31-cleveland-browns-30", attribution: "Michael Renner, PFF", locator: "Rookie Spotlight; both Wilson touchdown alignments", basis: "reported", limit: "PFF describes both Wilson touchdowns from out wide. Applying that statement to this winner supports outside alignment; it does not identify a jersey in a broadcast frame or establish route coordinates." },
  { id: "colombo-protection", title: "Marc Colombo on pass protection", url: "https://www.giants.com/news/marc-colombo-jerome-henderson-burton-burns-training-camp-quotes-2020", attribution: "Marc Colombo, Giants offensive line coach; official team transcript", locator: "August 26, 2020; response about stunts, set depth, trained eyes and communication", basis: "definition", limit: "General coaching principles about recognizing and coordinating against changing rush looks; not evidence of the Jets' actual protection rules." },
  { id: "digaetano-rush", title: "Four components of a pass-rush plan", url: "https://blogs.usafootball.com/blog/1425/4-key-components-to-a-pass-rush-plan", attribution: "Vince DiGaetano, USA Football", locator: "Pass-rush lanes and tackle set line sections", basis: "definition", limit: "General relationships among quarterback depth, tackle set and outside/inside rush lanes; no named matchup or rush assignment is recovered for this snap." },
  { id: "cason-quarters", title: "A coach explains quarters and matching rules", url: "https://blogs.usafootball.com/blog/7382/college-coach-details-quarters-coverage", attribution: "Clayton Cason, USA Football", locator: "Zone match, man match and route-distribution explanations", basis: "definition", limit: "Illustrates why a defender may retain or exchange a vertical threat before helping elsewhere. These principles do not identify Cleveland's Cover 6 side, variant or player key." },
  { id: "model", title: "Authored teaching study", url: null, attribution: "Film Room reconstruction", locator: "All reconstructed paths, body poses and teaching seconds", basis: "inferred", limit: "Study questions and mechanics illustrate possibilities. They do not convert charting or a model into historical assignments or individual grades." },
];

const pbp = {
  game_id: "2022_02_NYJ_CLE", play_id: 4199, old_game_id: "2022091801",
  qtr: 4, time: "00:25", down: 3, ydstogo: 10, yardline_100: 15, shotgun: 1,
  desc: "(:25) (Shotgun) 19-J.Flacco pass short middle to 17-G.Wilson for 15 yards, TOUCHDOWN.",
  passer_player_id: "00-0026158", receiver_player_id: "00-0037740",
  yards_gained: 15, air_yards: 14, yards_after_catch: 1, touchdown: 1,
  posteam_score: 24, defteam_score: 30, posteam_score_post: 30, defteam_score_post: 30,
  epa: 3.933165545167867, wp: 0.26075977087020874, away_wp_post: 0.572494227650942,
  wpa: 0.3117344567807333, cp: 0.4148028492927551, cpoe: 58.51971507072449,
};
const participation = {
  nflverse_game_id: "2022_02_NYJ_CLE", play_id: 4199, old_game_id: "2022091801",
  offense_formation: "SHOTGUN", offense_personnel: "1 RB, 1 TE, 3 WR", defense_personnel: "4 DL, 2 LB, 5 DB",
  defenders_in_box: 5, number_of_pass_rushers: 4, n_offense: 11, n_defense: 11,
  ngs_air_yards: 13.900000000000006, time_to_throw: 2.036, was_pressure: false,
  route: "POST", defense_man_zone_type: "ZONE_COVERAGE", defense_coverage_type: "COVER_6",
};
const ftn = {
  nflverse_game_id: "2022_02_NYJ_CLE", nflverse_play_id: 4199, ftn_game_id: 5897, ftn_play_id: 967050,
  starting_hash: "M", qb_location: "S", n_offense_backfield: 1, n_defense_box: 5,
  is_no_huddle: false, is_motion: false, is_play_action: false, is_screen_pass: false,
  is_rpo: false, is_trick_play: false, is_qb_out_of_pocket: false,
  is_interception_worthy: false, is_throw_away: false, read_thrown: "1",
  is_catchable_ball: true, is_contested_ball: false, is_created_reception: false,
  is_drop: false, is_qb_sneak: false, n_blitzers: 0, n_pass_rushers: 4, is_qb_fault_sack: false,
};
const chartField = (key, label, value, definition, sourceIds, limit) => ({ key, label, value, definition, sourceIds, limit });
const charting = {
  summary: "Both providers chart four rushers. Participation labels zone Cover 6 and a 2.036-second throw; FTN records no blitz, no motion, no play action and an in-pocket delivery.",
  fields: [
    chartField("personnel", "Personnel", "11 offense · 4–2–5 defense", "One back, one tight end and three receivers; four defensive linemen, two linebackers and five defensive backs.", ["participation"], "Personnel counts do not establish alignment, matchups or responsibilities."),
    chartField("coverage", "Provider coverage label", "Cover 6 · zone", "Raw defense_coverage_type=COVER_6 and defense_man_zone_type=ZONE_COVERAGE.", ["participation", "participation-dictionary"], "A provider classification; exact side, rotation, pattern matches and player rules are not recovered."),
    chartField("rush", "Rush and blitz", "4 rushers · 0 blitzers", "Participation and FTN each record four pass rushers; FTN records zero blitzers.", ["participation", "ftn"], "This supports a four-man rush classification, not any named block, stunt or rush win."),
    chartField("throwTime", "Charted time to throw", 2.036, "Seconds from snap to throw in the participation field.", ["participation", "participation-dictionary"], "Independent provider timing; the animation's 2.05-second release is an authored clock, not synchronization."),
    chartField("pressure", "Delivery context", "No pressure charted · in pocket", "Participation was_pressure=false; FTN is_qb_out_of_pocket=false.", ["participation", "ftn"], "These classifications do not grade all five blockers or imply the pocket never changed."),
    chartField("design", "FTN design tags", "No motion · no play action · no RPO", "All three FTN flags are false; is_screen_pass is also false.", ["ftn"], "Absence of these tags does not identify the Jets' play call."),
    chartField("catch", "FTN catch tags", "Catchable · uncontested", "is_catchable_ball=true and is_contested_ball=false.", ["ftn"], "A charted catch classification, not measured separation or a receiver/defender grade."),
  ],
  raw: { pbp, participation, ftn },
  conflicts: [
    { title: "Slant or post?", text: "Bell reports a slant; participation charts POST and Boord describes a post. The route terminology remains disputed. The animation illustrates an inside-breaking route without resolving route terminology.", sourceIds: ["jets-flacco", "participation", "jetx-film"] },
  ],
};

const metric = (key, label, value, unit, definition, limit) => ({ key, label, value, unit, definition, sourceIds: ["pbp"], limit });
const metrics = [
  metric("air_yards", "Air yards", 14, "yards", "Recorded pass depth from the line of scrimmage to the reception.", "A play-level value, not a measured 3D catch coordinate."),
  metric("yac", "After the catch", 1, "yard", "Recorded yards after the reception, completing the 15-yard gain.", "The teaching model's extra steps are authored, not a yardage measurement."),
  metric("epa", "Expected points added", 3.933165545167867, "expected points", "nflfastR change in expected points assigned to the play.", "A model-based play value; it does not allocate credit to all 22 players."),
  metric("wp_before", "Jets win probability before", 0.26075977087020874, "probability", "nflfastR offensive-team win probability before this play.", "A statistical estimate, not a known chance or the final result."),
  metric("wp_after", "Jets win probability after", 0.572494227650942, "probability", "nflfastR away-team win probability after the touchdown, before the extra point.", "The touchdown tied 30–30; the later extra point supplied the winning margin."),
  metric("wpa", "Win probability added", 0.3117344567807333, "probability change", "Post-play minus pre-play win probability: about +31.2 percentage points.", "Percentage points, not a relative percent gain or individual grade."),
  metric("cp", "Modeled completion probability", 0.4148028492927551, "probability", "The nflfastR PBP completion-probability model's estimate for this pass.", "This is not Next Gen Stats completion probability and is not a measured throwing-window size."),
  metric("cpoe", "Completion over expectation", 58.51971507072449, "percentage points", "Completed pass minus the nflfastR modeled completion probability.", "A single-play model residual, not a stable player skill estimate or a route/coverage grade."),
];

const participant = (name, gsisId, team, position, depthPosition, number) => ({ name, gsisId, team, position, depthPosition, number, basis: "charted", sourceIds: ["participation", "weekly-rosters"], figureId: null });
const participants = {
  offense: [
    participant("Michael Carter", "00-0036924", "NYJ", "RB", "RB", 32),
    participant("George Fant", "00-0032466", "NYJ", "OL", "T", 76),
    participant("Alijah Vera-Tucker", "00-0036979", "NYJ", "OL", "G", 75),
    participant("Laken Tomlinson", "00-0032234", "NYJ", "OL", "G", 78),
    participant("Braxton Berrios", "00-0034419", "NYJ", "WR", "WR", 10),
    participant("Connor McGovern", "00-0033011", "NYJ", "OL", "C", 60),
    participant("Joe Flacco", "00-0026158", "NYJ", "QB", "QB", 19),
    participant("Garrett Wilson", "00-0037740", "NYJ", "WR", "WR", 17),
    participant("Max Mitchell", "00-0038114", "NYJ", "OL", "T", 61),
    participant("Tyler Conklin", "00-0034270", "NYJ", "TE", "TE", 83),
    participant("Elijah Moore", "00-0036980", "NYJ", "WR", "WR", 8),
  ],
  defense: [
    participant("Isaiah Thomas", "00-0037314", "CLE", "DL", "DE", 58),
    participant("Grant Delpit", "00-0036282", "CLE", "DB", "SS", 22),
    participant("Martin Emerson", "00-0037250", "CLE", "DB", "DB", 23),
    participant("John Johnson", "00-0033927", "CLE", "DB", "FS", 43),
    participant("Jeremiah Owusu-Koramoah", "00-0036915", "CLE", "LB", "OLB", 28),
    participant("Myles Garrett", "00-0033868", "CLE", "DL", "DE", 95),
    participant("Anthony Walker", "00-0033570", "CLE", "LB", "MLB", 5),
    participant("Greg Newsome", "00-0036996", "CLE", "DB", "CB", 20),
    participant("Jordan Elliott", "00-0036266", "CLE", "DL", "DT", 96),
    participant("Taven Bryan", "00-0034842", "CLE", "DL", "DT", 99),
    participant("Denzel Ward", "00-0034856", "CLE", "DB", "CB", 21),
  ],
};

const conclusions = [
  { title: "Conklin occupies Owusu-Koramoah underneath", text: "Boord's review credits Conklin's stop with occupying Owusu-Koramoah long enough for Wilson to cross behind him, and describes a decisive throw through a narrow lane.", basis: "reported", sourceIds: ["jetx-film"], limit: "Attributed analyst interpretation; this does not assign those names to the reconstructed players or prove the defensive call." },
  { title: "The quarterback's intended window", text: "Flacco recalled a familiar staple targeting Wilson behind linebackers against soft safeties. In FOX's account he also contemplated influencing a linebacker with an underneath target.", basis: "reported", sourceIds: ["jets-flacco", "fox-flacco"], limit: "Stated intent does not establish his measured gaze, a confirmed manipulation or his full progression." },
  { title: "Cleveland’s coverage breaks down", text: "Haley English's PFF review says three unnamed Cleveland defenders left Wilson open and received negative grades. The passage supplies neither individual assignments nor numeric grades.", basis: "reported", sourceIds: ["pff-coverage"], limit: "The public assessment does not identify the three defenders. Its separate Ward discussion concerns Davis's earlier touchdown." },
  { title: "Outside alignment has source support", text: "Renner's PFF recap describes both Wilson touchdowns from out wide. Because this winner was one of the two, that supports an outside starting alignment.", basis: "reported", sourceIds: ["pff-alignment"], limit: "This is an inference from the attributed two-touchdown statement, not independent visual identification of Wilson or verified starting coordinates." },
  { title: "An inside break, disputed terminology", text: "The Jets account calls Wilson's route a slant. Participation labels POST, and Boord also describes a post. The sources agree on the completed touchdown, but not the route name.", basis: "conflicting", sourceIds: ["pbp", "jets-flacco", "participation", "jetx-film"], limit: "Retain both descriptions; do not resolve the dispute by treating the authored curve as film evidence." },
];

const phaseIds = ["pre", "develop", "flight", "finish"];
const phaseLabels = ["Release and first steps", "Develop the window", "Ball in flight", "Catch and reaction"];
const studyLimit = "Authored teaching mechanics and hypotheses; phase boundaries are not synchronized to the broadcast. Participant lists do not identify anonymous figures.";

// Three compact lines can be composed by the UI as key/read, technique, and
// hypothesis/test/alternative. A distinct question for each role prevents a
// generic position description from masquerading as exact-play analysis.
function role(actorId, title, sourceIds, keys, reads, techniques, hypothesis, tests, alternative) {
  return { actorId, title, basis: "inferred", sourceIds, phases: Object.fromEntries(phaseIds.map((phase, index) => [phase, {
    actorId, phase, phaseLabel: phaseLabels[index], basis: "inferred", sourceIds, limit: studyLimit,
    key: keys[index], read: reads[index], technique: techniques[index], hypothesis,
    test: tests[index], alternative,
  }])) };
}

const roleStudies = {
  qb: role("qb", "Quarterback · window and delivery", ["pbp", "jets-flacco", "fox-flacco", "jetx-film", "participation", "model"],
    ["Underneath depth", "The defender between the routes", "Review the earlier release", "Result versus process"],
    ["Where are the underneath bodies relative to the deeper defenders?", "Does the defender between Conklin underneath and Wilson stay occupied or gain depth into Wilson's path?", "Did the earlier release reach Wilson before recovering coverage could contest it?", "Which claims concern a recorded completion rather than the quarterback's read?"],
    ["Drop with eyes downfield and gather a balanced base.", "Deliver as Wilson enters an open path; if the defender closes it, that opportunity is gone.", "Watch the ball's arrival relative to recovering coverage, and evaluate the timing of the earlier release.", "Watch the finish while separating outcome from technique."],
    "The desired throw attacks the space behind underneath defenders before deeper help can close.",
    ["Compare both coverage levels before the route crosses.", "Compare the underneath defender's commitment with Wilson entering the available lane.", "Compare the earlier release with recovery and arrival; the teaching clock cannot measure that interval.", "Check the completion record separately from any inferred progression."],
    "A described intention does not prove actual eye movement or manipulation; no alternative progression is reconstructed."),
  wilson: role("wilson", "Target receiver · threaten, break, finish", ["pbp", "jets-flacco", "participation", "official-highlights", "model"],
    ["Initial leverage", "Between coverage levels", "Hands and running line", "Secure and cross"],
    ["Does the stem threaten the defender's depth before the inside turn?", "Is there room to enter behind the underneath defender before deeper help closes?", "Can he find the ball without stopping his stride?", "Does the trailing attempt arrive behind an upright runner?"],
    ["Accelerate from a forward stance with short driven first steps.", "Lower the hips, plant outside and drive through the inside angle.", "Let the shoulders find the ball while the legs keep running.", "Secure the ball, tuck it and run through the goal."],
    "An upfield threat can preserve room for an inside break between coverage levels.",
    ["Look for a defender changing hip angle before the break.", "Compare the plant with the defender's turn, without measuring model separation.", "Check whether hands reach while the running line continues.", "Compare the upright finish and trailing defender in the broadcast."],
    "The space may reflect zone rules or another route's influence; the sources disagree between slant and post terminology."),
  lt: role("lt", "Left protection edge · depth and balance", ["participation", "official-highlights", "colombo-protection", "digaetano-rush", "model"],
    ["Outside first step", "Protect the throwing spot", "Late edge pressure", "Contact release"],
    ["How much outside depth is needed before meeting the rush?", "Relative to the quarterback's throwing depth, does the rusher continue outside, counter inside or exchange lanes?", "Can the tackle recover after pressure changes angle?", "Does the blocker turn only after the threat releases?"],
    ["Kick for depth from a staggered bent-knee base.", "Maintain a barrier to the throwing spot and coordinate with the guard under the protection's rules.", "Recoil one hand and strike again without narrowing the base.", "Ease out of contact and find the ball."],
    "A wider edge set can preserve space beside a deeper quarterback.",
    ["Compare tackle depth with the adjacent guard.", "Track whether a direct inside path to the throwing spot opens or the rusher is retained or redirected.", "Check for continued feet after the first hand contact.", "Compare loss of contact with the shoulder turn."],
    "Man, slide or combination rules change how an exchange is handled; the Jets' actual rules and this matchup are unknown."),
  lg: role("lg", "Left interior · inside lane", ["participation", "official-highlights", "model"],
    ["Inside threat", "Guard-center spacing", "Interior compression", "Help and release"],
    ["Is the first threat inside or across the guard's face?", "Does the gap to the center stay usable for help?", "Can the guard sit against pressure without drifting into the passer?", "Is a nearby body a helper or a separate engagement?"],
    ["Use short set steps and keep the hips square to the interior threat.", "Maintain an inside hand and a wide bent base.", "Absorb with the knees, then replace feet under the hips.", "Release the hands and scan before following the finish."],
    "Interior spacing may let the center help while the guard protects the direct lane.",
    ["Follow the rusher's first two steps.", "Look for actual hand contact from a second blocker.", "Compare the guard's depth with quarterback depth.", "Distinguish nearby bodies from a verified double-team."],
    "A solo block or exchanged slide responsibility could produce the same pocket outline."),
  c: role("c", "Pocket middle · scan and possible help", ["participation", "official-highlights", "model"],
    ["Interior distribution", "Available help", "Middle of the pocket", "Threat check"],
    ["Where are four rushers distributed across five linemen?", "Which interior threat could draw a second set of hands?", "Does the center preserve room directly in front of the passer?", "Does the center check threats before leaving the pocket?"],
    ["Set low and keep the feet available to either side.", "Turn the shoulders slightly while keeping a balanced base.", "Stay ready to replace a hand or take over an inside threat.", "Find the ball after the immediate rush is over."],
    "Five blockers against four charted rushers permit a help possibility; they do not prove who receives it.",
    ["Count rushers and compare interior spacing.", "Look for second-hand contact and shared rusher movement.", "Check the space between the center and quarterback.", "Compare head scan with disengagement."],
    "The center may have an independent zone or man responsibility rather than a specific help assignment."),
  rg: role("rg", "Right interior · anchor and exchange", ["participation", "official-highlights", "model"],
    ["Near interior shoulder", "Right-side spacing", "Anchor under pressure", "Separate from contact"],
    ["Does the rush threaten the guard's inside shoulder?", "Can the guard keep space between the center and deeper tackle?", "Do the feet reset before the hands extend again?", "Does the rusher leave before the guard looks downfield?"],
    ["Set with short steps and a firm inside foot.", "Keep elbows close while the outside hand checks width.", "Sit through the hips and alternate pressure with each hand.", "Unwind the shoulders as the immediate threat releases."],
    "A compact interior set can connect the center's space to a deeper edge set.",
    ["Track the rusher's initial line against the guard's shoulders.", "Compare depth with both neighboring blockers.", "Look for a foot replacement between hand strikes.", "Compare the final contact frame with the first look toward the ball."],
    "A rush exchange could change this duty; neither the model pairing nor a still proves it."),
  rt: role("rt", "Right protection edge · deeper recovery", ["participation", "official-highlights", "model"],
    ["Wide rush angle", "Depth of the edge", "Outside-hand pressure", "Recover and release"],
    ["Can the first kick step meet a wider rush without turning too early?", "How much deeper is this engagement than the interior?", "Can the blocker stay attached as an outside arm rises?", "Does the last recovery step stay balanced?"],
    ["Kick wide and keep the inside foot beneath the hip.", "Hinge the shoulders while protecting the inside lane.", "Rework the hands from a staggered base.", "Replace the feet before turning toward the finish."],
    "The broadcast's deeper edge engagement can be illustrated with a recovery set outside the interior pocket.",
    ["Compare the edge's first angle with tackle depth.", "Use field lines to compare edge and interior engagements.", "Watch hand height without assigning a specific rush move.", "Check whether release follows the disappearing rush threat."],
    "The exact side, named blocker and protection rule still require a verified view; this pairing remains authored."),
  x: role("x", "Outside route A · width and depth", ["participation", "official-highlights", "model"],
    ["Outside cushion", "Lane occupancy", "Ball awareness", "Continue or brake"],
    ["Does the release make the outside defender protect depth?", "Does the route occupy width as the inside lane develops?", "Can the receiver check inside without turning his entire running line?", "Does he ease down after recognizing the throw elsewhere?"],
    ["Accelerate through the first steps with shoulders over the hips.", "Carry width before changing the route angle.", "Use a shoulder check while keeping the stride active.", "Shorten the stride as the play ends."],
    "An outside route can occupy a coverage lane while Wilson crosses inside.",
    ["Compare cushion before and after the initial release.", "Look for the defender following, passing off or holding a landmark.", "Compare the head check with the receiver's travel direction.", "Check the timing of braking against the ball's destination."],
    "The actual complementary route and its influence are unknown; it may not have been intended to clear Wilson's lane."),
  z: role("z", "Outside route B · opposite-side space", ["participation", "official-highlights", "model"],
    ["Opposite-side cushion", "Far-side depth", "Inside glance", "Finish spacing"],
    ["Does the opposite defender give ground as the route accelerates?", "Is the route holding a deeper body away from the inside throw?", "Can the runner find the ball while preserving width?", "Does he remain separated from the catch instead of converging blindly?"],
    ["Drive upfield before opening the stride.", "Keep the shoulders stacked as the route carries depth.", "Glance inward with the head before the hips turn.", "Brake on a separate line after the result becomes clear."],
    "Opposite-side depth can preserve horizontal spacing in a multi-route concept.",
    ["Watch the defender's first retreat rather than assuming a matchup.", "Compare route depth with the nearest deep defender.", "Check head and hip angles separately.", "Compare the runner's stopping lane with Wilson's finish."],
    "The route could serve a separate progression or coverage rule; width alone does not prove a clear-out assignment."),
  y: role("y", "Eligible route · underneath influence", ["participation", "jetx-film", "model"],
    ["Underneath release", "A defender's attention", "Route versus window", "Locate the finish"],
    ["Does a short release put an eligible body in an underneath defender's view?", "Would a stop or settle keep that defender below Wilson's crossing lane?", "Does the defender stay with the short route as the pass goes behind?", "Can the eligible turn after the ball passes?"],
    ["Release with a balanced stride and eyes available inside.", "Shorten the feet and show the hands if settling underneath.", "Stay available without drifting into the crossing lane.", "Turn toward the finish after the pass goes elsewhere."],
    "An underneath stop may hold a defender while an inside-breaking route crosses behind.",
    ["Locate the short route relative to the underneath body.", "Check for an actual stop and the defender's eyes or hips.", "Compare the short route and Wilson at the throw.", "Separate route reaction from a proved assignment."],
    "Boord attributes this effect to Conklin and Owusu-Koramoah; the illustrative eligible player is not their verified location."),
  rb: role("rb", "Backfield outlet · check or immediate route?", ["participation", "official-highlights", "model"],
    ["Inside rush picture", "Lateral outlet", "Quarterback's escape option", "Follow the result"],
    ["Does the back slow to inspect an inside threat before leaving?", "Can he gain width while keeping the passer in view?", "Is the outlet available below the inside throw?", "Does he shorten his stride after the pass goes downfield?"],
    ["Use short square steps before opening the hips.", "Accelerate laterally with the shoulders available to the ball.", "Stay under control and show a catchable target.", "Turn downfield and ease the stride after the throw."],
    "The visible lateral backfield release can supply an underneath option; a protection check is only a possibility.",
    ["Look for hesitation or contact before the lateral release.", "Compare head direction with widening hips.", "Locate the outlet below the deeper route structure.", "Compare acceleration and braking around the throw."],
    "An immediate flat or swing route can resemble a check-release without any actual pickup responsibility."),
};

const defensiveRoles = [
  ["d1", "Edge rush A", ["Outside tackle set", "Edge hand leverage", "Counter room", "Find the ball"], ["Is there room outside the tackle's first set?", "Can one hand clear while the other keeps contact?", "Does the rusher change angle without standing upright?", "Does pursuit begin after separation from the blocker?"], "Work the edge with a low first step and a changing shoulder angle.", "An edge counter may force the tackle to gain more depth.", "Compare rush angle, tackle recovery and hand separation.", "A contain or inside counter responsibility could produce similar pressure."],
  ["d2", "Interior rush A", ["Guard's inside shoulder", "Two-blocker picture", "Pocket compression", "Release lane"], ["Does the first step threaten the near interior gap?", "Is a second blocker actually contacting the rush?", "Does the guard give ground as the rusher keeps the feet active?", "Can the rusher turn downfield without passing through the blocker?"], "Drive from bent knees, replace the hands and keep the feet under pressure.", "Interior pressure can shrink the lane even without a charted quarterback pressure.", "Compare hand contact, blocker depth and the quarterback's remaining space.", "A gap control or exchange assignment is possible; a modeled pair does not prove it."],
  ["d3", "Interior rush B", ["Opposite interior lane", "Guard's outside hand", "Counter timing", "Turn after release"], ["Does the initial rush challenge the guard away from center help?", "Can an outside hand move the blocker before an inside counter?", "Does the shoulder angle change while the hips keep driving?", "Does the rusher see the pass before changing direction?"], "Keep a compact base and alternate inside drive with a shoulder counter.", "An interior counter may test spacing between guard and tackle.", "Track the rusher's shoulders against the guard's feet and neighboring space.", "Independent rush lanes can look like a coordinated stunt; no stunt is established."],
  ["d4", "Edge rush B", ["Deeper outside path", "Tackle recovery", "Passing-lane hand", "Pursuit angle"], ["Can the wide first step stretch the edge?", "Does the tackle keep gaining depth as the rusher turns?", "Does a raised hand affect the throwing lane without reaching the passer?", "Can the rusher turn toward the finish after losing contact?"], "Lean through the edge, work one hand free and extend toward the passing lane.", "A deeper edge and a high hand can challenge delivery even when pressure is charted false.", "Compare edge depth and hand height near the visible throw.", "The hand could be a rush counter rather than an intended pass deflection; the player mapping is unknown."],
];
for (const [id, title, keys, reads, technique, hypothesis, test, alternative] of defensiveRoles) {
  roleStudies[id] = role(id, `${title} · pressure without a grade`, ["participation", "ftn", "official-highlights", "model"], keys, reads,
    [technique, "Keep the feet replacing beneath hand contact.", "Work the shoulder angle while keeping a low base.", "Disengage before turning into a controlled pursuit stride."], hypothesis,
    [test, test, test, "Check contact separation before the pursuit turn."], alternative);
}
const coverageRoles = [
  ["d5", "Underneath reaction A", ["Crossing threat", "Depth below the lane", "Plant toward the throw", "Closing angle"], ["Does depth preserve space between the receiver and quarterback?", "Can this body squeeze Wilson's lane without abandoning a short route?", "Is the first downhill step before or after delivery?", "Does the angle point to the runner's path rather than his current spot?"], "An underneath defender may shrink the throw's lower boundary.", "Compare the defender's depth, eyes and first closing step with the crossing route.", "Carrying a short route or guarding a landmark could explain the same delay."],
  ["d6", "Underneath reaction B", ["Inside balance", "Route passing behind", "Reach decision", "Miss and recovery"], ["Is the body balanced enough to drive in either direction?", "Does the receiver cross behind the defender's initial depth?", "Does the launch start from a trailing angle?", "Does the prone defender remain behind the upright receiver?"], "A late trailing attempt can miss while the receiver continues through the goal.", "Compare launch, extended body and receiver position across the broadcast finish.", "The dive's exact actor, launch time and preceding coverage rule remain unresolved."],
  ["d7", "Outside coverage A", ["Cushion and eyes", "Opening the hips", "Route or ball", "Separate pursuit lane"], ["Can the defender gain depth while keeping the play in view?", "Which hip opens as the outside route changes angle?", "Does the defender follow the route or settle at a landmark?", "Does the defender brake away from the central catch traffic?"], "A cushion-to-run transition may carry the outside route while inside space develops.", "Compare chest direction, hip opening and the receiver's continuing lane.", "Following a route briefly does not distinguish man from zone match rules."],
  ["d8", "Outside coverage B", ["Opposite cushion", "Far-side hip turn", "Depth responsibility", "Reaction after the pass"], ["Does the far-side release make the defender retreat?", "Can the defender turn without crossing the feet awkwardly?", "Does he keep depth instead of attacking the short throw?", "When does he recognize the ball has gone inside?"], "Opposite-side depth may persist while the throw attacks another coverage lane.", "Track the far-side receiver, defender hips and when the head turns inside.", "A deep zone, match or man responsibility can each preserve similar depth."],
  ["d9", "Inside defensive back", ["Underneath width", "Short route leverage", "Pass behind or inside", "Braking line"], ["Does the first lateral step follow an eligible release?", "Can the defender stay square while widening?", "Is the ball thrown beyond the defender's current width or depth?", "Does the defender close on a distinct angle after the catch?"], "Width toward an outlet may leave a different body to handle the inside corridor.", "Compare the outlet's widening line with this defender's hips and inside gaze.", "An inside zone landmark or a matched receiver could produce the same widening."],
  ["d10", "Deep reaction A", ["Depth above the window", "Forward trigger", "Ball's arrival line", "Controlled closing"], ["How much space separates this deep body from the underneath layer?", "Does the defender step forward before or after the throw?", "Can the angle meet the catch line without overshooting?", "Does he shorten the stride once the receiver crosses the goal?"], "Relatively soft depth can leave a short-lived lane behind the underneath defenders.", "Compare deep depth, first forward step and receiver crossing point.", "The provider's Cover 6 label does not identify this anonymous figure's side or exact rule."],
  ["d11", "Deep reaction B", ["Opposite-side depth", "Two threats in view", "Late recognition", "Maintain a distinct angle"], ["Does this deep body stay separated from the opposite deep defender?", "Which outside or inside route could influence his depth?", "Does the first turn toward Wilson follow delivery?", "Can he brake without crowding the central receiver?"], "A separate deep responsibility may delay an opposite-side close toward the finish.", "Compare route distribution, head direction and the first closing turn.", "Split-field rules, rotation and individual responsibility are not established by the coverage label."],
];
for (const [id, title, keys, reads, hypothesis, test, alternative] of coverageRoles) {
  roleStudies[id] = role(id, `${title} · eyes, hips and reaction`, ["jets-flacco", "participation", "official-highlights", "model"], keys, reads,
    ["Read from a bent base with short backward or lateral steps.", "Open the hips before driving into the next running line.", "Plant, turn the shoulders and accelerate toward the developing play.", id === "d6" ? "Extend, land and recover without making the receiver stop." : "Take a distinct closing angle, then shorten the stride under control."], hypothesis,
    [test, test, "Compare the first committed step with delivery, without syncing the model clock.", test], alternative);
}
Object.assign(roleStudies.d11.phases.flight, {
  key: "When can deeper help leave its threat?",
  read: "If the defender is carrying a vertical threat, do the coverage rules release him to overlap inside?",
  technique: "Preserve the assigned threat until permitted to overlap; do not simply chase Wilson.",
  hypothesis: "Deeper help may overlap inside when its coverage rules release it; distance from the catch alone does not establish an error.",
  test: "Track route distribution before the committed turn and check whether the original threat is retained or passed off.",
  alternative: "The Cover 6 label cannot map this figure's exact key, side or error; remaining deep may satisfy its responsibility.",
  sourceIds: [...roleStudies.d11.sourceIds, "cason-quarters"],
});

export const ANALYSIS = deepFreeze({
  schemaVersion: 1,
  canonicalPlayId: "2022_02_NYJ_CLE:4199",
  corpusEdition: "3487ecae1418953352a56fb6c08db56bb1f44a3de171897c60132eae2eb4f8fc",
  sources, charting, metrics, participants, conclusions, roleStudies,
  provenance: {
    datasetAttribution: "NFL play-by-play and NFL Next Gen Stats participation via nflverse; FTN Data charting via nflverse; nflverse weekly rosters. Statistical estimates are nflfastR models.",
    license: { label: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/", datasetLicenseUrl: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md" },
    derivation: "Small exact-play field subset and week-2 participant join from the verified collected edition. No bulk archive or tracking coordinates are included.",
    participationProvider: { label: "NFL Next Gen Stats for 2022 participation", url: "https://raw.githubusercontent.com/nflverse/nflreadr/main/R/load_participation.R", limit: "Provider provenance does not turn field labels into independently recovered assignments." },
    readCode: {
      rawField: "read_thrown", rawValue: "1", status: "Historical 2022 encoding remains unconfirmed.",
      detail: "The v1.5.0 dictionary supplies no numeric mapping. Numeric definitions were added September 1, 2026 in PR 319 without a cited historical encoding key; issue 325 remained open on October 20, 2026 asking whether semantics vary by season. The code is not used to assign a progression in this study.",
      sourceIds: ["ftn", "ftn-dictionary", "ftn-dictionary-2022", "ftn-dictionary-change", "ftn-read-clarification"],
    },
    sourceHashes: Object.fromEntries(sources.filter((source) => source.sha256).map((source) => [source.id, source.sha256])),
  },
  participantLimit: "Exact-play participant IDs joined to week-2 rosters establish these names and numbers. Only Flacco and Wilson are identified at their current figure locations; the other names are not assigned to reconstructed player coordinates.",
  clockLimit: studyLimit,
});

/** A deterministic authored phase selector; no video synchronization is implied. */
export function studyAt(actorId, time) {
  const study = ANALYSIS.roleStudies[actorId];
  if (!study) return null;
  const t = typeof time === "number" && Number.isFinite(time) ? Math.max(0, time) : 0;
  const phase = t < 0.8 ? "pre" : t < 2.05 ? "develop" : t < 2.85 ? "flight" : "finish";
  return study.phases[phase];
}
