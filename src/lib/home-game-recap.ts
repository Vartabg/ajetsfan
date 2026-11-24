import { creditedHomeSnap, type HomeRoster } from "./home-play";
import { clockText } from "./snap-explorer";
import type { Snap, SnapGame, SnapScore } from "./snap-types";
import { teamIdentity } from "./teams";

export type HomeGameRecap = { text: string; periods: SnapScore[]; playKey: string | null };
type Side = 0 | 1;
type ScoringPlay = { play: Snap; before: SnapScore; after: SnapScore; side: Side; points: number };
const other = (side: Side): Side => side === 0 ? 1 : 0;
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
const smallNumber = (n: number) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] ?? String(n);
const score = (s: SnapScore, side: Side) => s[side] + "–" + s[other(side)];
const period = (q: number) => ["", "the first quarter", "the second quarter", "the third quarter", "the fourth quarter", "overtime"][q] ?? "overtime period " + (q - 4);

/** Require the score at every boundary before making claims about the whole game. */
function scoringRecord(game: SnapGame) {
  const ends: SnapScore[] = [], scoring: ScoringPlay[] = [];
  let previous: SnapScore = [0, 0];
  for (const play of game.plays) {
    const { before, after, quarter } = play;
    if (!before || !after || quarter < 1 || quarter < ends.length || quarter > ends.length + 1 ||
        before[0] !== previous[0] || before[1] !== previous[1]) return null;
    const jets = after[0] - before[0], opponent = after[1] - before[1];
    if (jets < 0 || opponent < 0 || (jets > 0 && opponent > 0) || Math.max(jets, opponent) > 8) return null;
    if (quarter === 5 && ends.length === 4 && before[0] !== before[1]) return null;
    if (jets || opponent) scoring.push({ play, before, after, side: jets ? 0 : 1, points: jets || opponent });
    ends[quarter - 1] = after;
    previous = after;
  }
  if (ends.length < 4 || !game.final || previous[0] !== game.final[0] || previous[1] !== game.final[1]) return null;
  return { ends, scoring };
}

function scoringAction(event: ScoringPlay, team: string, roster: HomeRoster) {
  const { play, side, points } = event;
  const f = creditedHomeSnap(play, roster).facts;
  const name = (s: string) => s.replace(/\.(?=\p{L})/u, ". ");
  if (points === 6 && f.touchdown && play.possession === (side === 0 ? "jets" : "opponent")) {
    if (f.kind === "completion" && f.passer && f.target) return name(f.passer) + " threw " +
      (f.yards != null && f.yards > 0 ? "a " + f.yards + "-yard touchdown pass" : "a touchdown pass") + " to " + name(f.target);
    if (f.kind === "rush" && f.rusher) return name(f.rusher) + " ran " +
      (f.yards != null && f.yards > 0 ? f.yards + (f.yards === 1 ? " yard " : " yards ") : "") + "for a touchdown";
  }
  if (f.kick?.outcome === "made" && f.kick.kind === "fieldGoal" && points === 3) return team + " kicked a field goal";
  if (f.kick?.outcome === "made" && f.kick.kind === "extraPoint" && points === 1) return team + " kicked the extra point";
  return team + (points === 6 ? " scored a touchdown" : " scored " + smallNumber(points) + (points === 1 ? " point" : " points"));
}

function when(play: Snap) {
  return play.clock === null ? "in " + period(play.quarter) : "with " + clockText(play.clock) + " left in " + period(play.quarter);
}

export function homeGameRecap(game: SnapGame, roster: HomeRoster = []): HomeGameRecap | null {
  const record = scoringRecord(game);
  if (!record) return null;
  const { ends, scoring } = record;
  const periods = ends.map((end, i): SnapScore => [end[0] - (ends[i - 1]?.[0] ?? 0), end[1] - (ends[i - 1]?.[1] ?? 0)]);
  const half = ends[1], final = ends[ends.length - 1], regulation = ends[3];
  const opponent = teamIdentity(game.opponent);
  const teams = ["the Jets", opponent?.nickname ? "the " + opponent.nickname : opponent?.city ?? game.opponent];
  const winner: Side | null = final[0] === final[1] ? null : final[0] > final[1] ? 0 : 1;
  const halfLeader: Side = half[0] >= half[1] ? 0 : 1;
  const opening = ends[0][0] === ends[0][1] && ends[0][0] > 0 && half[0] !== half[1] ? "After a " + score(ends[0], 0) + " first quarter, " : "";
  const halfText = half[0] === half[1] ? "the teams were tied " + score(half, 0) : teams[halfLeader] + " led " + score(half, halfLeader);
  const sentences = [capital(opening + halfText) + " at halftime."];

  const goAhead = winner === null ? undefined : scoring.findLast(p => p.side === winner && p.before[winner] <= p.before[other(winner)] && p.after[winner] > p.after[other(winner)]);
  const key = winner === null ? scoring.findLast(p => p.after[0] === p.after[1]) :
    goAhead && goAhead.play.quarter >= 3 ? goAhead : scoring.findLast(p => p.side === winner && p.points >= 3 && p.play.quarter >= 3) ?? goAhead;
  const last = scoring.at(-1);
  const margin = Math.abs(final[0] - final[1]);
  if (!scoring.length) {
    sentences.splice(0, 1, ends.length > 4 ? "Neither team scored in regulation or overtime." : "Neither team scored in four quarters.");
  } else if (key && key.play.quarter >= 3 && (margin <= 8 || key === goAhead)) {
    const action = scoringAction(key, teams[key.side], roster);
    const preceding = scoring[scoring.indexOf(key) - 1];
    if (winner === null) {
      sentences.push(capital(action) + " " + when(key.play) + " to tie the game at " + score(key.after, 0) + ".");
    } else if (key === goAhead) {
      sentences.push(capital(action) + " " + when(key.play) + " to put " + teams[winner] + " ahead for good.");
    } else if (preceding && preceding.side !== key.side && preceding.play.quarter === key.play.quarter) {
      sentences.push(capital(teams[preceding.side]) + " cut the lead to " + score(key.before, key.side) + " in " + period(key.play.quarter) + " before " + action + ".");
    } else {
      sentences.push("With " + teams[key.side] + " up " + score(key.before, key.side) + " in " + period(key.play.quarter) + ", " + action + ".");
    }
    if (winner !== null && last && last.side !== winner && margin <= 8 && last.play.quarter >= 4) {
      const finish = last.play.clock !== null && last.play.quarter === key.play.quarter ? "with " + clockText(last.play.clock) + " left" : when(last.play);
      sentences.push(capital(teams[last.side]) + " pulled within " + smallNumber(margin) + " " + finish + ".");
    }
  } else {
    const second: SnapScore = [regulation[0] - half[0], regulation[1] - half[1]];
    const side: Side = second[0] > second[1] ? 0 : 1;
    sentences.push(second[0] === second[1]
      ? second[0] === 0 ? "Neither team scored in the second half." : "Each team scored " + smallNumber(second[0]) + " in the second half."
      : capital(teams[side]) + " outscored " + teams[other(side)] + " " + score(second, side) + " in the second half.");
    const jetsScores = scoring.filter(p => p.side === 0);
    if (jetsScores.length >= 2 && jetsScores.every(p => p.points === 3 && p.play.facts?.kick?.kind === "fieldGoal" && p.play.facts.kick.outcome === "made")) {
      sentences.push("All " + final[0] + " Jets points came on " + smallNumber(jetsScores.length) + " field goals.");
    }
  }
  if (winner === null && scoring.length && ends.length > 4 && last && last.play.quarter <= 4) sentences.push("Neither team scored in overtime.");
  return { text: sentences.join(" "), periods, playKey: key?.play.key ?? null };
}
