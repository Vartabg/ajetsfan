import Link from "next/link";
import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How this was made — a Jets fan",
  description:
    "The metric, the three things the play-by-play got wrong, and what this still cannot tell you.",
};

export default function HowItWasMade() {
  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← Heartbreak &amp; Miracles
      </Link>

      <h1 className={styles.title}>How this was made</h1>
      <p className={styles.lede}>
        The board ranks 448 Jets games by a single number. Getting that number
        honest took more work on the data than on the site.
      </p>

      <section className={styles.section}>
        <h2>What the number is</h2>
        <p>
          For a loss, it is the highest win probability the Jets reached at any
          snap in the second half. For a win, the lowest they fell to. Overtime
          counts.
        </p>
        <p>
          The second-half restriction is the whole design. Measured across a full
          game, a first-quarter lead that quietly evaporated would rank beside a
          field goal missed as time expired. Those are not the same experience,
          and only one of them is what anyone means by heartbreak.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Where the data comes from</h2>
        <p>
          Play-by-play from{" "}
          <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
            nflverse
          </a>
          , free and open, going back to 1999. Every snap carries a win
          probability. A full season is about 49,000 plays across all 32 teams,
          of which roughly 3,000 involve the Jets — so 27 seasons of Jets
          football is a small enough slice to precompute entirely at build time.
        </p>
        <p>
          The site is static. A build script queries the remote Parquet files
          with DuckDB, writes one summary file and one win-probability series per
          game, and the pages are prerendered. Nothing runs on a server when you
          load this. A game&apos;s curve is fetched only when you click it.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Three things the data got wrong</h2>
        <p>
          None of these announce themselves. All three produce numbers that look
          plausible in a table and are nonsense on inspection.
        </p>

        <article className={styles.finding}>
          <h3>1. Administrative rows carry meaningless win probability</h3>
          <p>
            The play-by-play contains rows that are not plays: end of quarter,
            timeouts, the two-minute warning. They still carry a win probability
            field, and its value is garbage. From the 2000 game at Oakland, with
            the Jets losing 0–21:
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Row</th>
                <th className={styles.num}>Jets win prob.</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.bad}>
                <td className="mono">END QUARTER 3</td>
                <td className={`${styles.num} mono`}>99.4%</td>
              </tr>
              <tr>
                <td className="mono">R.Lucas up the middle for 7 yards</td>
                <td className={`${styles.num} mono`}>4.4%</td>
              </tr>
              <tr>
                <td className="mono">C.Martin up the middle for −1 yards</td>
                <td className={`${styles.num} mono`}>3.9%</td>
              </tr>
              <tr>
                <td className="mono">R.Gannon pass to J.Jett for 28 yards</td>
                <td className={`${styles.num} mono`}>3.6%</td>
              </tr>
            </tbody>
          </table>
          <p>
            Taking a maximum across the second half picks the 99.4%. The board
            then reports that the Jets were nearly certain to win a game they
            lost by 24 points.
          </p>
          <p>
            The reason it survived a first pass: these rows have an{" "}
            <strong>empty string</strong> in the possession-team column, not a
            null. A filter written as <code>posteam IS NOT NULL</code> keeps every
            one of them. That single distinction was the entire bug.
          </p>
        </article>

        <article className={styles.finding}>
          <h3>2. Kneel-downs win &ldquo;the play that did it&rdquo;</h3>
          <p>
            Each game names the play that moved win probability most. Ranked
            naively, the worst play of the 2024 Denver game came back as:
          </p>
          <blockquote className={styles.quote}>
            <span className="mono">(:47) 10-B.Nix kneels to DEN 38 for −2 yards.</span>
            <span className={styles.quoteNum}>−35.2 points of win probability</span>
          </blockquote>
          <p>
            The kneel did not decide anything. Win probability moves that much at
            the end of a game because the game is resolving, not because the play
            mattered. Kneels, spikes and nullified plays are barred from the
            caption for that reason.
          </p>
        </article>

        <article className={styles.finding}>
          <h3>3. One game describes something that never happened</h3>
          <p>
            Every Jets game since 1999 was checked for whether its running score
            actually reaches the official final. One does not:
          </p>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>Official final</td>
                <td className="mono">NYJ 3 @ JAX 28</td>
              </tr>
              <tr className={styles.bad}>
                <td>Play-by-play reaches</td>
                <td className="mono">NYJ 27 @ JAX 4</td>
              </tr>
            </tbody>
          </table>
          <p>
            The win probability for that game was computed against the second
            line, so it describes a Jets victory that did not occur — which is
            why it originally ranked first on the heartbreak board at 100%. It is
            one game out of 449. It is held out of both boards and disclosed
            rather than quietly deleted.
          </p>
        </article>
      </section>

      <section className={styles.section}>
        <h2>How the metric was checked</h2>
        <p>
          Once the filters were in place, the rankings were compared against
          games no one had told the code about. The deepest comeback it found was{" "}
          <strong>23 October 2000 against Miami, 0.4%, won 40–37</strong> — the
          Monday Night Miracle. The worst collapse was{" "}
          <strong>23 December 2018 against Green Bay, 97.8%, lost 38–44</strong>{" "}
          in overtime.
        </p>
        <p>
          Neither was hard-coded, weighted for, or hinted at. A metric that
          independently arrives at the games a fan would have named is a metric
          doing its job.
        </p>
      </section>

      <section className={styles.section}>
        <h2>What this still cannot tell you</h2>
        <ul className={styles.limits}>
          <li>
            The win probability model is nflverse&apos;s, not mine. It reads score,
            time, field position and situation. It does not know who is injured,
            who is on the field, or that the backup is in.
          </li>
          <li>
            The number records the highest point reached, not how long it was
            held. Ninety-five percent across an entire quarter and ninety-five
            percent for one snap score identically. They should not feel the same.
          </li>
          <li>
            Overtime carries no usable clock in the source data, so overtime
            plays are labelled by period only rather than given a false time.
          </li>
          <li>
            Seasons before 2006 are reconstructed from older sources and are
            thinner. The one game held out is from 2002, which is unlikely to be
            a coincidence.
          </li>
          <li>Ties are excluded. There is no collapse or comeback to measure.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Built with</h2>
        <p className={styles.stack}>
          Next.js 16 · React 19 · TypeScript · DuckDB at build time · hand-written
          CSS · static output, no backend ·{" "}
          <a href="https://github.com/Vartabg/ajetsfan" target="_blank" rel="noreferrer">
            source on GitHub
          </a>
        </p>
      </section>
    </main>
  );
}
