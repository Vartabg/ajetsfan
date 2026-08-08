"use client";

import { useEffect, useMemo, useState } from "react";
import type { Board, Game } from "@/lib/games";
import { clockLabel } from "@/lib/games";
import styles from "./SwingCurve.module.css";

type Point = {
  q: number;
  t: number | null;
  wp: number;
  d: number | null;
  desc: string | null;
  type: string | null;
};

const W = 1000;
const H = 300;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 22;
const PAD_B = 30;

export default function SwingCurve({ game, board }: { game: Game; board: Board }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setPoints(null);
    setError(false);
    fetch(`/data/curves/${game.id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Point[]) => live && setPoints(d.filter((p) => typeof p.wp === "number")))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [game.id]);

  const geo = useMemo(() => {
    if (!points || points.length < 2) return null;

    const x = (i: number) => PAD_L + (i / (points.length - 1)) * (W - PAD_L - PAD_R);
    const y = (wp: number) => PAD_T + (1 - wp) * (H - PAD_T - PAD_B);

    // The envelope: best (or worst) the Jets had managed up to this point.
    // The gap between it and the actual line is what the game gave back.
    const envelope: number[] = [];
    let run = points[0].wp;
    for (const p of points) {
      run = board === "heartbreak" ? Math.max(run, p.wp) : Math.min(run, p.wp);
      envelope.push(run);
    }

    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.wp).toFixed(1)}`).join(" ");
    const envLine = envelope.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    const band =
      envLine +
      " " +
      points
        .map((p, i) => `L${x(points.length - 1 - i).toFixed(1)} ${y(points[points.length - 1 - i].wp).toFixed(1)}`)
        .join(" ") +
      " Z";

    // Quarter boundaries, drawn where the period actually changes.
    const marks: { at: number; label: string }[] = [];
    let last = -1;
    points.forEach((p, i) => {
      if (p.q !== last) {
        marks.push({ at: x(i), label: p.q > 4 ? "OT" : `Q${p.q}` });
        last = p.q;
      }
    });

    // The swing itself: the second-half extreme this board ranks on.
    let swingIdx = -1;
    points.forEach((p, i) => {
      if (p.q < 3) return;
      if (swingIdx === -1) swingIdx = i;
      const better = board === "heartbreak" ? p.wp > points[swingIdx].wp : p.wp < points[swingIdx].wp;
      if (better) swingIdx = i;
    });

    // The single play that moved it most, in the direction that decided the game.
    let keyIdx = -1;
    points.forEach((p, i) => {
      if (p.q < 3 || p.d == null) return;
      if (keyIdx === -1) keyIdx = i;
      const cur = points[keyIdx].d ?? 0;
      const better = board === "heartbreak" ? (p.d ?? 0) < cur : (p.d ?? 0) > cur;
      if (better) keyIdx = i;
    });

    return { x, y, line, band, marks, swingIdx, keyIdx };
  }, [points, board]);

  const tone = board === "heartbreak" ? styles.break : styles.miracle;

  return (
    <figure className={`${styles.card} ${tone}`}>
      <figcaption className={styles.head}>
        <div>
          <h2 className={styles.matchup}>
            {game.atHome ? "vs" : "at"} {game.opponentDisplay}
            <span className={styles.score}>
              {game.jetsScore}–{game.oppScore}
            </span>
          </h2>
          <p className={styles.sub}>
            {game.date} · week {game.week}
            {game.wentToOt ? " · overtime" : ""}
            {game.roof && game.temp != null ? ` · ${game.temp}°F` : ""}
          </p>
        </div>
        <div className={styles.big}>
          <span className="mono">{((game.swing ?? 0) * 100).toFixed(1)}%</span>
          <small>{board === "heartbreak" ? "peak, 2nd half" : "low point, 2nd half"}</small>
        </div>
      </figcaption>

      <div className={styles.plot}>
        {error ? (
          <p className={styles.state}>Couldn&apos;t load this game&apos;s win probability.</p>
        ) : !geo ? (
          <p className={styles.state}>Loading win probability…</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img"
               aria-label={`Jets win probability across ${game.date} ${game.atHome ? "vs" : "at"} ${game.opponentDisplay}`}>
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={W - PAD_R} y1={geo.y(v)} y2={geo.y(v)}
                      className={v === 0.5 ? styles.gridMid : styles.grid} />
                <text x={PAD_L - 10} y={geo.y(v) + 4} className={styles.axis} textAnchor="end">
                  {v * 100}
                </text>
              </g>
            ))}

            {geo.marks.map((m) => (
              <g key={`${m.label}-${m.at}`}>
                <line x1={m.at} x2={m.at} y1={PAD_T} y2={H - PAD_B} className={styles.period} />
                <text x={m.at + 5} y={H - PAD_B + 18} className={styles.axis}>{m.label}</text>
              </g>
            ))}

            <path d={geo.band} className={styles.band} />
            <path d={geo.line} className={styles.line} fill="none" />

            {geo.swingIdx >= 0 && points ? (
              <circle cx={geo.x(geo.swingIdx)} cy={geo.y(points[geo.swingIdx].wp)} r={5}
                      className={styles.dotSwing} />
            ) : null}
            {geo.keyIdx >= 0 && points ? (
              <circle cx={geo.x(geo.keyIdx)} cy={geo.y(points[geo.keyIdx].wp)} r={4}
                      className={styles.dotKey} />
            ) : null}
          </svg>
        )}
      </div>

      {game.keyPlay.desc ? (
        <div className={styles.play}>
          <span className={`${styles.clock} mono`}>
            {clockLabel(game.keyPlay.qtr, game.keyPlay.secondsLeft)}
          </span>
          <span className={styles.desc}>{game.keyPlay.desc}</span>
          <span className={`${styles.wpa} mono`}>
            {game.keyPlay.wpa != null
              ? `${game.keyPlay.wpa > 0 ? "+" : ""}${(game.keyPlay.wpa * 100).toFixed(1)}`
              : "—"}
          </span>
        </div>
      ) : null}
    </figure>
  );
}
