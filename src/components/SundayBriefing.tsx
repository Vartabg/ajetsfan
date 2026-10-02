import Link from "next/link";
import type { SeasonAnalytics } from "@/lib/analytics";
import { epaLabel } from "@/lib/analytics";
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
      <div><p className={styles.kicker}>The Sunday briefing <span>Unit comparisons · Week {game.week}</span></p><h2 id="briefing-heading">The matchup, in numbers.</h2></div>
      {regular ? <p className={styles.stakes}>With a win: <strong>{recordLabel(record.wins + 1, record.losses)}</strong><span aria-hidden="true"> / </span>With a loss: <strong>{recordLabel(record.wins, record.losses + 1)}</strong><small>Regular-season record after this fixture.</small></p> : null}
    </div>
    <div className={styles.columns}>
      <div className={styles.questions}>
        {questions.length ? <ol aria-label="Measured unit comparisons">{questions.map((question, index) => <li key={question.id}><span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{question.title}</h3><dl className={styles.comparison} aria-label={`${question.title} comparison`}>
          <div><dt>{question.offense.team} offense</dt><dd><strong>{epaLabel(question.offense.epa, 3)}</strong><span>EPA per {question.unit}</span><small>{question.offense.plays} plays · {question.offense.games} completed games</small></dd></div>
          <div><dt>{question.defense.team} defense</dt><dd><strong>{epaLabel(question.defense.epa, 3)}</strong><span>EPA allowed per {question.unit}</span><small>{question.defense.plays} plays · {question.defense.games} completed games</small></dd></div>
        </dl></div></li>)}</ol> : <p className={styles.pending}>{overdue ? "This fixture is awaiting a confirmed final. Current reporting and source links appear below." : "Validated offensive and defensive play samples are not available for this fixture."}</p>}
        {questions.length && analytics ? <p className={styles.scope}>Current-season regular-season plays{analytics.throughWeek != null ? ` · highest included week: Week ${analytics.throughWeek}` : ""}{analytics.throughDate ? ` · through ${formatDate(analytics.throughDate)}` : ""}. Higher offensive EPA and lower defensive EPA allowed indicate better recorded efficiency. Each unit faced its own opponents; these rates do not predict this game’s result. <Link href="/how-made#efficiency">EPA, sample rules &amp; sources <span aria-hidden="true">↗</span></Link></p> : null}
      </div>
      <MatchdayDesk report={report} />
    </div>
  </section>;
}
