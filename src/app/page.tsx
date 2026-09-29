import Image from "next/image";
import Link from "next/link";
import { rank, clockLabel, pct } from "@/lib/games";
import { loadGames, loadCurve, loadCurrent, loadAnalytics } from "@/lib/load-games";
import { archiveCoverage, currentSeasonSummary, formatCheckedAt, formatDate, mergeResults, nextScheduledGame, selectLead } from "@/lib/current";
import { currentStreak } from "@/lib/paper";
import { gameHref } from "@/lib/explorer";
import { epaLabel } from "@/lib/analytics";
import PressChart from "@/components/PressChart";
import DataFreshness from "@/components/DataFreshness";
import Matchup from "@/components/Matchup";
import SeasonTrend from "@/components/SeasonTrend";
import styles from "./page.module.css";

export default async function BackPage() {
  const [games, snapshot, rawAnalytics] = await Promise.all([loadGames(), loadCurrent(), loadAnalytics()]);
  const analytics = rawAnalytics?.season === snapshot?.season ? rawAnalytics : null;
  const streak = currentStreak(mergeResults(games, snapshot));
  const lead = selectLead(games, snapshot);
  const result = lead.result;
  const analysis = lead.analysisStatus === "ready" ? lead.analysis : null;
  const curve = analysis ? await loadCurve(analysis.id) : [];
  const summary = currentSeasonSummary(snapshot);
  const next = nextScheduledGame(snapshot);
  const coverage = archiveCoverage(games);
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");
  const jets = analytics?.teams.find((team) => team.team === "NYJ");
  const gameStats = analysis ? analytics?.games.find((game) => game.id === analysis.id) : null;
  const lost = result?.outcome === "loss";
  const tied = result?.outcome === "tie";
  const headline = !analysis ? "The result is in." : lost
    ? (analysis.swing! >= .9 ? "Almost certain. Still a loss." : "The aftermath.")
    : (analysis.swing! <= .1 ? "Almost impossible. Still a win." : "A win worth reading.");
  const pendingTitle = tied ? "A tied final · no probability ranking" : lead.analysisStatus === "suspect" ? "Analysis held for review" :
    lead.analysisStatus === "unavailable" ? "Win probability unavailable" : "Win-probability analysis pending";
  const latestAnalyzed = games.filter((game) => !game.dataSuspect && game.swing != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const stories = [
    heartbreak[0] && { game: heartbreak[0], board: "heartbreak" as const, title: "The one that got away.", tag: "Biggest heartbreak" },
    miracle[0] && { game: miracle[0], board: "miracle" as const, title: "Never count them out.", tag: "Most improbable win" },
    latestAnalyzed && { game: latestAnalyzed, board: latestAnalyzed.outcome === "win" ? "miracle" as const : "heartbreak" as const, title: "The latest chapter.", tag: "Latest analyzed game" },
  ].filter((story) => !!story);

  return (
    <main id="main" className={styles.main}>
      <section className={styles.freshness} aria-label="Data freshness">
        <span className={styles.snapshotLabel}>{snapshot ? `${snapshot.season} season · Postgame edition` : "The analyzed archive"}</span>
        <span>{snapshot ? <>Results checked <time dateTime={snapshot.checkedAt}>{formatCheckedAt(snapshot.checkedAt)}</time></> : "Current-season results are not available in this edition."}</span>
      </section>
      {snapshot ? <DataFreshness checkedAt={snapshot.checkedAt} /> : null}

      <section className={styles.cover} aria-labelledby="cover-heading">
        <Image src="/images/stadium-hero.png" alt="An illustrated football player in a green uniform looks out from a tunnel toward a floodlit stadium" fill sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1288px) calc(100vw - 48px), 1240px" preload className={styles.coverImage} />
        <div className={styles.coverShade} />
        <div className={styles.coverCopy}>
          <p className={styles.coverKicker}>For the faithful. Fueled by data.</p>
          <h1 id="cover-heading" className="hed">Every game.<br /><span>Every swing.</span></h1>
          <p>The highs. The heartbreak. The numbers behind it all. A fresh perspective on Jets football.</p>
          <div className={styles.coverActions}><Link className={styles.primaryButton} href="/morgue">Explore the games <span aria-hidden="true">↗</span></Link>{result ? <a className={styles.textButton} href="#latest-game">Read the latest <span aria-hidden="true">↓</span></a> : null}</div>
        </div>
        {result ? <div className={styles.coverScore}><span>{lead.kind === "archive" ? "From the archive" : `Latest final · Week ${result.week}`}</span><div><b>NYJ</b><strong>{result.jetsScore}</strong><i aria-hidden="true">/</i><strong>{result.oppScore}</strong><b>{result.opponentDisplay}</b></div><small>{formatDate(result.date)}{analysis?.wentToOt ? " · OT" : ""}</small></div> : null}
        <span className={styles.imageCredit}>Stadium illustration</span>
      </section>

      <section className={styles.pulse} aria-label="Jets at a glance">
        <div><span>{snapshot?.season ?? "Season"} record</span><strong>{snapshot ? `${summary.wins}–${summary.losses}${summary.ties ? `–${summary.ties}` : ""}` : "—"}</strong><small>{snapshot ? "Confirmed regular-season finals" : "Current-season results unavailable"}</small></div>
        <div><span>Point differential</span><strong>{snapshot ? `${summary.pointDifferential > 0 ? "+" : ""}${summary.pointDifferential}` : "—"}</strong><small>{snapshot ? `${summary.pointsFor} scored · ${summary.pointsAgainst} allowed` : "Current-season results unavailable"}</small></div>
        <div><span>Offense EPA / play</span><strong>{epaLabel(jets?.offense.epaPerPlay)}</strong><small>{jets?.ranks.offenseEpa ? `#${jets.ranks.offenseEpa} in league · ${jets.completedGames} analyzed games` : "Current-season analysis pending"}</small></div>
        <div><span>The analyzed archive</span><strong>{coverage.count}</strong><small>Games · {coverage.seasonLabel}</small></div>
      </section>

      {result ? <article id="latest-game" className={styles.lead}>
        <div className={styles.sectionTop}><p className={styles.kicker}>{lead.kind === "archive" ? "From the archive · no current-season final in this edition" : `Latest final · Week ${result.week}${result.seasonType === "POST" ? " · playoffs" : ""}`}</p><span className={styles.sectionIndex}>01 / THE GAME</span></div>
        <div className={styles.leadGrid}>
          <div className={styles.leadLeft}>
            <h2 className={`${styles.headline} hed`}>{headline}</h2>
            <p className={styles.matchup}>Jets {result.jetsScore}, {result.opponentDisplay} {result.oppScore}{analysis?.wentToOt ? " · OT" : ""} · <time dateTime={result.date}>{formatDate(result.date)}</time></p>
            <p className={styles.bigNumber}>{analysis ? pct(analysis.swing) : `${result.jetsScore}–${result.oppScore}`}</p>
            <p className={styles.metricLabel}>{analysis ? `${lost ? "Peak" : "Lowest"} second-half win probability` : "Jets · opponent final score"}</p>
            <p className={styles.standfirst}>{analysis ? <>The Jets&apos; chance to win {lost ? "peaked at" : "fell to"} {pct(analysis.swing)} in the second half. Follow the curve to see where the game turned.</> : <>The final score is confirmed. {pendingTitle}. The result counts toward the season record and streak.</>}</p>
            <Link className={styles.leadLink} href={analysis ? gameHref(analysis.id, lost ? "heartbreak" : "miracle") : "/morgue"}>{analysis ? "Explore this game" : "Browse the analyzed archive"} <span aria-hidden="true">↗</span></Link>
          </div>
          <aside className={styles.rail} aria-label={lead.kind === "archive" ? "Archive game analysis" : "Latest game analysis"}>
            {analysis && curve.length >= 2 ? <figure className={styles.chart}><figcaption><strong>Every turn of the game.</strong><span>Jets pre-play win probability · play sequence</span></figcaption><PressChart points={curve} board={lost ? "heartbreak" : "miracle"} /></figure> : <div className={styles.pending}><h3>{analysis ? "Game curve unavailable" : pendingTitle}</h3><p>{tied ? "Tied games have no Heartbreak or Miracle ranking: neither a win nor a loss. The confirmed score still counts toward the season record." : lead.analysisStatus === "suspect" ? "The play-by-play fails the score integrity check. This game stays out of the probability rankings until the data can be reconciled." : "A confirmed result can arrive before usable play-by-play. This edition adds the probability curve when analysis is available."}</p></div>}
            {analysis?.keyPlay.desc ? <div className={styles.keyPlay}><p className={styles.sectionLabel}>{lost ? "Biggest second-half setback" : "Biggest second-half boost"}</p><p className={styles.playMeta}>{clockLabel(analysis.keyPlay.qtr, analysis.keyPlay.secondsLeft)}{analysis.keyPlay.wpa != null ? ` · ${analysis.keyPlay.wpa >= 0 ? "+" : ""}${(analysis.keyPlay.wpa * 100).toFixed(1)} percentage points` : ""}</p><p>{analysis.keyPlay.desc}</p></div> : null}
            {gameStats ? <div className={styles.gameEfficiency}><span>Game offense EPA / play <b>{epaLabel(gameStats.offense.epaPerPlay)}</b></span><span>Defense EPA allowed / play <b>{epaLabel(gameStats.defense.epaPerPlay)}</b></span></div> : null}
            <p className={styles.analysisDate}>{snapshot?.analysisUpdatedAt ? <>Archive analysis updated {formatCheckedAt(snapshot.analysisUpdatedAt)}</> : "Analysis update time unavailable."}</p>
          </aside>
        </div>
      </article> : null}

      {next && snapshot ? <Matchup game={next.game} overdue={next.overdue} analytics={analytics} /> : null}

      {snapshot ? <section className={styles.season} aria-labelledby="season-heading">
        <div className={styles.sectionTop}><p className={styles.kicker}>The story so far</p><span className={styles.sectionIndex}>02 / THE SEASON</span></div>
        <div className={styles.seasonHeading}><h2 id="season-heading" className="hed">The {snapshot.season} season</h2><span>Regular season · confirmed finals</span></div>
        <div className={styles.seasonGrid}>
          <div className={styles.seasonSummary}><p className={styles.seasonRecord}>{summary.wins}–{summary.losses}{summary.ties ? `–${summary.ties}` : ""}</p><p>Wins · losses{summary.ties ? " · ties" : ""}</p><div className={styles.streak}><b>{streak ? `${streak.type === "win" ? "W" : streak.type === "loss" ? "L" : "T"}${streak.count}` : "—"}</b><span>Consecutive results{streak && streak.lastGame.season !== snapshot.season ? " · previous season" : ""}</span></div><div className={styles.next}><p className={styles.sectionLabel}>Next on schedule</p>{next ? <><h3>Jets {next.game.atHome ? "vs" : "at"} {next.game.opponentDisplay}</h3><p>Week {next.game.week} · {formatDate(next.game.date)}</p>{next.overdue ? <p className={styles.nextNote}>Kickoff has passed as of the last check; a final is not confirmed.</p> : null}</> : <p>No remaining fixture listed.</p>}</div></div>
          <SeasonTrend games={summary.finals} />
        </div>
        {summary.recent.length ? <div className={styles.recent}><h3>Recent results</h3><ol>{summary.recent.slice(0, 3).map((game) => {
          const analyzed = games.find((item) => item.id === game.id && !item.dataSuspect && item.swing != null && item.date === game.date && item.outcome === game.outcome && item.jetsScore === game.jetsScore && item.oppScore === game.oppScore);
          return <li key={game.id}><span className={`${styles.resultLetter} ${game.outcome === "win" ? styles.win : ""}`}>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"}</span><div><small>Week {game.week} · {formatDate(game.date)}</small><strong>NYJ {game.jetsScore} <span>—</span> {game.opponentDisplay} {game.oppScore}</strong><span>{game.atHome ? "Home" : "Away"} · {analyzed?.wentToOt ? "Overtime" : "Final"}</span></div>{analyzed ? <Link href={gameHref(game.id, game.outcome === "win" ? "miracle" : "heartbreak")} aria-label={`Explore Week ${game.week} against ${game.opponentDisplay}`}>↗</Link> : <span className={styles.nextNote}>{game.outcome === "tie" ? "Tie · no probability ranking" : "Analysis pending"}</span>}</li>;
        })}</ol></div> : null}
        <details className={styles.schedule}><summary>See the full {snapshot.season} schedule <span>{snapshot.schedule.filter((game) => game.seasonType === "REG").length} games</span></summary><ol>{snapshot.schedule.filter((game) => game.seasonType === "REG").map((game) => <li key={game.id}><span className={styles.week}>W{game.week}</span><time dateTime={game.date}>{formatDate(game.date)}</time><strong>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><span>{game.status === "final" ? `${game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} ${game.jetsScore}–${game.oppScore}` : game.kickoff ? formatCheckedAt(game.kickoff) : "Time TBD"}</span></li>)}</ol></details>
      </section> : null}

      <section className={styles.archive} aria-labelledby="archive-heading">
        <div className={styles.sectionTop}><p className={styles.kicker}>History keeps receipts</p><span className={styles.sectionIndex}>03 / THE VAULT</span></div>
        <div className={styles.archiveHeading}><h2 id="archive-heading" className="hed">Some games stay with you.</h2><Link href="/morgue">Open The Morgue <span aria-hidden="true">↗</span></Link></div>
        <div className={styles.stories}>{stories.map(({ game, board, title, tag }) => <Link className={`${styles.story} ${board === "miracle" ? styles.miracle : ""}`} key={`${tag}-${game.id}`} href={gameHref(game.id, game.outcome === "win" ? "miracle" : "heartbreak")}><div className={styles.storyVisual}><span>{tag}</span><strong>{pct(game.swing)}</strong><small>{board === "heartbreak" ? "Peak second-half chance in a loss" : "Lowest second-half chance in a win"}</small><b aria-hidden="true">NYJ / {game.opponentDisplay}</b></div><div className={styles.storyCopy}><small>{formatDate(game.date)} · Week {game.week}</small><h3 className="hed">{title}</h3><p>Jets {game.jetsScore}, {game.opponentDisplay} {game.oppScore}<span aria-hidden="true">↗</span></p></div></Link>)}</div>
        <div className={styles.archiveCounts}><p><b>{heartbreak.filter((game) => game.swing! >= .9).length}</b> losses after reaching 90%+</p><p><b>{miracle.filter((game) => game.swing! <= .1).length}</b> wins from 10% or lower</p><Link href="/how-made">Our sources &amp; methodology <span aria-hidden="true">↗</span></Link></div>
      </section>
    </main>
  );
}
