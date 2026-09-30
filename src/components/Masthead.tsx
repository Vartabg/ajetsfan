import Link from "next/link";
import type { Streak } from "@/lib/paper";
import { WEAR_NOTE } from "@/lib/paper";
import { formatCheckedAt, formatDate } from "@/lib/current";
import styles from "./Masthead.module.css";
import SectionLinks from "./SectionLinks";

export default function Masthead({ streak, wear, checkedAt }: { streak: Streak | null; wear: number; checkedAt: string | null }) {
  return (
    <header className={styles.head}>
      <div className={styles.folio}>
        <span>a jets fan · ajetsfan.com</span>
        <span>{checkedAt ? <>Results checked <time dateTime={checkedAt}>{formatCheckedAt(checkedAt)}</time></> : streak ? <>Latest archived result: {formatDate(streak.lastGame.date)}</> : "An independent Jets fan project"}</span>
      </div>

      <div className={styles.brandRow}>
        <Link href="/" className={`${styles.brand} hed`}>The Back Page</Link>
        <p className={styles.tagline}>Hope. Regret.{" "}<br />Jets football.</p>
      </div>

      <nav className={styles.sections} aria-label="Site sections">
        <SectionLinks />
        <span className={styles.wear} title={WEAR_NOTE[wear]}>
          {streak ? `${streak.count} straight ${streak.type === "loss" ? streak.count === 1 ? "loss" : "losses" : streak.type === "win" ? streak.count === 1 ? "win" : "wins" : streak.count === 1 ? "tie" : "ties"}` : "Awaiting a result"}
        </span>
      </nav>
    </header>
  );
}
