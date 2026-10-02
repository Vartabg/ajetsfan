import { createPlay, type PlayDesign, type PlaybookPlayer } from "./playbook";

export type JetsPlay = {
  id: string;
  title: string;
  category: "great" | "painful";
  jetsSide: "offense" | "defense";
  date: string;
  opponent: string;
  situation: string;
  result: string;
  summary: string;
  sources: { label: string; url: string }[];
  confirmed: string[];
  /** Broad visible actions; these do not establish each player's assignment. */
  filmObservations?: { detail: string; sourceLabel: string; offsetLabel: string }[];
  illustrative: string[];
  focusPlayerIds: string[];
  /** These are teaching-time positions, not timestamps from the original film. */
  moments: { at: number; label: string; detail: string }[];
  design: PlayDesign;
};

/**
 * Preset IDs keep the editable board interoperable with saved designs. They do
 * not establish the real personnel, formation, front, protection or play call.
 * Only source-supported central actions receive motion. Every other marker is
 * an anonymous, stationary role placeholder, not a reconstruction of All-22.
 */
function archiveBoard(id: string, name: string, offenseId: string, conceptId: string, defenseId = "nickel"): PlayDesign {
  const design = createPlay(offenseId, defenseId, conceptId);
  design.archiveId = id;
  design.name = name;
  design.players = design.players.map((player) => ({ ...player, path: [] }));
  return design;
}

function actor(design: PlayDesign, id: string, change: Partial<PlaybookPlayer>): void {
  const player = design.players.find((item) => item.id === id);
  if (!player) throw new Error(`Missing archive actor: ${id}`);
  Object.assign(player, change);
}

const limits = [
  "Coordinates, spacing and the six-second timeline are illustrative board units, not measured player tracking or real elapsed time.",
  "Other markers are stationary, anonymous role placeholders. Their real locations, assignments, protection and coverage are not established here.",
  "The editable formation, defensive-front and concept presets are workspace scaffolding, not verified historical play calls.",
];

const wilson = archiveBoard("wilson-cleveland", "Garrett Wilson · Cleveland comeback", "spread-2x2", "slants");
actor(wilson, "qb", { label: "Flacco" });
actor(wilson, "h", {
  label: "G. Wilson",
  x: 280, y: 407,
  path: [{ x: 280, y: 360 }, { x: 470, y: 215 }, { x: 500, y: 185 }],
  motionWindow: { from: 0, to: 3 },
});
wilson.ball = { carrierId: "qb", targetId: "h", releaseAt: 2 };

const davis = archiveBoard("davis-cleveland", "Corey Davis · 66 yards of hope", "spread-2x2", "four-verts");
actor(davis, "qb", { label: "Flacco" });
actor(davis, "z", {
  label: "C. Davis",
  x: 910, y: 370,
  path: [{ x: 900, y: 210 }, { x: 895, y: 55 }],
});
davis.ball = { carrierId: "qb", targetId: "z", releaseAt: 2 };

const jumbo = archiveBoard("elliott-miami", "Jumbo Elliott · Monday Night Miracle", "goal-line", "stick");
actor(jumbo, "qb", { label: "Testaverde" });
actor(jumbo, "y", {
  label: "J. Elliott",
  path: [{ x: 405, y: 325 }, { x: 455, y: 280 }],
  motionWindow: { from: 0, to: 2.6 },
});
jumbo.ball = { carrierId: "qb", targetId: "y", releaseAt: 2 };

const walker = archiveBoard("walker-miami", "Wesley Walker · overtime air strike", "singleback", "four-verts");
actor(walker, "qb", { label: "K. O'Brien" });
actor(walker, "z", {
  label: "W. Walker",
  path: [{ x: 900, y: 225 }, { x: 885, y: 55 }],
  motionWindow: { from: 0, to: 2.6 },
});
walker.ball = { carrierId: "qb", targetId: "z", releaseAt: 2 };

const sanchez = archiveBoard("sanchez-thanksgiving", "Sanchez · the Thanksgiving fumble", "i-form", "inside-zone", "four-three");
actor(sanchez, "qb", {
  label: "6 Sanchez",
  path: [{ x: 520, y: 470 }, { x: 535, y: 392 }],
  motionWindow: { from: 0, to: 2.2 },
});
actor(sanchez, "rg", { label: "65 Moore" });
actor(sanchez, "d11", {
  label: "28 Gregory",
  x: 545, y: 392,
  path: [{ x: 585, y: 445 }, { x: 640, y: 585 }],
  motionWindow: { from: 3, to: 6 },
});
sanchez.ball = { carrierId: "qb", targetId: "rb", releaseAt: 2.2 };
sanchez.ballEvents = [
  { at: 0, kind: "carry", carrierId: "qb" },
  { at: 2.2, kind: "loose", until: 3, to: { x: 545, y: 392 } },
  { at: 3, kind: "carry", carrierId: "d11" },
];

const marino = archiveBoard("fake-spike", "Marino · the fake spike", "singleback", "smash", "four-three");
actor(marino, "qb", {
  label: "Marino",
  path: [{ x: 500, y: 450 }],
  motionWindow: { from: 0, to: 1.4 },
});
actor(marino, "z", {
  label: "Ingram",
  x: 825, y: 417,
  path: [{ x: 825, y: 285 }, { x: 905, y: 225 }],
  motionWindow: { from: 0, to: 2.6 },
});
marino.ball = { carrierId: "qb", targetId: "z", releaseAt: 2 };
marino.ballEvents = [
  { at: 0, kind: "carry", carrierId: "qb" },
  { at: 2, kind: "flight", until: 2.6, targetId: "z" },
];

export const jetsPlays: JetsPlay[] = [
  {
    id: "wilson-cleveland",
    title: "The Cleveland comeback: Wilson finishes it",
    category: "great",
    jetsSide: "offense",
    date: "2022-09-18",
    opponent: "Cleveland Browns",
    situation: "Late Q4 · Cleveland leads 30–24 · ball at CLE 15",
    result: "15-yard TD · 0:22 left after the score · Jets win 31–30",
    summary: "Joe Flacco finds Garrett Wilson on a slant through the middle. The touchdown ties the score; Greg Zuerlein's extra point completes the comeback.",
    sources: [
      { label: "Jets official game recap", url: "https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win" },
      { label: "Jets: Wilson's winning reception", url: "https://www.newyorkjets.com/news/jets-wr-garrett-wilson-comes-up-big-in-return-to-buckeye-state" },
      { label: "Official Jets film breakdown · winning TD at 1:15", url: "https://www.newyorkjets.com/video/baldy-s-breakdown-garrett-wilson-s-big-day-against-the-browns" },
    ],
    confirmed: [
      "Joe Flacco threw a 15-yard touchdown to Garrett Wilson on a slant, with 22 seconds remaining after the score.",
      "The Jets account describes Wilson catching between defenders and entering the end zone.",
      "The touchdown tied Cleveland at 30; Greg Zuerlein's extra point provided the 31–30 winning margin.",
    ],
    filmObservations: [
      { detail: "The inspected frames show blockers retreating into the pocket and engaging rushers; other eligible receivers release downfield while defenders turn or move with routes. These broad visible actions do not resolve all 22 identities or individual protection and coverage assignments.", sourceLabel: "Official Jets film breakdown · winning TD at 1:15", offsetLabel: "Official breakdown · frames at 1:15 and 1:18" },
    ],
    illustrative: [...limits, "Wilson's starting side, slot location, route angle, catch point and short finish are schematic; no defender identity or coverage call is assigned."],
    focusPlayerIds: ["h", "qb"],
    moments: [
      { at: 0, label: "Find Wilson", detail: "Focus on Garrett Wilson. The other markers do not establish the real formation or coverage." },
      { at: 2, label: "The slant", detail: "The official recap identifies the winning route as a slant through the middle." },
      { at: 2.6, label: "Catch and finish", detail: "Wilson catches between defenders and enters the end zone; the board does not measure separation." },
      { at: 6, label: "Comeback complete", detail: "Touchdown: 30–30 with 0:22 left. The extra point makes the final margin 31–30." },
    ],
    design: wilson,
  },
  {
    id: "davis-cleveland",
    title: "Corey Davis: 66 yards of hope",
    category: "great",
    jetsSide: "offense",
    date: "2022-09-18",
    opponent: "Cleveland Browns",
    situation: "Late Q4 · Cleveland leads 30–17 · ball at NYJ 34",
    result: "66-yard TD · Jets cut the deficit to six after the extra point",
    summary: "Flacco throws deep to an uncovered Corey Davis down the right sideline. This score keeps the comeback alive before the onside recovery and Wilson touchdown.",
    sources: [
      { label: "Jets official game recap", url: "https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win" },
      { label: "Watch the official 66-yard highlight", url: "https://www.newyorkjets.com/video/highlight-joe-flacco-to-corey-davis-for-a-66-yard-touchdown" },
    ],
    confirmed: [
      "Joe Flacco and Corey Davis connected for a 66-yard fourth-quarter touchdown while the Jets trailed 30–17.",
      "The Jets recap places the uncovered Davis down the right sideline; the official highlight describes a deep throw.",
      "An onside recovery and Wilson's touchdown followed, producing a 31–30 Jets win.",
    ],
    illustrative: [...limits, "The right-sideline direction is sourced. Davis's starting alignment, catch location, yards after catch and timing are not measured here."],
    focusPlayerIds: ["z", "qb"],
    moments: [
      { at: 0, label: "Two scores needed", detail: "Cleveland leads 30–17. Davis's touchdown is the first step in the comeback." },
      { at: 2, label: "Deep down the right", detail: "Flacco throws to Davis on the right sideline. The ball flight shown is illustrative." },
      { at: 2.6, label: "Davis has it", detail: "The source calls Davis uncovered. Stationary defensive markers do not reproduce the coverage error." },
      { at: 6, label: "Still a chance", detail: "The 66-yard score and extra point leave a six-point deficit; the onside recovery comes next." },
    ],
    design: davis,
  },
  {
    id: "elliott-miami",
    title: "Jumbo Elliott: the Monday Night Miracle",
    category: "great",
    jetsSide: "offense",
    date: "2000-10-23",
    opponent: "Miami Dolphins",
    situation: "Late Q4 · Miami leads 37–30 · ball at MIA 3",
    result: "3-yard TD · 0:42 left after the score · Jets win 40–37 in OT",
    summary: "Vinny Testaverde throws to tackle-eligible Jumbo Elliott in the goal-line offense. Elliott secures the juggled catch; the extra point ties the game before the overtime win.",
    sources: [
      { label: "Jets: the Monday Night Miracle", url: "https://www.newyorkjets.com/news/do-you-believe-in-miracles-jets-roar-back-from-23-down-rock-dolphins-40-37-in-ot" },
      { label: "Watch the official NFL highlight", url: "https://www.nfl.com/videos/nfl-100-greatest-no-92-offensive-lineman-jumbo-elliott-s-jumbo-touchdown-complet" },
      { label: "Official NFL gamebook · p. 11", url: "https://www.nflgsis.com/2000/reg/08/1105/Gamebook.pdf" },
      { label: "NFL Films radio account · p. 2", url: "https://www.nfl.info/nflmedia/nflinternational/Archives/2011_Pages/%5E11.Programs/11.Extra/wk13.NFLExtra.pdf" },
    ],
    confirmed: [
      "Vinny Testaverde completed a 3-yard touchdown to Jumbo Elliott in the Jets' goal-line offense.",
      "Elliott played as an eligible receiving lineman and juggled the ball before securing the touchdown.",
      "The NFL gamebook records second-and-goal from the Miami 3, Elliott #76 reporting eligible and a play-action fake before the throw. It does not identify the back involved in the fake.",
      "John Hall's extra point tied the game at 37 with 42 seconds remaining; the Jets won 40–37 in overtime.",
    ],
    illustrative: [...limits, "The eligible Elliott marker is placed at a teaching line end. His actual side, release shape and teammates' alignment are not established; the animation does not reproduce the juggles or replay review."],
    focusPlayerIds: ["y", "qb"],
    moments: [
      { at: 0, label: "Find the eligible tackle", detail: "The sourced action is Testaverde to Jumbo Elliott from Miami's 3-yard line." },
      { at: 2, label: "Testaverde lets it go", detail: "A short pass to an eligible lineman; its geometry and release time are schematic." },
      { at: 2.6, label: "Elliott secures it", detail: "The real catch included multiple juggles and replay review, which this marker animation does not recreate." },
      { at: 6, label: "One point from overtime", detail: "Hall's extra point ties it at 37 with 0:42 remaining. The Jets later win 40–37." },
    ],
    design: jumbo,
  },
  {
    id: "walker-miami",
    title: "Wesley Walker: the overtime air strike",
    category: "great",
    jetsSide: "offense",
    date: "1986-09-21",
    opponent: "Miami Dolphins",
    situation: "Overtime · tied 45–45 · ball at MIA 43",
    result: "43-yard walk-off TD · Jets win 51–45",
    summary: "Ken O'Brien finds Wesley Walker down the right sideline for Walker's fourth touchdown of the day. The 43-yard overtime score ends a 51–45 shootout.",
    sources: [
      { label: "Jets: the 1986 aerial assault", url: "https://www.newyorkjets.com/news/great-moments-in-jets-history-aerial-assault-at-the-meadowlands-2513155" },
      { label: "Jets: Walker's right-sideline winner", url: "https://www.newyorkjets.com/news/accolades-keep-coming-for-wesley-walker-8475167" },
    ],
    confirmed: [
      "Ken O'Brien threw a 43-yard touchdown to Wesley Walker 2:35 into overtime on September 21, 1986.",
      "The Jets describe Walker traveling down the right sideline for the winning catch.",
      "Walker caught all four of O'Brien's touchdowns that day; the winning score ended the game 51–45.",
    ],
    illustrative: [...limits, "The sourced right-sideline action is shown as a simple vertical path. The initial formation, specific route call, catch geometry and defensive assignments are not verified."],
    focusPlayerIds: ["z", "qb"],
    moments: [
      { at: 0, label: "Sudden-death overtime", detail: "The score is tied 45–45. A touchdown ends the game under the rules in use in 1986." },
      { at: 2, label: "O'Brien goes deep", detail: "Walker travels down the right sideline. The board's alignment and trajectory are schematic." },
      { at: 2.6, label: "Walker finishes it", detail: "The actual play gains 43 yards and is Walker's fourth touchdown catch of the game." },
      { at: 6, label: "51–45, final", detail: "The winning score occurs 2:35 into overtime. The board timeline is not that game clock." },
    ],
    design: walker,
  },
  {
    id: "sanchez-thanksgiving",
    title: "The Butt Fumble",
    category: "painful",
    jetsSide: "offense",
    date: "2012-11-22",
    opponent: "New England Patriots",
    situation: "Q2 9:10 · 1st-and-10 at NYJ 31 · Jets trailing 0–14",
    result: "Sanchez fumble · Gregory 32-yard return TD · Patriots win 49–19",
    summary: "Mark Sanchez's failed handoff becomes a collision with Brandon Moore. Steve Gregory recovers the fumble and returns it 32 yards for a Patriots touchdown.",
    sources: [
      { label: "Official gamebook · pp. 1, 12", url: "https://static.clubs.nfl.com/image/upload/v1579033021/patriots/amcwj36pj6zii3wsmwsl.pdf" },
      { label: "Sanchez's postgame account", url: "https://www.patriots.com/news/jets-postgame-quotes-11-22-2012-184316" },
      { label: "Watch the official NFL replay", url: "https://www.nfl.com/videos/mark-sanchez-s-butt-fumble-against-patriots" },
    ],
    confirmed: [
      "Sanchez said he mixed up the play, expected a fullback handoff, then ran and tried to get down before colliding with Moore.",
      "The gamebook records a 1-yard Sanchez run, a fumble at NYJ 32 and Steve Gregory's 32-yard touchdown return.",
      "The gamebook identifies Mark Sanchez as #6, Brandon Moore as #65 and Steve Gregory as #28.",
    ],
    illustrative: [...limits,
      "The failed-handoff, collision, loose ball and return are schematic. Contact is a scripted event, not a collision simulation.",
      "Gregory begins at the diagram's recovery point and moves after possession changes. His approach, precise recovery location and return track are not reconstructed.",
      "Moore remains stationary because his blocking movement and assignment are not established by this diagram.",
    ],
    focusPlayerIds: ["qb", "rg", "d11"],
    moments: [
      { at: 0, label: "The handoff breaks down", detail: "Sanchez's account says he confused the play and expected to hand off to the fullback." },
      { at: 2.2, label: "Collision and fumble", detail: "Sanchez collides with Moore. The record credits a 1-yard run and a fumble at NYJ 32." },
      { at: 3, label: "Gregory recovers", detail: "Possession changes to New England. Gregory's recovery position and timing on this board are schematic." },
      { at: 6, label: "A 32-yard return", detail: "Gregory's touchdown makes it 20–0; the extra point makes it 21–0 with 9:00 left in Q2." },
    ],
    design: sanchez,
  },
  {
    id: "fake-spike",
    title: "The Fake Spike",
    category: "painful",
    jetsSide: "defense",
    date: "1994-11-27",
    opponent: "Miami Dolphins",
    situation: "Late Q4 · 1st-and-goal at NYJ 8 · Jets leading 24–21",
    result: "8-yard Marino-to-Ingram TD · 0:22 left after score · Miami wins 28–24",
    summary: "Dan Marino signals a clock-stopping spike, keeps the play live and finds Mark Ingram in the corner of the end zone. Miami's offense is shown against the Jets' defense.",
    sources: [
      { label: "Jets historical timeline", url: "https://www.newyorkjets.com/news/a-timeline-of-jets-meadowlands-moments-2515818" },
      { label: "Dolphins: corner release and back-shoulder throw", url: "https://www.miamidolphins.com/news/top-news-chad-o-shea-likes-improvement-from-offensive-line" },
      { label: "Dolphins 2024 media guide · first-and-goal", url: "https://static.www.nfl.com/league/apps/league-site/media-guides/2024/MIA.pdf" },
      { label: "Watch the official NFL full game · Fake Spike at 1:55:29", url: "https://www.youtube.com/watch?v=muse9wmuueM&t=6929" },
    ],
    confirmed: [
      "The Jets timeline records an 8-yard Dan Marino-to-Mark Ingram touchdown with 22 seconds remaining and a 28–24 Miami win.",
      "The Dolphins describe Marino's fake spike, Ingram's release to the corner and a back-shoulder throw.",
      "Miami's media guide identifies first-and-goal; the Jets led 24–21 before the touchdown.",
    ],
    illustrative: [...limits,
      "Miami is the offense; the Jets are the defense. Marino's drop and Ingram's corner path are schematic, not a verified 22-player map.",
      "The marker animation does not reproduce Marino's hand gesture or the back-shoulder catch technique. No Jets defender is assigned an inferred route or blame.",
      "Official retrospectives vary on the pre-snap clock. The sourced 22 seconds is the clock after the touchdown.",
    ],
    focusPlayerIds: ["qb", "z"],
    moments: [
      { at: 0, label: "A spike is signaled", detail: "Marino's fake clock-stopping gesture is part of the sourced play; the markers do not animate the hand signal." },
      { at: 2, label: "The play stays live", detail: "Marino throws instead of spiking. Miami is on offense in this study." },
      { at: 2.6, label: "Ingram in the corner", detail: "The Dolphins account describes the corner release and a back-shoulder throw, without establishing every defender's assignment." },
      { at: 6, label: "0:22 after the score", detail: "The 8-yard touchdown puts Miami ahead. The final score is Dolphins 28, Jets 24." },
    ],
    design: marino,
  },
];

/** A caller can edit a study copy without mutating the canonical archive. */
export function getJetsPlayDesign(id: string): PlayDesign | null {
  const play = jetsPlays.find((item) => item.id === id);
  return play ? structuredClone(play.design) : null;
}
