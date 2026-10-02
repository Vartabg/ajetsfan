import { jetsPlays, type JetsPlay } from "./jets-playbook";
import { defensiveFormations, FIELD, type PlayDesign, type PlaybookPlayer, type Point } from "./playbook";

export type JetsAssignment = {
  playerId: string;
  role: string;
  action: string;
  detail: string;
  basis: "source-supported" | "illustrative";
  sourceLabels?: string[];
};

export type JetsStudy = {
  design: PlayDesign;
  assignments: JetsAssignment[];
  summary: string;
  questions: string[];
};

type Pair = readonly [x: number, y: number];
type StudyPlan = {
  path: Pair[];
  action: string;
  detail: string;
  from?: number;
  to?: number;
  start?: Pair;
};

const point = ([x, y]: Pair): Point => ({ x, y });
const plan = (path: Pair[], action: string, detail: string, to = 6, from = 0): StudyPlan => ({ path, action, detail, from, to });
const roles: Record<string, string> = {
  lt: "Left tackle", lg: "Left guard", c: "Center", rg: "Right guard", rt: "Right tackle",
  qb: "Quarterback", x: "Left outside receiver", z: "Right outside receiver",
  y: "Tight end / eligible line end", h: "Inside receiver", rb: "Running back",
};
const defensiveRoles: Record<string, string> = {
  LDE: "Left defensive end", RDE: "Right defensive end", LDT: "Left defensive tackle", RDT: "Right defensive tackle",
  WLB: "Weak-side linebacker", MLB: "Middle linebacker", SLB: "Strong-side linebacker",
  LCB: "Left outside corner", RCB: "Right outside corner", NB: "Inside defensive back",
  FS: "Left deep safety", SS: "Right deep safety",
};

/**
 * These are deliberately authored teaching assignments, not recovered All-22
 * tracking. A sourced action does not establish its board coordinates, clock,
 * protection, complementary routes, coverage or the other players' jobs.
 */
const geometryLimit = "The path, alignment and teaching time are illustrative; this is not an observed full-snap assignment.";

function passLine(setDepth: number, pocketBias: number, finish: number): Record<string, StudyPlan> {
  const detail = "Study choice: show an initial pass set and a short engagement, then hold the marker near the pocket. The real protection, footwork and contact are not established.";
  return {
    lt: plan([[414 + pocketBias, 370 + setDepth], [406 + pocketBias, 382 + setDepth]], "Set the left edge", detail, finish),
    lg: plan([[460 + pocketBias, 376 + setDepth], [456 + pocketBias, 382 + setDepth]], "Protect the left interior", detail, finish),
    c: plan([[500 + pocketBias, 374 + setDepth], [503 + pocketBias, 382 + setDepth]], "Set and help inside", "Study choice: an interior help set after the snap. No historical slide direction, double team or responsibility is assigned.", finish),
    rg: plan([[540 + pocketBias, 376 + setDepth], [544 + pocketBias, 382 + setDepth]], "Protect the right interior", detail, finish),
    rt: plan([[586 + pocketBias, 370 + setDepth], [594 + pocketBias, 382 + setDepth]], "Set the right edge", detail, finish),
  };
}

const supportingPlans: Record<string, Record<string, StudyPlan>> = {
  "wilson-cleveland": {
    ...passLine(10, 0, 1.7),
    x: plan([[95, 288], [205, 220], [280, 190]], "Stem and work inside", "Study choice: a complementary inside route draws a separate reaction away from Wilson. The other receiver's real route is unknown.", 3.3),
    z: plan([[908, 280], [870, 180], [850, 125]], "Clear the right outside lane", "Study choice: an outside vertical release supplies width. It does not establish the real route combination.", 3.5),
    y: plan([[745, 348], [842, 318]], "Release to the right flat", "Study choice: an underneath outlet widens the right-side defender. Its role in the actual touchdown is not established.", 2.6),
    rb: plan([[416, 420], [379, 387], [324, 332]], "Check inside, then release", "Study choice: a brief protection check followed by an outlet. No blitz pickup or real running-back responsibility is claimed.", 3),
    d1: plan([[397, 364], [386, 407]], "Rush outside the left set", "Study choice: an edge lane meets the left tackle's set. The real rush and any contact are unverified.", 2.8),
    d2: plan([[465, 364], [478, 377]], "Work the left interior lane", "Study choice: an interior rush approaches the guard; the final gap is schematic contact spacing.", 2.5),
    d3: plan([[534, 364], [521, 377]], "Work the right interior lane", "Study choice: a separate interior rush keeps the pocket readable. No stunt or pressure call is identified.", 2.5),
    d4: plan([[601, 364], [613, 407]], "Rush outside the right set", "Study choice: an edge rush approaches the right tackle rather than running through the quarterback.", 2.8),
    d5: plan([[420, 247], [448, 225], [487, 194]], "Drop inside, then close", "Study choice: one underneath reaction lets you inspect the slant's catch window. The real coverage and this defender's identity are unknown.", 3.2),
    d6: plan([[565, 247], [533, 222], [511, 189]], "Read the middle and converge", "Study choice: a second underneath reaction brackets the schematic catch area; it is not a verified zone or man assignment.", 3.2),
    d7: plan([[132, 189], [173, 188], [264, 191]], "Retreat with the left release", "Study choice: a left outside defender reacts to the complementary route. No actual matchup is claimed.", 3.4),
    d8: plan([[872, 180], [869, 128]], "Retreat with the right release", "Study choice: the right outside defender preserves depth against the vertical example.", 3.5),
    d9: plan([[772, 290], [820, 316]], "Widen toward the flat", "Study choice: an inside defensive back widens toward the outlet. This does not identify the Browns' coverage.", 2.8),
    d10: plan([[370, 112], [420, 151], [486, 171]], "Stay deep, then break inside", "Study choice: a left deep defender breaks toward the finish after a short retreat; no actual safety responsibility is established.", 3.3),
    d11: plan([[626, 114], [566, 150], [521, 170]], "Stay deep, then close on the slant", "Study choice: the opposite deep defender reacts toward Wilson's finish. The source confirms a catch between defenders, not these trajectories.", 3.3),
  },
  "davis-cleveland": {
    ...passLine(13, -3, 1.9),
    x: plan([[95, 220], [165, 110], [235, 56]], "Stretch the left side", "Study choice: a vertical release creates a separate deep threat. The actual complementary route is not established."),
    y: plan([[715, 285], [650, 180], [625, 80]], "Stem inside and carry depth", "Study choice: an inside seam-shaped route provides a visual reason to inspect eye discipline. It is not evidence of the Browns' bust."),
    h: plan([[285, 281], [365, 174], [413, 84]], "Carry an inside deep lane", "Study choice: a second inside route illustrates competing deep threats. Its existence on the historical play is unverified."),
    rb: plan([[421, 416], [393, 394], [323, 302], [287, 264]], "Check the edge and become an outlet", "Study choice: a running-back check and release. The real protection and release timing are unknown.", 3.4),
    d1: plan([[397, 367], [382, 411]], "Work the outside left rush lane", "Study choice: a left edge rush meets the tackle's set without simulating a win or a block.", 3.1),
    d2: plan([[462, 365], [475, 381]], "Press the left guard", "Study choice: a short interior push; no actual rush move or matchup is verified.", 2.7),
    d3: plan([[536, 365], [524, 381]], "Press the right interior", "Study choice: a second interior push preserves a schematic pocket.", 2.7),
    d4: plan([[600, 366], [614, 411]], "Work the outside right rush lane", "Study choice: an edge lane gives Flacco's pocket a visible boundary. It does not establish his real pressure level.", 3.1),
    d5: plan([[425, 220], [387, 162], [415, 117]], "Carry an inside threat", "Study choice: a linebacker follows an inside route to show an underneath reaction. No man assignment is asserted."),
    d6: plan([[577, 220], [614, 163], [666, 115]], "Gain depth inside", "Study choice: an inside defender gains depth toward the seam example; its relationship to the real coverage error is unknown."),
    d7: plan([[136, 162], [197, 76], [250, 65]], "Retreat down the opposite boundary", "Study choice: a left boundary response to the vertical example. This is not a recovered matchup."),
    d8: plan([[865, 174], [782, 139], [824, 113], [877, 84]], "React inside, then pursue the sideline", "Study choice: the right outside defender turns inside before chasing Davis's lane. The source says Davis was uncovered; it does not establish who made the coverage error."),
    d9: plan([[706, 224], [671, 163], [754, 142]], "Read inside, then turn outward", "Study choice: an inside defensive back reacts to the seam example before turning toward the throw. No assignment or blame is inferred."),
    d10: plan([[325, 98], [333, 63], [431, 67]], "Hold left depth and follow the throw", "Study choice: a deep left defender reacts across the field late. The real safety rotation is not known."),
    d11: plan([[593, 93], [645, 66], [777, 77], [858, 83]], "React to the inside threat, then pursue", "Study choice: a deep defender's inside reaction leaves schematic space on the right. This illustrates a question for tape, not the actual bust or a named player's mistake."),
  },
  "elliott-miami": {
    ...passLine(5, 0, 1.5),
    x: plan([[240, 365], [204, 300], [214, 279]], "Release away from the eligible tackle", "Study choice: an outside release supplies a separate goal-line threat. Its route and spacing are unverified.", 2.5),
    z: plan([[642, 333], [705, 302], [733, 284]], "Show an opposite-side outlet", "Study choice: the opposite eligible end releases toward the flat. This is a teaching complement, not the historical call.", 2.5),
    h: plan([[491, 445], [505, 405], [520, 391]], "Show a backfield fake, then protect", "The official gamebook identifies play action. Study choice: this anonymous fullback supplies the fake before protecting; the actual back's identity, fake track and blocking assignment are not established.", 2),
    rb: plan([[516, 494], [514, 435], [465, 410]], "Approach the fake, then check inside", "The source establishes play action. Study choice: this tailback approaches the backfield action and checks the pocket. The actual participating back, mesh, read and pickup are unknown.", 2.2),
    d1: plan([[392, 359], [385, 390]], "Contain the left edge", "Study choice: an edge rush stops near the left protection set; it does not simulate actual contact.", 2),
    d2: plan([[465, 355], [479, 371]], "Push the left interior", "Study choice: a short interior reaction at the goal line. The real front is not reconstructed.", 1.8),
    d3: plan([[535, 355], [522, 371]], "Push the right interior", "Study choice: an interior reaction opposite the right guard, without assigning an actual technique or matchup.", 1.8),
    d4: plan([[608, 357], [615, 389]], "Contain the right edge", "Study choice: a contained right rush lane keeps the short-pass pocket visible.", 2),
    d5: plan([[427, 306], [420, 292], [449, 275]], "Read the backfield, then find the eligible end", "Study choice: a short inward step and pass reaction illustrate the run/pass conflict. No real linebacker key or coverage is claimed.", 2.7),
    d6: plan([[545, 307], [546, 291], [479, 274]], "Step toward the line, then recover inside", "Study choice: an opposite underneath reaction closes toward Elliott after the backfield example. The actual defender job is unknown.", 2.7),
    d7: plan([[164, 250], [194, 267]], "React to the outside release", "Study choice: a boundary defender tracks the complementary left receiver. No historical matchup is established.", 2.6),
    d8: plan([[824, 255], [752, 277]], "Close toward the opposite flat", "Study choice: a right boundary response to the outlet; the starting depth and reaction are schematic.", 2.6),
    d9: plan([[691, 292], [624, 288], [549, 279]], "Read the flat and fold inside", "Study choice: a defensive back follows the opposite short action before turning inside. This does not identify Miami's coverage.", 2.8),
    d10: plan([[366, 185], [417, 237], [450, 257]], "Close from left depth", "Study choice: a deep defender reacts toward the eligible tackle's catch area. No real safety location or responsibility is established.", 2.8),
    d11: plan([[628, 186], [562, 236], [485, 258]], "Close from opposite depth", "Study choice: a second deep reaction completes the teaching snap. The actual package and pursuit are unknown.", 2.8),
  },
  "walker-miami": {
    ...passLine(14, 2, 1.9),
    x: plan([[92, 245], [126, 156], [183, 68]], "Carry the opposite boundary", "Study choice: a backside vertical threat keeps the entire formation active. Its route is not established in the winning-play sources.", 3.1),
    y: plan([[650, 321], [658, 246], [608, 181]], "Release inside and settle", "Study choice: a tight-end inside route supplies an intermediate option. The actual route and read order are unknown.", 2.8),
    h: plan([[270, 299], [318, 205], [439, 108]], "Work an inside deep route", "Study choice: an inside release crosses toward deep space; no historical concept or coverage manipulation is claimed.", 3),
    rb: plan([[505, 488], [500, 436], [464, 401]], "Step up and check the pocket", "Study choice: the deep back approaches the pocket and checks inside. Its actual assignment is not established.", 2),
    d1: plan([[398, 367], [387, 413]], "Rush the left pocket edge", "Study choice: an edge lane presses the left tackle's set, with schematic spacing rather than actual blocking contact.", 2.8),
    d2: plan([[466, 365], [477, 381]], "Press the left interior", "Study choice: an interior rush against the pass set. No observed technique or stunt is identified.", 2.6),
    d3: plan([[535, 365], [524, 381]], "Press the right interior", "Study choice: an opposing interior rush remains near the guard rather than running through the passer.", 2.6),
    d4: plan([[603, 366], [617, 413]], "Rush the right pocket edge", "Study choice: the right edge maintains a separate rush lane; the real pressure and protection are unknown.", 2.8),
    d5: plan([[368, 233], [332, 183], [422, 136]], "Retreat toward the inside release", "Study choice: a left underneath defender reacts to the complementary inside route. It is not a verified man or zone job.", 3.1),
    d6: plan([[500, 216], [546, 187], [598, 181]], "Gain depth toward the intermediate option", "Study choice: a middle defender reacts to the tight-end example; no coverage call is inferred.", 2.9),
    d7: plan([[634, 230], [687, 178], [742, 130]], "Turn toward the right-side threat", "Study choice: a right underneath reaction follows the developing throw. The real defender assignment is not established.", 3),
    d8: plan([[131, 175], [154, 102], [202, 66]], "Retreat with the left boundary route", "Study choice: the opposite corner responds to the backside vertical example.", 3.1),
    d9: plan([[881, 157], [897, 111], [908, 75]], "Retreat, then close on Walker's lane", "Study choice: an outside defender reacts near the winning route's finish. The source identifies the right sideline, not this matchup or separation.", 2.9),
    d10: plan([[329, 100], [364, 63], [461, 75]], "Keep left depth and react across", "Study choice: a left deep response to competing routes. The real safety rotation is unknown.", 3.1),
    d11: plan([[679, 103], [764, 74], [859, 72]], "Close from right depth", "Study choice: a right deep defender turns toward Walker's finish. No actual angle, coverage or named defensive responsibility is claimed.", 3),
  },
  "sanchez-thanksgiving": {
    lt: plan([[424, 353], [414, 340], [472, 446], [552, 521]], "Engage left, then turn after the fumble", "Study choice: a run-block step followed by recovery pursuit. The real blocking call, engagement and chase path are unknown."),
    lg: plan([[467, 350], [470, 339], [506, 448], [577, 545]], "Fit inside, then react to the return", "Study choice: an interior run fit gives way to pursuit when possession changes. No actual assignment is claimed."),
    c: plan([[507, 350], [514, 339], [539, 441], [590, 558]], "Step to the interior, then turn back", "Study choice: the center's path illustrates a post-fumble transition rather than establishing a real block or pursuit lane."),
    rg: plan([[535, 380], [535, 392]], "Move into the collision area", "The sources identify Sanchez's collision with Brandon Moore. Moore's short backward path and stopping point are a teaching choice; his actual blocking motion is not established.", 2),
    rt: plan([[574, 353], [584, 344], [589, 449], [627, 554]], "Fit the right edge, then react to the return", "Study choice: a short run-block step and a turn toward the return. No real block, leverage or chase is verified."),
    x: plan([[122, 330], [148, 310], [319, 409], [493, 507]], "Approach a perimeter fit, then pursue", "Study choice: a receiver approaches an outside block and turns toward the turnover. The actual receiver route or block is unknown."),
    z: plan([[888, 355], [863, 325], [776, 422], [704, 525]], "Approach the right perimeter, then react", "Study choice: a right receiver's run-action response becomes pursuit. The real assignment and return angle are unverified."),
    y: plan([[634, 351], [646, 333], [655, 450], [669, 558]], "Show an edge fit, then turn downfield", "Study choice: the tight end illustrates an edge block and subsequent turnover reaction. Contact is not simulated."),
    h: plan([[529, 442], [550, 396], [555, 346]], "Approach the expected handoff lane", "Sanchez said he expected a fullback handoff. This fullback's alignment, run track and finish are illustrative; the statement does not establish the fullback's actual assignment.", 2.3),
    rb: plan([[545, 492], [571, 419], [586, 389], [613, 480], [652, 558]], "Follow the backfield action, then pursue", "Study choice: a tailback approaches the run action and turns after the fumble. No real carry, read or pursuit lane is asserted."),
    d1: plan([[401, 366], [409, 377], [474, 456], [578, 552]], "Fit the left edge, then escort the return", "Study choice: an edge reaction transitions to a return-side screen. Its actual block or lane is unknown."),
    d2: plan([[469, 358], [483, 378], [523, 458], [603, 551]], "Press inside, then turn with possession", "Study choice: an interior run reaction and return escort. No actual block, tackle or defensive technique is claimed."),
    d3: plan([[537, 358], [551, 377], [584, 451], [662, 543]], "Fit the interior, then clear a return lane", "Study choice: a defensive tackle turns toward the developing return. The source does not establish the real collision or blocking matchup."),
    d4: plan([[607, 364], [598, 380], [640, 451], [688, 541]], "Contain right, then turn downfield", "Study choice: an edge defender reacts to the run and becomes a return escort. This is not recovered tracking."),
    d5: plan([[422, 327], [452, 374], [511, 447], [574, 545]], "Fit inside and turn toward the return", "Study choice: a left linebacker responds to the backfield, then turns with New England's possession. No actual key or block is assigned."),
    d6: plan([[514, 319], [536, 377], [594, 440], [650, 543]], "Read the backfield and escort outside", "Study choice: a middle linebacker converges, then changes direction after the recovery. The actual run fit and return job are unknown."),
    d7: plan([[594, 322], [578, 381], [628, 436], [677, 531]], "Close toward the run and transition", "Study choice: an opposite linebacker approaches the fumble area and turns downfield. No actual assignment is established."),
    d8: plan([[192, 307], [303, 365], [461, 439], [548, 512]], "Fold from the left perimeter", "Study choice: a corner turns toward the run, then follows the turnover. No actual pursuit or block is claimed."),
    d9: plan([[818, 307], [733, 361], [689, 448], [704, 548]], "Fold from the right perimeter", "Study choice: a right corner's reaction becomes an outside return lane. Its real path and responsibility are unknown."),
    d10: plan([[393, 221], [454, 325], [522, 433], [585, 529]], "Approach from depth and follow the return", "Study choice: a deep defender closes toward the run, then follows Gregory's return. The real safety angle is not established."),
  },
  "fake-spike": {
    ...passLine(4, 0, 1.3),
    x: plan([[109, 338], [145, 305]], "Release briefly on the opposite side", "Study choice: a short opposite-side release keeps a live-play response visible. The real route and receiver action are not established.", 2.4),
    y: plan([[642, 342], [682, 319]], "Show a short inside outlet", "Study choice: an eligible line-end release supplies a secondary threat. The sources establish Ingram's catch, not the other routes.", 2.4),
    h: plan([[283, 372], [318, 337]], "Release toward short interior space", "Study choice: a brief inside-receiver action illustrates that the snap remains live. No real route or role is asserted.", 2.4),
    rb: plan([[501, 487], [522, 446], [547, 415]], "Step toward the live pocket", "Study choice: a backfield protection response. Its real footwork, pickup and responsibility are unknown.", 1.9),
    d1: plan([[390, 353], [392, 377]], "React to the live snap on the edge", "Study choice: a short, delayed rush reaction after the signal. It does not establish that any named Jet stopped playing.", 2.2, 0.7),
    d2: plan([[465, 352], [478, 371]], "React in the left interior", "Study choice: a short interior response to the live snap. The delay is illustrative rather than measured reaction time.", 2, 0.7),
    d3: plan([[535, 352], [522, 371]], "React in the right interior", "Study choice: a second interior response; no actual rush count, technique or fault is assigned.", 2, 0.7),
    d4: plan([[610, 353], [614, 377]], "React on the right pocket edge", "Study choice: a restrained edge reaction keeps the short throw readable. The true timing and effort are unverified.", 2.2, 0.7),
    d5: plan([[374, 297], [336, 326]], "Read and close toward the short release", "Study choice: an underneath defender responds to the opposite inside receiver. No real matchup, coverage or lapse is inferred.", 2.6, 0.6),
    d6: plan([[527, 283], [595, 309], [666, 310]], "React to the live pass inside", "Study choice: a middle defender turns toward the short-pass side. The source does not establish his real responsibility.", 2.7, 0.6),
    d7: plan([[635, 283], [721, 277], [818, 245]], "Turn toward the developing corner throw", "Study choice: a right underneath defender reacts toward Ingram's lane. Its actual position, assignment and timing are unknown.", 2.9, 0.6),
    d8: plan([[143, 255], [169, 293]], "Respond to the opposite outside receiver", "Study choice: a left outside defender reacts to the short complementary release. No historical matchup is claimed.", 2.6, 0.6),
    d9: plan([[884, 220], [925, 216]], "Open toward the corner and close", "Study choice: an anonymous right outside defender reacts near Ingram's corner path. This does not identify the actual defender or assign blame for the touchdown.", 2.8, 0.7),
    d10: plan([[368, 181], [409, 241], [532, 262]], "Read from depth and close inside", "Study choice: a left deep response to the live pass. No real safety coverage or reaction speed is established.", 3, 0.8),
    d11: plan([[706, 176], [790, 204], [863, 218]], "Close from depth toward the corner", "Study choice: a deep defender follows the throw toward the right corner. Its real path and responsibility are unknown.", 3, 0.8),
  },
};

const summaries: Record<string, string> = {
  "wilson-cleveland": "Study the slant as a full snap: a short pocket set, complementary spacing, underneath reactions and a catch between converging defenders. Only Flacco's pass and Wilson's sourced action are established; the other jobs are teaching choices.",
  "davis-cleveland": "Study the deep right-sideline score with a moving pocket, competing deep threats and defenders reacting inside before pursuit. Davis being uncovered is sourced. The board does not identify the real coverage error, rotation or player responsible.",
  "elliott-miami": "Study the eligible-lineman touchdown with a compact pocket, play-action fake, opposite-side releases and short defensive reactions. Testaverde's pass, Elliott's eligibility and the play action are sourced; the specific back, complete protection and defensive assignments remain illustrative.",
  "walker-miami": "Study the overtime winner with a deeper pocket, a right-sideline target, complementary releases and pursuit from underneath and depth. The sideline touchdown is sourced; the historical route combination, matchups and coverage are not established.",
  "sanchez-thanksgiving": "Study a run-action breakdown becoming a turnover: a missed exchange, line engagement, collision area, recovery approach and a reversal of direction. Sanchez's account and Gregory's return are sourced. The other fits, contact spacing and return lanes are authored study choices.",
  "fake-spike": "Study Miami's live snap against the Jets: a short protection set, complementary releases and schematic delayed defensive reactions around the corner throw. The fake spike and Ingram touchdown are sourced. No defender's actual hesitation, assignment or blame is established.",
};

const questions: Record<string, string[]> = {
  "wilson-cleveland": ["On usable film, how are the inside defenders aligned before the snap?", "Which complementary routes change the width of the slant window?", "Where does Wilson catch relative to each defender's leverage?"],
  "davis-cleveland": ["Which defender takes the first step inside, and what is he reading?", "Does film establish the intended handoff of the outside receiver?", "Where are the other deep threats when Flacco commits to Davis?"],
  "elliott-miami": ["How does Elliott report and align as an eligible receiver?", "Which backfield and line actions precede his release?", "Who has eyes on the eligible line end before and after the snap?"],
  "walker-miami": ["How does Walker release against the actual corner's leverage?", "Where is the nearest deep help as O'Brien releases the ball?", "What do the complementary routes and protection do on the actual tape?"],
  "sanchez-thanksgiving": ["Where do the fullback and tailback go when the exchange breaks down?", "How does Moore's engagement change the space in front of Sanchez?", "Where does Gregory start, and who changes direction after the recovery?"],
  "fake-spike": ["Who reacts to Marino's signal, and what does the next frame show?", "What is Ingram's release and the actual corner's leverage?", "Which Jets are still carrying their assignments when the ball is released?"],
};

function applyPlan(player: PlaybookPlayer, assignment: StudyPlan): void {
  if (assignment.start) Object.assign(player, point(assignment.start));
  player.path = assignment.path.map(point);
  player.motionWindow = { from: assignment.from ?? 0, to: assignment.to ?? FIELD.duration };
}

function sourceAction(play: JetsPlay, player: PlaybookPlayer): Pick<JetsAssignment, "action" | "detail"> {
  if (play.id === "sanchez-thanksgiving") {
    if (player.id === "qb") return { action: "Missed exchange, run and collision", detail: "Sanchez said he expected a fullback handoff, ran and collided with Moore; the gamebook records his run and fumble. The board does not reproduce body position, the real blocking or collision physics." };
    if (player.id === "rg") return { action: "Moore at the collision", detail: "Sanchez's account identifies the collision with Brandon Moore. Moore's moving set, exact location and held finish on this board are illustrative, not a verified block or assignment." };
    return { action: "Gregory recovers and returns", detail: "The gamebook credits Steve Gregory with the recovery and a 32-yard touchdown return. His safety-depth start, approach and return track are illustrative; the approach meets the loose ball continuously at the board's recovery moment." };
  }
  if (player.id === "qb") return {
    action: play.id === "fake-spike" ? "Keep the snap live and throw" : "Set and deliver the sourced pass",
    detail: play.id === "fake-spike"
      ? "The sources describe Marino's fake spike and touchdown throw to Ingram. His drop, release position and teaching time are schematic; the marker does not animate the hand signal or throwing technique."
      : play.id === "elliott-miami"
        ? "The official gamebook identifies play action before Testaverde's touchdown to eligible Elliott; the NFL radio excerpt describes an under-center fake and short throw over the middle. The drop, fake coordinates, participating back and release time remain illustrative."
      : "The primary accounts identify this quarterback's touchdown pass. His drop, pocket location, progression and release time on the board are schematic, not measured or verified quarterback technique.",
  };
  const detail: Record<string, string> = {
    "wilson-cleveland": "The Jets describe Wilson's slant, catch between defenders and finish into the end zone. The starting side, path angle, defenders' trajectories and teaching clock are illustrative.",
    "davis-cleveland": "The Jets identify Davis uncovered down the right sideline on the 66-yard touchdown. His exact release, catch point and running track are not measured; other defenders' paths do not establish the actual bust.",
    "elliott-miami": "The Jets identify the eligible Elliott catching Testaverde's 3-yard touchdown and juggling it before securing possession. His release geometry and the other players' reactions are illustrative; the marker does not recreate the juggles.",
    "walker-miami": "The Jets describe Walker traveling down the right sideline for the 43-yard overtime touchdown. The exact route, release, catch geometry and defensive matchup are not established.",
    "fake-spike": "The Dolphins describe Ingram's corner release and Marino's back-shoulder throw. The drawn path and catch timing are schematic; the marker does not reproduce body orientation or catch technique.",
  };
  const action: Record<string, string> = {
    "wilson-cleveland": "Wilson's slant and touchdown finish",
    "davis-cleveland": "Davis down the right sideline",
    "elliott-miami": "Elliott's eligible release and touchdown",
    "walker-miami": "Walker's right-sideline winner",
    "fake-spike": "Ingram's corner release and touchdown",
  };
  return { action: action[play.id], detail: detail[play.id] };
}

function centralActor(play: JetsPlay, id: string): boolean {
  return id === "qb" || id === play.design.ball.targetId && play.id !== "sanchez-thanksgiving"
    || play.id === "sanchez-thanksgiving" && (id === "rg" || id === "d11");
}

function studyRole(play: JetsPlay, player: PlaybookPlayer): string {
  if (player.side === "defense") {
    const template = defensiveFormations.find((formation) => formation.id === play.design.defenseId)?.players.find((item) => item.id === player.id);
    return template ? defensiveRoles[template.label] ?? template.label : "Defensive role";
  }
  if (play.id === "elliott-miami" && player.id === "y") return "Eligible tackle";
  if (play.design.offenseId === "goal-line" && player.id === "z") return "Right eligible line end";
  if ((play.design.offenseId === "i-form" || play.design.offenseId === "goal-line") && player.id === "h") return "Fullback";
  return roles[player.id] ?? player.label;
}

function buildStudy(play: JetsPlay): JetsStudy {
  const design = structuredClone(play.design);
  design.studyMode = "full-snap";
  const plans = supportingPlans[play.id];
  for (const player of design.players) {
    const assignment = plans[player.id];
    if (assignment) applyPlan(player, assignment);
    // The source-only board leaves most quarterbacks still. A bounded pocket
    // set gives the teaching snap a readable passer without inventing footwork.
    if (player.id === "qb" && !player.path.length) {
      applyPlan(player, play.id === "wilson-cleveland"
        ? plan([[500, 476], [502, 482]], "Set and deliver", geometryLimit, 1.3)
        : play.id === "davis-cleveland"
          ? plan([[493, 490], [498, 493]], "Set and deliver", geometryLimit, 1.6)
          : play.id === "elliott-miami"
            ? plan([[509, 450], [502, 457]], "Set and deliver", geometryLimit, 1.5)
            : plan([[504, 466], [505, 477]], "Set and deliver", geometryLimit, 1.6));
    }
  }

  if (play.id === "sanchez-thanksgiving") {
    const gregory = design.players.find((player) => player.id === "d11")!;
    const recovery = design.ballEvents!.find((event) => event.kind === "loose")!;
    if (recovery.kind !== "loose") throw new Error("The recovery requires a loose-ball event.");
    // Starting depth is a study choice. Match cumulative distance at t=3 to
    // the loose-ball endpoint so possession changes without a position jump.
    gregory.x = 650;
    gregory.y = 145;
    gregory.path = [structuredClone(recovery.to), ...gregory.path];
    const approach = Math.hypot(recovery.to.x - gregory.x, recovery.to.y - gregory.y);
    const returnDistance = gregory.path.slice(1).reduce((distance, destination, index) => {
      const previous = gregory.path[index];
      return distance + Math.hypot(destination.x - previous.x, destination.y - previous.y);
    }, 0);
    gregory.motionWindow = { from: 0, to: recovery.until * (approach + returnDistance) / approach };
  }

  const assignments = design.players.map((player): JetsAssignment => {
    const supportedAction = centralActor(play, player.id);
    // A sourced pass/collision does not turn newly authored set or blocking
    // motion into evidence. Existing central actions keep their source notes.
    const sourced = supportedAction && Boolean(play.design.players.find((original) => original.id === player.id)?.path.length);
    const assignment = plans[player.id];
    const content = supportedAction ? sourceAction(play, player) : assignment;
    if (!content || !player.path.length) throw new Error(`Missing full-snap study for ${play.id}:${player.id}`);
    return {
      playerId: player.id,
      role: studyRole(play, player),
      action: content.action,
      detail: content.detail,
      basis: sourced ? "source-supported" : "illustrative",
      ...(supportedAction ? { sourceLabels: play.sources.map((source) => source.label) } : {}),
    };
  });
  return { design, assignments, summary: summaries[play.id], questions: questions[play.id] };
}

/** Full-snap teaching copies retain the source-only archive unchanged. */
export const jetsStudies: (JetsStudy & { id: string })[] = jetsPlays.map((play) => ({ id: play.id, ...buildStudy(play) }));

/** Every caller receives independent paths, notes and ball events. */
export function getJetsStudy(id: string): JetsStudy | null {
  const study = jetsStudies.find((item) => item.id === id);
  if (!study) return null;
  return structuredClone({ design: study.design, assignments: study.assignments, summary: study.summary, questions: study.questions });
}
