"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "./IntentLink";
import styles from "./TeamFocusNavigation.module.css";

const sections = [
  { href: "/team", label: "Overview" },
  { href: "/team/roster", label: "Roster" },
  { href: "/team/stats", label: "Player stats" },
  { href: "/team/news", label: "News" },
];

// The navigation remounts inside each page's shell. Carry only a deliberate
// local navigation across that remount; deep links and browser history keep focus.
let requestedPage: string | null = null;

export default function TeamFocusNavigation() {
  const pathname = usePathname();
  const current = sections.find((section) => section.href === pathname);

  useEffect(() => {
    if (requestedPage !== pathname) return;
    const frame = requestAnimationFrame(() => {
      if (requestedPage !== pathname) return;
      requestedPage = null;
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return <div className={styles.navigation}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <Link href="/">Home</Link><span aria-hidden="true">/</span>
      <Link href="/team">Team</Link><span aria-hidden="true">/</span>
      <span aria-current="page">{current?.label ?? "Player profile"}</span>
    </nav>
    <nav className={styles.tabs} aria-label="Team sections">
      {sections.map((section) => <Link key={section.href} href={section.href}
        onNavigate={() => { requestedPage = section.href; }}
        aria-current={pathname === section.href ? "page" : undefined}>{section.label}</Link>)}
    </nav>
  </div>;
}
