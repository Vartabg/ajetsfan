// Types and pure helpers only. Anything that touches the filesystem lives in
// load-games.ts, because this module is imported by client components and a
// `node:fs` import here ends up in the browser bundle.

export type Outcome = "win" | "loss" | "tie";

export type KeyPlay = {
  /** Stable nflverse play identity; older archive snapshots use description matching. */
  playId?: number;
  desc: string | null;
  wpa: number | null;
  qtr: number | null;
  secondsLeft: number | null;
};

export type Game = {
  id: string;
  dataSuspect: boolean;
  opponentDisplay: string;
  season: number;
  week: number;
  seasonType: string;
  date: string;
  opponent: string;
  atHome: boolean;
  jetsScore: number;
  oppScore: number;
  outcome: Outcome;
  /** Peak win probability in a loss, trough in a win. Second half only. */
  swing: number | null;
  peakH2Wp: number | null;
  troughH2Wp: number | null;
  wentToOt: boolean;
  /** Venue and kickoff conditions as recorded by the nflverse schedule; absent in older snapshots. */
  stadium?: string | null;
  roof: string | null;
  temp: number | null;
  wind: number | null;
  keyPlay: KeyPlay;
};

export type Board = "heartbreak" | "miracle";

/**
 * Games are eligible for a board only if the play-by-play is trustworthy and the
 * second half actually produced a win probability. See scripts/build-data.mjs.
 */
export function rank(games: Game[], board: Board): Game[] {
  const wanted: Outcome = board === "heartbreak" ? "loss" : "win";
  return games
    .filter((g) => !g.dataSuspect && g.swing != null && g.outcome === wanted)
    .sort((a, b) =>
      board === "heartbreak" ? b.swing! - a.swing! : a.swing! - b.swing!,
    );
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function clockLabel(qtr: number | null, secondsLeft: number | null): string {
  if (qtr == null) return "";
  // game_seconds_remaining counts down across regulation and is pinned at 0 for
  // overtime, so there is no honest clock to show there. Label the period only.
  if (qtr > 4) return "OT";
  if (secondsLeft == null) return `Q${qtr}`;
  const period = `Q${qtr}`;
  const inPeriod = secondsLeft - (4 - qtr) * 900;
  const m = Math.max(0, Math.floor(inPeriod / 60));
  const s = Math.max(0, Math.floor(inPeriod % 60));
  return `${period} ${m}:${String(s).padStart(2, "0")}`;
}
