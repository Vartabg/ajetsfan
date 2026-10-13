import type { ScheduledGame } from "./current";

/** One Jets game from the schedule file, with its venue, ESPN event and (once played) the Jets' starting quarterback. */
export type HistoryGame = ScheduledGame & { stadium: string | null; espn: string | null; qb: { id: string; name: string } | null };

/** Clubs with each regular-season win total, and how many of them reached the playoffs. */
export type PlayoffRow = { wins: number; clubs: number; playoffs: number };

export type LeagueHistory = {
  schemaVersion: 1;
  team: "NYJ";
  source: string;
  checkedAt: string;
  attemptedAt?: string;
  status?: "ready" | "retained";
  games: HistoryGame[];
  playoffsByWins: { seasons: number[]; rows: PlayoffRow[] };
};
