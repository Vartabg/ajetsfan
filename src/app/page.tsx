import Link from "next/link";
import { rank, clockLabel, pct } from "@/lib/games";
import { loadGames, loadCurve, loadCurrent, loadAnalytics } from "@/lib/load-games";
import { currentSeasonSummary, formatCheckedAt, formatDate, nextScheduledGame, selectLead } from "@/lib/current";
import { gameHref } from "@/lib/explorer";
import { epaLabel } from "@/lib/analytics";
import { leaders } from "@/lib/coverage";
import { playerHref } from "@/lib/roster";
import PressChart from "@/components/PressChart";
import EditorialPhoto from "@/components/EditorialPhoto";
import { gameEditorialPhoto, playerActionPhoto } from "@/lib/editorial-photos";
import DataFreshness from "@/components/DataFreshness";
import FeedStatus from "@/components/FeedStatus";
import Matchup from "@/components/Matchup";
import SeasonTrend from "@/components/SeasonTrend";
import { loadCoverage } from "@/lib/load-coverage";
import NewsDesk from "@/components/NewsDesk";
import SundayBriefing from "@/components/SundayBriefing";
import styles from "./page.module.css";

export default async function BackPage() {
  const [games, snapshot, rawAnalytics, coverageFeed] = await Promise.all([loadGames(), loadCurrent(), loadAnalytics(), loadCoverage()]);
  const analytics = rawAnalytics?.season === snapshot?.season ? rawAnalytics : null;
  const lead = selectLead(games, snapshot);
  const result = lead.result;
  const analysis = lead.analysisStatus === "ready" ? lead.analysis : null;
  const gamePhoto = result ? gameEditorialPhoto(result.id) : null;
  const curve = analysis ? await loadCurve(analysis.id) : [];
  const summary = currentSeasonSummary(snapshot);
  const next = nextScheduledGame(snapshot);
  const heartbreak = rank(games, "heartbreak")[0];
  const miracle = rank(games, "miracle")[0];
  const gameStats = analysis ? analytics?.games.find((game) => game.id === analysis.id) : null;
  const lost = result?.outcome === "loss";
  const tied = result?.outcome === "tie";
  const margin = result ? Math.abs(result.jetsScore - result.oppScore) : 0;
  const sunday = result ? new Date(`${result.date}T12:00:00Z`).getUTCDay() === 0 : false;
  const kickoff = result ? snapshot?.schedule.find((game) => game.id === result.id)?.kickoff : null;
  const afternoon = kickoff ? Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Chicago" }).format(new Date(kickoff))) < 17 : false;
  const headline = !result ? "Sunday can’t come soon enough." : tied ? "Nobody won. We all watched." : lost
    ? margin <= 8 ? `Close enough to ruin ${sunday && afternoon ? "the afternoon" : sunday ? "your Sunday" : "game day"}.` : `Well. There goes ${sunday ? "Sunday" : "game day"}.`
    : margin <= 8 ? "Exhale. We actually won." : "Enjoy this one.";
  const pendingTitle = tied ? "A tied final · no probability ranking" : lead.analysisStatus === "suspect" ? "Analysis held for review" :
    lead.analysisStatus === "unavailable" ? "Win probability unavailable" : "Win-probability analysis pending";
  const headlinePivot = headline.startsWith("Close enough ") ? "Close enough" : null;
  const spotlight = coverageFeed && coverageFeed.stats.status !== "unavailable" && coverageFeed.stats.season === snapshot?.season
    ? leaders(coverageFeed.stats, "receiving", 1)[0] : null;
  const spotlightRoster = spotlight && coverageFeed?.roster.status !== "unavailable" && coverageFeed?.roster.season === snapshot?.season ? coverageFeed?.roster.players.find((player) => player.id === spotlight.id) : null;
  const spotlightPhoto = spotlight ? playerActionPhoto(spotlight.id, snapshot?.season ?? 0) : null;
  const sourcePlay = analysis?.keyPlay.desc?.replace(/^\([^)]*\)\s*/, "").replace(/\b\d{1,2}-(?=[A-Z])/g, "");
  const touchdown = sourcePlay?.match(/\b([A-Z]\.[A-Za-z’'\-]+) pass\b.*?\bto ([A-Z]\.[A-Za-z’'\-]+) for (\d+) yards, TOUCHDOWN/);
  const playStory = touchdown ? `${touchdown[1].split(".")[1]} found ${touchdown[2].split(".")[1]} for a touchdown from ${touchdown[3]} yards out.` : sourcePlay;
  const stories = [
    heartbreak && { game: heartbreak, board: "heartbreak" as const, title: "We had already started the victory speech.", label: "Departed: one perfectly good Sunday", closer: "Reopen the case" },
    miracle && { game: miracle, board: "miracle" as const, title: "Occasional signs of life.", label: "The reason we keep coming back", closer: "Remember how this felt" },
  ].filter((story) => !!story);

  return (
    <main id="main" className={styles.main}>
      {snapshot ? <DataFreshness checkedAt={snapshot.checkedAt} /> : null}
      <nav className={styles.editionNav} aria-label="In this edition"><span>Go straight to</span>{next ? <Link href="#sunday-briefing">Sunday briefing <span aria-hidden="true">↓</span></Link> : null}{snapshot ? <Link href="#season" aria-label="Season and schedule">This season <span aria-hidden="true">↓</span></Link> : null}<Link href="/team#news">Jets news <span aria-hidden="true">↗</span></Link><Link href="/team#roster">The roster <span aria-hidden="true">↗</span></Link></nav>
      <article id="latest-game" className={styles.edition}>
        <div className={styles.cover}>
          <div className={styles.editionLine}><p>{lead.kind === "archive" ? "From the archive · no current-season final in this edition" : result ? `Latest final · Week ${result.week}${result.seasonType === "POST" ? " · playoffs" : ""}` : "The next chapter"}</p>{result ? <span className={styles.mobileFinal}>NYJ {result.jetsScore} <span aria-hidden="true">—</span> {result.opponentDisplay} {result.oppScore}</span> : null}<span className={styles.readerNote}>For those of us still watching</span></div>
          <div className={`${styles.coverBody} ${!result ? styles.copyOnly : !gamePhoto ? styles.scoreOnly : ""}`}>
            <div className={styles.coverCopy}>
              <span className={styles.voiceLabel}>Fan reaction</span>
              <h1 className="hed">{headlinePivot ? <><span>{headlinePivot}</span><em>{headline.slice(headlinePivot.length)}</em></> : headline}</h1>
              <p>{!result ? "The jersey is ready. The optimism is questionable. We’ll be here when the football starts." : tied ? "All that football, and we’re still waiting for an answer. The final counts. The feeling is harder to explain." : lost ? `${margin === 1 ? "One point" : `${margin} points`} short. Plenty to replay. That’s the deal when you love this team: you take it personally, then show up again.` : "Keep the jersey on. Let the group chat have its moment. Some Sundays remind you why you put yourself through the other ones."}</p>
              {result ? <Link href="#postgame" className={styles.coverLink}>{lost ? "How it got away" : "Relive the afternoon"} <span aria-hidden="true">↓</span></Link> : <Link href="/team" className={styles.coverLink}>Meet this year’s Jets <span aria-hidden="true">↗</span></Link>}
            </div>
            <div className={styles.coverVisual}>{gamePhoto ? <EditorialPhoto photo={gamePhoto} sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 900px) calc(55vw - 2.6125rem), (max-width: 1288px) calc(55vw - 3.3rem), 656px" eager /> : null}
            {result ? <div className={styles.scoreboard} aria-label={`Final score: Jets ${result.jetsScore}, ${result.opponentDisplay} ${result.oppScore}`}>
              <span className={styles.finalLabel}>Final{analysis?.wentToOt ? " / OT" : ""}</span>
              <div className={styles.scoreRow}><b>NYJ</b><strong>{result.jetsScore}</strong></div>
              <div className={styles.scoreRow}><b>{result.opponentDisplay}</b><strong>{result.oppScore}</strong></div>
              <p className="sr-only">Jets {result.jetsScore}, {result.opponentDisplay} {result.oppScore}</p>
              <time dateTime={result.date}>{formatDate(result.date)}</time>
              <small>{result.atHome ? "At home" : "On the road"}</small>
            </div> : null}</div>
          </div>
        </div>
        {result ? <div id="postgame" className={styles.postgame}>
          <div className={styles.playHeading}><span className={styles.kicker}>After the whistle</span><h2 className="hed">{lost ? "The play that hurt." : tied ? "The afternoon, on tape." : "The play that mattered."}</h2></div>
          <div className={styles.playCopy}>
            {analysis?.keyPlay.desc ? <><p className={styles.playClock}>{clockLabel(analysis.keyPlay.qtr, analysis.keyPlay.secondsLeft)} · {lost ? "Biggest second-half setback" : "Biggest second-half boost"}</p><p className={styles.playDescription}>{playStory}</p></> : <><p className={styles.playClock}>{pendingTitle}</p><p>The score is confirmed.{tied ? " Ties don’t enter the Heartbreak or Miracle rankings." : lead.analysisStatus === "suspect" ? " The play-by-play needs a score integrity review before we can tell the rest of the story." : " Usable play-by-play hasn’t arrived in this edition yet."}</p></>}
            <Link href={analysis ? gameHref(analysis.id, lost ? "heartbreak" : "miracle") : "/morgue"} className={styles.underlined}>{analysis ? "Watch the whole game turn" : "Visit The Morgue"} <span aria-hidden="true">↗</span></Link>
          </div>
        </div> : null}
        {analysis ? <details className={styles.tape}><summary className="disclosure"><span className={styles.summaryCopy}><span className="when-closed">Show me every swing</span><span className="when-open">Hide the game tape</span><small>Win probability &amp; game numbers</small></span></summary><div className={styles.tapeBody}>
          {curve.length >= 2 ? <figure><figcaption><strong>Where it turned.</strong><span>Jets pre-play win probability · play sequence</span></figcaption><PressChart points={curve} board={lost ? "heartbreak" : "miracle"} /></figure> : <p>Game curve unavailable in this edition.</p>}
          <div className={styles.tapeNotes}><p><b>{pct(analysis.swing)}</b>{lost ? "Peak" : "Lowest"} second-half chance to win</p>{analysis.keyPlay.wpa != null ? <p><b>{analysis.keyPlay.wpa >= 0 ? "+" : ""}{(analysis.keyPlay.wpa * 100).toFixed(1)} pp</b>Change on the featured play</p> : null}{gameStats ? <p><b>{epaLabel(gameStats.offense.epaPerPlay)}</b>Game offense EPA / play</p> : null}</div>
          {sourcePlay ? <p className={styles.sourcePlay}><b>Source play:</b> {sourcePlay}</p> : null}
          <small>Model estimates from play-by-play, not a measure of how much it hurt.{snapshot?.analysisUpdatedAt ? ` Analysis updated ${formatCheckedAt(snapshot.analysisUpdatedAt)}.` : ""}</small>
        </div></details> : null}
      </article>
      {snapshot ? <section id="season" className={styles.season} aria-labelledby="season-heading">
        <div className={styles.seasonLine}><div><span className={styles.kicker}>The story so far</span><h2 id="season-heading" className="hed">The {snapshot.season} season</h2></div><p><strong>{summary.wins}–{summary.losses}{summary.ties ? `–${summary.ties}` : ""}</strong><span>Regular season · confirmed finals</span></p></div>
        <div className={styles.sundays}>
          <div className={styles.recent}><h3>Last time we put the jersey on</h3>{summary.recent.length ? <ol>{summary.recent.slice(0, 3).map((game) => {
            const analyzed = games.find((item) => item.id === game.id && !item.dataSuspect && item.swing != null && item.date === game.date && item.outcome === game.outcome && item.jetsScore === game.jetsScore && item.oppScore === game.oppScore);
            return <li key={game.id}><span className={`${styles.resultLetter} ${game.outcome === "win" ? styles.win : ""}`}>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"}</span><small>Week {game.week}</small><strong>NYJ {game.jetsScore} <span>—</span> {game.opponentDisplay} {game.oppScore}</strong>{analyzed ? <Link href={gameHref(game.id, game.outcome === "win" ? "miracle" : "heartbreak")} aria-label={`Explore Week ${game.week} against ${game.opponentDisplay}`}>↗</Link> : <small>{game.outcome === "tie" ? "Tie" : "Analysis pending"}</small>}</li>;
          })}</ol> : <p>No regular-season final in this edition.</p>}</div>
          <div className={styles.nextSunday}><span className={styles.ticketMark} aria-hidden="true">Same seat. Same hope.</span><span className={styles.kicker}>And yes, we’re watching again</span>{next ? <><h3 className="hed">Jets {next.game.atHome ? "vs" : "at"} {next.game.opponentDisplay}</h3><p>Week {next.game.week} · <time dateTime={next.game.date}>{formatDate(next.game.date)}</time></p><p className={styles.kickoff}>{next.game.kickoff ? formatCheckedAt(next.game.kickoff) : "Kickoff time to be confirmed"}</p>{next.overdue ? <p>Kickoff has passed as of the results check; a final is not confirmed.</p> : null}</> : <><h3 className="hed">Waiting on the next fixture.</h3><p>No remaining fixture listed in this edition.</p></>}</div>
        </div>
        {next ? <SundayBriefing game={next.game} overdue={next.overdue} snapshot={snapshot} analytics={analytics} /> : null}
        <details className={styles.schedule}><summary className="disclosure"><span className={styles.summaryCopy}><span className="when-closed">See the full {snapshot.season} schedule</span><span className="when-open">Hide the {snapshot.season} schedule</span><small>{snapshot.schedule.filter((game) => game.seasonType === "REG").length} games</small></span></summary><ol>{snapshot.schedule.filter((game) => game.seasonType === "REG").map((game) => <li key={game.id}><span>W{game.week}</span><time dateTime={game.date}>{formatDate(game.date)}</time><strong>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><span>{game.status === "final" ? `${game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} ${game.jetsScore}–${game.oppScore}` : game.kickoff ? formatCheckedAt(game.kickoff) : "Time TBD"}</span></li>)}</ol></details>
      </section> : null}
      <section className={styles.morgue} aria-labelledby="morgue-heading">
        <div className={styles.morgueHeading}><div><p className={styles.kicker}>The Morgue · visiting hours are always open</p><h2 id="morgue-heading" className="hed">You remember these.<br /><span>Unfortunately.</span></h2><p>The losses we still talk about. The wins that briefly cured us.</p></div><Link href="/morgue" className={styles.morgueDoor}>Enter <br />The Morgue <span aria-hidden="true">↗</span></Link></div>
        <div className={styles.obituaries}>{stories.map(({ game, board, title, label, closer }) => <Link key={game.id} className={`${styles.obituary} ${board === "miracle" ? styles.signOfLife : ""}`} href={gameHref(game.id, board)}>
          <p className={styles.obitLabel}>{label}</p><h3 className="hed">{title}</h3><p className={styles.obitScore}>NYJ {game.jetsScore} <span>—</span> {game.opponentDisplay} {game.oppScore}{game.wentToOt ? " / OT" : ""}</p><small>{formatDate(game.date)} · Week {game.week}</small><p className={styles.obitFoot}><span>{closer}</span><span aria-hidden="true">↗</span></p>
        </Link>)}</div>
      </section>
      <div className={styles.touchline}>
        {spotlight ? <section className={styles.player} aria-labelledby="player-heading"><span className={styles.kicker}>Someone to shout for</span>{spotlightPhoto ? <EditorialPhoto photo={spotlightPhoto} sizes="(max-width: 640px) calc(100vw - 32px), 300px" className={styles.spotlightPhoto} /> : <p className={styles.jerseyNumber}>{spotlightRoster?.jersey ? `No. ${spotlightRoster.jersey}` : spotlight.position}</p>}<h2 id="player-heading" className="hed">{spotlight.name}</h2><p>{spotlight.receiving.receptions} catches. {spotlight.receiving.yards.toLocaleString("en-US")} yards. {spotlight.receiving.touchdowns} receiving TD.</p><small>{coverageFeed!.stats.season} receiving leader by yards · {spotlight.games} recorded games{coverageFeed!.stats.throughWeek != null ? ` · through Week ${coverageFeed!.stats.throughWeek}` : ""}</small><Link className={styles.underlined} href={spotlightRoster ? playerHref(spotlight.id) : "/team#season-leaders"}>Meet the man in the jersey <span aria-hidden="true">↗</span></Link><FeedStatus feed={coverageFeed!.stats} label="Player statistics" /></section> : null}
        {coverageFeed ? <NewsDesk feed={coverageFeed.news} limit={3} compact /> : null}
      </div>
      {snapshot ? <details className={styles.filmRoom}><summary className="disclosure"><span><span className="when-closed">Open the film room</span><span className="when-open">Close the film room</span><small>Data analysis · Matchup, team efficiency &amp; the season in margins</small></span></summary><div>{next ? <Matchup game={next.game} overdue={next.overdue} analytics={analytics} /> : null}<SeasonTrend games={summary.finals} /></div></details> : null}
      <section className={styles.freshness} aria-label="Data freshness"><span>{snapshot ? `${snapshot.season} edition` : "The analyzed archive"}</span><span>{snapshot ? <>Results checked <time dateTime={snapshot.checkedAt}>{formatCheckedAt(snapshot.checkedAt)}</time></> : "Current-season results unavailable in this edition."}</span><Link href="/how-made">Sources &amp; how it works</Link></section>
    </main>
  );
}
