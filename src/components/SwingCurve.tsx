"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type Ref } from "react";
import type { Board, Game } from "@/lib/games";
import { clockLabel, pct } from "@/lib/games";
import { formatDate } from "@/lib/current";
import { keyPlayIndex } from "@/lib/curve";
import { morgueEpitaph } from "@/lib/morgue";
import styles from "./SwingCurve.module.css";

type Point = { playId?: number; q: number; t: number | null; wp: number; d: number | null; desc: string | null; type: string | null };
const H = 265;
const L = 48;
const R = 16;
const T = 18;
const B = 46;

export default function SwingCurve({ game, board, headingRef }: { game: Game; board: Board; headingRef?: Ref<HTMLHeadingElement> }) {
  return <GameCurve key={`${game.id}-${board}`} game={game} board={board} headingRef={headingRef} />;
}

function GameCurve({ game, board, headingRef }: { game: Game; board: Board; headingRef?: Ref<HTMLHeadingElement> }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/data/curves/${game.id}.json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((data: Point[]) => {
        if (!Array.isArray(data)) throw new Error("Invalid probability curve");
        setPoints(data.filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1));
        setError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [game.id, retry]);

  const geo = useMemo(() => {
    if (!points || points.length < 2) return null;
    const x = (index: number) => L + index / (points.length - 1) * (width - L - R);
    const y = (wp: number) => T + (1 - wp) * (H - T - B);
    const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.wp).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`;
    const marks: { index: number; label: string }[] = [];
    let swingIndex = -1;
    points.forEach((point, index) => {
      if (index === 0 || points[index - 1].q !== point.q) marks.push({ index, label: point.q > 4 ? `OT${point.q - 4}` : `Q${point.q}` });
      if (point.q >= 3 && (swingIndex === -1 || (board === "heartbreak" ? point.wp > points[swingIndex].wp : point.wp < points[swingIndex].wp))) swingIndex = index;
    });
    return { x, y, line, area, marks, swingIndex, keyIndex: keyPlayIndex(points, game.keyPlay) };
  }, [points, board, game.keyPlay, width]);

  const index = selectedIndex ?? (geo && geo.keyIndex >= 0 ? geo.keyIndex : geo?.swingIndex ?? 0);
  const selected = points?.[index];
  const readoutId = `play-readout-${game.id}`;
  const helpId = `play-help-${game.id}`;

  function choosePlay(event: PointerEvent<SVGSVGElement>) {
    if (!geo || !points) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) * width / box.width;
    setSelectedIndex(Math.max(0, Math.min(points.length - 1, Math.round((x - L) / (width - L - R) * (points.length - 1)))));
  }

  return (
    <figure className={styles.card} aria-label={`Game analysis: ${game.date} ${game.opponentDisplay}`}>
      <figcaption className={styles.head}>
        <div className={styles.identity}><p className={styles.eyebrow}>{board === "heartbreak" ? "Heartbreak" : "Miracle"} · {game.season} season</p><h2 id="game-case-heading" ref={headingRef} tabIndex={-1} className={styles.matchup}>Jets {game.atHome ? "vs" : "at"} {game.opponentDisplay}</h2><p className={styles.epitaph}>{morgueEpitaph(game)}</p><p className={styles.sub}><time dateTime={game.date}>{formatDate(game.date)}</time> · Week {game.week}{game.seasonType !== "REG" ? " · playoffs" : ""}</p></div>
        <div className={styles.scoreBlock}>
          <div className={styles.scoreboard}><div><span>Jets</span><strong>{game.jetsScore}</strong></div><span className={styles.scoreDash} aria-hidden="true">–</span><div><span>{game.opponentDisplay}</span><strong>{game.oppScore}</strong></div></div>
          <p className={styles.final}>Final · {game.outcome === "win" ? "Jets win" : game.outcome === "loss" ? "Jets loss" : "Tie"}{game.wentToOt ? " · OT" : ""}</p>
        </div>
      </figcaption>

      <div className={styles.context}><strong>{pct(game.swing)}</strong><span>{board === "heartbreak" ? "Peak" : "Lowest"} Jets win probability in the second half, according to the model.</span></div>

      <div className={styles.tape}>
      <div className={styles.plot}>
        <h3 className={styles.plotTitle}>Where it turned.</h3><p className={styles.plotSub}>Jets win probability before each recorded play.</p>
        <div ref={canvas} className={styles.canvas}>
          {error ? <div className={styles.state}><p>Couldn&apos;t load this game&apos;s probability curve.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry curve</button></div> : points === null ? <p className={styles.state} role="status">Loading game curve…</p> : !geo ? <p className={styles.state}>No usable curve is published for this game.</p> : (
            <svg viewBox={`0 0 ${width} ${H}`} className={styles.svg} role="img" aria-label={`Jets win probability across ${points.length} recorded plays. ${board === "heartbreak" ? "Second-half peak" : "Second-half low"}: ${pct(game.swing)}. Use the play sequence slider below to inspect each play.`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); choosePlay(event); }} onPointerMove={(event) => { if (event.buttons & 1) choosePlay(event); }}>
              {[0, .5, 1].map((value) => <g key={value}><line x1={L} x2={width - R} y1={geo.y(value)} y2={geo.y(value)} className={styles.grid} /><text x={L - 10} y={geo.y(value) + 4} className={styles.axis} textAnchor="end">{value * 100}%</text></g>)}
              {geo.marks.map((mark) => <g key={mark.index}><line x1={geo.x(mark.index)} x2={geo.x(mark.index)} y1={T} y2={H - B} className={styles.period} /><text x={Math.min(width - R, geo.x(mark.index) + 3)} y={H - B + 17} className={styles.axis} textAnchor={geo.x(mark.index) > width - 38 ? "end" : "start"}>{mark.label}</text></g>)}
              <path d={geo.area} className={styles.area} /><path d={geo.line} className={styles.line} fill="none" />
              {geo.swingIndex >= 0 ? <circle cx={geo.x(geo.swingIndex)} cy={geo.y(points[geo.swingIndex].wp)} r={5} className={styles.dotSwing} /> : null}
              {selected ? <g><line x1={geo.x(index)} x2={geo.x(index)} y1={T} y2={H - B} className={styles.guide} /><circle cx={geo.x(index)} cy={geo.y(selected.wp)} r={5} className={styles.dotSelected} /></g> : null}
              {geo.keyIndex >= 0 ? <circle data-key-play={points[geo.keyIndex].playId ?? geo.keyIndex} cx={geo.x(geo.keyIndex)} cy={geo.y(points[geo.keyIndex].wp)} r={4} className={styles.dotKey} /> : null}
              <text x={(L + width - R) / 2} y={H - 4} className={styles.axisTitle} textAnchor="middle">Play sequence · 1–{points.length}</text>
            </svg>
          )}
        </div>
        {geo ? <div className={styles.legend}><span><i className={styles.legendPeak} />{board === "heartbreak" ? "Second-half peak" : "Second-half low"}</span><span><i className={styles.legendKey} />Key play</span></div> : null}
      </div>

      {geo && points && selected ? <div className={styles.scrubber}>
        <div className={styles.scrubberHead}><label htmlFor={`play-slider-${game.id}`}>Inspect a play</label><span>Play {index + 1} / {points.length}</span></div>
        <p id={helpId} className={styles.scrubberHelp}>Drag through the game, or use the arrow keys one play at a time.</p>
        <input id={`play-slider-${game.id}`} type="range" min={1} max={points.length} step={1} value={index + 1} aria-label="Play sequence" aria-valuetext={`Play ${index + 1} of ${points.length}, ${clockLabel(selected.q, selected.t)}, Jets win probability ${pct(selected.wp)}`} aria-describedby={`${readoutId} ${helpId}`} onChange={(event) => setSelectedIndex(Number(event.target.value) - 1)} />
        <div className={styles.steps}><button type="button" disabled={index === 0} onClick={() => setSelectedIndex(Math.max(0, index - 1))}><span aria-hidden="true">←</span> Previous play</button><button type="button" disabled={index === points.length - 1} onClick={() => setSelectedIndex(Math.min(points.length - 1, index + 1))}>Next play <span aria-hidden="true">→</span></button></div>
        <div className={styles.jump}>{geo.keyIndex >= 0 ? <button type="button" onClick={() => setSelectedIndex(geo.keyIndex)}>Jump to key play</button> : null}{geo.swingIndex >= 0 ? <button type="button" onClick={() => setSelectedIndex(geo.swingIndex)}>Jump to {board === "heartbreak" ? "peak" : "low point"}</button> : null}</div>
        <output id={readoutId} className={styles.readout} aria-live="polite" aria-label="Selected play"><span><strong>{pct(selected.wp)}</strong> chance to win <b>{clockLabel(selected.q, selected.t)}</b></span><span className={styles.description}>{selected.desc || "Play description unavailable."}</span></output>
      </div> : null}
      </div>

      {game.keyPlay.wpa != null ? <div className={styles.keyNote}><span>{board === "heartbreak" ? "Biggest second-half setback" : "Biggest second-half boost"}</span><strong>{game.keyPlay.wpa > 0 ? "+" : ""}{(game.keyPlay.wpa * 100).toFixed(1)} percentage points</strong><small>{clockLabel(game.keyPlay.qtr, game.keyPlay.secondsLeft)} · Key play marked above</small></div> : null}
    </figure>
  );
}
