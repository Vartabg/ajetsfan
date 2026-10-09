"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import FocusMoment from "./FocusMoment";
import { sampleBall, samplePlayer } from "@/lib/playbook-sampling";
import type { PlayDesign } from "@/lib/playbook";
import shared from "./Focus.module.css";

export type FocusPlayData = { title: string; date: string; situation: string; result: string; summary: string; star: string; design: PlayDesign };

const YARD_LINES = [60, 120, 180, 240, 300, 420, 480, 540];

/** One recorded play as a moment: twenty-two dots that run on request, the key route in green. */
export default function FocusPlay({ id, label, play, more }: { id: string; label: string; play: FocusPlayData; more?: ReactNode }) {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const run = () => {
    cancelAnimationFrame(frame.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setTime(6); return; }
    const start = performance.now();
    setRunning(true);
    const tick = (now: number) => {
      const seconds = Math.min(6, (now - start) / 1000);
      setTime(seconds);
      if (seconds < 6) frame.current = requestAnimationFrame(tick); else setRunning(false);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const star = play.design.players.find((player) => player.id === play.star);
  const ball = sampleBall(play.design, time);
  return <FocusMoment id={id} label={label}
    heading={<>{play.title.split(":")[0]}. <em>{play.result.split(" · ").at(-1)}.</em></>}
    actions={<><button type="button" className={shared.button} onClick={run} disabled={running} data-focus-play>{time >= 6 ? "Play it again" : running ? "Playing…" : "Play it"}</button>{more}</>}>
    <figure className={shared.shape}>
      <svg className={shared.field} viewBox="0 30 1000 540" role="img" aria-label="Twenty-two players at the snap; the highlighted route is the play’s key route." data-focus-field data-time={time.toFixed(1)}>
        {YARD_LINES.map((line) => <line key={line} className={shared.yard} x1="0" x2="1000" y1={line} y2={line} />)}
        <line className={shared.scrimmage} x1="0" x2="1000" y1="360" y2="360" />
        {star ? <polyline className={shared.route} points={[star, ...star.path].map((point) => `${point.x},${point.y}`).join(" ")} /> : null}
        {play.design.players.map((player) => { const point = samplePlayer(player, time); return <circle key={player.id} cx={point.x} cy={point.y} r={player.id === play.star ? 15 : 11} className={player.id === play.star ? shared.star : player.side === "offense" ? shared.offense : shared.defense} />; })}
        <circle className={shared.ball} cx={ball.x} cy={ball.y - 14} r="7" />
      </svg>
      <figcaption>{play.situation.replace(/ · /g, ", ")}. {play.summary.split(". ")[0]}. Drawn to show the idea, not traced from film.</figcaption>
    </figure>
  </FocusMoment>;
}
