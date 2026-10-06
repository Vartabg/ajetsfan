"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "./IntentLink";
import TeamNavigation from "./TeamNavigation";
import { FOCUS_ROUTES } from "@/lib/site-sections";
import styles from "@/app/team/page.module.css";

/** The team overview is a focus page with its own frame; roster, stats and news keep the team tabs. */
export default function TeamFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (FOCUS_ROUTES.includes(pathname)) return children;
  return <main id="main" className={styles.main}>
    <TeamNavigation />
    {children}
    <p className={styles.sourceNote}><Link href="/how-made">Sources &amp; definitions</Link></p>
  </main>;
}
