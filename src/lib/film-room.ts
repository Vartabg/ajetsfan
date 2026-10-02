import type { Game } from "./games";
import type { CurvePoint } from "./load-games";
import { publishedGames } from "./published-pages";

export type FilmSource = { label: string; url: string };
export type FilmScene = {
  kind?: "recreation" | "reference";
  src: string; alt: string; width: number; height: number; caption: string; reference: FilmSource;
};
export type FilmCase = {
  id: string;
  game: Game;
  /** The original archive row: wp is before this play, d is the reported change. */
  play: CurvePoint;
  playIndex: number;
  title: string;
  category: "great" | "painful";
  focus: string;
  recordedFacts: { label: string; value: string; source: FilmSource }[];
  sourceNotes: { label: string; text: string; source: FilmSource }[];
  watchFor: string[];
  unresolved: string[];
  replays: { label: string; url: string; kind: "play" | "analysis" | "game" }[];
  video: { youtubeId: string; label: string; sourceUrl: string };
  clockNote?: string;
  scene?: FilmScene;
};

export const filmGameIds = ["2022_02_NYJ_CLE", "2000_08_MIA_NYJ", "2012_12_NE_NYJ"] as const;

const fixtures = {
  "2022_02_NYJ_CLE": { season: 2022, week: 2, date: "2022-09-18", opponent: "CLE", opponentDisplay: "CLE", atHome: false, jetsScore: 31, oppScore: 30, outcome: "win", wentToOt: false },
  "2000_08_MIA_NYJ": { season: 2000, week: 8, date: "2000-10-23", opponent: "MIA", opponentDisplay: "MIA", atHome: true, jetsScore: 40, oppScore: 37, outcome: "win", wentToOt: true },
  "2012_12_NE_NYJ": { season: 2012, week: 12, date: "2012-11-22", opponent: "NE", opponentDisplay: "NE", atHome: true, jetsScore: 19, oppScore: 49, outcome: "loss", wentToOt: false },
} as const;

const clevelandBook: FilmSource = { label: "NFL gamebook · Jets at Browns", url: "https://static.www.nfl.com/image/upload/v1677628106/gamecenter/7ae81ee8-d24c-11ec-b23d-d15a91047884.pdf" };
const miamiBook: FilmSource = { label: "NFL gamebook · Miami at Jets, pp. 12–13", url: "https://static.www.nfl.com/image/upload/v1770924292/gamecenter/10012000-1023-009d-c8fe-cb7f8f9659fc.pdf" };
const thanksgivingBook: FilmSource = { label: "Official gamebook · New England at Jets, p. 12", url: "https://static.clubs.nfl.com/image/upload/v1579033021/patriots/amcwj36pj6zii3wsmwsl.pdf" };
const miamiAccount: FilmSource = { label: "Jets account of the Monday Night Miracle", url: "https://www.newyorkjets.com/news/do-you-believe-in-miracles-jets-roar-back-from-23-down-rock-dolphins-40-37-in-ot" };
const wilsonRoute: FilmSource = { label: "Jets account of Wilson’s winning route", url: "https://www.newyorkjets.com/news/jets-joe-cool-puts-cleveland-in-the-deep-freeze-with-a-stirring-comeback-victory" };
const sanchezAccount: FilmSource = { label: "Sanchez’s postgame account", url: "https://www.patriots.com/news/jets-postgame-quotes-11-22-2012-184316" };

type CuratedCase = Omit<FilmCase, "game" | "play" | "playIndex" | "scene"> & {
  gameId: typeof filmGameIds[number]; q: number; t: number; type: string;
  /** A broad identity finds ambiguity before the stricter source checks below. */
  identify: RegExp; sourceDescription: RegExp;
};

const unknownAssignments = [
  "The actual coverage, rush count and protection call have not been verified.",
  "No player tracking coordinates, All-22 view or verified video offsets are supplied.",
];

const curated: CuratedCase[] = [
  {
    id: "wilson-cleveland", gameId: "2022_02_NYJ_CLE", q: 4, t: 25, type: "pass",
    identify: /J\.Flacco pass.*G\.Wilson for 15 yards.*TOUCHDOWN/i,
    sourceDescription: /^\(:25\) \(Shotgun\) 19-J\.Flacco pass short middle to 17-G\.Wilson for 15 yards, TOUCHDOWN\./i,
    title: "Wilson’s winning touchdown", category: "great", focus: "The release, the slant and the throwing window.",
    recordedFacts: [
      { label: "Before the snap", value: "3rd-and-10 at the Cleveland 15; Jets trailing 24–30.", source: clevelandBook },
      { label: "Recorded result", value: "Flacco to Wilson: 15-yard touchdown from shotgun; tied 30–30 before the extra point.", source: clevelandBook },
      { label: "Game clock", value: "Q4 :25 before the play; touchdown completed at :22.", source: clevelandBook },
      { label: "After the extra point", value: "Zuerlein made the PAT for a 31–30 Jets lead and final score.", source: clevelandBook },
    ],
    sourceNotes: [{ label: "Reported route", text: "The Jets’ account identifies Wilson’s route as a slant. That does not establish Cleveland’s coverage or the Jets’ protection assignments.", source: wilsonRoute }],
    watchFor: ["How does Wilson’s release create space for his break?", "Where is the throwing window at release, then at arrival?", "Count the actual rushers and watch for safety rotation after the snap."],
    unresolved: [...unknownAssignments],
    replays: [
      { label: "Official Jets winning-drive replay", url: "https://www.newyorkjets.com/video/highlights-every-jets-play-during-the-game-winning-drive-vs-the-browns", kind: "play" },
      { label: "Quincy Enunwa’s film review", url: "https://www.newyorkjets.com/video/inside-the-film-room-with-quincy-enunwa-jets-at-browns", kind: "analysis" },
      { label: "Baldinger’s Wilson review", url: "https://www.newyorkjets.com/video/baldy-s-breakdown-garrett-wilson-s-big-day-against-the-browns", kind: "analysis" },
    ],
    video: { youtubeId: "LR1zPFNjOMM", label: "Official Jets game highlights", sourceUrl: "https://www.youtube.com/watch?v=LR1zPFNjOMM" },
  },
  {
    id: "elliott-miami", gameId: "2000_08_MIA_NYJ", q: 4, t: 80, type: "pass",
    identify: /V\.Testaverde pass to J\.Elliott for 3 yards.*TOUCHDOWN/i,
    sourceDescription: /^\(1:20\) NY #76 Elliott reports eligible\. Play action fake\. V\.Testaverde pass to J\.Elliott for 3 yards, TOUCHDOWN\. Play Challenged by Replay Official and Upheld\./i,
    title: "Jumbo Elliott’s touchdown", category: "great", focus: "Eligibility, run action and the defender’s response.",
    recordedFacts: [
      { label: "Before the play", value: "2nd-and-goal at the Miami 3; Jets trailing 30–37.", source: miamiBook },
      { label: "Recorded result", value: "#76 reported eligible; Testaverde’s play-action pass to Elliott gained 3 yards for a touchdown. The replay review upheld it.", source: miamiBook },
      { label: "Scoring clock", value: "Q4 :42 after the touchdown; exact snap time is uncertain.", source: miamiBook },
      { label: "After the extra point", value: "The touchdown made it 36–37; the PAT tied the game at 37–37.", source: miamiBook },
    ],
    sourceNotes: [{ label: "Historical account", text: "The Jets’ account documents Elliott’s late touchdown and links the full game broadcast. The ending continued into overtime.", source: miamiAccount }],
    watchFor: ["Locate the eligible tackle before the snap.", "How does the run action affect the defenders’ first steps?", "Follow Elliott’s release and catch without assuming his defender’s assignment."],
    unresolved: [...unknownAssignments, "The archive and old gamebook repeat 1:20 for the preceding Martin run and Elliott’s play; this is not a verified exact snap clock."],
    replays: [
      { label: "NFL Elliott touchdown replay", url: "https://www.nfl.com/videos/nfl-100-greatest-no-92-offensive-lineman-jumbo-elliott-s-jumbo-touchdown-complet", kind: "play" },
      { label: "Full broadcast linked by the Jets", url: "https://www.youtube.com/watch?v=hOfjgr-lC4c", kind: "game" },
    ],
    video: { youtubeId: "hOfjgr-lC4c", label: "Full game broadcast linked by the Jets", sourceUrl: miamiAccount.url },
    clockNote: "The exact snap clock is uncertain: the archive and older gamebook repeat 1:20 from the preceding play. The gamebook records :42 after the touchdown. The probability estimate is before the play.",
  },
  {
    id: "hall-miami", gameId: "2000_08_MIA_NYJ", q: 5, t: 493, type: "field_goal",
    identify: /J\.Hall 40 yard field goal is GOOD/i,
    sourceDescription: /^\(8:13\) J\.Hall 40 yard field goal is GOOD, Center-B\.Banta, Holder-T\.Tupa\./i,
    title: "Hall’s winning field goal", category: "great", focus: "Snap, hold, kick and protection under pressure.",
    recordedFacts: [
      { label: "Before the kick", value: "4th-and-2 at the Miami 23; tied 37–37.", source: miamiBook },
      { label: "Recorded result", value: "John Hall’s 40-yard field goal was good; Brad Banta snapped and Tom Tupa held.", source: miamiBook },
      { label: "Gamebook clock", value: "OT 8:13 remaining, separately recorded in the gamebook.", source: miamiBook },
      { label: "Confirmed final", value: "Jets 40, Miami 37. The archive probability is before the kick, not the final outcome.", source: miamiBook },
    ],
    sourceNotes: [{ label: "Historical account", text: "The Jets’ account confirms the winning kick and links the full broadcast of the comeback.", source: miamiAccount }],
    watchFor: ["Follow the snap-to-hold sequence before judging the kick.", "Where does the interior and edge protection face pressure?", "Separate the observed operation from blocking assignments that require the playbook."],
    unresolved: [...unknownAssignments],
    replays: [
      { label: "NFL Monday Night Miracle ending", url: "https://www.nfl.com/videos/craziest-nfl-finishes-the-monday-night-miracle", kind: "game" },
      { label: "Full broadcast linked by the Jets", url: "https://www.youtube.com/watch?v=hOfjgr-lC4c", kind: "game" },
    ],
    video: { youtubeId: "hOfjgr-lC4c", label: "Full game broadcast linked by the Jets", sourceUrl: miamiAccount.url },
    clockNote: "The gamebook records 8:13 in overtime. The displayed model estimate is before the winning kick; the confirmed final is recorded separately.",
  },
  {
    id: "sanchez-thanksgiving", gameId: "2012_12_NE_NYJ", q: 2, t: 2350, type: "run",
    identify: /M\.Sanchez up the middle.*FUMBLES.*RECOVERED by NE-28-S\.Gregory.*32 yards, TOUCHDOWN/i,
    sourceDescription: /^\(9:10\) 6-M\.Sanchez up the middle to NYJ 32 for 1 yard\. FUMBLES, RECOVERED by NE-28-S\.Gregory at NYJ 32\. 28-S\.Gregory for 32 yards, TOUCHDOWN\./i,
    title: "Sanchez’s Thanksgiving fumble", category: "painful", focus: "The documented mental error and the turnover’s consequences.",
    recordedFacts: [
      { label: "Before the snap", value: "Q2 9:10; 1st-and-10 at the Jets 31, trailing 0–14.", source: thanksgivingBook },
      { label: "Recorded result", value: "Sanchez gained 1 yard and fumbled. Steve Gregory recovered at the Jets 32 and returned it 32 yards for a touchdown.", source: thanksgivingBook },
      { label: "After the score", value: "New England led 20–0 after the touchdown and 21–0 after the PAT at 9:00.", source: thanksgivingBook },
    ],
    sourceNotes: [{ label: "Quarterback’s account", text: "Sanchez said he confused the play, expected a handoff to the fullback, then tried to run and get down. This does not establish Moore’s blocking assignment.", source: sanchezAccount }],
    watchFor: ["Compare the intended handoff in Sanchez’s account with the sequence on tape.", "Locate the collision and the ball before following the recovery.", "Grade the quarterback’s process separately from unverified protection assignments."],
    unresolved: [...unknownAssignments, "Brandon Moore’s blocking assignment has not been established by the supplied sources."],
    replays: [{ label: "Official NFL fumble replay", url: "https://www.nfl.com/videos/mark-sanchez-s-butt-fumble-against-patriots", kind: "play" }],
    video: { youtubeId: "82RIfy-gRa4", label: "Official NFL archival replay", sourceUrl: "https://www.youtube.com/watch?v=82RIfy-gRa4" },
  },
];

const probability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

function validPoint(point: CurvePoint, item: CuratedCase): boolean {
  if (point.q !== item.q || point.t !== item.t || point.type !== item.type || !probability(point.wp)
    || (point.d !== null && (typeof point.d !== "number" || !Number.isFinite(point.d) || point.d < -1 || point.d > 1))) return false;
  if (!point.desc || /REVERSED|\bNo\s*Play\b/i.test(point.desc) || !item.sourceDescription.test(point.desc)) return false;
  // Regulation t is whole-game seconds remaining. These source rows use q=5 for OT.
  return Number.isInteger(point.t) && (point.q <= 4
    ? point.t >= (4 - point.q) * 900 && point.t <= (5 - point.q) * 900
    : point.t >= 0 && point.t <= 900);
}

/** Withhold conflicting fixtures and ambiguous source plays; never synthesize a play or a final estimate. */
export function buildFilmCases(games: Game[], curves: Record<string, readonly CurvePoint[]>): FilmCase[] {
  if (!Array.isArray(games) || !curves || typeof curves !== "object") return [];
  const available = publishedGames(games.filter((game) => game && typeof game === "object"), null);
  return curated.flatMap((item): FilmCase[] => {
    const game = available.find((entry) => entry.id === item.gameId);
    const fixture = fixtures[item.gameId];
    if (!game || game.dataSuspect !== false || game.seasonType !== "REG" || Object.entries(fixture).some(([key, value]) => game[key as keyof Game] !== value)
      || !probability(game.peakH2Wp) || !probability(game.troughH2Wp) || game.troughH2Wp > game.peakH2Wp
      || game.swing !== (game.outcome === "win" ? game.troughH2Wp : game.peakH2Wp)) return [];
    const points = curves[item.gameId];
    if (!Array.isArray(points)) return [];
    const candidates = points.flatMap((point, index) => point && typeof point.desc === "string" && item.identify.test(point.desc) ? [index] : []);
    if (candidates.length !== 1) return [];
    const playIndex = candidates[0];
    const play = points[playIndex];
    if (!validPoint(play, item)) return [];
    const { id, title, category, focus, recordedFacts, sourceNotes, watchFor, unresolved, replays, video, clockNote } = item;
    return [{ id, game, play, playIndex, title, category, focus,
      recordedFacts: recordedFacts.map((fact) => ({ ...fact, source: { ...fact.source } })),
      sourceNotes: sourceNotes.map((note) => ({ ...note, source: { ...note.source } })),
      watchFor: [...watchFor], unresolved: [...unresolved], replays: replays.map((replay) => ({ ...replay })), video: { ...video },
      ...(clockNote ? { clockNote } : {}),
    }];
  });
}

export type CoverageId = "cover-0" | "cover-1" | "cover-2" | "cover-3" | "cover-4";
export type PressureId = "four" | "five" | "six" | "simulated";
export type FilmSelection = { film: FilmCase; coverage: CoverageId; pressure: PressureId; step: 0 | 1 | 2 };
export type CoverageCounts = { rushers: number; deep: number; underneath: number; man: number; total: 11 };

const coverageSource: FilmSource = { label: "USA Football · base coverage families", url: "https://blogs.usafootball.com/blog/730/rcfamilies.com" };
export const coverageLessons: { id: CoverageId; label: string; summary: string; watchFor: string[]; source: FilmSource }[] = [
  { id: "cover-0", label: "Cover 0", summary: "Man assignments with no deep safety help. This teaching example sends six rushers.", watchFor: ["Who covers each eligible receiver?", "Where can the ball go before pressure arrives?"], source: coverageSource },
  { id: "cover-1", label: "Cover 1", summary: "Man assignments with one deep safety. The four-rusher example also has an underneath help defender.", watchFor: ["Where is the deep safety?", "Which man matchup has inside or outside leverage?"], source: coverageSource },
  { id: "cover-2", label: "Cover 2", summary: "Two deep halves with five underneath zone defenders in this four-rusher example.", watchFor: ["How do the deep and underneath zones overlap?", "Which window opens between those levels?"], source: coverageSource },
  { id: "cover-3", label: "Cover 3", summary: "Three deep thirds with underneath zones. A five-rusher fire-zone example leaves three underneath defenders.", watchFor: ["Does the safety rotate after the snap?", "How many defenders actually rush?"], source: coverageSource },
  { id: "cover-4", label: "Cover 4", summary: "Four deep quarters. Quarters rules may match routes after release and vary by coach.", watchFor: ["How do defenders respond when receivers enter their quarters?", "Does the post-snap behavior support a match rule?"], source: { label: "Eagles · quarters and route-matching explanation", url: "https://www.philadelphiaeagles.com/news/eagle-eye-explaining-sunday-s-loss-from-a-coach-s-perspective" } },
];

export const pressureLabels: Record<PressureId, string> = {
  four: "Four rushers", five: "Five-rusher pressure", six: "Six-rusher pressure", simulated: "Simulated pressure · four rushers",
};

const packages: Record<CoverageId, Partial<Record<PressureId, CoverageCounts>>> = {
  "cover-0": { six: { rushers: 6, deep: 0, underneath: 0, man: 5, total: 11 } },
  "cover-1": { four: { rushers: 4, deep: 1, underneath: 1, man: 5, total: 11 }, five: { rushers: 5, deep: 1, underneath: 0, man: 5, total: 11 } },
  "cover-2": { four: { rushers: 4, deep: 2, underneath: 5, man: 0, total: 11 } },
  "cover-3": { four: { rushers: 4, deep: 3, underneath: 4, man: 0, total: 11 }, five: { rushers: 5, deep: 3, underneath: 3, man: 0, total: 11 }, simulated: { rushers: 4, deep: 3, underneath: 4, man: 0, total: 11 } },
  "cover-4": { four: { rushers: 4, deep: 4, underneath: 3, man: 0, total: 11 } },
};

/** Supported illustrative packages, not a classification of any selected game's defense. */
export function pressureOptions(coverage: CoverageId): readonly PressureId[] {
  return Object.keys(packages[coverage] ?? {}) as PressureId[];
}

export function coverageCounts(coverage: CoverageId, pressure: PressureId): CoverageCounts | null {
  const counts = packages[coverage]?.[pressure];
  return counts ? { ...counts } : null;
}

/** URL step 1..3 maps to internal 0..2; unsupported schemes never reach the teaching board. */
export function parseFilmSelection(search: string, cases: FilmCase[]): FilmSelection | null {
  if (!cases.length) return null;
  const params = new URLSearchParams(search);
  const film = cases.find((item) => item.id === params.get("play")) ?? cases[0];
  const coverage = coverageLessons.find((item) => item.id === params.get("coverage"))?.id ?? "cover-3";
  const options = pressureOptions(coverage);
  const pressure = options.find((item) => item === params.get("pressure")) ?? options[0];
  const rawStep = params.get("step");
  const parsed = rawStep && /^-?(?:0|[1-9]\d*)$/.test(rawStep) ? Number(rawStep) : Number.NaN;
  const step = (Number.isSafeInteger(parsed) ? Math.max(0, Math.min(2, parsed - 1)) : 0) as 0 | 1 | 2;
  return { film, coverage, pressure, step };
}
