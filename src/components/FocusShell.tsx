"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "./IntentLink";
import { SECTIONS } from "@/lib/site-sections";
import { on } from "@/lib/focus-format";
import styles from "./Focus.module.css";
import rail from "./FocusRail.module.css";

export type FocusEntry = { id: string; title: string; answer: string };
const MORE: FocusEntry = { id: "more", title: "Everything else", answer: "Team, seasons, archive…" };

const followsNormally = (event: MouseEvent<HTMLAnchorElement>) =>
  !event.defaultPrevented && event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

function followSection(event: MouseEvent<HTMLAnchorElement>) {
  if (followsNormally(event)) event.currentTarget.closest("dialog")?.close();
}

/** The frame every focus page shares: the section directory and an index of this page's moments. */
/** `section` names the site section a page belongs to when its path does not say so, such as a game under Seasons. `name` titles a page below its section. */
export default function FocusShell({ page, entries, checkedAt, section, name, className = "", style, children }: { page: string; entries: FocusEntry[]; checkedAt: string | null; section?: string; name?: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const pathname = usePathname();
  const index = [...entries, MORE];
  const entryIds = JSON.stringify(entries.map((entry) => entry.id));
  // Use the most specific destination, and keep player profiles in the Team desk.
  const place = section ?? (pathname.startsWith("/players/") ? "/team" : pathname);
  const currentHref = SECTIONS.filter(({ href }) => place === href || place.startsWith(`${href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const current = (href: string) => href === currentHref ? "page" : undefined;
  // A page below its section names itself and links back up, so its own list of moments reads as this page's.
  const home = SECTIONS.find(({ href }) => href === currentHref);
  const parent = home && pathname !== home.href ? home : null;
  const title = parent ? name : home?.label ?? name;
  const context = parent || title ? <div className={rail.context}>
    {parent ? <Link href={parent.href} className={rail.back}><span aria-hidden="true">←</span> <span className="sr-only">Back to </span>{parent.label}</Link> : null}
    {title ? <p className={rail.name}>{title}</p> : null}
  </div> : null;
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<"sections" | "moments" | null>(null);
  const directory = useRef<HTMLDialogElement>(null);
  const pageIndex = useRef<HTMLDialogElement>(null);
  const stack = useRef<HTMLElement>(null);

  // An enhanced shortcut opens over the current screen. Its fragment remains usable before hydration and without JavaScript.
  const openDialog = (event: MouseEvent<HTMLAnchorElement>, dialog: HTMLDialogElement | null, kind: "sections" | "moments") => {
    if (!followsNormally(event) || !dialog?.showModal) return;
    event.preventDefault();
    // Some browsers leave links unfocused on pointer activation. Record the opener for native focus return without moving the page.
    event.currentTarget.focus({ preventScroll: true });
    dialog.showModal();
    dialog.scrollTop = 0;
    setOpen(kind);
  };
  // Close the index and move keyboard focus to the selected moment.
  const goTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!followsNormally(event) || !target) return;
    event.preventDefault();
    pageIndex.current?.close();
    history.replaceState(history.state, "", `#${id}`);
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: "instant" });
  };

  useEffect(() => {
    const findSections = () => index.map((entry) => document.getElementById(entry.id)).filter((section): section is HTMLElement => section !== null);
    let sections = findSections();
    // The moment crossing the middle of the screen is the one in view, however tall it is.
    const observer = new IntersectionObserver((records) => {
      for (const record of records) if (record.isIntersecting) {
        const at = sections.indexOf(record.target as HTMLElement);
        if (at >= 0) setActive(at);
      }
    }, { rootMargin: "-45% 0px -54% 0px" });
    sections.forEach((section) => observer.observe(section));
    // An RSC refresh may replace a section without changing its ID. Only
    // direct-child replacements matter; text, clocks and controls within a
    // moment never restart observation or change the reader's position.
    const replacements = new MutationObserver(() => {
      const next = findSections();
      if (next.length !== index.length || next.every((section, at) => section === sections[at])) return;
      observer.disconnect();
      sections = next;
      sections.forEach((section) => observer.observe(section));
    });
    if (stack.current) replacements.observe(stack.current, { childList: true });
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || directory.current?.open || pageIndex.current?.open || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest("input, select, textarea, [contenteditable], [data-focus-chart], [data-focus-tools], [data-inline-media], video, audio")) return;
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
    return () => { replacements.disconnect(); observer.disconnect(); removeEventListener("keydown", keys); };
  // Runtime evidence can add a moment while this shell stays mounted. Observe
  // the new DOM only when its IDs change; labels and source clocks keep the
  // same listeners and never reposition the reader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIds]);

  const siteNavigation = <div className={styles.siteNavigation}>
    <Link href="/" className={styles.brand} aria-label="ajetsfan">ajets<span>fan</span></Link>
    <a href="#more" className={`${styles.shortcut} ${styles.browse}`} aria-haspopup="dialog" aria-expanded={open === "sections"} aria-controls="focus-sections" onClick={(event) => openDialog(event, directory.current, "sections")}>Browse sections</a>
  </div>;
  const gameLinks = (onClick?: (event: MouseEvent<HTMLAnchorElement>) => void) => <>
    <Link href="/find" className={styles.findGame} aria-current={pathname === "/find" ? "page" : undefined} onClick={onClick}>Find a game</Link>
    <Link href="/game-day/follow" className={styles.findGame} aria-current={pathname === "/game-day/follow" ? "page" : undefined} onClick={onClick}>Follow at my TV clock</Link>
  </>;
  const sectionLinks = (label: string, onClick?: (event: MouseEvent<HTMLAnchorElement>) => void) =>
    <nav aria-label={label} className={styles.sections}><ul>{SECTIONS.map((section) => <li key={section.href}>
      <Link href={section.href} onClick={onClick} pendingHint={!onClick} aria-current={current(section.href)}><b>{section.label}</b><span>{section.note}</span></Link>
    </li>)}</ul></nav>;
  const momentLinks = (moments: FocusEntry[], inDialog = false) =>
    <ol>{moments.map((entry, at) => <li key={entry.id}>
      <a href={`#${entry.id}`} aria-current={at === active ? "true" : undefined} onClick={inDialog ? (event) => goTo(event, entry.id) : undefined}><span>{entry.title}</span><b>{entry.answer}</b></a>
    </li>)}</ol>;
  return <div className={`${styles.app} ${className}`} style={style} data-focus-page={page}>
    <header className={styles.bar}>
      {siteNavigation}
      {entries.length ? <a href="#focus-page-index" className={`${styles.shortcut} ${styles.pageShortcut}`} aria-haspopup="dialog" aria-expanded={open === "moments"} aria-controls="focus-moments" onClick={(event) => openDialog(event, pageIndex.current, "moments")}>On this page</a> : null}
    </header>
    <aside id="focus-page-index" className={styles.rail} tabIndex={-1}>
      {siteNavigation}
      {context}
      <nav className={styles.sheetMoments} aria-label="On this page"><p className={rail.label}>On this page</p>{momentLinks(index)}</nav>
      {checkedAt ? <p className={styles.note}>Results checked {on(checkedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET.</p> : null}
    </aside>
    <dialog ref={directory} id="focus-sections" className={styles.sheet} aria-labelledby="focus-sections-heading" onClose={(event) => { if (!event.currentTarget.open) setOpen((kind) => kind === "sections" ? null : kind); }}
      onClick={(event) => { if (event.target === event.currentTarget) directory.current?.close(); }}>
      <div className={styles.sheetHead}><h2 id="focus-sections-heading">Browse sections</h2><button type="button" className={styles.sheetClose} onClick={() => directory.current?.close()}>Close</button></div>
      {gameLinks(followSection)}
      {sectionLinks("All sections", followSection)}
    </dialog>
    {entries.length ?
      <dialog ref={pageIndex} id="focus-moments" className={styles.sheet} aria-labelledby="focus-moments-heading" onClose={(event) => { if (!event.currentTarget.open) setOpen((kind) => kind === "moments" ? null : kind); }}>
        <div className={styles.sheetHead}><h2 id="focus-moments-heading">On this page</h2><button type="button" className={styles.sheetClose} onClick={() => pageIndex.current?.close()}>Close</button></div>
        {context}
        <nav className={styles.sheetMoments} aria-labelledby="focus-moments-heading">{momentLinks(entries, true)}</nav>
      </dialog> : null}
    <main ref={stack} id="main" className={styles.stack}>
      {children}
      <section id="more" className={styles.moment} aria-labelledby="more-heading" data-focus-moment="more" tabIndex={-1}>
        <p className={styles.label}>ajetsfan</p>
        {entries.length ? <h2 id="more-heading" className={styles.say}>Everything else.</h2> : <h1 id="more-heading" className={styles.say}>Everything else.</h1>}
        {gameLinks()}
        {sectionLinks("Site sections")}
        {checkedAt ? <p className={styles.note}>Results checked {on(checkedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ET.</p> : null}
      </section>
    </main>
    <footer className={styles.foot}>
      <p>ajetsfan is an independent, unofficial New York Jets fan publication. Not affiliated with or endorsed by the New York Jets or the NFL.</p>
      <div className={styles.footLinks}>
        <Link href="/how-made">Methods &amp; sources</Link>
        <a href="/.well-known/security.txt">Security</a>
      </div>
    </footer>
  </div>;
}
