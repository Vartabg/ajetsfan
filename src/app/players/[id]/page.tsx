import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPlayerEdition, loadPublishedPlayer } from "@/lib/load-published-pages";
import { formatDate } from "@/lib/current";
import { playerStatLines, playerStatsMessage, statsForPlayer } from "@/lib/roster";
import { playerActionPhoto } from "@/lib/editorial-photos";
import { pageMetadata } from "@/lib/site";
import EditorialPhoto from "@/components/EditorialPhoto";
import FeedStatus from "@/components/FeedStatus";
import styles from "./page.module.css";

type Props = { params: Promise<{ id: string }> };
async function getProfile(id: string) {
  const profile = await loadPublishedPlayer(id);
  if (!profile) notFound();
  return profile;
}

export const dynamicParams = false;
export async function generateStaticParams() {
  return (await loadPlayerEdition()).players.map((player) => ({ id: player.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { player, season } = await getProfile((await params).id);
  const title = `${player.name} · Jets ${player.position}`;
  const description = `${player.name}, ${player.position}${player.jersey !== null ? `, No. ${player.jersey}` : ""}. ${season} Jets source roster profile, recorded regular-season statistics, and links to the source coverage.`;
  return pageMetadata({ title, description, path: `/players/${player.id}` });
}

export default async function PlayerPage({ params }: Props) {
  const { player, coverage, season } = await getProfile((await params).id);
  const stats = statsForPlayer(coverage.stats, player.id, season);
  const lines = playerStatLines(stats);
  const statsMessage = playerStatsMessage(coverage.stats, player, season);
  const photo = playerActionPhoto(player.id, season);
  const rosterHref = `/team?${new URLSearchParams({ player: player.id })}#roster`;
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">The Back Page</Link><span aria-hidden="true">/</span><Link href="/team">Around the Jets</Link><span aria-hidden="true">/</span><span>Player profile</span></nav>
    <article>
      <header className={styles.header}>
        <div className={styles.folio}><span>{season} edition · The player programme</span><span>Source roster{coverage.roster.week !== null ? ` · Week ${coverage.roster.week}` : ""}</span></div>
        <div className={`${styles.hero} ${photo ? styles.withPhoto : ""}`}><div className={styles.identity}><p className={styles.kicker}>The name on the jersey</p><h1 className="hed">{player.name}</h1><p className={styles.position}>{player.position}{player.jersey !== null ? ` · No. ${player.jersey}` : ""} · New York Jets</p><p className={styles.status}>Source roster status: <strong>{player.statusLabel}</strong> ({player.status})</p><Link className={styles.rosterLink} href={rosterHref}>Find {player.name.split(" ")[0]} in the roster <span aria-hidden="true">↗</span></Link></div>{photo ? <EditorialPhoto photo={photo} eager sizes="(max-width: 800px) calc(100vw - 2rem), (max-width: 1288px) calc(50vw - 3rem), 580px" className={styles.photo} /> : <div className={styles.number} aria-hidden="true"><span>Green &amp; white</span><strong>{player.jersey !== null ? player.jersey : player.position}</strong><span>{season} source roster</span></div>}</div>
      </header>
      <div className={styles.body}>
        <section className={styles.bio} aria-labelledby="profile-details-heading"><p className={styles.kicker}>From the team sheet</p><h2 id="profile-details-heading">The particulars.</h2><dl><div><dt>Position</dt><dd>{player.position}</dd></div>{player.jersey !== null ? <div><dt>Jersey</dt><dd>No. {player.jersey}</dd></div> : null}<div><dt>Height</dt><dd>{player.height ?? "Not listed"}</dd></div><div><dt>Weight</dt><dd>{player.weight !== null ? `${player.weight} lb` : "Not listed"}</dd></div><div><dt>College</dt><dd>{player.college ?? "Not listed"}</dd></div><div><dt>Experience</dt><dd>{player.experience !== null ? `${player.experience} ${player.experience === 1 ? "year" : "years"} in source roster` : "Not listed"}</dd></div></dl><p className={styles.note}>Roster listing describes this source snapshot. It does not establish game-day availability or an injury designation.</p><FeedStatus feed={coverage.roster} label="Player roster" /></section>
        <section className={styles.stats} aria-labelledby="profile-stats-heading"><p className={styles.kicker}>The work on Sunday</p><h2 id="profile-stats-heading">{season} on the record.</h2><p className={styles.statsScope}>{statsMessage.scope}{coverage.stats.season === season && coverage.stats.throughWeek !== null ? ` · through Week ${coverage.stats.throughWeek}` : ""}{coverage.stats.season === season && coverage.stats.throughDate ? ` · ${formatDate(coverage.stats.throughDate)}` : ""}</p>{lines.length ? <><dl className={styles.statLines}>{lines.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl><p className={styles.note}>{coverage.stats.pendingGameIds.length ? `${coverage.stats.pendingGameIds.length} confirmed ${coverage.stats.pendingGameIds.length === 1 ? "result is" : "results are"} awaiting player statistics. ` : ""}These are recorded totals from the checked feed.</p><FeedStatus feed={coverage.stats} label="Player statistics" /></> : <div className={styles.pending}><p>{statsMessage.empty}</p><p className={styles.note}>An absent offensive line does not mean the player has not contributed.</p><FeedStatus feed={coverage.stats} label="Player statistics" /></div>}</section>
      </div>
      <footer className={styles.sources}><h2>Read the source. Follow the team.</h2><p>Profile details come from the {coverage.roster.season} nflverse roster snapshot. Newer roster changes may be missing until the next successful check.</p><nav aria-label="Player sources and next steps"><a href={coverage.roster.source} target="_blank" rel="noreferrer">Roster source <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>{lines.length ? <a href={coverage.stats.source} target="_blank" rel="noreferrer">Recorded stats source <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a> : null}{player.profileUrl ? <a href={player.profileUrl} target="_blank" rel="noreferrer">ESPN player profile <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a> : null}<Link href="/team#news">Latest Jets coverage <span aria-hidden="true">↗</span></Link><Link href="/team#roster">Find another player <span aria-hidden="true">↗</span></Link></nav></footer>
    </article>
  </main>;
}
