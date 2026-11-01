"use client";

import { useSearchParams } from "next/navigation";
import { DeepCutPaths } from "./DeepCutComparison";
import type { CurvePoint } from "@/lib/load-games";
import { journeyPosition } from "@/lib/miracle-journey";
import styles from "./MiracleJourney.module.css";

export default function JourneyComparison({ games }: { games: { id: string; label: string; points: CurvePoint[] }[] }) {
  const params = useSearchParams();
  const { progress } = journeyPosition(params.toString());
  const select = (value: string) => {
    const url = new URL(location.href);
    url.searchParams.set("step", "compare");
    url.searchParams.set("progress", value);
    // Next preserves its own state and updates useSearchParams for native calls.
    // Passing its internal state back would bypass that synchronization.
    history.replaceState(null, "", url);
  };
  return <div className={styles.comparison} data-focus-tools>
    <p className={styles.intro}>Both charts show Jets win probability from 0% to 100%. Miami starts at its second-half low; Cleveland starts with 1:55 left. The slider aligns recorded play order, not elapsed time or matching game situations.</p>
    <label>Progress through each comeback <span>{progress}%</span>
      <input type="range" min="0" max="100" step="1" value={progress} aria-label="Comeback sequence progress" onChange={(event) => select(event.target.value)} />
    </label>
    <DeepCutPaths games={games} progress={progress} />
  </div>;
}
