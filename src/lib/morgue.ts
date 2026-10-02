import type { Game } from "./games";

/** A score-based summary, without attributing feelings or motives to anyone. */
export function gameEvidenceSummary(game: Game): string {
  if (game.dataSuspect) return "Score integrity review required. Probability analysis withheld.";
  if (!Number.isInteger(game.jetsScore) || game.jetsScore < 0 || !Number.isInteger(game.oppScore) || game.oppScore < 0) return "Final score unavailable.";
  const margin = game.jetsScore - game.oppScore;
  return `NYJ ${game.jetsScore}–${game.opponentDisplay} ${game.oppScore}. Differential: ${margin > 0 ? "+" : ""}${margin} ${Math.abs(margin) === 1 ? "point" : "points"}${game.wentToOt ? " · overtime" : ""}.`;
}

/** Describe the signed model change without assigning a cause to the result. */
export function keyPlayEvidenceLabel(game: Game): string {
  const change = game.keyPlay.wpa;
  if (change == null || !Number.isFinite(change) || Math.abs(change) > 1) return "Selected second-half play";
  if (game.outcome === "loss") return change < 0 ? "Largest second-half probability decrease" : "Smallest second-half probability change";
  if (game.outcome === "win") return change > 0 ? "Largest second-half probability increase" : "Largest second-half probability change";
  return "Selected second-half play";
}
