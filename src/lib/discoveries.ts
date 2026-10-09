import type { Game } from "./games";
import { publishedGames } from "./published-pages";

export type DiscoveryScope = {
  /** Reconciled, unique wins/losses with a valid second-half estimate for their outcome. */
  games: number;
  wins: number;
  losses: number;
  firstSeason: number | null;
  lastSeason: number | null;
  firstDate: string | null;
  lastDate: string | null;
};

export type SameScoreDiscovery = {
  /** Ordered by second-half probability low, independently of date or home/away. */
  low: Game;
  high: Game;
  jetsScore: number;
  oppScore: number;
  /** Fractional probability difference; multiply by 100 for probability points. */
  gap: number;
  /** All unordered candidate pairs across every exact-score group, including tied lows. */
  pairCount: number;
};

export type Discoveries = {
  scope: DiscoveryScope;
  belowOnePercent: Game[];
  aboveNinetyFivePercent: Game[];
  /** Saved actionable second-half key plays, ranked by absolute recorded model change. */
  biggestKeyPlays: Game[];
  sameScore: SameScoreDiscovery | null;
};

const probability = (value: number | null): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const gameOrder = (a: Game, b: Game) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

function recordedAction(game: Game): boolean {
  const play = game.keyPlay;
  if (!play || typeof play.wpa !== "number" || !Number.isFinite(play.wpa) || Math.abs(play.wpa) > 1 ||
    !Number.isInteger(play.qtr) || play.qtr! < 3 || typeof play.desc !== "string" || !play.desc.trim()) return false;
  // The extractor excludes these rows before selecting a key play. Keep that
  // boundary for older/malformed snapshots, whose key-play records have no type.
  if (/\b(?:no play|kneels|spiked|play under review)\b/i.test(play.desc)) return false;
  // A review/timeout/end-period placeholder cannot establish a football action.
  // Timeouts mentioned after a real snap remain eligible, as in the extractor.
  return /\b(?:pass|sack(?:ed)?|scrambl\w*|rush\w*|runs?|punts?|kicks?|field goal|extra point|fumbles?|intercept(?:ed|ion)|left (?:end|tackle|guard)|right (?:end|tackle|guard)|up the middle)\b/i.test(play.desc);
}

/**
 * Discoveries describe the supplied archive, including REG and POST games.
 * Callers apply their edition's date cutoff before invoking this pure helper.
 * Wins need a valid second-half trough; losses need a valid second-half peak.
 * A missing unrelated estimate does not erase an otherwise usable observation.
 * Key-play rankings compare saved key plays, not every play in the archive.
 */
export function buildDiscoveries(games: Game[]): Discoveries {
  const records = publishedGames(games, null).filter((game) =>
    game.outcome === "win" ? probability(game.troughH2Wp) : probability(game.peakH2Wp));
  const wins = records.filter((game) => game.outcome === "win");
  const losses = records.filter((game) => game.outcome === "loss");
  const dates = records.map((game) => game.date).sort();
  const seasons = records.map((game) => game.season);
  const scope: DiscoveryScope = {
    games: records.length, wins: wins.length, losses: losses.length,
    firstSeason: seasons.length ? Math.min(...seasons) : null,
    lastSeason: seasons.length ? Math.max(...seasons) : null,
    firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null,
  };
  const belowOnePercent = wins.filter((game) => game.troughH2Wp! < .01)
    .sort((a, b) => a.troughH2Wp! - b.troughH2Wp! || gameOrder(a, b));
  const aboveNinetyFivePercent = losses.filter((game) => game.peakH2Wp! > .95)
    .sort((a, b) => b.peakH2Wp! - a.peakH2Wp! || gameOrder(a, b));
  const biggestKeyPlays = records.filter(recordedAction)
    .sort((a, b) => Math.abs(b.keyPlay.wpa!) - Math.abs(a.keyPlay.wpa!) || gameOrder(a, b));

  const groups = new Map<string, Game[]>();
  for (const game of wins) {
    const key = `${game.jetsScore}:${game.oppScore}`;
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }
  let best: SameScoreDiscovery | null = null;
  let pairCount = 0;
  for (const group of groups.values()) {
    pairCount += group.length * (group.length - 1) / 2;
    const ordered = group.toSorted((a, b) => a.troughH2Wp! - b.troughH2Wp! || gameOrder(a, b));
    // Comparing every pair keeps tied maxima deterministic under input reversal.
    for (let lowIndex = 0; lowIndex < ordered.length - 1; lowIndex++) {
      for (let highIndex = lowIndex + 1; highIndex < ordered.length; highIndex++) {
        const low = ordered[lowIndex], high = ordered[highIndex];
        const gap = high.troughH2Wp! - low.troughH2Wp!;
        if (!best || gap > best.gap || gap === best.gap &&
          (gameOrder(low, best.low) < 0 || gameOrder(low, best.low) === 0 && gameOrder(high, best.high) < 0)) {
          best = { low, high, gap, jetsScore: low.jetsScore, oppScore: low.oppScore, pairCount: 0 };
        }
      }
    }
  }
  return { scope, belowOnePercent, aboveNinetyFivePercent, biggestKeyPlays,
    sameScore: best ? { ...best, pairCount } : null };
}
