import type { Metadata } from "next";
import Link from "next/link";
import { loadGames, loadCurrent, loadAnalytics } from "@/lib/load-games";
import { archiveCoverage, formatCheckedAt, formatDate } from "@/lib/current";
import { rank } from "@/lib/games";
import PaperSample from "./PaperSample";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How the paper is made — a Jets fan",
  description: "How The Back Page turns Jets play-by-play into a newspaper: data-driven art direction, honest probability rankings, and visible exclusions.",
};

export default async function HowMade() {
  const [games, snapshot, analytics] = await Promise.all([loadGames(), loadCurrent(), loadAnalytics()]);
  const excluded = games.filter((game) => game.dataSuspect);
  const eligible = rank(games, "heartbreak").length + rank(games, "miracle").length;
  const coverage = archiveCoverage(games);
  return (
    <main id="main" className={styles.main}>
      <header className={styles.header}>
        <p className={styles.kicker}>Inside the composing room / Engineering case study</p>
        <h1 className="hed">How the<br />paper is made</h1>
        <p className={styles.lede}>Every game has a story. These are the sources, calculations, and checks behind the numbers.</p>
        <p className={styles.byline}>Built by <a href="https://garovartabedian.com/work">Garo Vartabedian</a>. An independent fan project with its workings left open to inspection.</p>
        <span className={styles.proofStamp} aria-hidden="true">Open for<br />inspection</span>
      </header>

      <ol className={styles.pipeline} aria-label="From source data to the front page">
        <li><strong>01 / Source</strong><span>nflverse play-by-play</span></li>
        <li><strong>02 / Check</strong><span>Real snaps, reconciled scores</span></li>
        <li><strong>03 / Rank</strong><span>Second-half probability</span></li>
        <li><strong>04 / Print</strong><span>Lead, headline, paper</span></li>
      </ol>

      <PaperSample />

      <section data-note="The team desk">
        <h2>Follow the team, with each source in view</h2>
        <p>The news desk carries headlines and original publication times from the <a href="https://www.newyorkjets.com/rss/news">official Jets news feed</a>. Each headline opens the original story. Publication time describes the article; the successful-check time describes when this edition fetched the feed.</p>
        <p>“Fan reaction” and “Fan analysis” identify this publication’s commentary. The Sunday briefing turns validated passing and running splits into football questions, with the sample and cutoff visible. News labels describe explicit headline wording; they do not add reporting.</p>
        <p>The game-day desk uses separately reviewed <a href="https://www.newyorkjets.com/news/jets-at-bears-ways-to-watch-stream-week-4-10-04-2026">official viewing guidance</a> and <a href="https://www.newyorkjets.com/news/minkah-fitzpatrick-really-good-chance-to-play-vs-bears-jets-injury-update-09-30-2026">dated team availability reporting</a>. Each curated briefing belongs to one fixture and expires at kickoff. Its notes keep their publication and review dates, and warn when the review is more than 24 hours old. Practice participation and roster status do not establish game-day clearance.</p>
        <p>The roster uses the latest regular-season week in the <a href="https://github.com/nflverse/nflverse-data/releases/tag/rosters">nflverse roster files</a>. Active, practice-squad, and reserve labels describe source roster membership. They do not establish injury status or availability for a game. Profiles are matched by GSIS identifiers, with validated ESPN identifiers as a fallback. Entries without either identifier are counted visibly as awaiting identifiers. Headshots come from the source and fall back to initials when unavailable.</p>
        <p>Passing, rushing, and receiving totals come from <a href="https://github.com/nflverse/nflverse-data/releases/tag/stats_player">nflverse weekly player statistics</a>, restricted to Jets regular-season games confirmed final by the schedule. Each game&apos;s passing completions, yards, and touchdowns must reconcile with its receiving totals before publication; replacements cannot silently lose previously verified player-game rows. Yardage supplies the leader ordering. A player&apos;s recorded-game count includes games with a source statistics row, rather than all roster appearances. Defensive, special-teams, and preseason production are outside this display. Missing player statistics are described as missing, rather than presented as zero production.</p>
        <p>News, roster, and player statistics have independent successful-check times and cutoffs. If one source fails validation or fetching, its previous valid data remains visible with a warning. Without a previous snapshot, that section is marked unavailable. Previous-season roster records keep their source-season label; they cannot supply statistics for the current edition. A reader-side clock marks source checks older than 24 hours as overdue.</p>
        <Link href="/team">Explore the news desk and roster →</Link>
      </section>

      <section id="efficiency" data-note="The scouting notes">
        <h2>Team efficiency, with the sample in view</h2>
        <p><strong>Expected points added (EPA)</strong> measures how a play changes the offense&apos;s expected scoring position. EPA per play is the sum divided by the number of included plays. Higher offensive EPA is better; lower defensive EPA allowed is better. <strong>Success rate</strong> is the share of those plays with EPA above zero.</p>
        <p>The sample includes current-season regular-season games confirmed final by the schedule, with completed, score-reconciled play-by-play. Included plays have a valid offense and defense, down 1–4, a run or pass play type, and finite EPA. No-plays, kneels, spikes, and two-point attempts are excluded. These are pooled play rates, rather than averages of game averages.</p>
        <p><strong>Dropbacks</strong> include passes, sacks, and quarterback scrambles marked as dropbacks in the source. The rushing split uses the remaining designed runs. Empty samples show a dash. League ranks compare teams with analyzed games and give tied values the same rank; the next rank skips the tied places.</p>
        {analytics?.throughDate ? <p>The efficiency snapshot includes {analytics.analyzedGameIds.length} completed games and {analytics.teams.length} teams through Week {analytics.throughWeek}, {formatDate(analytics.throughDate)}. {analytics.pendingGameIds.length} confirmed league finals await usable analysis. Last analysis update: {analytics.analysisUpdatedAt ? formatCheckedAt(analytics.analysisUpdatedAt) : "unavailable"}.</p> : <p>No current-season efficiency snapshot is available in this edition.</p>}
        <p>Early-season samples are small. The comparison describes recorded performance and does not predict who will win the next game. <a href="https://nflfastr.com/articles/beginners_guide.html">Read the nflfastR guide to EPA and win probability</a>.</p>
      </section>

      <section data-note="The editorial rule">
        <h2>The headline is a calculation</h2>
        <p><strong>Heartbreak</strong> ranks losses by the highest Jets win probability reached in the second half. <strong>Miracle</strong> ranks wins by the lowest probability reached in the second half. Overtime is included.</p>
        <p>The latest confirmed current-season final supplies the lead. Its probability analysis appears only when the play-by-play passes integrity checks and agrees with the confirmed score. A result awaiting analysis still counts toward the record and streak. When the season has no confirmed final, an older archive feature is clearly labeled.</p>
        <p>These are model estimates at particular moments, not a measurement of how every fan felt. The analyzed archive covers the {coverage.seasonLabel} seasons{coverage.lastDate ? `, through ${formatDate(coverage.lastDate)}` : ""}; the paper is a postgame edition.</p>
        <Link href="/morgue">Inspect the rankings and game curves →</Link>
      </section>

      <section data-note="A correction, on record">
        <h2>The useful finding was a bad number</h2>
        <p>A quarter-ending administrative row in the 2000 Oakland game carried a 99.4% win probability while nearby real snaps were around 4%. Checking only for a non-null possession team did not remove it: the row contained an empty string.</p>
        <p>The extraction now requires a possession team that is neither null nor empty, plus a play type, before reading probability. Selecting the decisive play also excludes no-plays, kneels, and spikes. The source query keeps those rules beside the calculation.</p>
        <a href="https://github.com/Vartabg/ajetsfan/blob/master/scripts/build-data.mjs">Read the extraction and integrity checks →</a>
      </section>

      <section data-note="The exception ledger">
        <h2>Keep the exception visible</h2>
        <p>The current dataset contains <strong>{games.length} games</strong>; <strong>{eligible}</strong> qualify for the two rankings. <strong>{excluded.length}</strong> {excluded.length === 1 ? "game is" : "games are"} flagged because the running play-by-play score does not reconcile with the recorded final score.</p>
        <ul className={styles.exceptions}>
          {excluded.map((game) => <li key={game.id}><code>{game.id}</code><span>{game.date} · {game.atHome ? "vs" : "at"} {game.opponentDisplay} · Jets {game.jetsScore}, opponent {game.oppScore}</span></li>)}
        </ul>
        <p>Flagged records remain in the dataset for inspection but cannot win a probability ranking. A flagged latest result can supply the confirmed score on the front page, with its probability analysis held for review. No replacement probability is invented.</p>
      </section>

      <section data-note="The press room">
        <h2>A small system with a visible chain of decisions</h2>
        <p>The results and schedule are checked separately from the play-by-play analysis. DuckDB reads the source Parquet files during data preparation and writes static JSON. Next.js prints the edition from that checked data. Small React controls handle archive filters and play-by-play exploration. Editorial photographs come from official Jets coverage. Captions identify the game, practice, or archive context, and link to the original source.</p>
        {snapshot ? <p>Results last checked <time dateTime={snapshot.checkedAt}>{formatCheckedAt(snapshot.checkedAt)}</time>. Analysis {snapshot.analysisUpdatedAt ? <>last updated <time dateTime={snapshot.analysisUpdatedAt}>{formatCheckedAt(snapshot.analysisUpdatedAt)}</time></> : "has no published update time"}. <a href={snapshot.sources.schedule}>Inspect the results and schedule source</a>.</p> : null}
        <p>There is no runtime language-model call deciding the headline. The source data, rules, and output can be inspected independently.</p>
        <ul>
          <li><a href="https://github.com/nflverse/nflverse-data">Original data: nflverse</a></li>
          <li><a href="https://github.com/Vartabg/ajetsfan/blob/master/src/lib/paper.ts">Editorial and paper rules</a></li>
          <li><a href="https://github.com/Vartabg/ajetsfan">Source and local setup</a></li>
        </ul>
        <p><Link href="/">Return to The Back Page →</Link></p>
      </section>
    </main>
  );
}
