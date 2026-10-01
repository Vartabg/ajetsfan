import type { Game } from "./games";
import { fanMemoryForGame } from "./fan-memories";

/** Fan commentary, chosen from verified results rather than invented game events. */
export function morgueEpitaph(game: Game): string {
  const memory = fanMemoryForGame(game);
  if (memory) return memory.epitaph;
  const margin = Math.abs(game.jetsScore - game.oppScore);

  if (game.outcome === "loss") {
    if (game.wentToOt) return "We stayed for overtime. Of course we did. It still hurts.";
    if (margin <= 8) return "One score short. Plenty of time to think about it.";
    if (margin >= 17) return "The remote deserves hazard pay.";
    if (game.peakH2Wp != null && game.peakH2Wp >= .9) return "For a while, even the numbers believed.";
    return "Four quarters. A familiar ache.";
  }

  if (game.outcome === "win") {
    if (game.troughH2Wp != null && game.troughH2Wp <= .1) return "We were rehearsing the rant. Then they won.";
    if (game.wentToOt) return "Extra football. For once, a reward.";
    if (margin <= 8) return "Just enough to keep us hopelessly attached.";
    if (margin >= 17) return `Won by ${margin}. We're trying to act normal.`;
    return "Football is fun again. Please let this catch on.";
  }

  return "A draw. Even the closure got canceled.";
}
