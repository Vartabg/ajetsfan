import type { Snap, SnapGame, SnapScore } from "./snap-types";

export type ReplayPace = "key" | "all";
export type ReplayView = {
  game: Pick<SnapGame, "id" | "date" | "home" | "opponent" | "source">;
  play: Snap;
  pace: ReplayPace;
  index: number;
  previous: string | null;
  next: string | null;
  first: string;
  last: boolean;
  reason: string | null;
  /** A recorded before-first score has index -1. Remaining indices are after-play boundaries. */
  scoreTrail: { index: number; score: SnapScore }[];
  displayScore: SnapScore | null;
  scoreLabel: string;
  terminalScore: SnapScore | null;
};

export function replayHref(gameId: string, playKey?: string, pace: ReplayPace = "key", chalk = false): string {
  const params = new URLSearchParams();
  if (playKey !== undefined) params.set("play", playKey);
  if (pace === "all") params.set("pace", pace);
  if (chalk) params.set("view", "chalk");
  const query = params.toString();
  return "/replay/" + encodeURIComponent(gameId) + (query ? "?" + query : "");
}

function differs(a: SnapScore | null, b: SnapScore | null) {
  return a !== null && b !== null && (a[0] !== b[0] || a[1] !== b[1]);
}

function reasonFor(play: Snap, opening: boolean, lastScore: SnapScore | null, firstPeriodPlay: boolean, last: boolean): string | null {
  const reasons: string[] = [];
  if (opening) reasons.push("First recorded play");
  else if (firstPeriodPlay) {
    const period = play.quarter <= 4 ? "Q" + play.quarter : play.quarter === 5 ? "overtime" : (play.quarter - 4) + "OT";
    reasons.push("First play of " + period);
  }
  if (differs(play.before, play.after)) reasons.push("Score changed");
  else if (differs(lastScore, play.before ?? play.after)) reasons.push("Updated score recorded");
  const turnovers = play.facts?.turnovers;
  if (turnovers?.includes("interception") || play.facts?.kind === "interception") reasons.push("Interception");
  if (turnovers?.includes("lostFumble")) reasons.push("Lost fumble");
  if (turnovers?.includes("downs")) reasons.push("Turnover on downs");
  if (play.delta !== null && Math.abs(play.delta) >= 0.1 && Math.abs(play.delta) <= 1) {
    reasons.push("Jets win probability " + (play.delta > 0 ? "rose " : "fell ") +
      Number((Math.abs(play.delta) * 100).toFixed(1)) + " percentage points");
  }
  if (last) reasons.push("Last recorded play");
  return reasons.length ? reasons.join(" · ") : null;
}

function scoreHistory(plays: Snap[], selected: number): ReplayView["scoreTrail"] {
  let trail: ReplayView["scoreTrail"] = [];
  for (let i = 0; i <= selected; i++) {
    const play = plays[i];
    const previous = i > 0 ? plays[i - 1].after : null;
    if (i === 0 || previous === null || differs(previous, play.before)) {
      // Restart at the first observation after a gap; a line across the gap would imply a known score.
      trail = play.before ? [{ index: i - 1, score: play.before }] : [];
    }
    if (play.after) {
      if (!trail.length || differs(trail[trail.length - 1].score, play.after)) trail.push({ index: i, score: play.after });
    } else if (!play.before) trail = [];
  }
  return trail;
}

/** Build the same selected frame for an initial server response and subsequent in-memory navigation. */
export function replayView(game: SnapGame, key: string | undefined, pace: ReplayPace): ReplayView | null {
  const { plays } = game;
  if (!Array.isArray(plays) || !plays.length || new Set(plays.map((play) => play.key)).size !== plays.length) return null;
  const index = key === undefined ? 0 : plays.findIndex((play) => play.key === key);
  if (index < 0) return null;
  const play = plays[index];
  let previous: string | null = null, next: string | null = null, reason: string | null = null;
  const periods = new Set<number>();
  let lastScore: SnapScore | null = null;
  for (let i = 0; i < plays.length; i++) {
    const row = plays[i];
    const qualifies = reasonFor(row, i === 0, lastScore, !periods.has(row.quarter), i === plays.length - 1);
    lastScore = row.after ?? row.before ?? lastScore;
    periods.add(row.quarter);
    if (i === index) reason = qualifies;
    else if (qualifies || pace === "all") {
      if (i < index) previous = row.key;
      else { next = row.key; break; }
    }
  }
  const last = index === plays.length - 1;
  const { id, date, home, opponent, source } = game;
  return {
    game: { id, date, home, opponent, source }, play, pace, index, previous, next, first: plays[0].key, last, reason,
    scoreTrail: scoreHistory(plays, index), displayScore: play.after ?? play.before,
    scoreLabel: play.after ? "Score after this play" : play.before ? "Score before this play" : "Score unavailable for this play",
    terminalScore: last && play.after !== null && !differs(game.final, play.after) ? game.final : null,
  };
}
