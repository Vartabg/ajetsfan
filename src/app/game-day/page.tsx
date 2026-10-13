import Link from "@/components/IntentLink";
import LivePlays from "@/components/LivePlays";
import CalendarSubscribe from "@/components/CalendarSubscribe";
import FocusMoment from "@/components/FocusMoment";
import FocusNext from "@/components/FocusNext";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import FootballLiveCard, { footballOpponent, showFootballMoment } from "@/components/football-live-card";
import GameDayTicket from "@/components/GameDayTicket";
import LeagueContext from "@/components/LeagueContext";
import Matchup from "@/components/Matchup";
import PlayOut from "@/components/PlayOut";
import SeasonTrend from "@/components/SeasonTrend";
import SundayBriefing from "@/components/SundayBriefing";
import shared from "@/components/Focus.module.css";
import { currentSeasonSummary, divisionPicture, formatCheckedAt, formatDate, nextScheduledGame, recordLabel } from "@/lib/current";
import { placeName, seasonWeeks } from "@/lib/focus";
import { halfGames, ORDINAL, on, record } from "@/lib/focus-format";
import { loadAnalytics, loadCurrent, loadGames } from "@/lib/load-games";
import { loadLeagueHistory } from "@/lib/load-league-history";
import { loadFootballLive } from "@/lib/load-football";
import { editionClock } from "@/lib/live-plays";
import { publishedGames } from "@/lib/published-pages";
import { pageMetadata } from "@/lib/site";
import { teamIdentity } from "@/lib/teams";
import { focusFonts } from "../focus-fonts";
import styles from "./page.module.css";

export const metadata = pageMetadata({ path: "/game-day", title: "Jets Game Day — matchup and schedule", description: "The next Jets matchup, a score prediction you can save, and the current season’s schedule and results." });
export const dynamic = "force-dynamic";

export default async function GameDayPage() {
  const [games, snapshot, rawAnalytics, history, live] = await Promise.all([loadGames(), loadCurrent(), loadAnalytics(), loadLeagueHistory(), loadFootballLive()]);
  const analytics = rawAnalytics?.season === snapshot?.season ? rawAnalytics : null;
  const next = nextScheduledGame(snapshot);
  const summary = currentSeasonSummary(snapshot);
  const liveGame = live && showFootballMoment(live, summary.finals.at(-1)?.id) ? live.featured : null;
  const standings = snapshot?.standings ?? null;
  const picture = divisionPicture(standings);
  const showTies = !!standings?.teams.some((row) => row.ties > 0);
  const showDivisionTies = !!standings?.teams.some((row) => row.divisionTies > 0);
  const reports = new Set(publishedGames(games, snapshot).map((game) => game.id));
  const played = summary.wins + summary.losses + summary.ties;
  const schedule = snapshot?.schedule.filter((game) => game.seasonType === "REG") ?? [];
  const nextGame = next ? { week: next.game.week, postseason: next.game.seasonType === "POST", place: placeName(next.game.opponentDisplay), home: next.game.atHome, date: next.game.date, kickoff: next.game.kickoff, overdue: next.overdue } : null;
  const place = picture && standings ? standings.teams.findIndex((row) => row.team === "NYJ") + 1 : 0;
  // Play it out while regular-season games remain and the playoff counts are published.
  const weeks = seasonWeeks(snapshot);
  const toPlay = weeks?.weeks.filter((week) => week.state === "next" || week.state === "upcoming").length ?? 0;
  const playOut = weeks && toPlay && history?.playoffsByWins.seasons.length ? { season: weeks, ...history.playoffsByWins } : null;

  const entries = [
    liveGame ? { id: "kickoff", title: liveGame.state === "live" && live?.status === "ready" ? "Live game" : "Game update", answer: liveGame.jetsScore !== null && liveGame.oppScore !== null ? `Jets ${liveGame.jetsScore}–${liveGame.oppScore}` : liveGame.detail }
      : nextGame ? { id: "kickoff", title: "Next game", answer: `${nextGame.place}, ${on(nextGame.kickoff ?? `${nextGame.date}T17:00:00Z`, { weekday: "short" })}` } : { id: "kickoff", title: "Next game", answer: "None scheduled" },
    next && snapshot ? { id: "briefing", title: "The matchup", answer: "In numbers" } : null,
    snapshot ? { id: "ticket", title: "Your call", answer: "Call the score" } : null,
    snapshot ? { id: "standings", title: standings?.division ?? "Standings", answer: picture ? (place === 1 ? (picture.atTop > 1 ? "Tied for first" : "First") : `${ORDINAL[place - 1] ?? place}, ${halfGames(picture.back)} back`) : "Pending" } : null,
    snapshot ? { id: "season", title: `${snapshot.season} season`, answer: record(summary.wins, summary.losses, summary.ties) } : null,
    playOut ? { id: "play-out", title: "Play it out", answer: `Pick the last ${toPlay}` } : null,
    analytics ? { id: "league", title: "League context", answer: "Where the Jets sit" } : null,
  ].filter((entry): entry is FocusEntry => entry !== null);

  return <FocusShell page="game-day" entries={entries} checkedAt={snapshot?.checkedAt ?? null} className={focusFonts}>
    {liveGame && live ? <FocusMoment id="kickoff" first label={`${live.status === "retained" ? "Last verified game update" : liveGame.state === "live" ? "Live game" : "Latest game update"} · ${liveGame.seasonType === "POST" ? "Playoffs" : `Week ${liveGame.week}`}`}
      heading={<>Jets {liveGame.atHome ? "vs" : "at"} {footballOpponent(liveGame)}.</>}
      actions={<Link href="/team/stats" className={shared.go}>Game &amp; player numbers <span aria-hidden="true">→</span></Link>}>
      <figure className={shared.shape}>{liveGame.state === "live" ? <LivePlays event={liveGame.eventId} nickname={footballOpponent(liveGame)} us={liveGame.jetsScore} them={liveGame.oppScore} clock={editionClock(liveGame)} />
        : <FootballLiveCard feed={live} id="game-day-football-score" />}</figure>
    </FocusMoment> : nextGame && next ? <FocusNext id="kickoff" first next={nextGame} wins={summary.wins} losses={summary.losses} ties={summary.ties} stakes={false} go={{ href: "#ticket", label: "Make your call" }} />
      : <FocusMoment id="kickoff" first label="Next game" heading="No game on the schedule."><p className={shared.caption}>{snapshot ? "No remaining fixture is listed in this edition." : "The next fixture is unavailable in this edition."}</p></FocusMoment>}

    {next && snapshot ? <FocusMoment id="briefing" hosts>
      <SundayBriefing game={next.game} overdue={next.overdue} snapshot={snapshot} analytics={analytics} />
      <details className={shared.unfold}><summary className="disclosure"><span><span className="when-closed">See every unit number</span><span className="when-open">Hide the unit numbers</span></span></summary><div><Matchup game={next.game} overdue={next.overdue} analytics={analytics} /></div></details>
    </FocusMoment> : null}

    {snapshot ? <FocusMoment id="ticket" hosts>
      <GameDayTicket game={next?.game ?? null} overdue={next?.overdue ?? false} finals={summary.finals} season={snapshot.season} />
    </FocusMoment> : null}

    {snapshot ? <FocusMoment id="standings" label={standings?.division ?? "Standings"}
      heading={!picture ? "Standings are pending." : place === 1 ? <>{picture.atTop > 1 ? "Tied for first" : "First"} <em>in the {picture.division}.</em></> : <>{ORDINAL[place - 1] ?? `No. ${place}`} <em>in the {picture.division}, {halfGames(picture.back)} behind {placeName(picture.leader.team)}.</em></>}>
      {standings ? <div className={styles.standings} data-standings>
        <div className={styles.standingsHead}><h3>{standings.division}</h3><span>Regular season · confirmed finals as of the results check</span></div>
        <div className={styles.standingsScroll}><table>
          <thead><tr><th scope="col">Team</th><th scope="col">Record</th><th scope="col">Division</th><th scope="col"><abbr title="Points for">PF</abbr></th><th scope="col"><abbr title="Points against">PA</abbr></th><th scope="col">Net</th></tr></thead>
          <tbody>{standings.teams.map((row) => {
            const net = row.pointsFor - row.pointsAgainst;
            return <tr key={row.team} className={row.team === "NYJ" ? styles.us : undefined}><th scope="row">{teamIdentity(row.team)?.nickname ?? row.team}</th><td>{recordLabel(row, showTies)}</td><td>{row.divisionWins}–{row.divisionLosses}{showDivisionTies ? `–${row.divisionTies}` : ""}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td><td>{net > 0 ? `+${net}` : net}</td></tr>;
          })}</tbody>
        </table></div>
        <p className={shared.caption}>Ordered by win percentage, then division record, then point differential; the NFL’s full tiebreaking procedure is not applied. Source: the nflverse schedule record.</p>
      </div> : <p className={shared.caption} data-standings-pending>Division standings publish with the next results check.</p>}
    </FocusMoment> : null}

    {snapshot ? <FocusMoment id="season" label={`${snapshot.season} season`} heading={<>{record(summary.wins, summary.losses, summary.ties)} <em>{played ? `after ${played} game${played === 1 ? "" : "s"}.` : "before the opener."}</em></>}
      actions={<CalendarSubscribe season={snapshot.season} />}>
      <div id="season-trend" className={styles.trend}><SeasonTrend games={summary.finals} analysisIds={games.filter((game) => !game.dataSuspect && game.swing != null && game.outcome !== "tie").map((game) => game.id)} /></div>
      <details className={shared.unfold}><summary className="disclosure"><span><span className="when-closed">See the full {snapshot.season} schedule</span><span className="when-open">Hide the {snapshot.season} schedule</span> <small>{schedule.length} games</small></span></summary>
        <ol className={styles.schedule}>{schedule.map((game) => <li key={game.id} data-status={game.status === "final" ? game.outcome : "scheduled"}>
          <span>W{game.week}</span><time dateTime={game.date}>{formatDate(game.date)}</time><strong>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong>
          <span>{game.status === "final" ? `${game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} ${game.jetsScore}–${game.oppScore}` : game.kickoff ? formatCheckedAt(game.kickoff) : "Time TBD"}</span>
          {game.status === "final" && reports.has(game.id) ? <Link href={`/games/${encodeURIComponent(game.id)}`} aria-label={`Week ${game.week} game report`}>Report <span aria-hidden="true">→</span></Link> : <span aria-hidden="true" />}
        </li>)}</ol>
      </details>
    </FocusMoment> : null}

    {playOut ? <PlayOut season={playOut.season} rows={playOut.rows} seasons={playOut.seasons} /> : null}

    {analytics ? <FocusMoment id="league" hosts>
      <LeagueContext analytics={analytics} opponent={next?.game.opponent ?? ""} />
    </FocusMoment> : null}
  </FocusShell>;
}
