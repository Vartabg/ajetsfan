import type { DefensePhase, DefenseSample } from "./defense-match";
import { beforeFullSnap, fullSnapBoard } from "./full-snap";
import { snapChalkboard } from "./snap-chalkboard";
import { fieldSpot, snapAccount } from "./snap-context";
import { chartLabel } from "./snap-participation";

/** A comparison always reports the score and clock at the snap. Only the revealed response reads the throw. */
export function defenseMatchField({ game, play }: DefenseSample, phase: DefensePhase) {
  const chart = play.facts?.charting;
  const board = phase === "snap" ? beforeFullSnap(game, play) : fullSnapBoard(game, play, snapChalkboard(game, play));
  if (!board || play.yardline == null || play.distance == null) return null;
  const jetsBall = play.possession === "jets";
  return {
    game: game.id, play: play.key, date: game.date, home: game.home, opponent: game.opponent,
    offense: jetsBall ? "NYJ" : game.opponent, defense: jetsBall ? game.opponent : "NYJ",
    formation: chartLabel(chart?.formation), offensePersonnel: chart?.offensePersonnel, defensePersonnel: chart?.defensePersonnel,
    yardline: play.yardline, distance: play.distance, spot: fieldSpot(game, play, play.yardline),
    score: play.before, quarter: play.quarter, clock: play.clock, board,
    verifiedLineups: board.players.every(player => !!player.participantId),
    result: phase === "action" ? {
      account: snapAccount(game, play), airYards: play.facts?.airYards ?? null,
      toGain: play.facts?.goalToGo ? play.yardline : Math.min(play.yardline, play.distance),
    } : null,
  };
}

export type DefenseField = NonNullable<ReturnType<typeof defenseMatchField>>;
