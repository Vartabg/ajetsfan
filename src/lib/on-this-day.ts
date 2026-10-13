import type { HistoryGame } from "./league-history";
import { placeName } from "./focus";
import { etDay } from "./focus-format";

export type OnThisDay = {
  /** "Oct 13" */
  day: string;
  /** The years the strip spans: every earlier year in which this date could hold a recorded game. */
  from: number;
  to: number;
  wins: number;
  losses: number;
  ties: number;
  games: { id: string; year: number; season: number; opponent: string; home: boolean; us: number; them: number; outcome: "win" | "loss" | "tie"; href: string }[];
};

/** The New York date at the moment of the request. */
export const newYorkToday = () => etDay(Date.now());

/**
 * Jets games played on today's calendar date in earlier years, from the schedule record (1999 onward).
 * `today` is the New York date, YYYY-MM-DD. A game dated today is the news, not history, so it is left out.
 */
export function onThisDay(history: HistoryGame[], today: string, published: Set<string>): OnThisDay | null {
  const monthDay = today.slice(5);
  const games = history
    .filter((game) => game.status === "final" && game.outcome && game.jetsScore !== null && game.oppScore !== null && game.date.slice(5) === monthDay && game.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((game) => ({
      id: game.id, year: Number(game.date.slice(0, 4)), season: game.season, opponent: placeName(game.opponent), home: game.atHome,
      us: game.jetsScore!, them: game.oppScore!, outcome: game.outcome!,
      href: published.has(game.id) ? `/games/${encodeURIComponent(game.id)}` : `/seasons/${game.season}`,
    }));
  if (!games.length) return null;
  // The archive starts with the 1999 season, so January dates begin in 2000.
  const from = Number(monthDay.slice(0, 2)) >= 8 ? 1999 : 2000;
  const count = (outcome: string) => games.filter((game) => game.outcome === outcome).length;
  return {
    day: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${today}T12:00:00Z`)),
    from, to: Number(today.slice(0, 4)) - 1, wins: count("win"), losses: count("loss"), ties: count("tie"), games,
  };
}
