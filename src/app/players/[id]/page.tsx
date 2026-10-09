import type { Metadata } from "next";
import Link from "@/components/IntentLink";
import { notFound } from "next/navigation";
import { loadPlayerEdition, loadPublishedPlayer } from "@/lib/load-published-pages";
import { formatDate } from "@/lib/current";
import { playerStatLines, playerStatsMessage, statsForPlayer } from "@/lib/roster";
import { playerActionPhoto } from "@/lib/editorial-photos";
import { pageMetadata } from "@/lib/site";
import EditorialPhoto from "@/components/EditorialPhoto";
import FeedStatus from "@/components/FeedStatus";
import PlayerPortrait from "@/components/PlayerPortrait";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import TeamFocusNavigation from "@/components/TeamFocusNavigation";
import shared from "@/components/Focus.module.css";
import { focusFonts } from "../../focus-fonts";
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
  const rosterHref = `/team/roster?${new URLSearchParams({ player: player.id })}#roster`;
  const entries: FocusEntry[] = [
    { id: "player", title: "The player", answer: player.name },
    { id: "profile-details", title: "The particulars", answer: player.college ?? player.position },
    { id: "profile-stats", title: "On the record", answer: `${season} production` },
    { id: "profile-sources", title: "Sources", answer: "Read the source" },
  ];

  return <FocusShell page="player" section="/team" entries={entries} checkedAt={coverage.roster.checkedAt} className={focusFonts}>
    <FocusMoment id="player" first heading={player.name} status={<TeamFocusNavigation />}
      label={`${season} source roster${coverage.roster.week !== null ? ` · Week ${coverage.roster.week}` : ""}`}
      actions={<Link className={shared.go} href={rosterHref}>Find {player.name.split(" ")[0]} in the roster <span aria-hidden="true">→</span></Link>}>
      <p className={styles.position}>{player.position}{player.jersey !== null ? ` · No. ${player.jersey}` : ""} · New York Jets</p>
      <p className={shared.caption}>Source roster status: <strong>{player.statusLabel}</strong> ({player.status})</p>
      <div className={shared.shape}>{photo
        ? <EditorialPhoto photo={photo} eager sizes="(max-width: 1023px) calc(100vw - 32px), (max-width: 1400px) calc(100vw - 400px), 760px" className={styles.photo} />
        : <div className={styles.number} aria-hidden="true">
          {player.headshot ? <div className={styles.headshot}><PlayerPortrait src={player.headshot} name={player.name} sizes="(max-width: 640px) 40vw, 240px" /></div> : null}
          <div><span className={shared.label}>Green &amp; white</span><strong>{player.jersey !== null ? player.jersey : player.position}</strong><span className={shared.label}>{season} source roster</span></div>
        </div>}
      </div>
    </FocusMoment>

    <FocusMoment id="profile-details" label="From the team sheet" heading="The particulars.">
      <div className={shared.shape}>
        <dl className={styles.bio}>
          <div><dt>Position</dt><dd>{player.position}</dd></div>
          {player.jersey !== null ? <div><dt>Jersey</dt><dd>No. {player.jersey}</dd></div> : null}
          <div><dt>Height</dt><dd>{player.height ?? "Not listed"}</dd></div>
          <div><dt>Weight</dt><dd>{player.weight !== null ? `${player.weight} lb` : "Not listed"}</dd></div>
          <div><dt>College</dt><dd>{player.college ?? "Not listed"}</dd></div>
          <div><dt>Experience</dt><dd>{player.experience !== null ? `${player.experience} ${player.experience === 1 ? "year" : "years"} in source roster` : "Not listed"}</dd></div>
        </dl>
        <p className={shared.caption}>Roster listing describes this source snapshot. It does not establish game-day availability or an injury designation.</p>
        <FeedStatus feed={coverage.roster} label="Player roster" />
      </div>
    </FocusMoment>

    <FocusMoment id="profile-stats" label="The work on Sunday" heading={`${season} on the record.`}>
      <p className={shared.caption}>{statsMessage.scope}{coverage.stats.season === season && coverage.stats.throughWeek !== null ? ` · through Week ${coverage.stats.throughWeek}` : ""}{coverage.stats.season === season && coverage.stats.throughDate ? ` · ${formatDate(coverage.stats.throughDate)}` : ""}</p>
      <div className={shared.shape}>{lines.length ? <>
        <dl className={styles.statLines}>{lines.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>
        <p className={shared.caption}>{coverage.stats.pendingGameIds.length ? `${coverage.stats.pendingGameIds.length} confirmed ${coverage.stats.pendingGameIds.length === 1 ? "result is" : "results are"} awaiting player statistics. ` : ""}These are recorded totals from the checked feed.</p>
      </> : <>
        <p className={styles.pending}>{statsMessage.empty}</p>
        <p className={shared.caption}>An absent offensive line does not mean the player has not contributed.</p>
      </>}
      <FeedStatus feed={coverage.stats} label="Player statistics" /></div>
    </FocusMoment>

    <FocusMoment id="profile-sources" label="Follow the record" heading="Read the source. Follow the team.">
      <p className={shared.caption}>Profile details come from the {coverage.roster.season} nflverse roster snapshot. Newer roster changes may be missing until the next successful check.</p>
      <nav className={styles.sources} aria-label="Player sources and next steps">
        <a href={coverage.roster.source} target="_blank" rel="noopener noreferrer">Roster source <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
        {lines.length ? <a href={coverage.stats.source} target="_blank" rel="noopener noreferrer">Recorded stats source <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
        {player.profileUrl ? <a href={player.profileUrl} target="_blank" rel="noopener noreferrer">ESPN player profile <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
        <Link href="/team/news">Latest Jets coverage <span aria-hidden="true">→</span></Link>
        <Link href="/team/roster">Find another player <span aria-hidden="true">→</span></Link>
      </nav>
    </FocusMoment>
  </FocusShell>;
}
