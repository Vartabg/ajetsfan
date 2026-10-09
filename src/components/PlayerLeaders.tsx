import Link from "next/link";
import type { CoverageSnapshot } from "@/lib/coverage";
import { playerHref } from "@/lib/roster";
import { leaders } from "@/lib/coverage";
import { formatDate } from "@/lib/current";
import { playerActionPhoto } from "@/lib/editorial-photos";
import EditorialPhoto from "./EditorialPhoto";
import FeedStatus from "./FeedStatus";
import styles from "./PlayerLeaders.module.css";

const CATEGORIES = [
  { kind: "passing" as const, title: "Passing", unit: "passing yards", activity: "attempts" as const },
  { kind: "rushing" as const, title: "Rushing", unit: "rushing yards", activity: "carries" as const },
  { kind: "receiving" as const, title: "Receiving", unit: "receiving yards", activity: "receptions" as const },
];

export default function PlayerLeaders({ stats, roster, editionSeason, compact = false, externalHeadingId }: { stats: CoverageSnapshot["stats"]; roster: CoverageSnapshot["roster"]; editionSeason: number; compact?: boolean; externalHeadingId?: string }) {
  const validSeason = stats.season === editionSeason && stats.status !== "unavailable";
  return <section id="season-leaders" className={styles.section} aria-labelledby={externalHeadingId ?? "leaders-heading"}>
    {!externalHeadingId ? <div className={styles.heading}><div><p className={styles.kicker}>Moving the chains</p><h2 id="leaders-heading" className="hed">Who’s carrying<br />this thing?</h2></div><p>{editionSeason} regular season{validSeason && stats.throughWeek != null ? ` · through Week ${stats.throughWeek}` : ""}</p></div> : null}
    <div className={styles.cards}>{CATEGORIES.map(({ kind, title, unit }) => {
      const ranked = validSeason ? leaders(stats, kind) : [];
      const player = ranked[0];
      const rosterPlayer = player && roster.players.find((entry) => entry.id === player.id);
      const actionPhoto = player ? playerActionPhoto(player.id, editionSeason) : null;
      const onRoster = !!rosterPlayer;
      return <div className={styles.card} key={kind}>
        <div className={styles.cardTop}><span>{title} leader</span><b>{rosterPlayer?.jersey != null ? <><span className={styles.shirtLabel}>No.</span> <span className={styles.shirtNumber}>{rosterPlayer.jersey}</span></> : player?.position ?? ""}</b></div>
        {player ? <>
          {actionPhoto ? <EditorialPhoto photo={actionPhoto} className={styles.actionPhoto} sizes="(max-width: 800px) calc(100vw - 32px), (max-width: 900px) calc(33.333vw - 2.73rem), (max-width: 1288px) calc(33.333vw - 3.98rem), 366px" /> : <div className={styles.jerseyFallback} aria-hidden="true">{rosterPlayer?.jersey ?? player.position}</div>}
          <div className={styles.player}><h3>{onRoster ? <Link href={playerHref(player.id)}>{player.name} <span aria-hidden="true">↗</span></Link> : player.name}</h3><p>{player.position} · {player.games} {player.games === 1 ? "game" : "games"} with recorded stats</p></div><div className={styles.production}><strong className={styles.yards}>{player[kind].yards.toLocaleString("en-US")}</strong><span className={styles.unit}>{unit}</span></div><div className={styles.statLine}>{kind === "passing" ? <><span><b>{player.passing.touchdowns}</b> TD</span><span><b>{player.passing.interceptions}</b> INT</span><span><b>{player.passing.attempts ? `${(player.passing.completions / player.passing.attempts * 100).toFixed(1)}%` : "—"}</b> completion</span></> : kind === "rushing" ? <><span><b>{player.rushing.touchdowns}</b> TD</span><span><b>{player.rushing.carries}</b> carries</span></> : <><span><b>{player.receiving.touchdowns}</b> TD</span><span><b>{player.receiving.receptions}</b> catches</span><span><b>{player.receiving.targets}</b> targets</span></>}</div>{!compact && ranked.length > 1 ? <ol className={styles.runners} aria-label={`${title} yardage leaders`}>{ranked.slice(1).map((entry, index) => <li key={entry.id}><span>{index + 2}. {entry.name}</span><strong>{entry[kind].yards.toLocaleString("en-US")} yd</strong></li>)}</ol> : null}</> : <p className={styles.pending}>No verified {editionSeason} {kind} statistics are available in this edition.</p>}
      </div>;
    })}</div>
    <div className={styles.meta}><p>Ranked by yards in confirmed, completed regular-season games.{validSeason && stats.throughDate ? ` Through ${formatDate(stats.throughDate)}.` : ""}{validSeason && stats.pendingGameIds.length ? ` ${stats.pendingGameIds.length} Jets finals await player statistics.` : ""} <a href={stats.source} target="_blank" rel="noreferrer">Source: nflverse <span aria-hidden="true">↗</span></a></p><FeedStatus feed={stats} label="Player statistics" />{compact ? <Link className={styles.more} href="/team/roster">Meet the roster <span aria-hidden="true">↗</span></Link> : null}</div>
  </section>;
}
