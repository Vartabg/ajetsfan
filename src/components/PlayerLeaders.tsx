import Link from "next/link";
import type { CoverageSnapshot } from "@/lib/coverage";
import { leaders } from "@/lib/coverage";
import { formatDate } from "@/lib/current";
import PlayerPortrait from "./PlayerPortrait";
import FeedStatus from "./FeedStatus";
import styles from "./PlayerLeaders.module.css";

const CATEGORIES = [
  { kind: "passing" as const, title: "Passing", unit: "passing yards", activity: "attempts" as const },
  { kind: "rushing" as const, title: "Rushing", unit: "rushing yards", activity: "carries" as const },
  { kind: "receiving" as const, title: "Receiving", unit: "receiving yards", activity: "receptions" as const },
];

export default function PlayerLeaders({ stats, roster, editionSeason, compact = false }: { stats: CoverageSnapshot["stats"]; roster: CoverageSnapshot["roster"]; editionSeason: number; compact?: boolean }) {
  const validSeason = stats.season === editionSeason && stats.status !== "unavailable";
  return <section id="season-leaders" className={styles.section} aria-labelledby="leaders-heading">
    <div className={styles.heading}><div><p className={styles.kicker}>The players behind the numbers</p><h2 id="leaders-heading" className="hed">Setting the pace.</h2></div><p>{editionSeason} regular season{validSeason && stats.throughWeek != null ? ` · through Week ${stats.throughWeek}` : ""}</p></div>
    <div className={styles.cards}>{CATEGORIES.map(({ kind, title, unit }) => {
      const ranked = validSeason ? leaders(stats, kind) : [];
      const player = ranked[0];
      const onRoster = player && roster.players.some((entry) => entry.id === player.id);
      return <div className={styles.card} key={kind}>
        <div className={styles.cardTop}><span>{title} leader</span><b aria-hidden="true">{title.slice(0, 1)}</b></div>
        {player ? <><div className={styles.feature}><div className={styles.portrait}><PlayerPortrait src={player.headshot} name={player.name} sizes="140px" /></div><div><strong className={styles.yards}>{player[kind].yards.toLocaleString("en-US")}</strong><span className={styles.unit}>{unit}</span></div></div><div className={styles.player}>{onRoster ? <Link href={`/team?${new URLSearchParams({ player: player.id })}#roster`}>{player.name} <span aria-hidden="true">↗</span></Link> : <strong>{player.name}</strong>}<p>{player.position} · {player.games} {player.games === 1 ? "game" : "games"} with recorded stats</p></div><div className={styles.statLine}>{kind === "passing" ? <><span><b>{player.passing.touchdowns}</b> TD</span><span><b>{player.passing.interceptions}</b> INT</span><span><b>{player.passing.attempts ? `${(player.passing.completions / player.passing.attempts * 100).toFixed(1)}%` : "—"}</b> completion</span></> : kind === "rushing" ? <><span><b>{player.rushing.touchdowns}</b> TD</span><span><b>{player.rushing.carries}</b> carries</span></> : <><span><b>{player.receiving.touchdowns}</b> TD</span><span><b>{player.receiving.receptions}</b> catches</span><span><b>{player.receiving.targets}</b> targets</span></>}</div>{!compact && ranked.length > 1 ? <ol className={styles.runners} aria-label={`${title} yardage leaders`}>{ranked.slice(1).map((entry, index) => <li key={entry.id}><span>{index + 2}. {entry.name}</span><strong>{entry[kind].yards.toLocaleString("en-US")} yd</strong></li>)}</ol> : null}</> : <p className={styles.pending}>No verified {editionSeason} {kind} statistics are available in this edition.</p>}
      </div>;
    })}</div>
    <div className={styles.meta}><p>Ranked by yards in confirmed, completed regular-season games.{validSeason && stats.throughDate ? ` Through ${formatDate(stats.throughDate)}.` : ""}{validSeason && stats.pendingGameIds.length ? ` ${stats.pendingGameIds.length} Jets finals await player statistics.` : ""} <a href={stats.source} target="_blank" rel="noreferrer">Source: nflverse <span aria-hidden="true">↗</span></a></p><FeedStatus feed={stats} label="Player statistics" />{compact ? <Link className={styles.more} href="/team#roster">Meet the roster <span aria-hidden="true">↗</span></Link> : null}</div>
  </section>;
}
