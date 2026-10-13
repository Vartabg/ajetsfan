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

/** "9 of the 23 clubs that won 9 games since 2021 made the playoffs." Counts only; no model. */
export function playoffSentence(rows: PlayoffRow[], seasons: number[], wins: number): string {
  const row = rows.find((entry) => entry.wins === wins);
  const since = `since ${seasons[0]}`;
  if (!row) return `No club has won exactly ${wins} game${wins === 1 ? "" : "s"} ${since}.`;
  if (row.playoffs === row.clubs) return `Every club that won ${wins} games ${since} made the playoffs (${row.clubs} of ${row.clubs}).`;
  if (row.playoffs === 0) return `None of the ${row.clubs} clubs that won ${wins} game${wins === 1 ? "" : "s"} ${since} made the playoffs.`;
  return `${row.playoffs} of the ${row.clubs} clubs that won ${wins} games ${since} made the playoffs.`;
}
