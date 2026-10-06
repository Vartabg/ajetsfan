"use client";

import type { MouseEvent } from "react";
import FocusPlay from "./FocusPlay";
import { on } from "@/lib/focus-format";
import { getJetsPlayDesign, jetsPlays } from "@/lib/jets-playbook";
import { getJetsStudy } from "@/lib/jets-snap-study";
import shared from "./Focus.module.css";

// The play data already ships with the chalkboard, so each moment draws from it rather than from page props.
const REEL = jetsPlays.map((play) => ({ play, design: getJetsStudy(play.id)?.design ?? getJetsPlayDesign(play.id) }));

/** The Film Room's recorded plays, one moment each; each hands off to the chalkboard below. */
export default function FilmReel() {
  return REEL.map(({ play, design }) => {
    if (!design) return null;
    const target = `#jets-play:${play.id}`;
    // The chalkboard loads a play when the address changes; a second click on the same play only needs the scroll.
    const open = (event: MouseEvent<HTMLAnchorElement>) => {
      if (window.location.hash !== target) return;
      event.preventDefault();
      document.getElementById("jets-play-stage")?.scrollIntoView({ block: "start" });
    };
    return <FocusPlay key={play.id} id={`play-${play.id}`}
      label={`${on(`${play.date}T16:00:00Z`, { month: "short", day: "numeric", year: "numeric" })} · ${play.opponent}`}
      play={{ title: play.title, date: play.date, situation: play.situation, result: play.result, summary: play.summary, star: play.focusPlayerIds[0], design }}
      more={<a href={target} className={shared.go} onClick={open}>Take it apart on the chalkboard <span aria-hidden="true">↓</span></a>} />;
  });
}
