"use client";

import { useSearchParams } from "next/navigation";
import type { CurvePoint } from "@/lib/load-games";
import { clockLabel, pct } from "@/lib/games";
import styles from "./DeepCuts.module.css";
import shared from "./Focus.module.css";

type ComparisonGame = { id: string; label: string; points: CurvePoint[] };

/** Shared progress aligns play order, not elapsed clock or matching football situations. */
export default function DeepCutComparison({ games }: { games: ComparisonGame[] }) {
  const params = useSearchParams();
  const raw = Number(params.get("progress") ?? 0);
  const progress = Number.isFinite(raw) ? Math.round(Math.min(100, Math.max(0, raw))) : 0;
  const select = (value: number) => {
    const url = new URL(location.href);
    url.searchParams.set("progress", String(value));
    url.hash = "same-score";
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  return <details className={shared.unfold} open={params.has("progress") || undefined}>
    <summary>Compare their play-by-play paths</summary>
    <div data-focus-tools className={styles.comparison}>
    <label className={styles.control}>Compare at the same play progress <span>{progress}%</span>
      <input type="range" min="0" max="100" step="1" value={progress} onChange={(event) => select(Number(event.target.value))} />
    </label>
    <p className={styles.note}>Aligned by each game’s recorded play order, from first play to last. The clocks and situations can differ. The URL keeps your selection.</p>
    <DeepCutPaths games={games} progress={progress} />
    </div>
  </details>;
}

/** A readable pair of paths also renders in the static, no-JavaScript fallback. */
export function DeepCutPaths({ games, progress = 0 }: { games: ComparisonGame[]; progress?: number }) {
  return <div className={styles.paths}>
      {games.map((game) => {
        const last = game.points.length - 1;
        const at = Math.round(progress / 100 * last);
        const point = game.points[at];
        if (last < 1 || !point) return <p key={game.id}>{game.label}: no usable probability path in this edition.</p>;
        const path = game.points.map((entry, index) => `${index ? "L" : "M"}${(index / last * 600).toFixed(1)},${((1 - entry.wp) * 180).toFixed(1)}`).join(" ");
        return <figure key={game.id} className={styles.path}>
          <figcaption>{game.label}</figcaption>
          <svg viewBox="0 0 600 180" role="img" aria-label={`${game.label}: Jets pre-play win chance, ${pct(point.wp)} at ${progress}% of recorded play progress.`}>
            <line className={styles.guide} x1="0" x2="600" y1="90" y2="90" />
            <path className={styles.curve} d={path} />
            <line className={styles.cursor} x1={progress * 6} x2={progress * 6} y1="0" y2="180" />
            <circle cx={at / last * 600} cy={(1 - point.wp) * 180} r="5" className={styles.dot} />
          </svg>
          <p className={styles.readout}><strong>{pct(point.wp)}</strong> pre-play win chance · {clockLabel(point.q, point.t)}</p>
          <p className={styles.description}>{point.desc ?? "No recorded description for this point."}</p>
        </figure>;
      })}
  </div>;
}
