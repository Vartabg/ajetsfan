import type { Metadata } from "next";
import Link from "next/link";
import { loadGames } from "@/lib/load-games";
import { rank } from "@/lib/games";
import PaperSample from "./PaperSample";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How the paper is made — a Jets fan",
  description: "How The Back Page turns Jets play-by-play into a newspaper: data-driven art direction, honest probability rankings, and visible exclusions.",
};

export default async function HowMade() {
  const games = await loadGames();
  const excluded = games.filter((game) => game.dataSuspect);
  const eligible = rank(games, "heartbreak").length + rank(games, "miracle").length;
  const seasons = games.map((game) => game.season);
  return (
    <main id="main" className={styles.main}>
      <header className={styles.header}>
        <p className="label">Inside the composing room / Engineering case study</p>
        <h1 className="hed">How the<br />paper is made</h1>
        <p className={styles.lede}>The score chooses the story. The streak ages the paper. Every effect starts with a fact in the archive.</p>
        <p>Built by <a href="https://garovartabedian.com/work">Garo Vartabedian</a>. An independent fan project with its workings left open to inspection.</p>
      </header>

      <ol className={styles.pipeline} aria-label="From source data to the front page">
        <li><strong>01 / Source</strong><span>nflverse play-by-play</span></li>
        <li><strong>02 / Check</strong><span>Real snaps, reconciled scores</span></li>
        <li><strong>03 / Rank</strong><span>Second-half probability</span></li>
        <li><strong>04 / Print</strong><span>Lead, headline, paper</span></li>
      </ol>

      <PaperSample />

      <section>
        <h2>The headline is a calculation</h2>
        <p><strong>Heartbreak</strong> ranks losses by the highest Jets win probability reached in the second half. <strong>Miracle</strong> ranks wins by the lowest probability reached in the second half. Overtime is included.</p>
        <p>The most recent result chooses the mood: after a loss, the lead comes from heartbreak; after a win, it comes from miracles. The story itself may be an older extreme in the archive. Headline size grows with distance from a 50–50 game.</p>
        <p>These are model estimates at particular moments, not a measurement of how every fan felt. The archive covers the {Math.min(...seasons)}–{Math.max(...seasons)} seasons; this is not a live scoreboard.</p>
        <Link href="/morgue">Inspect the rankings and game curves →</Link>
      </section>

      <section>
        <h2>The useful finding was a bad number</h2>
        <p>A quarter-ending administrative row in the 2000 Oakland game carried a 99.4% win probability while nearby real snaps were around 4%. Checking only for a non-null possession team did not remove it: the row contained an empty string.</p>
        <p>The extraction now requires a possession team that is neither null nor empty, plus a play type, before reading probability. Selecting the decisive play also excludes no-plays, kneels, and spikes. The source query keeps those rules beside the calculation.</p>
        <a href="https://github.com/Vartabg/ajetsfan/blob/master/scripts/build-data.mjs">Read the extraction and integrity checks →</a>
      </section>

      <section>
        <h2>Keep the exception visible</h2>
        <p>The current dataset contains <strong>{games.length} games</strong>; <strong>{eligible}</strong> qualify for the two rankings. <strong>{excluded.length}</strong> {excluded.length === 1 ? "game is" : "games are"} flagged because the running play-by-play score does not reconcile with the recorded final score.</p>
        <ul className={styles.exceptions}>
          {excluded.map((game) => <li key={game.id}><code>{game.id}</code><span>{game.date} · {game.atHome ? "vs" : "at"} {game.opponentDisplay} · Jets {game.jetsScore}, opponent {game.oppScore}</span></li>)}
        </ul>
        <p>Flagged records remain in the dataset for inspection but cannot win a ranking or supply the lead. No replacement probability is invented.</p>
      </section>

      <section>
        <h2>A small system with a visible chain of decisions</h2>
        <p>DuckDB reads the source Parquet files during data preparation and writes static JSON. Next.js renders the front page from that snapshot. Small React controls handle comparison and archive interaction; CSS carries the paper, typography, and print texture.</p>
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
