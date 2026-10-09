"use client";

import { lazy, Suspense } from "react";
import styles from "./recovery.module.css";

// An error frame is needed only after a failure. Loading it lazily prevents a
// second copy of the focus navigation from shipping with every successful page.
const ErrorRecovery = lazy(() => import("@/components/ErrorRecovery"));
// The emergency fallback also navigates when the client router cannot recover.
// eslint-disable-next-line @next/next/no-html-link-for-pages
const homeLink = <a href="/">Back to the front page →</a>;

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <Suspense fallback={<main id="main" className={styles.main}>
    <h1>Page temporarily unavailable.</h1>
    <p>This page couldn’t finish loading. Try again, or head back to the front page.</p>
    <div className={styles.actions}><button type="button" onClick={retry}>Try again</button>{homeLink}</div>
  </main>}>
    <ErrorRecovery retry={retry} />
  </Suspense>;
}
