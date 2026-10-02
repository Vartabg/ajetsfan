"use client";

import Link from "next/link";
import styles from "./recovery.module.css";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main id="main" className={styles.main}>
    <p className={styles.kicker}>A delay in the press room</p>
    <h1>Page temporarily unavailable.</h1>
    <p>This page couldn’t finish loading. Try again, or head back to the front page.</p>
    <div className={styles.actions}><button type="button" onClick={retry}>Try again</button><Link href="/">Back to The Back Page →</Link></div>
  </main>;
}
