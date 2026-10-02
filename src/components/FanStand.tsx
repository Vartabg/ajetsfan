import type { Game } from "@/lib/games";
import type { CurrentSnapshot } from "@/lib/current";
import MemoryWall from "./MemoryWall";
import RivalryDesk from "./RivalryDesk";
import styles from "./FanStand.module.css";

export default function FanStand({ games, snapshot }: { games: Game[]; snapshot: CurrentSnapshot | null }) {
  return <section id="fan-stand" className={styles.stand} aria-labelledby="fan-stand-heading">
    <header className={styles.header}>
      <div><p className={styles.kicker}>The historical record</p><h2 id="fan-stand-heading">Jets history.</h2><p>Super Bowl III, selected classic games, and AFC East results.</p></div>
      <p className={styles.chant}><span aria-hidden="true">J<span>—</span>E<span>—</span>T<span>—</span>S</span><small aria-hidden="true">New York Jets</small><span className="sr-only">New York Jets</span></p>
    </header>
    <aside className={styles.guarantee} aria-labelledby="guarantee-heading">
      <div><p className={styles.kicker}>The championship result</p><h3 id="guarantee-heading">Super Bowl III.</h3><p>The Jets’ historical account records Joe Namath’s pregame guarantee and the 16–7 win over Baltimore.</p><a href="https://www.newyorkjets.com/news/super-bowl-iii-jets-16-colts-7-2507141" target="_blank" rel="noreferrer">Read the Jets’ historical account <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></div>
      <div className={styles.originalScore}><p>Jets <strong>16</strong><span aria-hidden="true">—</span><strong>7</strong> Baltimore Colts</p><small>Super Bowl III · 1968 season<br /><time dateTime="1969-01-12">January 12, 1969</time></small></div>
    </aside>
    <MemoryWall games={games} compact />
    <RivalryDesk games={games} snapshot={snapshot} />
  </section>;
}
