import type { Game } from "./games";
import type { CurvePoint } from "./load-games";
import { keyPlayIndex } from "./curve";

export type VisualChapter = {
  id: string;
  index: number;
  label: string;
  headline: string;
};

export type VisualStory = {
  id: string;
  title: string;
  dek: string;
  game: Game;
  points: CurvePoint[];
  chapters: VisualChapter[];
  source: { label: string; url: string };
};

export const visualStoryIds = ["2022_02_NYJ_CLE", "2000_08_MIA_NYJ"] as const;

const fixtures = {
  "2022_02_NYJ_CLE": { season: 2022, week: 2, date: "2022-09-18", opponent: "CLE", opponentDisplay: "CLE", atHome: false, jetsScore: 31, oppScore: 30, wentToOt: false },
  "2000_08_MIA_NYJ": { season: 2000, week: 8, date: "2000-10-23", opponent: "MIA", opponentDisplay: "MIA", atHome: true, jetsScore: 40, oppScore: 37, wentToOt: true },
} as const;

const probability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/** Invalid rows cannot become invented clocks or estimates. Delta stays source-reported. */
function cleanPoint(raw: unknown): CurvePoint | null {
  if (!raw || typeof raw !== "object") return null;
  const point = raw as Record<string, unknown>;
  if (typeof point.q !== "number" || !Number.isInteger(point.q) || point.q < 1 || point.q > 5 || !probability(point.wp)) return null;
  const q = point.q;
  const t = point.t;
  if (q <= 4) {
    if (typeof t !== "number" || !Number.isInteger(t) || t < (4 - q) * 900 || t > (5 - q) * 900) return null;
  } else if (t !== null && (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > 900)) return null;
  const d = typeof point.d === "number" && Number.isFinite(point.d) && point.d >= -1 && point.d <= 1 ? point.d : null;
  return {
    q, t: t as number | null, wp: point.wp, d,
    desc: typeof point.desc === "string" && point.desc.trim() ? point.desc : null,
    type: typeof point.type === "string" && point.type.trim() ? point.type : null,
    // Modern snapshots supply identity; legacy snapshots deliberately do not.
    ...(typeof point.playId === "number" && Number.isSafeInteger(point.playId) && point.playId >= 0 ? { playId: point.playId } : {}),
  };
}

/** A duplicated or absent description is insufficient evidence for a named chapter. */
function matchedChapter(points: CurvePoint[], id: string, label: string, headline: string, matches: (point: CurvePoint) => boolean): VisualChapter | null {
  const indices = points.flatMap((point, index) => matches(point) ? [index] : []);
  return indices.length === 1 ? { id, index: indices[0], label, headline } : null;
}

const recordedTouchdown = (point: CurvePoint) => !!point.desc && /TOUCHDOWN/i.test(point.desc) && !/REVERSED|No Play/i.test(point.desc);

function chaptersFor(game: Game, points: CurvePoint[]): VisualChapter[] {
  const chapters: (VisualChapter | null)[] = [];
  if (game.id === "2022_02_NYJ_CLE") {
    chapters.push(
      matchedChapter(points, "missed-extra-point", "The extra point", "Cleveland’s extra point misses wide right.", (point) => point.q === 4 && point.t === 115 && point.type === "extra_point" && /C\.York extra point is No Good, Wide Right/i.test(point.desc ?? "")),
      matchedChapter(points, "davis-touchdown", "66 yards", "Joe Flacco finds Corey Davis for a 66-yard touchdown.", (point) => point.q === 4 && point.t === 92 && recordedTouchdown(point) && /J\.Flacco pass.*C\.Davis for 66 yards/i.test(point.desc ?? "")),
      matchedChapter(points, "onside-recovery", "Possession regained", "Justin Hardee recovers Braden Mann’s onside kick.", (point) => point.q === 4 && point.t === 82 && /B\.Mann kicks onside.*RECOVERED by NYJ-34-J\.Hardee/i.test(point.desc ?? "")),
      matchedChapter(points, "wilson-touchdown", "15 yards", "Joe Flacco finds Garrett Wilson for a 15-yard touchdown.", (point) => point.q === 4 && point.t === 25 && recordedTouchdown(point) && /J\.Flacco pass.*G\.Wilson for 15 yards/i.test(point.desc ?? "")),
      matchedChapter(points, "davis-interception", "The interception", "Ashtyn Davis intercepts Jacoby Brissett.", (point) => point.q === 4 && point.t === 13 && /J\.Brissett pass.*INTERCEPTED by 21-A\.Davis/i.test(point.desc ?? "")),
    );
  } else {
    chapters.push(
      { id: "second-half-low", index: 0, label: "The low point", headline: `The second-half low: ${(points[0].wp * 100).toFixed(1)}% before this play.` },
      matchedChapter(points, "coles-touchdown", "The fourth-quarter rally", "Vinny Testaverde finds Laveranues Coles for a 30-yard touchdown.", (point) => point.q === 4 && point.t === 834 && recordedTouchdown(point) && /V\.Testaverde pass to L\.Coles for 30 yards/i.test(point.desc ?? "")),
      matchedChapter(points, "elliott-touchdown", "Elliott’s touchdown", "Jumbo Elliott catches a three-yard touchdown pass.", (point) => point.q === 4 && point.t === 80 && recordedTouchdown(point) && /V\.Testaverde pass to J\.Elliott for 3 yards/i.test(point.desc ?? "")),
    );
    const keyIndex = keyPlayIndex(points, game.keyPlay);
    if (keyIndex >= 0 && points[keyIndex].q === 5 && /V\.Testaverde pass to W\.Chrebet.*28 yards/i.test(points[keyIndex].desc ?? "")) {
      chapters.push({ id: "chrebet-overtime", index: keyIndex, label: "28 yards in overtime", headline: "Wayne Chrebet’s 28-yard reception moves the Jets to the Miami 31." });
    }
    const final = points[points.length - 1];
    if (final.q === 5 && final.type === "field_goal" && /J\.Hall 40 yard field goal is GOOD/i.test(final.desc ?? "")) {
      chapters.push({ id: "hall-field-goal", index: points.length - 1, label: "The winning kick", headline: "John Hall’s 40-yard field goal wins the game in overtime." });
    }
  }
  const valid = chapters.filter((chapter): chapter is VisualChapter => chapter !== null);
  if (!valid.some((chapter) => chapter.index === 0)) valid.push({ id: "opening-moment", index: 0, label: "Opening moment", headline: "The first published play in this story." });
  return valid.sort((a, b) => a.index - b.index);
}

/** Only these checked fixtures can inherit their historical account. Never reconstruct a live score. */
export function buildVisualStory(game: Game, rawPoints: readonly CurvePoint[]): VisualStory | null {
  if (!visualStoryIds.some((id) => id === game.id) || game.dataSuspect || game.outcome !== "win" || game.seasonType !== "REG"
    || !probability(game.swing) || !probability(game.peakH2Wp) || !probability(game.troughH2Wp)
    || game.troughH2Wp > game.peakH2Wp || game.swing !== game.troughH2Wp || !Array.isArray(rawPoints)) return null;
  const id = game.id as typeof visualStoryIds[number];
  const fixture = fixtures[id];
  if (Object.entries(fixture).some(([key, value]) => game[key as keyof Game] !== value)) return null;
  const clean = rawPoints.flatMap((raw) => { const point = cleanPoint(raw); return point ? [point] : []; });
  if (clean.some((point, index) => index > 0 && (point.q < clean[index - 1].q || (point.q <= 4 && point.q === clean[index - 1].q && point.t! > clean[index - 1].t!)))) return null;
  let start = -1;
  if (id === "2022_02_NYJ_CLE") start = clean.findIndex((point) => point.q === 4 && point.t! <= 115);
  else clean.forEach((point, index) => { if (point.q >= 3 && (start < 0 || point.wp < clean[start].wp)) start = index; });
  if (start < 0) return null;
  const points = clean.slice(start);
  if (points.length < 2) return null;
  const cleveland = id === "2022_02_NYJ_CLE";
  return {
    id, game, points, chapters: chaptersFor(game, points),
    title: cleveland ? "The final 1:55." : "A 23-point comeback.",
    dek: cleveland
      ? "The Jets erased a 13-point deficit in the final 1:55 at Cleveland and won 31–30. Explore the recorded plays and the model’s pre-play estimates."
      : "Down 30–7 after three quarters, the Jets tied Miami, then won 40–37 in overtime. Follow the published probability curve through the fourth quarter and overtime.",
    source: cleveland
      ? { label: "Jets account of the Cleveland comeback", url: "https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win" }
      : { label: "Jets account of the Monday Night Miracle", url: "https://www.newyorkjets.com/news/do-you-believe-in-miracles-jets-roar-back-from-23-down-rock-dolphins-40-37-in-ot" },
  };
}

/** URL moments are one-based sequences within this story, never an unvalidated array offset. */
export function parseVisualStorySelection(search: string, stories: VisualStory[]): { story: VisualStory; index: number } | null {
  const available = stories.filter((story) => story.points.length > 0);
  if (!available.length) return null;
  const params = new URLSearchParams(search);
  const requested = params.get("story");
  const matched = available.find((story) => story.id === requested);
  const story = matched ?? available[0];
  const initial = story.chapters.find((chapter) => Number.isInteger(chapter.index) && chapter.index >= 0 && chapter.index < story.points.length)?.index ?? 0;
  const raw = params.get("moment");
  const moment = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : Number.NaN;
  const index = (!requested || matched) && Number.isSafeInteger(moment) && moment <= story.points.length ? moment - 1 : initial;
  return { story, index };
}
