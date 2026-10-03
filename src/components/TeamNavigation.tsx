"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Link from "./IntentLink";
import styles from "@/app/team/page.module.css";

const sections = [
  { href: "/team", label: "Overview" },
  { href: "/team/roster", label: "Roster" },
  { href: "/team/stats", label: "Player stats" },
  { href: "/team/news", label: "News" },
];

/** The same route controls stay in place throughout the team section. */
export default function TeamNavigation() {
  const pathname = usePathname();
  const requestedPage = useRef<string | null>(null);
  const current = sections.find((section) => section.href === pathname) ?? sections[0];
  useEffect(() => {
    const cancel = () => { requestedPage.current = null; };
    window.addEventListener("popstate", cancel);
    return () => window.removeEventListener("popstate", cancel);
  }, []);
  useEffect(() => {
    const requested = requestedPage.current;
    requestedPage.current = null;
    if (requested !== pathname) return;
    // Only a deliberate local-page click moves focus. Preserve browser Back,
    // deep links and the control row; reveal just enough of the new heading.
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return;
      heading.focus({ preventScroll: true });
      const bounds = heading.getBoundingClientRect();
      const navigation = document.querySelector<HTMLElement>('nav[aria-label="Site sections"]');
      const top = Math.max(0, navigation?.getBoundingClientRect().bottom ?? 0) + 16;
      const bottom = window.innerHeight - 16;
      const shift = bounds.top < top || bounds.height > bottom - top ? bounds.top - top
        : bounds.bottom > bottom ? bounds.bottom - bottom : 0;
      if (shift) window.scrollBy({ top: shift, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return <div className={styles.navigation}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <Link href="/">Home</Link><span aria-hidden="true">/</span>
      {pathname === "/team" ? <span aria-current="page">Team</span> : <><Link href="/team" scroll={false} onNavigate={() => { requestedPage.current = "/team"; }}>Team</Link><span aria-hidden="true">/</span><span aria-current="page">{current.label}</span></>}
    </nav>
    <nav className={styles.sectionNav} aria-label="Team sections">
      {sections.map((section) => <Link key={section.href} href={section.href} scroll={false} onNavigate={() => { requestedPage.current = section.href; }} aria-current={pathname === section.href ? "page" : undefined}>{section.label}</Link>)}
    </nav>
  </div>;
}
