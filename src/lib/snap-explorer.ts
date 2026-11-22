import type { KeyPlay } from "./games";
import { snapDescription } from "./snap-data";
import type { Snap, SnapGame, SnapScore } from "./snap-types";

export type SearchValues = Record<string, string | string[] | undefined>;
export const CLEVELAND = "2022_02_NYJ_CLE";
export const BUFFALO = "2026_10_BUF_NYJ";
export const snapPath = (game: string, play: string) => "/plays/" + encodeURIComponent(game) + "/" + encodeURIComponent(play);
export const periodName = (q: number) => q <= 4 ? "Q" + q : q === 5 ? "OT" : (q - 4) + "OT";
export const clockText = (seconds: number) => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
export const snapTime = (play: Snap) => periodName(play.quarter) + (play.clock === null ? "" : " " + clockText(play.clock));
export const chance = (wp: number) => Number((wp * 100).toFixed(1)) + "%";
export function oneOf<const T extends string>(value: string | string[] | undefined, options: readonly T[], fallback: T): T {
  return options.find(option => option === value) ?? fallback;
}

/** A legacy curve has game seconds in regulation and may have no play ID. */
export function featuredSnap(game: SnapGame | null, key: KeyPlay): Snap | null {
  if (!game || !key.desc) return null;
  const description = snapDescription(key.desc);
  const matches = game.plays.filter(play => play.description === description && play.quarter === key.qtr &&
    (key.playId != null ? play.key === String(key.playId) :
      key.qtr !== null && key.qtr <= 4 && key.secondsLeft !== null && play.clock === key.secondsLeft - (4 - key.qtr) * 900));
  return matches.length === 1 ? matches[0] : null;
}

/** With a stopped clock, present every source ID at that instant for explicit selection. */
export function clockCandidates(plays: Snap[], quarter: number, clock: number): Snap[] {
  const period = plays.filter(play => play.quarter === quarter && play.clock !== null);
  const exact = period.filter(play => play.clock === clock);
  if (exact.length) return exact;
  // A clock correction can place an unsampled TV time on either side of a play.
  if (period.some((play, i) => i > 0 && period[i - 1].clock! < clock && clock < play.clock!)) return [];
  const seen = period.filter(play => play.clock! > clock);
  if (!seen.length) return [];
  const nearest = Math.min(...seen.map(play => play.clock!));
  return seen.filter(play => play.clock === nearest);
}

export type SituationRules = ReturnType<typeof situationRules>;
export function situationRules(params: SearchValues, play: Snap) {
  return {
    window: play.clock === null ? "quarter" : oneOf(params.window, ["60", "120", "300", "quarter"], "120"),
    margin: !play.before ? "any" : oneOf(params.margin, ["0", "3", "7", "any"], "3"),
    possession: !play.possession ? "any" : oneOf(params.possession, ["same", "any"], "same"),
    down: play.down === null ? "any" : oneOf(params.down, ["same", "any"], "same"),
    distance: play.distance === null ? "any" : oneOf(params.distance, ["0", "3", "any"], "3"),
  };
}

export type MatchedGame = { game: SnapGame; play: Snap; won: boolean | null };
export type SnapMatches = { eligible: number; matches: MatchedGame[] };
const jetsWin = (final: SnapScore) => final[0] === final[1] ? null : final[0] > final[1];
const runOrPass = (play: Snap) => play.type === "run" || play.type === "pass";

export function lateGameMatches(games: SnapGame[], threshold: number): SnapMatches {
  const matches: MatchedGame[] = [];
  let eligible = 0;
  for (const game of games) {
    if (game.date < "1999-01-01" || Number(game.id.slice(0, 4)) > 2025 || !game.final) continue;
    let lowest: Snap | null = null;
    for (const play of game.plays) {
      if (!runOrPass(play) || play.quarter !== 4 || play.clock === null || play.clock <= 0 || play.clock > 120 || play.wp === null) continue;
      if (!lowest || play.wp < lowest.wp!) lowest = play;
    }
    if (!lowest) continue;
    eligible++;
    if (lowest.wp! < threshold / 100) matches.push({ game, play: lowest, won: jetsWin(game.final) });
  }
  return { eligible, matches };
}

export function situationMatches(games: SnapGame[], origin: SnapGame, selected: Snap, rules: SituationRules): SnapMatches {
  const matches: MatchedGame[] = [];
  let eligible = 0;
  for (const game of games) {
    if (game.id === origin.id || game.date >= origin.date || !game.final) continue;
    let nearest: Snap | null = null;
    let nearestTime = Infinity;
    let covered = false;
    for (const play of game.plays) {
      if (!runOrPass(play) || play.quarter !== selected.quarter) continue;
      const clockGap = selected.clock !== null && play.clock !== null ? Math.abs(play.clock - selected.clock) : Infinity;
      if (rules.window !== "quarter" && clockGap > Number(rules.window)) continue;
      if (rules.margin !== "any" && (!selected.before || !play.before) ||
        rules.possession === "same" && (!selected.possession || !play.possession) ||
        rules.down === "same" && (selected.down === null || play.down === null) ||
        rules.distance !== "any" && (selected.distance === null || play.distance === null)) continue;
      covered = true;
      if (rules.possession === "same" && play.possession !== selected.possession ||
        rules.down === "same" && play.down !== selected.down ||
        rules.distance !== "any" && Math.abs(selected.distance! - play.distance!) > Number(rules.distance)) continue;
      if (rules.margin !== "any" && Math.abs((selected.before![0] - selected.before![1]) - (play.before![0] - play.before![1])) > Number(rules.margin)) continue;
      if (!nearest || clockGap < nearestTime) { nearest = play; nearestTime = clockGap; }
    }
    if (covered) eligible++;
    if (nearest) matches.push({ game, play: nearest, won: jetsWin(game.final) });
  }
  return { eligible, matches };
}
