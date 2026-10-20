import type { Metadata } from "next";
import Link from "@/components/IntentLink";
import { notFound } from "next/navigation";
import { loadPlayerEdition, loadPublishedGames, loadPublishedPlayer } from "@/lib/load-published-pages";
import { loadPlayerHistory } from "@/lib/load-player-history";
import { archiveDiffersFromStats, focusOf, lineText, playText, sumLines, type PlayerGame, type PlayerHistory } from "@/lib/player-history";
import { formatCheckedAt, formatDate } from "@/lib/current";
import { playerStatLines, playerStatsMessage, statsForPlayer } from "@/lib/roster";
import { playerActionPhoto } from "@/lib/editorial-photos";
import { pageMetadata } from "@/lib/site";
import { teamIdentity } from "@/lib/teams";
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

export const dynamic = "force-dynamic";
export const dynamicParams = true;
export async function generateStaticParams() {
  return (await loadPlayerEdition({ live: false })).players.map((player) => ({ id: player.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { player, season } = await getProfile((await params).id);
  const title = `${player.name} · Jets ${player.position}`;
  const description = `${player.name}, ${player.position}${player.jersey !== null ? `, No. ${player.jersey}` : ""}. ${season} Jets source roster profile, recorded regular-season statistics, and links to the source coverage.`;
  return pageMetadata({ title, description, path: `/players/${player.id}` });
}

const n = (value: number) => value.toLocaleString("en-US");
const where = (game: { gameId: string; opponent: string }) => `${game.gameId.endsWith("_NYJ") ? "vs" : "at"} ${teamIdentity(game.opponent)?.nickname ?? game.opponent}`;
const when = (game: { week: number; post: boolean }) => game.post ? "Playoffs" : `Week ${game.week}`;
const archiveCutoff = (coverage: { throughWeek: number | null; playoffs: boolean }) => [
  coverage.throughWeek !== null ? `regular-season Week ${coverage.throughWeek}` : null,
  coverage.playoffs ? "recorded playoff games" : null,
].filter(Boolean).join(" and ");

/** One bar per game this season, measured in the player's main number. */
function Games({ history, published, differs }: { history: PlayerHistory; published: Set<string>; differs: boolean }) {
  const latest = history.latest!;
  const focus = focusOf(sumLines(latest.games));
  if (!focus) return null;
  const top = Math.max(1, ...latest.games.map((game) => focus.value(game)));
  const total = focus.value(sumLines(latest.games));
  const gameLabel = (game: PlayerGame) => `${when(game)} ${where(game)}`;
  return <FocusMoment id="profile-games" label={`${latest.season} archive · game by game`}
    heading={<>{n(total)} {focus.unit} <em>in {latest.games.length} {latest.games.length === 1 ? "game" : "games"}.</em></>}>
    <p className={shared.caption}>Archive through {archiveCutoff(latest)}. Checked <time dateTime={latest.checkedAt}>{formatCheckedAt(latest.checkedAt)}</time>. It updates separately from the current totals below.</p>
    {differs ? <p className={shared.caption}>The archive and current totals cover different games or source revisions. These bars show only the archived game lines; use the cutoff and check time for each section.</p> : null}
    <div className={shared.shape}>
      <ol className={styles.bars}>{latest.games.map((game) => <li key={game.gameId}>
        {published.has(game.gameId) ? <Link href={`/games/${game.gameId}`}>{gameLabel(game)}</Link> : <span>{gameLabel(game)}</span>}
        <i style={{ width: `${Math.max(0, focus.value(game)) / top * 100}%` }} aria-hidden="true" /><b>{n(focus.value(game))}</b>
        <small>{lineText(game) || "No recorded line"}</small>
      </li>)}</ol>
      <p className={shared.caption}>Jets games only, from nflverse weekly player stats. The bars measure {focus.unit}.</p>
    </div>
  </FocusMoment>;
}

/** One bar per season as a Jet. */
function Career({ history }: { history: PlayerHistory }) {
  const focus = focusOf(sumLines(history.seasons.map((season) => season.totals)));
  if (!focus) return null;
  const top = Math.max(1, ...history.seasons.map((season) => focus.value(season.totals)));
  const games = history.seasons.reduce((sum, season) => sum + season.games, 0);
  const total = focus.value(sumLines(history.seasons.map((season) => season.totals)));
  return <FocusMoment id="profile-career" label="As a Jet · in the archive"
    heading={<>{history.seasons.length} {history.seasons.length === 1 ? "season" : "seasons"}, {games} {games === 1 ? "game" : "games"}. <em>{n(total)} {focus.unit}.</em></>}>
    <div className={shared.shape}>
      <ol className={styles.bars}>{history.seasons.map((season) => <li key={season.season}>
        <Link href={`/seasons/${season.season}`}>{season.season}</Link>
        <i style={{ width: `${Math.max(0, focus.value(season.totals)) / top * 100}%` }} aria-hidden="true" /><b>{n(focus.value(season.totals))}</b>
        <small>{season.games} {season.games === 1 ? "game" : "games"} · {lineText(season.totals) || "No recorded line"}</small>
        <small>Archive through {archiveCutoff(season)} · checked <time dateTime={season.checkedAt}>{formatCheckedAt(season.checkedAt)}</time></small>
      </li>)}</ol>
      <p className={shared.caption}>Recorded regular season and playoffs, Jets games only, since 1999. Archive totals update separately from the current-season feed and may be missing newer games or corrections.</p>
    </div>
  </FocusMoment>;
}

/** The plays naming the player that most raised the Jets' chance to win. */
function Plays({ history, published }: { history: PlayerHistory; published: Set<string> }) {
  return <FocusMoment id="profile-plays" label="Biggest plays · by Jets win chance"
    heading={<>+{Math.round(history.plays[0].d * 100)}% win chance <em>on a single play.</em></>}>
    <div className={shared.shape}>
      <ol className={styles.plays}>{history.plays.map((play) => <li key={`${play.gameId}-${play.playId}`}>
        <b>+{Math.round(play.d * 100)}%</b>
        <p>{playText(play.desc)}</p>
        <small>{published.has(play.gameId) ? <Link href={`/games/${play.gameId}`}>{play.season} · {when(play)} {where(play)}</Link> : <>{play.season} · {when(play)} {where(play)}</>} · Q{play.q > 4 ? "OT" : play.q}</small>
      </li>)}</ol>
      <p className={shared.caption}>From this site’s play-by-play: the plays that name this player, ranked by how much each raised the Jets’ chance to win.</p>
    </div>
  </FocusMoment>;
}

export default async function PlayerPage({ params }: Props) {
  const { player, coverage, season } = await getProfile((await params).id);
  const [history, games] = await Promise.all([loadPlayerHistory(player.id), loadPublishedGames()]);
  const published = new Set(games.map((game) => game.id));
  // Kickers, punters and snappers have no line here worth a bar (their kicks are not in these stats); their plays still show.
  const bars = !["K", "P", "LS"].includes(player.position);
  const latestFocus = bars && history?.latest ? focusOf(sumLines(history.latest.games)) : null;
  const stats = statsForPlayer(coverage.stats, player.id, season);
  const lines = playerStatLines(stats);
  const statsMessage = playerStatsMessage(coverage.stats, player, season);
  const archiveDiffers = history ? archiveDiffersFromStats(history, player.id, coverage.stats) : false;
  const photo = playerActionPhoto(player.id, season);
  const rosterHref = `/team/roster?${new URLSearchParams({ player: player.id })}#roster`;
  const entries: FocusEntry[] = [
    { id: "player", title: "The player", answer: player.name },
    ...(history?.latest && latestFocus ? [{ id: "profile-games", title: `${history.latest.season} game archive`, answer: `${history.latest.games.length} ${history.latest.games.length === 1 ? "game" : "games"}` }] : []),
    ...(bars && history && history.seasons.length ? [{ id: "profile-career", title: "Jets archive", answer: `${history.seasons.length} ${history.seasons.length === 1 ? "season" : "seasons"}` }] : []),
    ...(history?.plays.length ? [{ id: "profile-plays", title: "Biggest plays", answer: `+${Math.round(history.plays[0].d * 100)}% win chance` }] : []),
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

    {history?.latest && latestFocus ? <Games history={history} published={published} differs={archiveDiffers} /> : null}
    {bars && history && history.seasons.length ? <Career history={history} /> : null}
    {history?.plays.length ? <Plays history={history} published={published} /> : null}

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
