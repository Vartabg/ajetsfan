import Link from "next/link";
import type { SeasonAnalytics } from "@/lib/analytics";
import { leagueMetric } from "@/lib/analytics-context";
import { formatDate } from "@/lib/current";
import { ordinal } from "@/lib/focus-format";
import LeagueField from "./LeagueField";
import shared from "./Focus.module.css";
import styles from "./LeagueContext.module.css";

/** League context: one plain sentence on where each Jets unit ranks, then every analyzed team on one scale. */
export default function LeagueContext({ analytics, opponent }: { analytics: SeasonAnalytics; opponent: string }) {
  const offense = leagueMetric(analytics.teams, "offense", "epaPerPlay");
  const defense = leagueMetric(analytics.teams, "defense", "epaPerPlay");
  const jetsOffense = offense.entries.find((entry) => entry.team === "NYJ");
  const jetsDefense = defense.entries.find((entry) => entry.team === "NYJ");

  return <section className={styles.context} aria-labelledby="league-context-heading">
    <p className={shared.label}>League context · {analytics.season}</p>
    <h2 id="league-context-heading" className={shared.say}>Where the Jets sit.</h2>
    {jetsOffense || jetsDefense ? <p className={shared.reveal}>
      {jetsOffense ? `The offense ranks ${ordinal(jetsOffense.rank)} of ${offense.teams} analyzed teams` : "The offense has no validated sample yet"}; {jetsDefense ? `the defense ${ordinal(jetsDefense.rank)} of ${defense.teams}` : "the defense has no validated sample yet"}, by points added per play.
    </p> : null}
    {offense.teams || defense.teams ? <LeagueField offense={offense} defense={defense} opponent={opponent} /> : <p className={shared.caption}>League comparisons appear when completed games have validated efficiency samples.</p>}
    <p className={styles.scope}>{analytics.season} regular season · {analytics.analyzedGameIds.length} analyzed league finals{analytics.throughWeek != null ? ` · highest included week: ${analytics.throughWeek}` : ""}{analytics.throughDate ? ` · ${formatDate(analytics.throughDate)}` : ""}.{analytics.pendingGameIds.length ? ` ${analytics.pendingGameIds.length} confirmed league finals await analysis.` : ""} All situations included; not opponent adjusted. The league average weights every included play equally. Tied values share a rank. <Link href="/how-made#efficiency">How EPA and the sample work <span aria-hidden="true">↗</span></Link></p>
  </section>;
}
