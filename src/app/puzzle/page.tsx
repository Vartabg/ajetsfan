import DailyPuzzle from "@/components/DailyPuzzle";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import { loadCurve } from "@/lib/load-games";
import { loadPuzzle } from "@/lib/load-puzzle";
import { puzzleDay } from "@/lib/puzzle";
import { pageMetadata } from "@/lib/site";
import { teamName } from "@/lib/teams";
import { formatDate } from "@/lib/current";
import styles from "./page.module.css";
import shared from "@/components/Focus.module.css";
import { focusFonts } from "../focus-fonts";

// The day's game is chosen on the server; the page refreshes itself every five minutes so the turnover at midnight New York time needs no client clock.
export const revalidate = 300;
export const metadata = pageMetadata({ path: "/puzzle", title: "Which Jets game? — the daily puzzle", description: "One recorded Jets game a day. Six guesses. Every clue comes from the record: the probability line, the conditions, the margin, the score." });

export default async function PuzzlePage() {
  const day = puzzleDay(new Date());
  const { pool, game } = await loadPuzzle(day);
  // Only the quarter and the probability reach the browser: play descriptions name players and teams.
  const points = game ? (await loadCurve(game.id)).filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1).map(({ q, wp }) => ({ q, wp })) : [];
  const opponents = [...new Set(pool.map((entry) => entry.opponentDisplay))].map((code) => ({ code, name: teamName(code) })).sort((a, b) => a.name.localeCompare(b.name));
  const seasons = [...new Set(pool.map((entry) => entry.season))].sort((a, b) => a - b);
  return <FocusShell page="puzzle" entries={[{ id: "puzzle", title: "The daily puzzle", answer: "Which Jets game?" }]} checkedAt={null} className={focusFonts}>
    <FocusMoment id="puzzle" first label="One game a day · six guesses" heading="Which Jets game?">
    <p className={shared.caption}>Guess a past Jets game. The chart shows how likely the Jets were to win at each point of it. Pick the opponent and the year. Each wrong guess unlocks another clue.</p>
    {game ? <>
      <p className={styles.day}>Puzzle for <time dateTime={day}>{formatDate(day)}</time> · {pool.length} games in the pool, {seasons[0]}–{seasons.at(-1)} · progress is kept in this browser only</p>
      <DailyPuzzle key={day} day={day} board={game.outcome === "win" ? "miracle" : "heartbreak"} points={points} opponents={opponents} seasons={seasons} />
    </> : <p className={styles.day}>No puzzle in this edition: the archive has no published game.</p>}
    </FocusMoment>
  </FocusShell>;
}
