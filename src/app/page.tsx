import Link from "next/link";
import { pageMetadata } from "@/lib/site";
import AnalysisStatus from "@/components/AnalysisStatus";

export const metadata = pageMetadata({ path: "/", title: "The Back Page — a Jets fan", description: "Jets results, player statistics, measured game analysis, and a sourced archive. Scores, plays, and probability with the evidence in view." });
import { rank, clockLabel, pct } from "@/lib/games";
import { loadGames, loadCurve, loadCurrent, loadAnalytics } from "@/lib/load-games";
import { currentSeasonSummary, formatCheckedAt, formatDate, nextScheduledGame, selectLead } from "@/lib/current";
import { gameHref } from "@/lib/explorer";
import { keyPlayEvidenceLabel } from "@/lib/morgue";
import { leaders } from "@/lib/coverage";
import { playerHref } from "@/lib/roster";
import { publishedGames, publishedPlayers } from "@/lib/published-pages";
import PressChart from "@/components/PressChart";
import EditorialPhoto from "@/components/EditorialPhoto";
import { gameEditorialPhoto, playerActionPhoto } from "@/lib/editorial-photos";
import DataFreshness from "@/components/DataFreshness";
import FeedStatus from "@/components/FeedStatus";
import Matchup from "@/components/Matchup";
import SeasonTrend from "@/components/SeasonTrend";
import LeagueContext from "@/components/LeagueContext";
import { loadCoverage } from "@/lib/load-coverage";
import NewsDesk from "@/components/NewsDesk";
import SundayBriefing from "@/components/SundayBriefing";
import GameEvidence from "@/components/GameEvidence";
import GameDayTicket from "@/components/GameDayTicket";
import FanStand from "@/components/FanStand";
import VisualGameStory from "@/components/VisualGameStory";
import { buildVisualStory, visualStoryIds, type VisualStory } from "@/lib/visual-story";
import styles from "./page.module.css";

export default async function BackPage() {
  const [games, snapshot, rawAnalytics, coverageFeed] = await Promise.all([loadGames(), loadCurrent(), loadAnalytics(), loadCoverage()]);
  const analytics = rawAnalytics?.season === snapshot?.season ? rawAnalytics : null;
  const lead = selectLead(games, snapshot);
  const caseIds = new Set(publishedGames(games, snapshot).map((game) => game.id));
  const caseHref = (id: string, board: "heartbreak" | "miracle") => caseIds.has(id) ? `/games/${encodeURIComponent(id)}` : gameHref(id, board);
  const profileIds = new Set(publishedPlayers(coverageFeed, snapshot?.season ?? null).map((player) => player.id));
  const result = lead.result;
  const analysis = lead.analysisStatus === "ready" ? lead.analysis : null;
  const gamePhoto = result ? gameEditorialPhoto(result.id) : null;
  const [curve, storyCandidates] = await Promise.all([
    analysis ? loadCurve(analysis.id) : Promise.resolve([]),
    Promise.all(visualStoryIds.map(async (id) => {
      const game = caseIds.has(id) ? games.find((item) => item.id === id) : null;
      return game ? buildVisualStory(game, await loadCurve(id)) : null;
    })),
  ]);
  const visualStories = storyCandidates.filter((story): story is VisualStory => story != null);
  const summary = currentSeasonSummary(snapshot);
  const next = nextScheduledGame(snapshot);
  const heartbreak = rank(games, "heartbreak")[0];
  const miracle = rank(games, "miracle")[0];
  const gameStats = analysis ? analytics?.games.find((game) => game.id === analysis.id) : null;
  const lost = result?.outcome === "loss";
  const tied = result?.outcome === "tie";
  const margin = result ? Math.abs(result.jetsScore - result.oppScore) : 0;
  const headline = !result ? "Jets football." : tied ? "Jets tie." : lost ? "Jets lose." : "Jets win.";
  const resultSummary = !result ? "Current results, roster listings, and recorded statistics are published with their source check times." :
    `${tied ? "A tied final" : `A ${margin}-point ${lost ? "loss" : "win"}`} ${result.atHome ? "at home" : "on the road"}.${analysis ? ` The Jets’ ${lost ? "peak" : "lowest"} second-half win-probability estimate was ${pct(analysis.swing)}.` : " The final score is confirmed; usable win-probability analysis is not available in this edition."}`;
  const pendingTitle = tied ? "A tied final · no probability ranking" : lead.analysisStatus === "suspect" ? "Analysis held for review" :
    lead.analysisStatus === "unavailable" ? "Win probability unavailable" : "Win-probability analysis pending";
  const playHeading = analysis ? `${keyPlayEvidenceLabel(analysis)}.` : "Analysis status.";
  const spotlight = coverageFeed && coverageFeed.stats.status !== "unavailable" && coverageFeed.stats.season === snapshot?.season
    ? leaders(coverageFeed.stats, "receiving", 1)[0] : null;
  const spotlightRoster = spotlight && coverageFeed?.roster.status !== "unavailable" && coverageFeed?.roster.season === snapshot?.season ? coverageFeed?.roster.players.find((player) => player.id === spotlight.id) : null;
  const spotlightPhoto = spotlight ? playerActionPhoto(spotlight.id, snapshot?.season ?? 0) : null;
  const sourcePlay = analysis?.keyPlay.desc?.replace(/^\([^)]*\)\s*/, "").replace(/\b\d{1,2}-(?=[A-Z])/g, "");
  const stories = [
    heartbreak && { game: heartbreak, board: "heartbreak" as const, title: `${pct(heartbreak.swing)} peak. A loss.`, label: "Highest second-half estimate in a loss", closer: "Read the game case" },
    miracle && { game: miracle, board: "miracle" as const, title: `${pct(miracle.swing)} low. A win.`, label: "Lowest second-half estimate in a win", closer: "Read the game case" },
  ].filter((story) => !!story);

  return (
    <main id="main" className={styles.main}>
      {snapshot ? <DataFreshness checkedAt={snapshot.checkedAt} /> : null}
      <nav className={styles.editionNav} aria-label="In this edition"><span>Go straight to</span>{next ? <Link href="#sunday-briefing">Sunday briefing <span aria-hidden="true">↓</span></Link> : null}{snapshot ? <Link href="#season" aria-label="Season and schedule">This season <span aria-hidden="true">↓</span></Link> : null}{visualStories.length ? <Link href="#visual-story">Visual stories <span aria-hidden="true">↓</span></Link> : null}<Link href="/film-room">Film Room <span aria-hidden="true">↗</span></Link><Link href="#fan-stand">Jets history <span aria-hidden="true">↓</span></Link><Link href="/team#news">Jets news <span aria-hidden="true">↗</span></Link><Link href="/team#roster">The roster <span aria-hidden="true">↗</span></Link></nav>
      <article id="latest-game" className={styles.edition}>
        <div className={styles.cover}>
          <div className={styles.editionLine}><p>{lead.kind === "archive" ? "From the archive · no current-season final in this edition" : result ? `Latest final · Week ${result.week}${result.seasonType === "POST" ? " · playoffs" : ""}` : "The current edition"}</p>{result ? <span className={styles.mobileFinal}>NYJ {result.jetsScore} <span aria-hidden="true">—</span> {result.opponentDisplay} {result.oppScore}</span> : null}<span className={styles.readerNote}>Scores. Plays. Probability.</span></div>
          <div className={`${styles.coverBody} ${!result ? styles.copyOnly : !gamePhoto ? styles.scoreOnly : ""}`}>
            <div className={styles.coverCopy}>
              <span className={styles.voiceLabel}>{result ? "Confirmed result" : "Source-led coverage"}</span>
              <h1 className="hed"><span>{headline}</span>{result ? <em>{result.jetsScore}–{result.oppScore}.</em> : null}</h1>
              <p>{resultSummary}</p>
              {result ? <Link href="#postgame" className={styles.coverLink}>Examine the game <span aria-hidden="true">↓</span></Link> : <Link href="/team" className={styles.coverLink}>Current team coverage <span aria-hidden="true">↗</span></Link>}
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
          <div className={styles.playHeading}><span className={styles.kicker}>Play-by-play evidence</span><h2 className="hed">{playHeading}</h2>{analysis?.keyPlay.wpa != null ? <p className={styles.featuredDelta}>{analysis.keyPlay.wpa >= 0 ? "+" : ""}{(analysis.keyPlay.wpa * 100).toFixed(1)}<span>percentage points · Jets win probability</span></p> : null}</div>
          <div className={styles.playCopy}>
            {analysis?.keyPlay.desc ? <><p className={styles.playClock}>{clockLabel(analysis.keyPlay.qtr, analysis.keyPlay.secondsLeft)} · Source play description</p><p className={styles.playDescription}>{sourcePlay}</p><p className={styles.evidenceNote}>Selected by the {lost ? "smallest" : "largest"} Jets win-probability change in the second half. The model’s change is an estimate, not proof that one play determined the result.</p></> : <><p className={styles.playClock}>{pendingTitle}</p><p>The score is confirmed.{tied ? " Ties don’t enter the Heartbreak or Miracle rankings." : lead.analysisStatus === "suspect" ? " The play-by-play needs a score integrity review before publication." : " Usable play-by-play hasn’t arrived in this edition yet."}</p></>}
            <Link href={analysis ? caseHref(analysis.id, lost ? "heartbreak" : "miracle") : "/morgue"} className={styles.underlined}>{analysis ? "Read the game case" : "Visit The Morgue"} <span aria-hidden="true">↗</span></Link>
          </div>
        </div> : null}
        {analysis ? <section className={styles.tapeBody} aria-label="Game probability evidence">
          {curve.length >= 2 ? <figure><figcaption><strong>Win probability, play by play.</strong><span>Jets pre-play model estimate · play sequence</span></figcaption><PressChart points={curve} board={lost ? "heartbreak" : "miracle"} /></figure> : <p>Game curve unavailable in this edition.</p>}
          <p className={styles.evidenceNote}>The marker identifies the {lost ? "highest" : "lowest"} second-half pre-play estimate. The line shows model estimates before recorded plays; it does not extend to an inferred final whistle.</p>
          <AnalysisStatus check={snapshot?.analysisCheck} /><p className={styles.evidenceNote}><a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">Play-by-play source: nflverse<span className="sr-only"> (opens in a new tab)</span></a>{snapshot?.analysisUpdatedAt ? ` · Archive updated ${formatCheckedAt(snapshot.analysisUpdatedAt)}.` : ""} <Link href="/how-made#efficiency">Methods and definitions</Link></p>
        </section> : null}
        {analysis ? <GameEvidence game={analysis} statistics={gameStats ?? null} /> : null}
      </article>
      {snapshot ? <section id="season" className={styles.season} aria-labelledby="season-heading">
        <div className={styles.seasonLine}><div><span className={styles.kicker}>The story so far</span><h2 id="season-heading" className="hed">The {snapshot.season} season</h2></div><p><strong>{summary.wins}–{summary.losses}{summary.ties ? `–${summary.ties}` : ""}</strong><span>Regular season · confirmed finals</span></p></div>
        <div className={styles.sundays}>
          <div className={styles.recent}><h3>Recent confirmed results</h3>{summary.recent.length ? <ol>{summary.recent.slice(0, 3).map((game) => {
            const analyzed = games.find((item) => item.id === game.id && !item.dataSuspect && item.swing != null && item.date === game.date && item.outcome === game.outcome && item.jetsScore === game.jetsScore && item.oppScore === game.oppScore);
            return <li key={game.id}><span className={`${styles.resultLetter} ${game.outcome === "win" ? styles.win : ""}`}>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"}</span><small>Week {game.week}</small><strong>NYJ {game.jetsScore} <span>—</span> {game.opponentDisplay} {game.oppScore}</strong>{analyzed ? <Link href={caseHref(game.id, game.outcome === "win" ? "miracle" : "heartbreak")} aria-label={`Explore Week ${game.week} against ${game.opponentDisplay}`}>↗</Link> : <small>{game.outcome === "tie" ? "Tie" : "Analysis pending"}</small>}</li>;
          })}</ol> : <p>No regular-season final in this edition.</p>}</div>
          <div className={styles.nextSunday}><span className={styles.ticketMark} aria-hidden="true">Next fixture</span><span className={styles.kicker}>On the checked schedule</span>{next ? <><h3 className="hed">Jets {next.game.atHome ? "vs" : "at"} {next.game.opponentDisplay}</h3><p>Week {next.game.week} · <time dateTime={next.game.date}>{formatDate(next.game.date)}</time></p><p className={styles.kickoff}>{next.game.kickoff ? formatCheckedAt(next.game.kickoff) : "Kickoff time to be confirmed"}</p>{next.overdue ? <p>Kickoff has passed as of the results check; a final is not confirmed.</p> : null}</> : <><h3 className="hed">Next fixture unavailable.</h3><p>No remaining fixture listed in this edition.</p></>}</div>
        </div>
        <SeasonTrend games={summary.finals} analysisIds={games.filter((game) => !game.dataSuspect && game.swing != null && game.outcome !== "tie").map((game) => game.id)} />
        {next ? <SundayBriefing game={next.game} overdue={next.overdue} snapshot={snapshot} analytics={analytics} /> : null}
        <GameDayTicket game={next?.game ?? null} overdue={next?.overdue ?? false} finals={summary.finals} season={snapshot.season} />
        <details className={styles.schedule}><summary className="disclosure"><span className={styles.summaryCopy}><span className="when-closed">See the full {snapshot.season} schedule</span><span className="when-open">Hide the {snapshot.season} schedule</span><small>{snapshot.schedule.filter((game) => game.seasonType === "REG").length} games</small></span></summary><ol>{snapshot.schedule.filter((game) => game.seasonType === "REG").map((game) => <li key={game.id}><span>W{game.week}</span><time dateTime={game.date}>{formatDate(game.date)}</time><strong>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><span>{game.status === "final" ? `${game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} ${game.jetsScore}–${game.oppScore}` : game.kickoff ? formatCheckedAt(game.kickoff) : "Time TBD"}</span></li>)}</ol></details>
      </section> : null}
      <section className={styles.morgue} aria-labelledby="morgue-heading">
        <div className={styles.morgueHeading}><div><p className={styles.kicker}>The Morgue · the game archive</p><h2 id="morgue-heading" className="hed">The result.<br /><span>The evidence.</span></h2><p>Losses ranked by peak second-half win-probability estimate. Wins ranked by the lowest. The final score is a fact; probability is a model.</p></div><Link href="/morgue" className={styles.morgueDoor}>Enter <br />The Morgue <span aria-hidden="true">↗</span></Link></div>
        <div className={styles.obituaries}>{stories.map(({ game, board, title, label, closer }) => <Link key={game.id} className={`${styles.obituary} ${board === "miracle" ? styles.signOfLife : ""}`} href={caseHref(game.id, board)}>
          <p className={styles.obitLabel}>{label}</p><h3 className="hed">{title}</h3><p className={styles.obitScore}>NYJ {game.jetsScore} <span>—</span> {game.opponentDisplay} {game.oppScore}{game.wentToOt ? " / OT" : ""}</p><small>{formatDate(game.date)} · Week {game.week}</small><p className={styles.obitFoot}><span>{closer}</span><span aria-hidden="true">↗</span></p>
        </Link>)}</div>
      </section>
      {visualStories.length ? <VisualGameStory stories={visualStories} /> : null}
      <section className={styles.filmInvitation} aria-labelledby="film-invitation-heading"><div><p className={styles.kicker}>The new Film Room</p><h2 id="film-invitation-heading" className="hed">Watch it again.<br /><span>See more.</span></h2><p>Wilson in Cleveland. Jumbo against Miami. Thanksgiving, 2012. Official replays, verified situations and the questions that turn a highlight into a football study.</p><Link href="/film-room">Enter the Film Room <span aria-hidden="true">↗</span></Link></div><div className={styles.filmIndex}><span>Inside the notebook</span><p><strong>04</strong> selected plays</p><p><strong>05</strong> coverage families</p><small>Work through rushers, leverage and throwing windows on the independent teaching board.</small></div></section>
      <FanStand games={games} snapshot={snapshot} />
      <div className={styles.touchline}>
        {spotlight ? <section className={styles.player} aria-labelledby="player-heading"><span className={styles.kicker}>Receiving production</span>{spotlightPhoto ? <EditorialPhoto photo={spotlightPhoto} sizes="(max-width: 640px) calc(100vw - 32px), 300px" className={styles.spotlightPhoto} /> : <p className={styles.jerseyNumber}>{spotlightRoster?.jersey ? `No. ${spotlightRoster.jersey}` : spotlight.position}</p>}<h2 id="player-heading" className="hed">{spotlight.name}</h2><p>{spotlight.receiving.receptions} receptions. {spotlight.receiving.yards.toLocaleString("en-US")} yards. {spotlight.receiving.touchdowns} receiving TD.</p><small>{coverageFeed!.stats.season} receiving leader by yards · {spotlight.games} recorded games{coverageFeed!.stats.throughWeek != null ? ` · through Week ${coverageFeed!.stats.throughWeek}` : ""}</small><Link className={styles.underlined} href={profileIds.has(spotlight.id) ? `/players/${encodeURIComponent(spotlight.id)}` : spotlightRoster ? playerHref(spotlight.id) : "/team#season-leaders"}>Player profile and statistics <span aria-hidden="true">↗</span></Link><FeedStatus feed={coverageFeed!.stats} label="Player statistics" /></section> : null}
        {coverageFeed ? <NewsDesk feed={coverageFeed.news} limit={3} compact /> : null}
      </div>
      {snapshot ? <details className={styles.filmRoom}><summary className="disclosure"><span><span className="when-closed">Open league and unit comparisons</span><span className="when-open">Close league and unit comparisons</span><small>Data analysis · Unit matchups &amp; league context</small></span></summary><div>{next ? <Matchup game={next.game} overdue={next.overdue} analytics={analytics} /> : null}{analytics ? <LeagueContext analytics={analytics} opponent={next?.game.opponent ?? ""} /> : null}</div></details> : null}
      <section className={styles.freshness} aria-label="Data freshness"><span>{snapshot ? `${snapshot.season} edition` : "The analyzed archive"}</span><span>{snapshot ? <>Results checked <time dateTime={snapshot.checkedAt}>{formatCheckedAt(snapshot.checkedAt)}</time></> : "Current-season results unavailable in this edition."}</span><Link href="/how-made">Sources &amp; how it works</Link></section>
    </main>
  );
}
