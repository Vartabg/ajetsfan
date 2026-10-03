import Link from "@/components/IntentLink";
import { loadGames, loadCurrent, loadAnalytics } from "@/lib/load-games";
import { currentSeasonSummary, formatCheckedAt, formatDate, nextScheduledGame, recordLabel } from "@/lib/current";
import { publishedGames } from "@/lib/published-pages";
import { gameHref } from "@/lib/explorer";
import { pageMetadata } from "@/lib/site";
import { teamColor, teamIdentity, teamName } from "@/lib/teams";
import type { CSSProperties } from "react";
import SundayBriefing from "@/components/SundayBriefing";
import SeasonTrend from "@/components/SeasonTrend";
import GameDayTicket from "@/components/GameDayTicket";
import Matchup from "@/components/Matchup";
import LeagueContext from "@/components/LeagueContext";
import ExploreHeader from "@/components/ExploreHeader";
import styles from "../page.module.css";
export const metadata = pageMetadata({ path: "/game-day", title: "Jets Game Day — matchup and schedule", description: "The next Jets matchup, a score prediction you can save, and the current season’s schedule and results." });
export default async function GameDayPage() {
  const [games, snapshot, rawAnalytics] = await Promise.all([loadGames(), loadCurrent(), loadAnalytics()]);
  const analytics = rawAnalytics?.season === snapshot?.season ? rawAnalytics : null;
  const next = nextScheduledGame(snapshot);
  const summary = currentSeasonSummary(snapshot);
  const standings = snapshot?.standings ?? null;
  const showTies = !!standings?.teams.some((row) => row.ties > 0);
  const showDivisionTies = !!standings?.teams.some((row) => row.divisionTies > 0);
  const caseIds = new Set(publishedGames(games, snapshot).map((game) => game.id));
  const caseHref = (id: string, board: "heartbreak" | "miracle") => caseIds.has(id) ? `/games/${encodeURIComponent(id)}` : gameHref(id, board);
  return <main id="main" className={styles.main}>
    <ExploreHeader title="Game day." description="The matchup. Your call. The season so far." />
    {snapshot ? <>
        {next ? <SundayBriefing game={next.game} overdue={next.overdue} snapshot={snapshot} analytics={analytics} /> : null}
        <GameDayTicket game={next?.game ?? null} overdue={next?.overdue ?? false} finals={summary.finals} season={snapshot.season} />
    </> : <p>The next fixture is unavailable in this edition.</p>}
      {snapshot ? <section id="season" className={styles.season} aria-labelledby="season-heading">
        <div className={styles.seasonLine}><div><span className={styles.kicker}>The story so far</span><h2 id="season-heading" className="hed">The {snapshot.season} season</h2></div><p><strong>{summary.wins}–{summary.losses}{summary.ties ? `–${summary.ties}` : ""}</strong><span>Regular season · confirmed finals</span></p></div>
        <div className={styles.sundays}>
          <div className={styles.recent}><h3>Recent confirmed results</h3>{summary.recent.length ? <ol>{summary.recent.slice(0, 3).map((game) => {
            const analyzed = games.find((item) => item.id === game.id && !item.dataSuspect && item.swing != null && item.date === game.date && item.outcome === game.outcome && item.jetsScore === game.jetsScore && item.oppScore === game.oppScore);
            return <li key={game.id}><span className={`${styles.resultLetter} ${game.outcome === "win" ? styles.win : ""}`}>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"}</span><small>Week {game.week}</small><strong>NYJ {game.jetsScore} <span>—</span> {game.opponentDisplay} {game.oppScore}</strong>{analyzed ? <Link href={caseHref(game.id, game.outcome === "win" ? "miracle" : "heartbreak")} aria-label={`Explore Week ${game.week} against ${game.opponentDisplay}`}>↗</Link> : <small>{game.outcome === "tie" ? "Tie" : "Analysis pending"}</small>}</li>;
          })}</ol> : <p>No regular-season final in this edition.</p>}</div>
          <div className={styles.nextSunday} style={next ? { "--rival": teamColor(next.game.opponentDisplay), "--rival-2": teamColor(next.game.opponentDisplay, 1) } as CSSProperties : undefined}><span className={styles.ticketMark} aria-hidden="true">Next fixture</span><span className={styles.kicker}>On the checked schedule</span>{next ? <><h3 className="hed">Jets {next.game.atHome ? "vs" : "at"} {next.game.opponentDisplay}</h3><p className={styles.rival}>{teamName(next.game.opponentDisplay)}</p><p>Week {next.game.week} · <time dateTime={next.game.date}>{formatDate(next.game.date)}</time></p><p className={styles.kickoff}>{next.game.kickoff ? formatCheckedAt(next.game.kickoff) : "Kickoff time to be confirmed"}</p>{next.overdue ? <p>Kickoff has passed as of the results check; a final is not confirmed.</p> : null}</> : <><h3 className="hed">Next fixture unavailable.</h3><p>No remaining fixture listed in this edition.</p></>}</div>
        </div>
        {standings ? <div id="standings" className={styles.standings} data-standings>
          <div className={styles.standingsHead}><h3>{standings.division}</h3><span>Regular season · confirmed finals as of the results check</span></div>
          <div className={styles.standingsScroll}><table>
            <thead><tr><th scope="col">Team</th><th scope="col">Record</th><th scope="col">Division</th><th scope="col"><abbr title="Points for">PF</abbr></th><th scope="col"><abbr title="Points against">PA</abbr></th><th scope="col">Net</th></tr></thead>
            <tbody>{standings.teams.map((row) => {
              const net = row.pointsFor - row.pointsAgainst;
              return <tr key={row.team} className={row.team === "NYJ" ? styles.us : undefined} style={{ "--rival": teamColor(row.team), "--rival-2": teamColor(row.team, 1) } as CSSProperties}><th scope="row"><i className={styles.swatch} aria-hidden="true" />{teamIdentity(row.team)?.nickname ?? row.team}</th><td>{recordLabel(row, showTies)}</td><td>{row.divisionWins}–{row.divisionLosses}{showDivisionTies ? `–${row.divisionTies}` : ""}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td><td>{net > 0 ? `+${net}` : net}</td></tr>;
            })}</tbody>
          </table></div>
          <p className={styles.standingsNote}>Ordered by win percentage, then division record, then point differential; the NFL’s full tiebreaking procedure is not applied. Source: the nflverse schedule record.</p>
        </div> : <p className={`${styles.standingsNote} ${styles.standingsPending}`} data-standings-pending>Division standings publish with the next results check.</p>}
        <div id="season-trend"><SeasonTrend games={summary.finals} analysisIds={games.filter((game) => !game.dataSuspect && game.swing != null && game.outcome !== "tie").map((game) => game.id)} /></div>


        <details className={styles.schedule}><summary className="disclosure"><span className={styles.summaryCopy}><span className="when-closed">See the full {snapshot.season} schedule</span><span className="when-open">Hide the {snapshot.season} schedule</span><small>{snapshot.schedule.filter((game) => game.seasonType === "REG").length} games</small></span></summary><ol>{snapshot.schedule.filter((game) => game.seasonType === "REG").map((game) => <li key={game.id}><span>W{game.week}</span><time dateTime={game.date}>{formatDate(game.date)}</time><strong>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><span>{game.status === "final" ? `${game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} ${game.jetsScore}–${game.oppScore}` : game.kickoff ? formatCheckedAt(game.kickoff) : "Time TBD"}</span></li>)}</ol></details>
      </section> : null}
      {snapshot ? <details className={styles.filmRoom}><summary className="disclosure"><span><span className="when-closed">Open league and unit comparisons</span><span className="when-open">Close league and unit comparisons</span><small>Data analysis · Unit matchups &amp; league context</small></span></summary><div>{next ? <Matchup game={next.game} overdue={next.overdue} analytics={analytics} /> : null}{analytics ? <LeagueContext analytics={analytics} opponent={next?.game.opponent ?? ""} /> : null}</div></details> : null}
  </main>;
}
