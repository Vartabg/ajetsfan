import DailyPuzzle from "@/components/DailyPuzzle";
import ExploreHeader from "@/components/ExploreHeader";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { dailyPuzzleGame, puzzleDay } from "@/lib/puzzle";
import { pageMetadata } from "@/lib/site";
import { teamName } from "@/lib/teams";
import { formatDate } from "@/lib/current";
import styles from "./page.module.css";

// The day's game is chosen on the server; the page refreshes itself every five minutes so the turnover at midnight New York time needs no client clock.
export const revalidate = 300;
export const metadata = pageMetadata({ path: "/puzzle", title: "Which Jets game? — the daily puzzle", description: "One recorded Jets game a day. Six guesses. Every clue comes from the record: the probability line, the conditions, the margin, the score." });

export default async function PuzzlePage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const pool = publishedGames(games, snapshot);
  const day = puzzleDay(new Date());
  const game = dailyPuzzleGame(pool, day);
  const points = game ? (await loadCurve(game.id)).filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1) : [];
  const opponents = [...new Set(pool.map((entry) => entry.opponentDisplay))].map((code) => ({ code, name: teamName(code) })).sort((a, b) => a.name.localeCompare(b.name));
  const seasons = [...new Set(pool.map((entry) => entry.season))].sort((a, b) => a - b);
  return <main id="main" className={styles.main}>
    <ExploreHeader title="Which Jets game?" description="One recorded game a day. Six guesses. Each miss opens another clue from the record." />
    {game ? <>
      <p className={styles.day}>Puzzle for <time dateTime={day}>{formatDate(day)}</time> · {pool.length} games in the pool, {seasons[0]}–{seasons.at(-1)} · progress is kept in this browser only</p>
      <DailyPuzzle key={day} day={day} game={{ id: game.id, season: game.season, week: game.week, seasonType: game.seasonType, date: game.date, opponentDisplay: game.opponentDisplay, atHome: game.atHome, jetsScore: game.jetsScore, oppScore: game.oppScore, outcome: game.outcome, wentToOt: game.wentToOt, stadium: game.stadium ?? null, roof: game.roof, temp: game.temp, wind: game.wind }} points={points} opponents={opponents} seasons={seasons} caseHref={`/games/${encodeURIComponent(game.id)}`} />
    </> : <p className={styles.day}>No puzzle in this edition: the archive has no published game.</p>}
  </main>;
}
