import Link from "next/link";
import { rank, clockLabel } from "@/lib/games";
import { loadGames, loadCurve } from "@/lib/load-games";
import { currentStreak, wearLevel, pickLead, headlineScale, spellNumber, WEAR_NOTE } from "@/lib/paper";
import PressChart from "@/components/PressChart";
import styles from "./page.module.css";

const MONTHS = ["Jan.","Feb.","March","April","May","June","July","Aug.","Sept.","Oct.","Nov.","Dec."];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

export default async function BackPage() {
  const games = await loadGames();
  const streak = currentStreak(games);
  const wear = wearLevel(streak);
  const lead = pickLead(games, streak)!;
  const curve = await loadCurve(lead.id);
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");

  const pct = (lead.swing ?? 0) * 100;
  const scale = headlineScale(lead.swing);
  const lost = lead.outcome === "loss";

  return (
    <main id="main" className={styles.main}>
      <article className={styles.lead}>
        <p className={`${styles.kicker} label`}>
          {lost ? "The worst night in the archive" : "The deepest hole in the archive"}
        </p>

        <div className={styles.leadGrid}>
          <div className={styles.leadLeft}>
            <h1 className="hed" style={{ fontSize: `clamp(52px, ${scale * 11}vw, ${scale * 128}px)` }}>
              {spellNumber(Number(pct.toFixed(1)))}
            </h1>

            <p className={`${styles.deck} deck`}>
              {lead.atHome ? "" : "At "}
              {lead.opponentDisplay} {lead.oppScore}, Jets {lead.jetsScore}
              {lead.wentToOt ? " · OT" : ""} · {longDate(lead.date)}
            </p>

            <div className={styles.body}>
              <p>
                <span className={styles.dropcap}>{lost ? "W" : "T"}</span>
                {lost ? (
                  <>
                    ith the ball and the clock on their side, the Jets held a {pct.toFixed(1)} percent
                    chance to win this game. In the twenty-seven seasons on record, no Jets team has
                    ever been closer to a win it did not get.
                  </>
                ) : (
                  <>
                    heir chances had fallen to {pct.toFixed(1)} percent. In the twenty-seven seasons on
                    record, no Jets team has climbed out of a hole this deep and still won.
                  </>
                )}
              </p>
              {lead.keyPlay.desc ? (
                <p>
                  The play that decided it, with{" "}
                  <span className="agate">{clockLabel(lead.keyPlay.qtr, lead.keyPlay.secondsLeft)}</span>{" "}
                  showing: <em>{lead.keyPlay.desc}</em>
                </p>
              ) : null}
              <p className={styles.jump}>
                Continued in <Link href="/morgue">The Morgue</Link> →
              </p>
            </div>
          </div>

          <aside className={styles.rail}>
            <figure className={styles.chart}>
              <figcaption className="label">Win probability · {lead.date}</figcaption>
              <PressChart points={curve} board={lost ? "heartbreak" : "miracle"} />
            </figure>

            <div className={styles.edition}>
              <p className="label">About this edition</p>
              <p className={styles.editionBody}>
                This paper yellows with the losing streak. {WEAR_NOTE[wear]}
                {streak && streak.type === "loss" && streak.count > 1 ? (
                  <>
                    {" "}
                    The Jets have lost {streak.count} straight since {longDate(streak.since)}.
                  </>
                ) : null}{" "}
                A win prints it back on fresh stock.
              </p>
              <div className={styles.wearScale} aria-hidden="true">
                {[0, 1, 2, 3, 4].map((n) => (
                  <span key={n} className={n === wear ? styles.wearOn : styles.wearOff} data-swatch={n} />
                ))}
              </div>
            </div>
          </aside>
        </div>
      </article>

      <section className={styles.strip}>
        <div className={styles.stripCol}>
          <h2 className={`${styles.stripHead} label`}>Heartbreak · the standings</h2>
          <ol className={`${styles.agateList} agate`}>
            {heartbreak.slice(0, 6).map((g, i) => (
              <li key={g.id}>
                <span className={styles.n}>{i + 1}</span>
                <span className={styles.mt}>{g.atHome ? "vs" : "at"} {g.opponentDisplay}</span>
                <span className={styles.dt}>{g.date}</span>
                <span className={styles.pc}>{((g.swing ?? 0) * 100).toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.stripCol}>
          <h2 className={`${styles.stripHead} label`}>Miracles · the standings</h2>
          <ol className={`${styles.agateList} agate`}>
            {miracle.slice(0, 6).map((g, i) => (
              <li key={g.id}>
                <span className={styles.n}>{i + 1}</span>
                <span className={styles.mt}>{g.atHome ? "vs" : "at"} {g.opponentDisplay}</span>
                <span className={styles.dt}>{g.date}</span>
                <span className={styles.pc}>{((g.swing ?? 0) * 100).toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.stripCol}>
          <h2 className={`${styles.stripHead} label`}>The record</h2>
          <table className={`${styles.agateTable} agate`}>
            <tbody>
              <tr><td>Games in the archive</td><td>{heartbreak.length + miracle.length}</td></tr>
              <tr><td>Losses after reaching 90%</td><td>{heartbreak.filter((g) => (g.swing ?? 0) >= 0.9).length}</td></tr>
              <tr><td>Wins from under 10%</td><td>{miracle.filter((g) => (g.swing ?? 1) <= 0.1).length}</td></tr>
              <tr><td>Seasons covered</td><td>1999–2025</td></tr>
              <tr><td>Current stock</td><td>{wear}/4</td></tr>
            </tbody>
          </table>
          <p className={styles.stripNote}>
            Full archive in <Link href="/morgue">The Morgue</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
