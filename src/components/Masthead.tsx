import Link from "./IntentLink";
import type { Streak } from "@/lib/paper";
import { WEAR_NOTE } from "@/lib/paper";
import { formatCheckedAt, formatDate } from "@/lib/current";
import styles from "./Masthead.module.css";
import SectionLinks from "./SectionLinks";
import FanMark from "./FanMark";

export default function Masthead({ streak, wear, checkedAt }: { streak: Streak | null; wear: number; checkedAt: string | null }) {
  const streakLabel = streak ? `${streak.count} straight ${streak.type === "loss" ? streak.count === 1 ? "loss" : "losses" : streak.type === "win" ? streak.count === 1 ? "win" : "wins" : streak.count === 1 ? "tie" : "ties"}` : "Awaiting a result";
  return (
    <><header id="top" className={styles.head}>
      <div className={styles.folio}>
        <span>a jets fan <span className={styles.domain}>· ajetsfan.com</span></span>
        <span className={styles.mobileWear} title={WEAR_NOTE[wear]}>{streakLabel}</span>
        <span className={styles.checkTime}>{checkedAt ? <>Results checked <time dateTime={checkedAt}>{formatCheckedAt(checkedAt)}</time></> : streak ? <>Latest archived result: {formatDate(streak.lastGame.date)}</> : "An independent Jets fan project"}</span>
      </div>

      <div className={styles.brandRow}>
        <Link href="/" className={styles.brand} aria-label="The Back Page"><FanMark className={styles.crest} /><span className={styles.wordmark}><span className={styles.brandNote} aria-hidden="true">An independent Jets publication</span><span className={`${styles.brandName} hed`}>The Back Page</span></span></Link>
        <p className={styles.tagline}>Jets football.<br />On the record.</p>
      </div>

    </header>
    <div className={styles.navigation}>
      <nav className={styles.sections} aria-label="Site sections">
        <SectionLinks />
        <span className={styles.wear} title={WEAR_NOTE[wear]}>
          {streakLabel}
        </span>
      </nav>
    </div></>
  );
}
