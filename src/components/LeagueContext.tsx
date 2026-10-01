import Link from "next/link";
import type { SeasonAnalytics } from "@/lib/analytics";
import { leagueMetric } from "@/lib/analytics-context";
import { formatDate } from "@/lib/current";
import LeagueField from "./LeagueField";
import styles from "./LeagueContext.module.css";

export default function LeagueContext({ analytics, opponent }: { analytics: SeasonAnalytics; opponent: string }) {
  const offense = leagueMetric(analytics.teams, "offense", "epaPerPlay");
  const defense = leagueMetric(analytics.teams, "defense", "epaPerPlay");

  return <section className={styles.context} aria-labelledby="league-context-heading">
    <div className={styles.heading}>
      <div><p className={styles.kicker}>The league measuring stick</p><h2 id="league-context-heading" className="hed">Where the Jets sit.</h2></div>
      <p>Put the Jets’ offense and defense beside the rest of the league.</p>
    </div>
    {offense.teams || defense.teams ? <LeagueField offense={offense} defense={defense} opponent={opponent} /> : <p className={styles.pending}>League comparisons will appear when completed games have validated efficiency samples.</p>}
    <p className={styles.scope}>{analytics.season} regular season · {analytics.analyzedGameIds.length} analyzed league finals{analytics.throughWeek != null ? ` · highest included week: ${analytics.throughWeek}` : ""}{analytics.throughDate ? ` · ${formatDate(analytics.throughDate)}` : ""}.{analytics.pendingGameIds.length ? ` ${analytics.pendingGameIds.length} confirmed league finals await analysis.` : ""} All situations included; not opponent adjusted. The league average weights every included play equally. Tied values share a rank. <Link href="/how-made#efficiency">How EPA and the sample work <span aria-hidden="true">↗</span></Link></p>
  </section>;
}
