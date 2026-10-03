import type { ReactNode } from "react";
import Link from "@/components/IntentLink";
import TeamNavigation from "@/components/TeamNavigation";
import styles from "./page.module.css";

export default function TeamLayout({ children }: { children: ReactNode }) {
  return <main id="main" className={styles.main}>
    <TeamNavigation />
    {children}
    <p className={styles.sourceNote}><Link href="/how-made">Sources &amp; definitions</Link></p>
  </main>;
}
