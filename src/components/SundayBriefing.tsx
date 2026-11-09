import Link from "next/link";
import type { SeasonAnalytics } from "@/lib/analytics";
import { epaLabel } from "@/lib/analytics";
import { leagueMetric, type LeagueMeasure } from "@/lib/analytics-context";
import type { CurrentSnapshot, ScheduledGame } from "@/lib/current";
import { currentSeasonSummary, formatDate } from "@/lib/current";
import { placeName } from "@/lib/focus";
import { record } from "@/lib/focus-format";
import { previewQuestions, type PreviewQuestion } from "@/lib/football-preview";
import { selectMatchdayReport } from "@/lib/matchday-report";
import MatchdayDesk from "./MatchdayDesk";
import shared from "./Focus.module.css";
import styles from "./SundayBriefing.module.css";

/** 1 → "1st", 22 → "22nd": a rank a stranger reads at a glance. */
export function ordinal(rank: number): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
const plural = (name: string) => name.startsWith("the ");

/** The plain question each measured pairing answers. */
function unitQuestion(question: PreviewQuestion, opponent: string): string {
  if (question.id === "passing") return "When the Jets throw";
  if (question.id === "rushing") return "When the Jets run";
  return `When ${opponent} throw${plural(opponent) ? "" : "s"}`;
}

const rankOf = (measure: LeagueMeasure, team: string) => measure.entries.find((entry) => entry.team === team)?.rank ?? null;

/** Which recorded unit has been better, by overall EPA rank over the analyzed games. A description of the record, never a forecast. */
export function matchupRead(game: ScheduledGame, analytics: SeasonAnalytics | null) {
  const opponent = placeName(game.opponentDisplay);
  const fallback = <>Jets {game.atHome ? "vs" : "at"} {opponent}, <em>unit by unit.</em></>;
  if (!analytics || analytics.season !== game.season) return fallback;
  const offense = leagueMetric(analytics.teams, "offense", "epaPerPlay");
  const defense = leagueMetric(analytics.teams, "defense", "epaPerPlay");
  const jetsOffense = rankOf(offense, "NYJ"), oppOffense = rankOf(offense, game.opponent);
  const jetsDefense = rankOf(defense, "NYJ"), oppDefense = rankOf(defense, game.opponent);
  if (jetsOffense === null || oppOffense === null || jetsDefense === null || oppDefense === null || jetsOffense === oppOffense || jetsDefense === oppDefense) return fallback;
  const when = <em>{analytics.throughWeek != null ? `through Week ${analytics.throughWeek}.` : "so far."}</em>;
  const jetsBetterOffense = jetsOffense < oppOffense;
  const jetsBetterDefense = jetsDefense < oppDefense;
  if (jetsBetterOffense && jetsBetterDefense) return <>The Jets have had the better offense and the better defense {when}</>;
  if (!jetsBetterOffense && !jetsBetterDefense) return <>{capital(opponent)} {plural(opponent) ? "have" : "has"} had the better offense and the better defense {when}</>;
  return <>The Jets have had the better {jetsBetterOffense ? "offense" : "defense"}, {opponent} the better {jetsBetterOffense ? "defense" : "offense"} {when}</>;
}

function Unit({ side, name, us, measure, epa, plays, games, unit }: {
  side: "offense" | "defense"; name: string; us: boolean; measure: LeagueMeasure; epa: number; plays: number; games: number; unit: string;
}) {
  const rank = rankOf(measure, us ? "NYJ" : name);
  const fill = rank === null || !measure.teams ? 0 : (measure.teams - rank + 1) / measure.teams * 100;
  return <div className={us ? styles.us : undefined}>
    <dt>{us ? "Jets" : capital(placeName(name))} {side}</dt>
    <dd>
      <span className={styles.track} aria-hidden="true"><span style={{ width: `${fill}%` }} /></span>
      <strong>{rank === null ? "Unranked" : `${ordinal(rank)} of ${measure.teams}`}</strong>
      <small>{epaLabel(epa, 3)} EPA {side === "offense" ? "per" : "allowed per"} {unit} · {plays} plays · {games} completed {games === 1 ? "game" : "games"}</small>
    </dd>
  </div>;
}

/** The matchup as a focus moment: one plain sentence, each unit pairing as two bars ranked against the league, then where to watch. */
export default function SundayBriefing({ game, overdue, snapshot, analytics }: {
  game: ScheduledGame;
  overdue: boolean;
  snapshot: CurrentSnapshot;
  analytics: SeasonAnalytics | null;
}) {
  const questions = overdue ? [] : previewQuestions(game, analytics);
  const report = overdue ? null : selectMatchdayReport(game);
  const summary = currentSeasonSummary(snapshot);
  const regular = !overdue && game.seasonType === "REG" && game.season === snapshot.season;
  const opponent = placeName(game.opponentDisplay);
  const measures = analytics ? {
    passEpaPerPlay: { offense: leagueMetric(analytics.teams, "offense", "passEpaPerPlay"), defense: leagueMetric(analytics.teams, "defense", "passEpaPerPlay") },
    rushEpaPerPlay: { offense: leagueMetric(analytics.teams, "offense", "rushEpaPerPlay"), defense: leagueMetric(analytics.teams, "defense", "rushEpaPerPlay") },
  } : null;

  return <section id="sunday-briefing" className={styles.briefing} aria-labelledby="briefing-heading">
    <p className={shared.label}>The matchup · Week {game.week}</p>
    <h2 id="briefing-heading" className={shared.say}>{overdue ? <>Jets {game.atHome ? "vs" : "at"} {opponent}, <em>awaiting a final.</em></> : matchupRead(game, analytics)}</h2>
    {questions.length && measures && analytics ? <figure className={shared.shape}>
      <ol className={styles.units} aria-label="Measured unit comparisons">{questions.map((question) => {
        const measure = measures[question.unit === "dropback" ? "passEpaPerPlay" : "rushEpaPerPlay"];
        const unit = question.unit === "dropback" ? "dropback" : "rush";
        return <li key={question.id}>
          <h3>{unitQuestion(question, opponent)}</h3>
          <dl className={styles.pair} aria-label={`${question.title} comparison`}>
            <Unit side="offense" name={game.opponent} us={question.offense.team === "NYJ"} measure={measure.offense} epa={question.offense.epa} plays={question.offense.plays} games={question.offense.games} unit={unit} />
            <Unit side="defense" name={game.opponent} us={question.defense.team === "NYJ"} measure={measure.defense} epa={question.defense.epa} plays={question.defense.plays} games={question.defense.games} unit={unit} />
          </dl>
        </li>;
      })}</ol>
      <figcaption>A longer bar is a better rank among the teams with analyzed games{analytics.throughWeek != null ? `, through Week ${analytics.throughWeek}` : ""}{analytics.throughDate ? ` (${formatDate(analytics.throughDate)})` : ""}. Offenses rank by points added per play, defenses by points allowed. Each unit faced its own opponents; these rates do not predict this game’s result. <Link href="/how-made#efficiency">EPA, sample rules &amp; sources <span aria-hidden="true">↗</span></Link></figcaption>
    </figure> : <p className={shared.caption}>{overdue ? "Kickoff has passed as of the results check. The final appears here once it is recorded." : "Validated offensive and defensive play samples are not available for this fixture."}</p>}
    {regular ? <p className={shared.reveal}>A win makes them {record(summary.wins + 1, summary.losses, summary.ties)}. A loss makes them {record(summary.wins, summary.losses + 1, summary.ties)}.</p> : null}
    <MatchdayDesk report={report} />
  </section>;
}
