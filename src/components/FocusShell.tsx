"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "./IntentLink";
import { SECTIONS } from "@/lib/site-sections";
import { on } from "@/lib/focus-format";
import styles from "./Focus.module.css";

export type FocusEntry = { id: string; title: string; answer: string };
const MORE: FocusEntry = { id: "more", title: "Everything else", answer: "Team, seasons, archive…" };

/** The frame every focus page shares: a slim bar on phones, an index of moments on wide screens, and the site's sections last. */
export default function FocusShell({ page, entries, checkedAt, className = "", children }: { page: string; entries: FocusEntry[]; checkedAt: string | null; className?: string; children: ReactNode }) {
  const pathname = usePathname();
  const index = [...entries, MORE];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const sections = index.map((entry) => document.getElementById(entry.id)).filter((section): section is HTMLElement => section !== null);
    // The moment crossing the middle of the screen is the one in view, however tall it is.
    const observer = new IntersectionObserver((records) => {
      for (const record of records) if (record.isIntersecting) setActive(sections.indexOf(record.target as HTMLElement));
    }, { rootMargin: "-45% 0px -54% 0px" });
    sections.forEach((section) => observer.observe(section));
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest("input, select, textarea, [contenteditable], [data-focus-chart], [data-focus-tools]")) return;
      const step = ["ArrowDown", "j"].includes(event.key) ? 1 : ["ArrowUp", "k"].includes(event.key) ? -1 : 0;
      if (!step) return;
      const middle = innerHeight / 2;
      const current = sections.findIndex((section) => { const box = section.getBoundingClientRect(); return box.top <= middle && box.bottom > middle; });
      const box = sections[current]?.getBoundingClientRect();
      // Inside a moment taller than the screen, the arrow keys scroll it until its far edge is in view.
      if (box && event.key.startsWith("Arrow") && (step > 0 ? box.bottom > innerHeight + 1 : box.top < -1)) return;
      const target = sections[Math.min(sections.length - 1, Math.max(0, (current < 0 ? 0 : current) + step))];
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    };
    addEventListener("keydown", keys);
    return () => { observer.disconnect(); removeEventListener("keydown", keys); };
  // The moment list only changes with a new build.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className={`${styles.app} ${className}`} data-focus-page={page}>
    <header className={styles.bar}>
      <Link href="/" className={styles.brand}>ajets<span>fan</span></Link>
      <span className={styles.progress} aria-hidden="true">{index.map((entry, at) => <i key={entry.id} data-on={at === active ? "" : undefined} />)}</span>
      <a href="#more" className={styles.menu}>Menu</a>
    </header>
    <aside className={styles.rail}>
      <Link href="/" className={styles.brand}>ajets<span>fan</span></Link>
      <nav aria-label="On this page"><ol>{index.map((entry, at) => <li key={entry.id}><a href={`#${entry.id}`} aria-current={at === active ? "true" : undefined}><span>{entry.title}</span><b>{entry.answer}</b></a></li>)}</ol></nav>
      {checkedAt ? <p className={styles.note}>Results checked {on(checkedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET.</p> : null}
    </aside>
    <main id="main" className={styles.stack}>
      {children}
      <section id="more" className={styles.moment} aria-labelledby="more-heading" data-focus-moment="more">
        <p className={styles.label}>ajetsfan</p>
        {entries.length ? <h2 id="more-heading" className={styles.say}>Everything else.</h2> : <h1 id="more-heading" className={styles.say}>Everything else.</h1>}
        <nav aria-label="Site sections" className={styles.sections}><ul>{SECTIONS.map((section) => <li key={section.href}><Link href={section.href} pendingHint aria-current={pathname === section.href ? "page" : undefined}><b>{section.label}</b><span>{section.note}</span></Link></li>)}</ul></nav>
        {checkedAt ? <p className={styles.note}>Results checked {on(checkedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ET.</p> : null}
      </section>
    </main>
  </div>;
}
