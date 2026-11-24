"use client";

import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SeasonWeeks } from "@/lib/focus";
import { dayOf, record } from "@/lib/focus-format";
import FocusMoment from "./FocusMoment";
import shared from "./Focus.module.css";
import styles from "./FocusHome.module.css";

export type OpenWeek = { week: number; content: ReactNode };
const states = { win: "Win", loss: "Loss", tie: "Tie", next: "Next game", upcoming: "Scheduled", bye: "" };

export default function HomeSeason({ season, first, detail }: { season: SeasonWeeks; first: boolean; detail?: OpenWeek }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const openedFrom = useRef<number | null>(null);
  const lastOpen = useRef<number | null>(null);
  const selected = detail?.week;
  const played = season.wins + season.losses + season.ties;

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (selected && panel) {
      lastOpen.current = selected;
      if (panel.showModal && !panel.matches(":modal")) {
        // The server sends an open, readable panel for visits with scripting disabled.
        panel.removeAttribute("open");
        panel.showModal();
      }
      panel.querySelector<HTMLElement>("[data-week-close]")?.focus({ preventScroll: true });
    } else if (lastOpen.current !== null) {
      const link = document.getElementById("season-week-" + lastOpen.current);
      link?.focus({ preventScroll: true });
      lastOpen.current = null;
      openedFrom.current = null;
    }
  }, [selected]);

  const returnHref = "/#season-week-" + selected;
  function dismiss() {
    if (openedFrom.current === selected) router.back();
    else router.replace(returnHref, { scroll: false });
  }
  function closeLink(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    dismiss();
  }

  return <FocusMoment id="season" first={first} label={season.year + " season"}
    heading={<>{record(season.wins, season.losses, season.ties)} <em>{played ? `after ${played} game${played === 1 ? "" : "s"}.` : "before the opener."}</em></>}
    actions={<Link prefetch={false} href={"/seasons/" + season.year} className={shared.go}>Season page <span aria-hidden="true">→</span></Link>}>
    <p className={shared.caption}>Select a week for game details. Scores show the Jets first.</p>
    <ol className={styles.marks} aria-label="Regular season by week">
      {season.weeks.map(week => <li key={week.week} className={styles[week.state]} data-week-state={week.state}>
        <Link href={"/?week=" + week.week + "#season"} id={"season-week-" + week.week} prefetch={false} scroll={false}
          aria-haspopup="dialog" onNavigate={() => { openedFrom.current = week.week; }}>
          <i><span className="sr-only">Week </span>{week.week}</i>
          <span>{week.opponent ? (week.home ? "Home" : "Away") + " · " + week.opponent : season.byeWeek === week.week ? "Bye week" : "No game listed"}</span>
          {week.opponent && <small>{week.date ? (week.state === "next" ? "Next · " : "") + dayOf(week.date) : states[week.state] + (week.score ? " " + week.score : "")}</small>}
        </Link>
      </li>)}
    </ol>
    {detail && <dialog key={selected} ref={dialog} open className={styles.weekDialog} aria-labelledby="season-week-heading" data-focus-tools
      onCancel={event => { event.preventDefault(); dismiss(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dismiss();
      }}>
      <div className={styles.weekTop}><h2 id="season-week-heading">Week {selected}<span className="sr-only"> game details</span></h2>
        <a href={returnHref} onClick={closeLink} data-week-close>Close</a></div>
      {detail.content}
    </dialog>}
  </FocusMoment>;
}
