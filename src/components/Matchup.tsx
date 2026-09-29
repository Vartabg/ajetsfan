import Link from "next/link";
import type { SeasonAnalytics, TeamAnalytics } from "@/lib/analytics";
import { epaLabel, rateLabel } from "@/lib/analytics";
import type { ScheduledGame } from "@/lib/current";
import { formatCheckedAt, formatDate } from "@/lib/current";
import styles from "./Matchup.module.css";

export default function Matchup({ game, overdue, analytics }: { game: ScheduledGame; overdue: boolean; analytics: SeasonAnalytics | null }) {
  const jets = analytics?.teams.find((team) => team.team === "NYJ");
  const opponent = analytics?.teams.find((team) => team.team === game.opponent);
  const hasComparison = jets && opponent && jets.completedGames > 0 && opponent.completedGames > 0 && jets.offense.plays > 0 && opponent.offense.plays > 0;
  const rows: { label: string; read: (team: TeamAnalytics) => number | null; format: typeof epaLabel; rank?: "offenseEpa" | "defenseEpa" | "offenseSuccess"; lower?: boolean }[] = [
    { label: "Offense EPA / play", read: (team) => team.offense.epaPerPlay, format: epaLabel, rank: "offenseEpa" },
    { label: "Success rate", read: (team) => team.offense.successRate, format: rateLabel, rank: "offenseSuccess" },
    { label: "Dropback EPA / play", read: (team) => team.offense.passEpaPerPlay, format: epaLabel },
    { label: "Rush EPA / play", read: (team) => team.offense.rushEpaPerPlay, format: epaLabel },
    { label: "Defense EPA allowed / play", read: (team) => team.defense.epaPerPlay, format: epaLabel, rank: "defenseEpa", lower: true },
  ];
  return (
    <section className={styles.matchup} aria-labelledby="matchup-heading">
      <div className={styles.intro}>
        <p className={styles.kicker}>{overdue ? "Awaiting final" : "Up next"} · Week {game.week}</p>
        <h2 id="matchup-heading" className="hed">Know the<br /><span>matchup.</span></h2>
        <p>Jets {game.atHome ? "vs" : "at"} {game.opponentDisplay}<br /><time dateTime={game.date}>{formatDate(game.date)}</time></p>
        <p className={styles.kickoff}>{game.kickoff ? formatCheckedAt(game.kickoff) : "Kickoff time to be confirmed"}</p>
        {overdue ? <p className={styles.kickoff}>Kickoff has passed as of the results check. A final has not been confirmed.</p> : null}
        <Link href="/how-made#efficiency">What the numbers mean <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.comparison}>
        <div className={styles.teams} aria-hidden={hasComparison ? true : undefined}><span><b>NYJ</b><small>{jets ? `${jets.completedGames} analyzed games` : "Analysis pending"}</small></span><span className={styles.vs}>VS</span><span><b>{game.opponentDisplay}</b><small>{opponent ? `${opponent.completedGames} analyzed games` : "Analysis pending"}</small></span></div>
        {hasComparison ? <table className={styles.metrics}>
          <caption className={styles.srOnly}>Current-season efficiency comparison: Jets versus {game.opponentDisplay}</caption>
          <thead className={styles.srOnly}><tr><th scope="col">NYJ · {jets.completedGames} analyzed games</th><th scope="col">Metric</th><th scope="col">{game.opponentDisplay} · {opponent.completedGames} analyzed games</th></tr></thead>
          <tbody>{rows.map((row) => {
            const left = row.read(jets);
            const right = row.read(opponent);
            const better = left == null || right == null || left === right ? null : ((row.lower ? left < right : left > right) ? "jets" : "opponent");
            return <tr className={styles.metric} key={row.label}>
              <td className={better === "jets" ? styles.better : undefined}><strong>{row.format(left)}</strong>{row.rank && jets.ranks[row.rank] != null ? <small>#{jets.ranks[row.rank]} in league</small> : null}</td>
              <th scope="row" className={styles.metricName}>{row.label}{row.lower ? <small>Lower is better</small> : null}</th>
              <td className={better === "opponent" ? styles.better : undefined}><strong>{row.format(right)}</strong>{row.rank && opponent.ranks[row.rank] != null ? <small>#{opponent.ranks[row.rank]} in league</small> : null}</td>
            </tr>;
          })}</tbody>
        </table> : <p className={styles.pending}>Team efficiency will appear here when both teams have validated, completed play-by-play. The fixture is confirmed by the schedule.</p>}
        <p className={styles.scope}>{analytics?.throughDate ? <>Regular-season efficiency through Week {analytics.throughWeek} · {formatDate(analytics.throughDate)}. {analytics.teams.filter((team) => team.completedGames > 0).length} teams with analyzed games.{analytics.pendingGameIds.length ? ` ${analytics.pendingGameIds.length} confirmed league finals await analysis.` : ""}</> : "No current-season efficiency snapshot is available."} {hasComparison ? "Highlighted values favor that team. Early-season samples can change quickly." : ""}</p>
      </div>
    </section>
  );
}
