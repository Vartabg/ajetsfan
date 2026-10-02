import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import Link from "next/link";
import { loadGames, loadCurrent, loadAnalytics } from "@/lib/load-games";
import { archiveCoverage, formatCheckedAt, formatDate } from "@/lib/current";
import { rank } from "@/lib/games";
import PaperSample from "./PaperSample";
import styles from "./page.module.css";

export const metadata: Metadata = pageMetadata({
  path: "/how-made",
  title: "How the paper is made — a Jets fan",
  description: "How The Back Page turns Jets play-by-play into a newspaper: data-driven art direction, honest probability rankings, and visible exclusions.",
});

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
        <li><strong>02 / Check</strong><span>Recorded plays, reconciled scores</span></li>
        <li><strong>03 / Rank</strong><span>Second-half probability</span></li>
        <li><strong>04 / Print</strong><span>Lead, charts, paper</span></li>
      </ol>

      <PaperSample />

      <section data-note="The team desk">
        <h2>Follow the team, with each source in view</h2>
        <p>The news desk carries headlines and original publication times from the <a href="https://www.newyorkjets.com/rss/news">official Jets news feed</a>. Each headline opens the original story. Publication time describes the article; the successful-check time describes when this edition fetched the feed.</p>
        <p>The Sunday briefing compares validated offensive and defensive samples. Each side shows EPA per dropback or non-scramble rush, its included play count, and completed-game count. Defensive rates retain their “EPA allowed” label. The two units faced different opponents, so the comparison describes recorded performance rather than a predicted matchup result. News labels describe explicit headline wording; they do not add reporting.</p>
        <p>The game-day desk uses separately reviewed <a href="https://www.newyorkjets.com/news/jets-at-bears-ways-to-watch-stream-week-4-10-04-2026">official viewing guidance</a> and <a href="https://www.newyorkjets.com/news/minkah-fitzpatrick-really-good-chance-to-play-vs-bears-jets-injury-update-09-30-2026">dated team availability reporting</a>. Each curated briefing belongs to one fixture and expires at kickoff. Its notes keep their publication and review dates, and warn when the review is more than 24 hours old. Practice participation and roster status do not establish game-day clearance.</p>
        <p>The roster uses the latest regular-season week in the <a href="https://github.com/nflverse/nflverse-data/releases/tag/rosters">nflverse roster files</a>. Active, practice-squad, and reserve labels describe source roster membership. They do not establish injury status or availability for a game. Profiles are matched by GSIS identifiers, with validated ESPN identifiers as a fallback. Entries without either identifier are counted visibly as awaiting identifiers. Headshots come from the source and fall back to initials when unavailable.</p>
        <p>Passing, rushing, and receiving totals come from <a href="https://github.com/nflverse/nflverse-data/releases/tag/stats_player">nflverse weekly player statistics</a>, restricted to Jets regular-season games confirmed final by the schedule. Each game&apos;s passing completions, yards, and touchdowns must reconcile with its receiving totals before publication; replacements cannot silently lose previously verified player-game rows. Yardage supplies the leader ordering. A player&apos;s recorded-game count includes games with a source statistics row, rather than all roster appearances. Defensive, special-teams, and preseason production are outside this display. Missing player statistics are described as missing, rather than presented as zero production.</p>
        <p>News, roster, and player statistics have independent successful-check times and cutoffs. If one source fails validation or fetching, its previous valid data remains visible with a warning. Without a previous snapshot, that section is marked unavailable. Previous-season roster records keep their source-season label; they cannot supply statistics for the current edition. A reader-side clock marks source checks older than 24 hours as overdue.</p>
        <Link href="/team">Explore the news desk and roster →</Link>
      </section>

      <section id="rivalries" data-note="The historical record">
        <h2>Selected cases, with sources attached</h2>
        <p>The classic case files are editorial selections, separate from the probability rankings. Their dates and scores must match the checked archive before a game link appears. Each case links to an official account supporting its historical context. The Super Bowl III feature links to the Jets’ historical account; the play-by-play archive begins in 1999 and supplies no tape for the 1968 season.</p>
        <p>The rivalry ledger covers regular-season results against today’s AFC East opponents: Buffalo, Miami and New England. It gives the included game count and season range, rather than claiming an all-time series record or complete historical division record. Playoffs are excluded. Current schedule-confirmed finals replace older analysis scores; unconfirmed fixtures do not count. An unreconciled archive score is omitted unless a confirmed current result supplies the score. Game-analysis links additionally require matching, eligible play-by-play.</p>
        <p>The personal game-day ticket saves user-selected scores, conviction and ritual in this browser when storage is available. It starts blank and has no public poll or community tally. Fixture changes require a new review; the form closes at kickoff, or at the start of the listed game date in America/Chicago when kickoff is unconfirmed. A saved call can be compared with a schedule-confirmed final, including a tie. Browser storage is editable, so the ticket is a personal record rather than a verified prediction contest. “Copy saved ticket” copies text to the clipboard; it sends no message.</p>
        <Link href="/#fan-stand">Explore Jets history →</Link>
      </section>

      <section id="film-sources" data-note="The Film Room">
        <h2>Film study, with the source in view</h2>
        <p>The Film Room pairs four curated archive plays with official NFL or Jets replays and gamebooks. Down, distance, field position and scoring context come from those books. Attributed source accounts identify a reported route or a player’s explanation; they do not establish the full coverage, blitz or protection call.</p>
        <p>Win probability is the archive’s pre-play estimate; the displayed change is the reported model delta. Miami’s older touchdown row repeats a clock from the preceding play, so its header shows the quarter and its notebook gives the separately documented scoring clock. The overtime kick retains its pre-kick estimate rather than replacing it with the final outcome.</p>
        <p>The coverage board is an independent teaching schematic, with illustrative positions, routes and eleven assigned defenders. It supplies no All-22 footage, player tracking or verified video offsets. Coverage and pressure controls change the lesson, not our classification of the selected play. Photo-style scene recreations are visibly labeled as AI-generated and linked to historical references; they are editorial illustrations, never film evidence.</p>
        <Link href="/film-room">Enter the Film Room →</Link>
      </section>

      <section id="efficiency" data-note="The scouting notes">
        <h2>Team efficiency, with the sample in view</h2>
        <p><strong>Expected points added (EPA)</strong> measures how a play changes the offense&apos;s expected scoring position. EPA per play is the sum divided by the number of included plays. Higher offensive EPA is better; lower defensive EPA allowed is better. <strong>Success rate</strong> is the share of those plays with EPA above zero.</p>
        <p>The sample includes current-season regular-season games confirmed final by the schedule, with completed, score-reconciled play-by-play. Included plays have a valid offense and defense, down 1–4, a run or pass play type, and finite EPA. No-plays, kneels, spikes, and two-point attempts are excluded. These are pooled play rates, rather than averages of game averages.</p>
        <p><strong>Dropbacks</strong> include passes, sacks, and quarterback scrambles marked as dropbacks in the source. The rushing split uses the remaining included non-dropback plays; it excludes quarterback scrambles and may include aborted run snaps. Empty samples show a dash. League ranks compare eligible team samples using unrounded rates and give tied values the same rank; the next rank skips the tied places. Displayed EPA rates use three decimals in the Sunday briefing and league/unit comparisons; each rate carries its own play count.</p>
        {analytics?.throughDate ? <p>The efficiency snapshot includes {analytics.analyzedGameIds.length} completed games and {analytics.teams.length} teams through {formatDate(analytics.throughDate)}. Week {analytics.throughWeek} is the highest included week, rather than a claim that every game in that week has been analyzed. {analytics.pendingGameIds.length} confirmed league finals await usable analysis. Last analysis update: {analytics.analysisUpdatedAt ? formatCheckedAt(analytics.analysisUpdatedAt) : "unavailable"}.</p> : <p>No current-season efficiency snapshot is available in this edition.</p>}
        <p>League averages pool team rates by their included play counts, counting each offensive play once. Zero EPA is the model baseline; the observed league average can differ from zero. All game situations are included and rates are not opponent-adjusted. Offense-versus-defense tables describe what each unit has recorded against its own opponents; they do not calculate a predicted matchup advantage.</p>
        <p>Early-season samples are small. The comparison describes recorded performance and does not predict who will win the next game. <a href="https://nflfastr.com/articles/beginners_guide.html">Read the nflfastR guide to EPA and win probability</a>.</p>
      </section>

      <section data-note="The probability model">
        <h2>The ranking is a calculation</h2>
        <p><strong>Heartbreak</strong> ranks losses by the highest Jets win probability reached in the second half. <strong>Miracle</strong> ranks wins by the lowest probability reached in the second half. Overtime is included.</p>
        <p>The latest confirmed current-season final supplies the lead. Its probability analysis appears only when the play-by-play passes integrity checks and agrees with the confirmed score. A result awaiting analysis still counts toward the record and streak. When the season has no confirmed final, an older archive feature is clearly labeled.</p>
        <p>The curve shows the Jets’ estimated chance to win before each recorded play. “Change on this play” is the source WPA oriented to the Jets and expressed in percentage points, not a relative percentage change or an individual player grade. <a href="https://nflfastr.com/reference/fast_scraper.html">Inspect the nflfastR probability field definitions</a>.</p>
        <p>These are model estimates at recorded moments. The analyzed archive covers the {coverage.seasonLabel} seasons{coverage.lastDate ? `, through ${formatDate(coverage.lastDate)}` : ""}; the paper is a postgame edition.</p>
        <Link href="/morgue">Inspect the rankings and game curves →</Link>
      </section>

      <section data-note="A correction, on record">
        <h2>The useful finding was a bad number</h2>
        <p>A quarter-ending administrative row in the 2000 Oakland game carried a 99.4% win probability while nearby real snaps were around 4%. Checking only for a non-null possession team did not remove it: the row contained an empty string.</p>
        <p>The extraction now requires a possession team that is neither null nor empty, plus a play type, before reading probability. The probability curve and second-half extrema retain recorded rows such as nullified plays, kneels, and spikes when the possession and probability are valid. Selecting the decisive play excludes no-plays, kneels, and spikes. The source query keeps those rules beside the calculation.</p>
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
        <p>A temporary current-season play-by-play outage retains the last verified analysis while independently checked results and team coverage advance. The successful analysis check, analysis content update, and pending game counts describe different things. Invalid analysis still stops publication for review.</p>
        <p>Each eligible game and current roster player has a dedicated page and share card. The interactive archive and roster keep their filters and play controls. Vercel Web Analytics and Speed Insights provide audience and performance measurement when enabled for this project; page URLs are stripped of searches and fragments before sending. Personal game-day tickets stay in browser storage.</p>
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
