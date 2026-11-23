import { createHash } from "node:crypto";
import type { Snap, SnapGame } from "./snap-types";

export const fourthDownPath = "/replay/studies/fourth-down";
export const featuredDecision = { game: "2022_02_NYJ_CLE", play: "2938" };
export const calls = ["go", "punt", "field-goal"] as const;
export type FourthDownCall = (typeof calls)[number];
export type DecisionPool = "range" | "all";
export type DecisionId = { game: string; play: string };
export type DecisionRow = DecisionId & {
  spot: number;
  signature: string;
  go: number;
  punt: number;
  "field-goal": number;
};

export const callNames: Record<FourthDownCall, string> = { go: "Go for it", punt: "Punt", "field-goal": "Field goal" };
export const inFieldGoalRange = (spot: number) => spot >= 31 && spot <= 40;

export function decisionHref(id: DecisionId, pool: DecisionPool, call?: FourthDownCall) {
  const query = new URLSearchParams({ game: id.game, play: id.play });
  if (pool === "all") query.set("pool", pool);
  if (call) query.set("call", call);
  return fourthDownPath + "?" + query;
}

/** Use only credited calls on a recorded Jets fourth down with a complete pre-play situation. */
export function actualFourthDownCall(game: SnapGame, p: Snap): FourthDownCall | null {
  if (game.source !== "nflverse" || p.possession !== "jets" || p.down !== 4 || !p.before || !p.description ||
      p.clock === null || p.yardline === null || p.yardline < 1 || p.yardline > 99 ||
      p.distance === null || p.distance < 1 || !p.facts) return null;
  if (/\b(?:no play|aborted|penalt(?:y|ies)|replay|review(?:ed)?|challeng\w*|revers(?:ed|al)|fumbl\w*|muff\w*|lateral\w*|blocked|fake[sd]?)\b/i.test(p.description)) return null;
  const f = p.facts;
  if (p.type === "field_goal" && f.kick?.kind === "fieldGoal" && f.kick.kicker && f.kick.outcome) return "field-goal";
  if (p.type === "punt" && f.kick?.kind === "punt" && f.kick.kicker && f.kick.kickYards !== undefined) return "punt";
  if (f.kick || /\b(?:punt|field goal) formation\b/i.test(p.description)) return null;
  if (p.type === "run" && f.kind === "rush" && f.rusher && f.yards !== undefined) return "go";
  if (p.type === "pass" && f.passer &&
      (f.kind === "completion" || f.kind === "incompletion" || f.kind === "interception" || f.kind === "sack")) return "go";
  return null;
}

/** Guard the upstream model join against later changes to its fixture, pre-snap inputs or recorded action. */
export function decisionSignature(game: SnapGame, play: Snap, actual: FourthDownCall): string {
  const identity = [game.id, game.date, game.home, game.opponent, game.final, game.source, play.key,
    play.quarter, play.clock, play.down, play.distance, play.yardline, play.possession, play.before, play.after,
    play.facts?.timeouts ?? null, play.type, play.description, actual];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24);
}

export function validDecisionOdds(row: Record<FourthDownCall, number>) {
  return calls.every(call => Number.isFinite(row[call]) && row[call] >= 0 && row[call] <= 1);
}

export function probabilityPrecision(row: DecisionRow) {
  const distinct = [...new Set(calls.map(call => row[call]))];
  for (const digits of [1, 2]) {
    if (new Set(distinct.map(p => (100 * p).toFixed(digits))).size === distinct.length) return digits;
  }
  return 3;
}

export function decisionPercent(probability: number, digits: number) {
  const formatted = (probability * 100).toFixed(digits);
  const unit = 10 ** -digits;
  if (Number(formatted) === 0 && probability > 0) return "<" + unit.toFixed(digits) + "%";
  if (Number(formatted) === 100 && probability < 1) return ">" + (100 - unit).toFixed(digits) + "%";
  return formatted + "%";
}
