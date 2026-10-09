import "server-only";
import { loadCurrent, loadGames } from "./load-games";
import { publishedGames } from "./published-pages";
import { dailyPuzzleGame } from "./puzzle";

/** The day's game and the guessable pool. Only the server sees the game; the page receives the line and the choices. */
export async function loadPuzzle(day: string) {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const pool = publishedGames(games, snapshot);
  return { pool, game: dailyPuzzleGame(pool, day) };
}
