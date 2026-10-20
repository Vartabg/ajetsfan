import "server-only";
import archiveV1 from "./puzzle-archive-v1.json";
import { dailyPuzzleGame, type PuzzleGame } from "./puzzle";

type Row = [string, string, "REG" | "POST", string, boolean, number, number, boolean, string | null, number | null, number | null];
function expand(row: Row): PuzzleGame {
  const [id, date, seasonType, opponentDisplay, atHome, jetsScore, oppScore, wentToOt, roof, temp, wind] = row;
  const [season, week] = id.split("_").map(Number);
  return { id, date, season, week, seasonType, opponentDisplay, atHome, jetsScore, oppScore,
    outcome: jetsScore > oppScore ? "win" : "loss", wentToOt, stadium: null, roof, temp, wind };
}

// Immutable, server-only records keep both the answer and its clues unchanged by
// archive refreshes. Never edit an existing series: append a new frozen version
// with a future effectiveDay, retaining older versions for saved puzzle days.
const series = [{ effectiveDay: archiveV1.effectiveDay, pool: (archiveV1.rows as Row[]).map(expand) }];
export function puzzleSeries(day: string) {
  const edition = series.filter((entry) => entry.effectiveDay <= day).at(-1);
  const pool = edition?.pool ?? [];
  return { pool, game: dailyPuzzleGame(pool, day) };
}
