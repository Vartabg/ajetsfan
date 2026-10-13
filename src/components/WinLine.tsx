"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { FocusPoint } from "@/lib/focus";
import styles from "./WinLine.module.css";

const pct = (wp: number) => `${Math.round(wp * 100)}%`;

/** The game's shape: one point per play, evenly spaced, as the site's other charts do. */
/** `played` (0–1) is how much of the game the line covers; a game in progress leaves the rest of the width empty. */
export default function WinLine({ line, keys = false, label, end = "Final", played = 1 }: { line: FocusPoint[]; keys?: boolean; label: string; end?: string; played?: number }) {
  const [at, setAt] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const last = line.length - 1;
  const span = Math.max(last, Math.round(last / Math.min(1, Math.max(.05, played))));
  const x = (index: number) => index / span * 1000;
  const y = (wp: number) => (1 - wp) * 300;
  const path = line.map(([wp], index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(wp).toFixed(1)}`).join("");
  const quarters = line.flatMap(([, q], index) => index && q !== line[index - 1][1] ? [{ index, label: q > 4 ? "OT" : `Q${q}` }] : []);
  const best = line.reduce((top, point, index) => point[0] > line[top][0] ? index : top, 0);
  const marks = [{ index: 0, text: `Kickoff ${pct(line[0][0])}`, below: Math.abs(best) < last * .12 }, { index: best, text: `Best ${pct(line[best][0])}`, below: false }, { index: last, text: `${end} ${pct(line[last][0])}`, below: line[last][0] > .85 }];
  const read = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setAt(Math.min(last, Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * span)));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType === "mouse" || event.buttons) read(event.clientX); };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setAt((current) => Math.min(last, Math.max(0, (current ?? (event.key === "ArrowLeft" ? last + 1 : -1)) + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  const reading = at === null ? null : line[at];
  return <div ref={box} className={styles.chart} role="img" aria-label={label} tabIndex={0} onPointerMove={move} onPointerDown={(event) => read(event.clientX)} onPointerLeave={() => setAt(null)} onKeyDown={step} onBlur={() => setAt(null)} data-focus-chart>
    <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
      {quarters.map((quarter) => <line key={quarter.index} className={styles.tick} x1={x(quarter.index)} x2={x(quarter.index)} y1="0" y2="300" />)}
      <line className={styles.even} x1="0" x2="1000" y1="150" y2="150" />
      <path className={styles.area} d={`${path}L${x(last).toFixed(1)} 300L0 300Z`} />
      <path className={styles.line} d={path} />
    </svg>
    <i className={styles.final} style={{ left: `${x(last) / 10}%`, top: `calc((100% - 24px) * ${(y(line[last][0]) / 300).toFixed(3)})` }} aria-hidden="true" />
    <div className={styles.axis} aria-hidden="true"><span style={{ left: 0 }}>Q1</span>{quarters.map((quarter) => <span key={quarter.index} style={{ left: `${x(quarter.index) / 10}%` }}>{quarter.label}</span>)}</div>
    {keys ? <div className={styles.keys} data-focus-keys>{marks.map((mark) => {
      // Labels near an edge hang inward so enlarged text cannot push them off the screen.
      const left = x(mark.index) / 10, edge = left < 20 ? styles.start : left > 80 ? styles.end : "";
      return <span key={mark.text} className={`${mark.below ? styles.below : ""} ${edge}`} style={{ left: `${left}%`, top: `${y(line[mark.index][0]) / 3}%` }}>{mark.text}</span>;
    })}</div> : null}
    {reading ? <><span className={styles.cursor} style={{ left: `${x(at!) / 10}%` }} aria-hidden="true" /><span className={styles.readout} role="status">{reading[1] > 4 ? "OT" : `Q${reading[1]}`} · {pct(reading[0])}</span></> : null}
  </div>;
}
