import type { Game } from "./games";
import { teamColor, teamName, venueLine } from "./teams";

export const PUZZLE_GUESSES = 6;

/** The publication's puzzle day turns over at midnight in New York, like the paper. */
export function puzzleDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** FNV-1a, 32-bit: a stable spread over the pool for a short date string. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The same day picks the same game for everyone; the pool is sorted so edition order cannot change it. */
export function dailyPuzzleGame<T extends { id: string }>(pool: T[], day: string): T | null {
  if (!pool.length) return null;
  const ordered = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[hashString(`back-page-puzzle:${day}`) % ordered.length];
}

export type PuzzleGame = Pick<Game, "id" | "season" | "week" | "seasonType" | "date" | "opponentDisplay" | "atHome" | "jetsScore" | "oppScore" | "outcome" | "wentToOt" | "stadium" | "roof" | "temp" | "wind">;

export type Clue = { label: string; text: string; kind?: "colours" };

/** Every clue is a recorded fact about the game; the chart is the first clue and is always shown. */
export function puzzleClues(game: PuzzleGame): Clue[] {
  const margin = Math.abs(game.jetsScore - game.oppScore);
  return [
    { label: "When", text: `Week ${game.week} · ${game.seasonType === "POST" ? "Postseason" : "Regular season"} · ${game.atHome ? "Home game" : "Away game"}` },
    // The stadium's name would give an away opponent away, so only roof and weather are shown.
    { label: "Conditions", text: `${venueLine({ ...game, stadium: null }) ?? "Roof and weather not recorded"}${game.wentToOt ? " · Went to overtime" : ""}` },
    { label: "Margin", text: game.outcome === "tie" ? "Tied" : `Jets ${game.outcome === "win" ? "won" : "lost"} by ${margin} ${margin === 1 ? "point" : "points"}` },
    { label: "Final score", text: `Jets ${game.jetsScore}, opponent ${game.oppScore}` },
    { label: "Colours", text: "The opponent’s colours", kind: "colours" },
    { label: "Season", text: `${game.season}` },
  ];
}

export type Guess = { opponent: string; season: number };
export type Verdict = { opponent: "right" | "wrong"; season: "right" | "earlier" | "later" };

export function judge(game: PuzzleGame, guess: Guess): Verdict {
  return {
    opponent: guess.opponent === game.opponentDisplay ? "right" : "wrong",
    season: guess.season === game.season ? "right" : game.season < guess.season ? "earlier" : "later",
  };
}

export const solved = (verdict: Verdict) => verdict.opponent === "right" && verdict.season === "right";

/** What the browser may know after these guesses: verdicts, the clues they opened, and the answer only once the game is over. */
export type RevealedClue = Clue & { colours?: [string, string] };
export type PuzzleAnswer = { opponent: string; jetsScore: number; oppScore: number; atHome: boolean; seasonType: string; week: number; date: string; wentToOt: boolean; colours: [string, string]; caseHref: string };
export type PuzzleProgress = { verdicts: Verdict[]; clues: RevealedClue[]; answer: PuzzleAnswer | null };

export function puzzleProgress(game: PuzzleGame, guesses: Guess[]): PuzzleProgress {
  const verdicts: Verdict[] = [];
  for (const guess of guesses.slice(0, PUZZLE_GUESSES)) {
    const verdict = judge(game, guess);
    verdicts.push(verdict);
    if (solved(verdict)) break;
  }
  const over = verdicts.some(solved) || verdicts.length >= PUZZLE_GUESSES;
  const colours: [string, string] = [teamColor(game.opponentDisplay), teamColor(game.opponentDisplay, 1)];
  const clues = puzzleClues(game).slice(0, over ? undefined : verdicts.length).map((clue) => clue.kind === "colours" ? { ...clue, colours } : clue);
  const answer = over ? { opponent: teamName(game.opponentDisplay), jetsScore: game.jetsScore, oppScore: game.oppScore, atHome: game.atHome, seasonType: game.seasonType, week: game.week, date: game.date, wentToOt: game.wentToOt, colours, caseHref: `/games/${encodeURIComponent(game.id)}` } : null;
  return { verdicts, clues, answer };
}
