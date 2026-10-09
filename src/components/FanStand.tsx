import type { Game } from "@/lib/games";
import type { CurrentSnapshot } from "@/lib/current";
import { selectFanMemories } from "@/lib/fan-memories";
import MemoryWall from "./MemoryWall";
import RivalryDesk from "./RivalryDesk";
import FocusMoment from "./FocusMoment";
import Link from "./IntentLink";
import shared from "./Focus.module.css";
import styles from "./FanStand.module.css";

export default function FanStand({ games, snapshot }: { games: Game[]; snapshot: CurrentSnapshot | null }) {
  return <>
    <FocusMoment id="fan-stand" first label="The historical record" heading="Jets history."
      actions={<><Link href="/history/trades" className={shared.go}>The trade ledger · every pick, followed <span aria-hidden="true">→</span></Link><Link href="/seasons" className={shared.go}>Browse the seasons <span aria-hidden="true">→</span></Link></>}>
    <p className={styles.chant}><span aria-hidden="true">J—E—T—S</span><span className="sr-only">New York Jets</span></p>
    <p className={shared.caption}>The games that stay with you. Super Bowl III, selected classic games, and AFC East results.</p>
    <aside className={styles.guarantee} aria-labelledby="guarantee-heading">
      <p className={shared.label}>The championship result</p>
      <h2 id="guarantee-heading">Super Bowl III.</h2>
      <div className={styles.originalScore} aria-label="Jets 16, Baltimore Colts 7"><p><span>Jets</span><strong>16</strong></p><span aria-hidden="true">—</span><p><span>Baltimore Colts</span><strong>7</strong></p></div>
      <p className={shared.note}>1968 season · <time dateTime="1969-01-12">January 12, 1969</time></p>
      <p className={shared.caption}>The Jets’ historical account records Joe Namath’s pregame guarantee and the 16–7 win over Baltimore.</p>
      <a className={shared.go} href="https://www.newyorkjets.com/news/super-bowl-iii-jets-16-colts-7-2507141" target="_blank" rel="noreferrer">Read the Jets’ historical account <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
    </aside>
    </FocusMoment>
    {selectFanMemories(games).length ? <FocusMoment id="memories" hosts><div className={styles.content}><MemoryWall games={games} compact /></div></FocusMoment> : null}
    <FocusMoment id="rivals" hosts><div className={styles.content}><RivalryDesk games={games} snapshot={snapshot} /></div></FocusMoment>
  </>;
}
