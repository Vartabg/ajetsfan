import type { SnapGame } from "@/lib/snap-types";

export const davisGame = "2022_02_NYJ_CLE";
export const davisPlay = "4276";

/** Tie the account to the gamebook's two consecutive snaps, including the recorded return spots. */
export function davisCasePlay(game: SnapGame | null) {
  if (!game || game.source !== "nflverse" || game.id !== davisGame || game.date !== "2022-09-18" ||
    game.home !== false || game.opponent !== "CLE" || game.final?.[0] !== 31 || game.final?.[1] !== 30) return null;
  const index = game.plays.findIndex(play => play.key === davisPlay);
  const play = game.plays[index];
  if (!play || play.possession !== "opponent" || play.quarter !== 4 || play.clock !== 13 ||
    play.down !== 1 || play.distance !== 10 || play.yardline !== 54 || play.type !== "pass" ||
    play.before?.[0] !== 31 || play.before?.[1] !== 30 || play.after?.[0] !== 31 || play.after?.[1] !== 30) return null;
  const facts = play.facts;
  if (facts?.kind !== "interception" || facts.passer !== "J.Brissett" || facts.target !== "A.Cooper" ||
    facts.interceptor !== "A.Davis" || facts.direction !== "left" || facts.passLength !== "deep" ||
    facts.interceptionReturnYards !== 14 || !/A\.Davis at NYJ 36\. (?:21-)?A\.Davis to 50 for 14 yards\b/i.test(play.description)) return null;
  const next = game.plays[index + 1];
  if (next?.key !== "4307" || next.possession !== "jets" || next.quarter !== 4 || next.clock !== 6 ||
    next.yardline !== 50 || next.type !== "qb_kneel" || next.facts?.kind !== "kneel" || next.facts.rusher !== "J.Flacco") return null;
  return play;
}
