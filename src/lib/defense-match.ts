import { hasComplexRuling } from "./snap-chalkboard";
import type { Snap, SnapGame } from "./snap-types";

export const defenseStudyPath = "/replay/studies/defense";
export const featuredDefense = { game: "2022_02_NYJ_CLE", play: "4199" };
const featuredEarlier = { game: "2021_10_BUF_NYJ", play: "3510" };
const matchLimit = 8;

export type DefenseSnapId = { game: string; play: string };
export type DefensePhase = "snap" | "action";
export type DefenseSample = { game: SnapGame; play: Snap };

export function defenseMatchHref(game: string, play: string, match?: DefenseSnapId, phase: DefensePhase = "snap") {
  const query = new URLSearchParams({ game, play });
  if (match) {
    query.set("matchGame", match.game);
    query.set("matchPlay", match.play);
  }
  if (phase === "action") query.set("phase", phase);
  return defenseStudyPath + "?" + query;
}

/** Only throws whose chart and field position support both phases of the comparison. */
export function defenseCriteria(play: Snap) {
  const { kind, charting } = play.facts ?? {};
  if (play.type !== "pass" || (kind !== "completion" && kind !== "incompletion" && kind !== "interception") ||
      !play.possession || !play.down || play.distance == null || play.distance <= 0 || play.yardline == null ||
      !charting?.coverage || charting.rushers == null || hasComplexRuling(play)) return null;
  return { side: play.possession, down: play.down, distance: play.distance, coverage: charting.coverage, rushers: charting.rushers };
}

export function sameReportedPersonnel(left?: string, right?: string) {
  if (!left || !right) return false;
  const groups = (value: string) => value.split(/,\s*/).filter(group => !group.startsWith("0 ")).sort().join(",");
  return groups(left) === groups(right);
}

function identifies(sample: DefenseSample, id: DefenseSnapId) {
  return sample.game.id === id.game && sample.play.key === id.play;
}

export function earlierDefenseMatches(anchor: DefenseSample, games: SnapGame[]) {
  const criteria = defenseCriteria(anchor.play);
  if (!criteria || anchor.game.source !== "nflverse") return [];
  const chart = anchor.play.facts!.charting!;
  const matches: (DefenseSample & { rank: number; order: number })[] = [];
  for (const game of games) {
    if (game.source !== "nflverse" || game.id === anchor.game.id || game.date >= anchor.game.date) continue;
    for (const [order, play] of game.plays.entries()) {
      if (play.possession !== criteria.side || play.down !== criteria.down || play.distance !== criteria.distance) continue;
      const other = play.facts?.charting;
      if (other?.coverage !== criteria.coverage || other.rushers !== criteria.rushers || !defenseCriteria(play)) continue;
      const defense = sameReportedPersonnel(chart.defensePersonnel, other.defensePersonnel);
      const offense = sameReportedPersonnel(chart.offensePersonnel, other.offensePersonnel);
      matches.push({ game, play, order, rank: Number(defense) * 2 + Number(offense) });
    }
  }
  return matches.sort((a, b) => b.rank - a.rank || b.game.date.localeCompare(a.game.date) ||
    a.game.id.localeCompare(b.game.id) || a.order - b.order);
}

/** The browser navigates a bounded shortlist. A still-valid bookmarked pair also survives later reranking. */
export function selectDefenseMatch(anchor: DefenseSample, matches: DefenseSample[], requested?: DefenseSnapId) {
  const featured = identifies(anchor, featuredDefense) ? featuredEarlier : undefined;
  const preferred = requested ?? featured;
  const index = preferred ? matches.findIndex(match => identifies(match, preferred)) : 0;
  if (requested && index < 0) return null;
  const selectedIndex = Math.max(0, index);
  const selected = matches[selectedIndex];
  if (!selected) return null;
  const shown = Math.min(matches.length, matchLimit);
  const idAt = (i: number) => ({ game: matches[i].game.id, play: matches[i].play.key });
  return {
    selected, shown, total: matches.length, position: selectedIndex + 1,
    previous: selectedIndex > 0 && selectedIndex < shown ? idAt(selectedIndex - 1) : null,
    next: selectedIndex + 1 < shown ? idAt(selectedIndex + 1) : null,
    first: selectedIndex >= shown ? idAt(0) : null,
  };
}
