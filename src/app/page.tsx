import Link from "next/link";
import { rank, clockLabel, pct } from "@/lib/games";
import { loadGames, loadCurve, loadCurrent } from "@/lib/load-games";
import { archiveCoverage, currentSeasonSummary, formatCheckedAt, formatDate, mergeResults, nextScheduledGame, selectLead } from "@/lib/current";
import { currentStreak, wearLevel, WEAR_NOTE } from "@/lib/paper";
import PressChart from "@/components/PressChart";
import DataFreshness from "@/components/DataFreshness";
import styles from "./page.module.css";

export default async function BackPage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const streak = currentStreak(mergeResults(games, snapshot));
  const wear = wearLevel(streak);
  const lead = selectLead(games, snapshot);
  const result = lead.result;
  const analysis = lead.analysisStatus === "ready" ? lead.analysis : null;
  const curve = analysis ? await loadCurve(analysis.id) : [];
  const summary = currentSeasonSummary(snapshot);
  const next = nextScheduledGame(snapshot);
  const coverage = archiveCoverage(games);
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");
  const lost = result?.outcome === "loss";
  const headline = !analysis ? "The result is in." : lost
    ? (analysis.swing! >= 0.9 ? "Almost certain. Still a loss." : "A loss, by the numbers.")
    : (analysis.swing! <= 0.1 ? "Almost impossible. Still a win." : "A win worth reading.");
  const pendingTitle = lead.analysisStatus === "suspect" ? "Analysis held for review" :
    lead.analysisStatus === "unavailable" ? "Win probability unavailable" : "Win-probability analysis pending";

  return (
    <main id="main" className={styles.main}>
      <section className={styles.freshness} aria-label="Data freshness">
        <span className={styles.snapshotLabel}>{snapshot ? `${snapshot.season} season · Postgame edition` : "Analyzed archive"}</span>
        <span>{snapshot ? <>Results checked <time dateTime={snapshot.checkedAt}>{formatCheckedAt(snapshot.checkedAt)}</time></> : "Current-season results are not available in this edition."}</span>
      </section>
      {snapshot ? <DataFreshness checkedAt={snapshot.checkedAt} /> : null}

      {result ? (
        <article className={styles.lead}>
          <div className={styles.leadLeft}>
            <p className={styles.kicker}>{lead.kind === "archive" ? "From the archive · no current-season final in this edition" : `Latest final · Week ${result.week}${result.seasonType === "POST" ? " · playoffs" : ""}`}</p>
            <p className={styles.bigNumber}>{analysis ? pct(analysis.swing) : `${result.jetsScore}–${result.oppScore}`}</p>
            <p className={styles.metricLabel}>{analysis ? `${lost ? "Peak" : "Lowest"} second-half win probability` : "Jets · opponent final score"}</p>
            <h1 className={`${styles.headline} hed`}>{headline}</h1>
            <p className={styles.matchup}>
              Jets {result.jetsScore}, {result.opponentDisplay} {result.oppScore}
              {analysis?.wentToOt ? " · OT" : ""} · <time dateTime={result.date}>{formatDate(result.date)}</time>
            </p>
            {analysis ? (
              <p className={styles.standfirst}>The Jets&apos; chance to win {lost ? "peaked at" : "fell to"} {pct(analysis.swing)} in the second half. The final score tells the rest.</p>
            ) : <p className={styles.standfirst}>The final score is confirmed. {pendingTitle}. The result counts toward the season record and streak.</p>}
            <Link className={styles.leadLink} href="/morgue">Explore the analyzed archive <span aria-hidden="true">→</span></Link>
          </div>

          <aside className={styles.rail} aria-label={lead.kind === "archive" ? "Archive game analysis" : "Latest game analysis"}>
            {analysis && curve.length >= 2 ? (
              <figure className={styles.chart}>
                <figcaption><strong>Every turn of the game.</strong><span>Jets win probability · {result.atHome ? "vs" : "at"} {result.opponentDisplay}</span></figcaption>
                <PressChart points={curve} board={lost ? "heartbreak" : "miracle"} />
              </figure>
            ) : (
              <div className={styles.pending}>
                <p className={styles.sectionLabel}>The analysis desk</p>
                <h2>{analysis ? "Game curve unavailable" : pendingTitle}</h2>
                <p>{lead.analysisStatus === "suspect" ? "The play-by-play fails the score integrity check. This game stays out of the probability rankings until the data can be reconciled." : analysis ? "The summary is available, but this edition does not contain a usable game curve." : "A confirmed result can arrive before usable play-by-play. This edition shows the score now and adds the probability curve when analysis is available."}</p>
              </div>
            )}
            {analysis?.keyPlay.desc ? (
              <div className={styles.keyPlay}>
                <p className={styles.sectionLabel}>{lost ? "Biggest second-half setback" : "Biggest second-half boost"}</p>
                <p className={styles.playMeta}>{clockLabel(analysis.keyPlay.qtr, analysis.keyPlay.secondsLeft)}{analysis.keyPlay.wpa != null ? ` · ${analysis.keyPlay.wpa >= 0 ? "+" : ""}${(analysis.keyPlay.wpa * 100).toFixed(1)} percentage points` : ""}</p>
                <p>{analysis.keyPlay.desc}</p>
              </div>
            ) : null}
            <p className={styles.analysisDate}>{snapshot?.analysisUpdatedAt ? <>Archive analysis updated <time dateTime={snapshot.analysisUpdatedAt}>{formatCheckedAt(snapshot.analysisUpdatedAt)}</time></> : "Analysis update time unavailable."}{coverage.lastDate ? <> · Latest analyzed result: {formatDate(coverage.lastDate)}</> : null}</p>
          </aside>
        </article>
      ) : <section className={styles.empty}><h1 className="hed">Waiting for the first edition.</h1><p>No confirmed result or analyzed archive game is available.</p></section>}

      {snapshot ? (
        <section className={styles.season} aria-labelledby="season-heading">
          <div className={styles.seasonHeading}><h2 id="season-heading">The {snapshot.season} season</h2><span>Regular season · confirmed finals</span></div>
          <div className={styles.seasonGrid}>
            <div className={styles.stats}>
              <div><strong>{summary.wins}–{summary.losses}{summary.ties ? `–${summary.ties}` : ""}</strong><span>Record{summary.ties ? " · W–L–T" : " · W–L"}</span></div>
              <div><strong>{summary.pointDifferential > 0 ? "+" : ""}{summary.pointDifferential}</strong><span>Point differential</span></div>
              <div><strong>{streak ? `${streak.type === "win" ? "W" : streak.type === "loss" ? "L" : "T"}${streak.count}` : "—"}</strong><span>Consecutive results{streak && streak.lastGame.season !== snapshot.season ? " · previous season" : ""}</span></div>
            </div>
            <div className={styles.next}>
              <p className={styles.sectionLabel}>Next on schedule</p>
              {next ? <><h3>Jets {next.game.atHome ? "vs" : "at"} {next.game.opponentDisplay}</h3><p>Week {next.game.week} · {formatDate(next.game.date)}</p><p className={styles.nextNote}>{next.overdue ? "Kickoff has passed as of the last results check; a final result has not been confirmed." : next.game.kickoff ? <>Kickoff {formatCheckedAt(next.game.kickoff)}</> : "Kickoff time not published in this edition."}</p></> : <><h3>No remaining fixture listed</h3><p className={styles.nextNote}>As of the results check above.</p></>}
            </div>
          </div>
          {summary.recent.length ? <div className={styles.recent}><h3>Recent results</h3><ol>{summary.recent.map((game) => <li key={game.id}><span className={styles.resultLetter}>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"}</span><span>{game.atHome ? "vs" : "at"} {game.opponentDisplay}<small>Week {game.week} · {formatDate(game.date)}</small></span><strong>{game.jetsScore}–{game.oppScore}</strong></li>)}</ol></div> : <p className={styles.nextNote}>No regular-season final has been confirmed in this edition.</p>}
        </section>
      ) : null}

      <section className={styles.archive} aria-labelledby="archive-heading">
        <div className={styles.archiveHeading}><div><p className={styles.sectionLabel}>History keeps receipts</p><h2 id="archive-heading">The archive, ranked.</h2></div><Link href="/morgue">Open The Morgue <span aria-hidden="true">→</span></Link></div>
        <div className={styles.strip}>
          {([["Heartbreak", heartbreak], ["Miracles", miracle]] as const).map(([title, list]) => (
            <div className={styles.stripCol} key={title}><h3 className={styles.stripHead}>{title}<span>{title === "Heartbreak" ? "Peak chance in a loss" : "Lowest chance in a win"}</span></h3><ol className={styles.agateList}>{list.slice(0, 5).map((game, index) => <li key={game.id}><span className={styles.n}>{index + 1}</span><span>{game.atHome ? "vs" : "at"} {game.opponentDisplay}<small>{game.date}</small></span><strong>{pct(game.swing)}</strong></li>)}</ol></div>
          ))}
          <div className={styles.stripCol}><h3 className={styles.stripHead}>The record<span>Analyzed archive · {coverage.seasonLabel}</span></h3><dl className={styles.archiveStats}><div><dt>Games analyzed</dt><dd>{coverage.count}</dd></div><div><dt>Losses after reaching 90%+</dt><dd>{heartbreak.filter((game) => game.swing! >= 0.9).length}</dd></div><div><dt>Wins from 10% or lower</dt><dd>{miracle.filter((game) => game.swing! <= 0.1).length}</dd></div></dl><p className={styles.stripNote}>{coverage.lastDate ? `Through ${formatDate(coverage.lastDate)}. ` : ""}{games.filter((game) => game.dataSuspect).length} flagged for score integrity; excluded from rankings.</p><p className={styles.stockNote}>Paper stock {wear}/4 · {WEAR_NOTE[wear]}</p></div>
        </div>
      </section>
    </main>
  );
}
