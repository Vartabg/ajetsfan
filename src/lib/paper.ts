import type { Game } from "./games";
import type { ResultGame } from "./current";

/**
 * The paper ages with the losing streak.
 *
 * Newsprint yellows, foxes and creases in proportion to how long it has been
 * since a win. A win resets it to fresh stock. The physical condition of the
 * page is the emotional state of the season, and it is driven entirely by data
 * — nothing here is decorative.
 */

export type Streak = {
  type: "win" | "loss" | "tie";
  count: number;
  since: string;
  lastGame: ResultGame;
};

export function currentStreak(games: ResultGame[]): Streak | null {
  const played = [...games].sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week || a.id.localeCompare(b.id));
  if (!played.length) return null;
  const last = played[played.length - 1];
  let count = 0;
  for (let i = played.length - 1; i >= 0; i--) {
    if (played[i].outcome !== last.outcome) break;
    count++;
  }
  return { type: last.outcome, count, since: played[played.length - count].date, lastGame: last };
}

/** 0 = fresh stock, 4 = the paper is falling apart. */
export function wearLevel(streak: Streak | null): number {
  if (!streak || streak.type === "win") return 0;
  if (streak.type === "tie") return 1;
  if (streak.count >= 7) return 4;
  if (streak.count >= 5) return 3;
  if (streak.count >= 3) return 2;
  return 1;
}

export const WEAR_NOTE: Record<number, string> = {
  0: "Fresh stock. They won.",
  1: "The paper has started to turn.",
  2: "Yellowing. Three straight or more.",
  3: "Foxed and creased. Five straight or more.",
  4: "This edition is coming apart. Seven straight or more.",
};

/**
 * An archive feature chosen from the mood. The current-season homepage uses
 * selectLead in current.ts so confirmed new results always take precedence.
 */
export function pickLead(games: Game[], streak: Streak | null): Game | null {
  const eligible = games.filter((g) => !g.dataSuspect && g.swing != null);
  if (!eligible.length) return null;
  const worst = eligible
    .filter((g) => g.outcome === "loss")
    .sort((a, b) => b.swing! - a.swing!)[0];
  const best = eligible
    .filter((g) => g.outcome === "win")
    .sort((a, b) => a.swing! - b.swing!)[0];
  if (!worst) return best ?? null;
  if (!best) return worst;

  // The page leads with the mood. Losing, it leads with heartbreak; coming off a
  // win, it leads with a miracle. Only when there is no streak to read does raw
  // extremity decide.
  if (streak?.type === "loss") return worst;
  if (streak?.type === "win") return best;
  return worst.swing! >= 1 - best.swing! ? worst : best;
}

/** Headline type scales with how extreme the number is. */
export function headlineScale(swing: number | null): number {
  if (swing == null) return 1;
  const extremity = Math.abs(swing - 0.5) * 2; // 0 at a coin flip, 1 at certainty
  return 0.72 + extremity * 0.48;
}

const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine"];
const TEENS = ["ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

/** 97.8 -> "ninety seven point eight". Headlines are set in words, as a back page would. */
export function spellNumber(n: number): string {
  const whole = Math.floor(n);
  const dec = Math.round((n - whole) * 10);
  const words = (v: number): string => {
    if (v < 10) return ONES[v];
    if (v < 20) return TEENS[v - 10];
    const t = Math.floor(v / 10);
    const o = v % 10;
    return TENS[t] + (o ? " " + ONES[o] : "");
  };
  return dec > 0 ? `${words(whole)} point ${ONES[dec]}` : words(whole);
}
