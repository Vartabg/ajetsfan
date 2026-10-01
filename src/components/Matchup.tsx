import Link from "next/link";
import type { RateMetrics, SeasonAnalytics, TeamAnalytics } from "@/lib/analytics";
import { epaLabel, rateLabel } from "@/lib/analytics";
import { leagueMetric, type EfficiencyMetric } from "@/lib/analytics-context";
import type { ScheduledGame } from "@/lib/current";
import { formatCheckedAt, formatDate } from "@/lib/current";
import styles from "./Matchup.module.css";

type MetricRow = {
  metric: EfficiencyMetric;
  label: string;
  denominator: "plays" | "passPlays" | "rushPlays";
  unit: string;
};

const ROWS: MetricRow[] = [
  { metric: "epaPerPlay", label: "EPA / play", denominator: "plays", unit: "plays" },
  { metric: "successRate", label: "Success rate", denominator: "plays", unit: "plays" },
  { metric: "passEpaPerPlay", label: "Dropback EPA / play", denominator: "passPlays", unit: "dropbacks" },
  { metric: "rushEpaPerPlay", label: "Non-dropback rush EPA / play", denominator: "rushPlays", unit: "rush plays" },
];

function metricValue(metrics: RateMetrics, row: MetricRow) {
  return row.metric === "successRate" ? rateLabel(metrics[row.metric]) : epaLabel(metrics[row.metric], 3);
}

function UnitMatchup({ offense, defense, offenseName, defenseName, analytics, open = false }: {
  offense: TeamAnalytics;
  defense: TeamAnalytics;
  offenseName: string;
  defenseName: string;
  analytics: SeasonAnalytics;
  open?: boolean;
}) {
  const tableName = `${offenseName} offense vs ${defenseName} defense`;
  return <details className={styles.unit} open={open}>
    <summary><strong>When {offenseName === "Jets" ? "the Jets have" : `${offenseName} has`} the ball</strong><span>{tableName}</span></summary>
    <p className={styles.samples}>{offenseName}: {offense.completedGames} analyzed {offense.completedGames === 1 ? "game" : "games"} · {defenseName}: {defense.completedGames} analyzed {defense.completedGames === 1 ? "game" : "games"}</p>
    <div className={styles.tableScroll} role="region" tabIndex={0} aria-label={`${tableName}, scroll if needed`}>
      <table className={styles.metrics}>
        <caption className={styles.srOnly}>{tableName}</caption>
        <colgroup><col className={styles.labelColumn} /><col /><col /></colgroup>
        <thead><tr><th scope="col">Metric</th><th scope="col">{offenseName}<small>Offense · produced</small></th><th scope="col">{defenseName}<small>Defense · allowed</small></th></tr></thead>
        <tbody>{ROWS.map((row) => {
          const offenseLeague = leagueMetric(analytics.teams, "offense", row.metric);
          const defenseLeague = leagueMetric(analytics.teams, "defense", row.metric);
          const offenseRank = offenseLeague.entries.find((entry) => entry.team === offense.team)?.rank;
          const defenseRank = defenseLeague.entries.find((entry) => entry.team === defense.team)?.rank;
          return <tr className={styles.metric} key={row.metric}>
            <th scope="row" className={styles.metricName}>{row.label}</th>
            <td><strong>{metricValue(offense.offense, row)}</strong><small>{offense.offense[row.denominator].toLocaleString("en-US")} {row.unit}</small>{row.metric === "successRate" ? <small>Offensive success</small> : null}{offenseRank != null ? <small>#{offenseRank} of {offenseLeague.teams} offenses</small> : null}</td>
            <td><strong>{metricValue(defense.defense, row)}</strong><small>{defense.defense[row.denominator].toLocaleString("en-US")} {row.unit}</small>{row.metric === "successRate" ? <small>Defensive success allowed</small> : null}{defenseRank != null ? <small>#{defenseRank} of {defenseLeague.teams} defenses</small> : null}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </details>;
}

function splitRead(jets: TeamAnalytics) {
  const { passEpaPerPlay, rushEpaPerPlay, passPlays, rushPlays } = jets.offense;
  if (!passPlays || !rushPlays || passEpaPerPlay == null || rushEpaPerPlay == null || !Number.isFinite(passEpaPerPlay) || !Number.isFinite(rushEpaPerPlay) || passEpaPerPlay === rushEpaPerPlay) return null;
  const stronger = passEpaPerPlay > rushEpaPerPlay ? "dropbacks" : "non-dropback runs";
  return <>The Jets have gotten more per play from {stronger} so far: {epaLabel(passEpaPerPlay, 3)} EPA across {passPlays} dropbacks, versus {epaLabel(rushEpaPerPlay, 3)} across {rushPlays} non-dropback rush plays.</>;
}

export default function Matchup({ game, overdue, analytics }: { game: ScheduledGame; overdue: boolean; analytics: SeasonAnalytics | null }) {
  const jets = analytics?.teams.find((team) => team.team === "NYJ");
  const opponent = analytics?.teams.find((team) => team.team === game.opponent);
  const hasComparison = analytics && jets && opponent && jets.completedGames > 0 && opponent.completedGames > 0 &&
    jets.offense.plays > 0 && jets.defense.plays > 0 && opponent.offense.plays > 0 && opponent.defense.plays > 0;
  const interpretation = jets && jets.completedGames > 0 ? splitRead(jets) : null;
  return (
    <section className={styles.matchup} aria-labelledby="matchup-heading">
      <div className={styles.intro}>
        <p className={styles.kicker}>{overdue ? "Awaiting final" : "Up next"} · Week {game.week}</p>
        <h2 id="matchup-heading" className="hed">Know the <br /><span>matchup.</span></h2>
        <p>Jets {game.atHome ? "vs" : "at"} {game.opponentDisplay}<br /><time dateTime={game.date}>{formatDate(game.date)}</time></p>
        <p className={styles.kickoff}>{game.kickoff ? formatCheckedAt(game.kickoff) : "Kickoff time to be confirmed"}</p>
        {overdue ? <p className={styles.kickoff}>Kickoff has passed as of the results check. A final has not been confirmed.</p> : null}
        {interpretation ? <p className={styles.interpretation}>{interpretation}</p> : null}
        <Link href="/how-made#efficiency">What the numbers mean <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.comparison}>
        {hasComparison ? <>
          <p className={styles.guide}>Two sides of Sunday. Higher offensive rates are better; lower defensive rates allowed are better. These describe recorded performance, not the next result.</p>
          <UnitMatchup offense={jets} defense={opponent} offenseName="Jets" defenseName={game.opponentDisplay} analytics={analytics} open />
          <UnitMatchup offense={opponent} defense={jets} offenseName={game.opponentDisplay} defenseName="Jets" analytics={analytics} />
          <p className={styles.definitions}>Success is a play with EPA above zero. Dropbacks include sacks and quarterback scrambles. Non-dropback rush plays exclude scrambles, kneels and spikes; source-classified aborted runs can remain.</p>
        </> : <p className={styles.pending}>Team efficiency will appear here when both teams have validated, completed play-by-play. The fixture is confirmed by the schedule.</p>}
        <p className={styles.scope}>{analytics?.throughDate ? <>{analytics.season} regular season · highest included week: Week {analytics.throughWeek} · latest included game: {formatDate(analytics.throughDate)}. {analytics.teams.filter((team) => team.completedGames > 0).length} teams with analyzed games.{analytics.pendingGameIds.length ? ` ${analytics.pendingGameIds.length} confirmed league finals await analysis.` : ""}</> : "No current-season efficiency snapshot is available."} {hasComparison ? "Rates pool the included plays across each team’s analyzed games. All game situations are included; rates are not opponent-adjusted. Early-season samples can change quickly. Ranks use unrounded rates among teams with a usable sample for that metric." : ""}</p>
      </div>
    </section>
  );
}
