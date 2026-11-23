import "server-only";
import catalog from "./fourth-down-model.json";
import { actualFourthDownCall, decisionSignature, inFieldGoalRange, validDecisionOdds, type DecisionId, type DecisionPool, type DecisionRow } from "./fourth-down-study";
import { loadSnapGame } from "./load-snaps";

const all: DecisionRow[] = catalog.rows;
const range = all.filter(row => inFieldGoalRange(row.spot));
const byId = new Map(all.map(row => [row.game + "/" + row.play, row]));
export const fourthDownSource = catalog.source;
export const fourthDownSeasons = all[0].game.slice(0, 4) + "–" + all[all.length - 1].game.slice(0, 4);

async function verified(row: DecisionRow) {
  const game = await loadSnapGame(row.game);
  const play = game?.plays.find(p => p.key === row.play);
  if (!game || !play || play.yardline !== row.spot || !validDecisionOdds(row)) return null;
  const actual = actualFourthDownCall(game, play);
  if (!actual || decisionSignature(game, play, actual) !== row.signature) return null;
  return { game, play, actual, row };
}

export async function loadFourthDown(id: DecisionId, requestedPool?: DecisionPool) {
  const row = byId.get(id.game + "/" + id.play);
  if (!row) {
    const game = await loadSnapGame(id.game);
    const play = game?.plays.find(p => p.key === id.play);
    if (!play) return null;
    const noPunt = play.possession === "jets" && play.down === 4 && play.yardline !== null && play.yardline <= 30;
    return { state: "unavailable" as const, noPunt };
  }
  const selected = await verified(row);
  if (!selected) return { state: "unavailable" as const, noPunt: false };
  const pool = requestedPool === "all" || !inFieldGoalRange(row.spot) ? "all" : "range";
  const choices = pool === "all" ? all : range;
  const index = choices.indexOf(row);
  // An archive correction may retire an example between model imports.
  async function adjacent(step: number): Promise<DecisionId | null> {
    for (let offset = 1; offset < choices.length; offset++) {
      const next = choices[(index + step * offset + choices.length) % choices.length];
      if (await verified(next)) return { game: next.game, play: next.play };
    }
    return null;
  }
  const [previous, next] = await Promise.all([adjacent(-1), adjacent(1)]);
  return { state: "ready", ...selected, pool, previous, next, total: choices.length } as const;
}
