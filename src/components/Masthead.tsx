import Link from "next/link";
import type { Streak } from "@/lib/paper";
import { WEAR_NOTE } from "@/lib/paper";
import styles from "./Masthead.module.css";

const SECTIONS = [
  { href: "/", label: "The Back Page" },
  { href: "/morgue", label: "The Morgue" },
];

export default function Masthead({ streak, wear }: { streak: Streak | null; wear: number }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className={styles.head}>
      <nav className={styles.sections}>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className={`${styles.section} label`}>
            {s.label}
          </Link>
        ))}
      </nav>

      <div className={styles.folio}>
        <span className="label">a jets fan · ajetsfan.com</span>
        <span className="label">{today}</span>
        <span className={`${styles.wear} label`} title={WEAR_NOTE[wear]}>
          {streak && streak.type === "loss" && streak.count > 1
            ? `${streak.count} straight · stock ${wear}/4`
            : `stock ${wear}/4`}
        </span>
      </div>
    </header>
  );
}
