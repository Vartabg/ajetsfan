import type { TeamAnalytics } from "./analytics";

export type EfficiencyMetric = "epaPerPlay" | "successRate" | "passEpaPerPlay" | "rushEpaPerPlay";
export type LeagueEntry = { team: string; value: number; plays: number; rank: number; completedGames: number };
export type LeagueMeasure = { mean: number | null; plays: number; teams: number; entries: LeagueEntry[] };

/** Pool rates by their own play counts; ranks use unrounded values, with the canonical numerical tie tolerance. */
export function leagueMetric(teams: TeamAnalytics[], side: "offense" | "defense", metric: EfficiencyMetric): LeagueMeasure {
  const denominator = metric === "passEpaPerPlay" ? "passPlays" : metric === "rushEpaPerPlay" ? "rushPlays" : "plays";
  const entries: LeagueEntry[] = [];
  for (const team of teams) {
    const value = team[side][metric];
    const plays = team[side][denominator];
    if (team.completedGames < 1 || value == null || !Number.isFinite(value) || !Number.isInteger(plays) || plays < 1) continue;
    entries.push({ team: team.team, value, plays, rank: 0, completedGames: team.completedGames });
  }
  entries.sort((a, b) => (side === "defense" ? a.value - b.value : b.value - a.value) || a.team.localeCompare(b.team));
  entries.forEach((entry) => {
    entry.rank = 1 + entries.filter((other) => side === "defense" ? other.value < entry.value - 1e-12 : other.value > entry.value + 1e-12).length;
  });
  const plays = entries.reduce((total, entry) => total + entry.plays, 0);
  const total = entries.reduce((sum, entry) => sum + entry.value * entry.plays, 0);
  return { mean: plays > 0 ? total / plays : null, plays, teams: entries.length, entries };
}

/** Changes are percentage points, never relative percent changes or player grades. */
export function wpaLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) > 1) return "Unavailable";
  const points = Number((value * 100).toFixed(1));
  return `${points > 0 ? "+" : ""}${points.toFixed(1)} percentage points`;
}
