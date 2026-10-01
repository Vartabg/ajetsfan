import Link from "next/link";
import type { SeasonAnalytics } from "@/lib/analytics";
import type { CurrentSnapshot, ScheduledGame } from "@/lib/current";
import { currentSeasonSummary, formatDate } from "@/lib/current";
import { previewQuestions } from "@/lib/football-preview";
import { selectMatchdayReport } from "@/lib/matchday-report";
import MatchdayDesk from "./MatchdayDesk";
import styles from "./SundayBriefing.module.css";

export default function SundayBriefing({ game, overdue, snapshot, analytics }: {
  game: ScheduledGame;
  overdue: boolean;
  snapshot: CurrentSnapshot;
  analytics: SeasonAnalytics | null;
}) {
  const questions = overdue ? [] : previewQuestions(game, analytics);
  const report = overdue ? null : selectMatchdayReport(game);
  const record = currentSeasonSummary(snapshot);
  const recordLabel = (wins: number, losses: number) => `${wins}–${losses}${record.ties ? `–${record.ties}` : ""}`;
  const regular = !overdue && game.seasonType === "REG" && game.season === snapshot.season;

  return <section id="sunday-briefing" className={styles.briefing} aria-labelledby="briefing-heading">
    <div className={styles.header}>
      <div><p className={styles.kicker}>The Sunday briefing <span>Fan analysis · Week {game.week}</span></p><h2 id="briefing-heading">Before we do this again.</h2></div>
      {regular ? <p className={styles.stakes}>Win: <strong>{recordLabel(record.wins + 1, record.losses)}</strong><span aria-hidden="true"> / </span>Lose: <strong>{recordLabel(record.wins, record.losses + 1)}</strong><small>The next line in the season story.</small></p> : null}
    </div>
    <div className={styles.columns}>
      <div className={styles.questions}>
        {questions.length ? <ol aria-label="Football questions">{questions.map((question, index) => <li key={question.id}><span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{question.title}</h3><p>{question.body}</p><small>{question.evidence}</small></div></li>)}</ol> : <p className={styles.pending}>{overdue ? "This fixture is awaiting a confirmed final. Follow the team’s latest coverage below." : "The next matchup needs more validated play-by-play before we can put the football questions in context."}</p>}
        {questions.length && analytics ? <p className={styles.scope}>Based on {analytics.teams.find((team) => team.team === "NYJ")?.completedGames} Jets games and {analytics.teams.find((team) => team.team === game.opponent)?.completedGames} {game.opponentDisplay} games · highest included week: Week {analytics.throughWeek}{analytics.throughDate ? ` · ${formatDate(analytics.throughDate)}` : ""}. These are things to watch, not predictions. <Link href="/how-made#efficiency">EPA explained <span aria-hidden="true">↗</span></Link></p> : null}
      </div>
      <MatchdayDesk report={report} />
    </div>
  </section>;
}
