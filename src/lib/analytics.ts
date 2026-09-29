export type RateMetrics = {
  plays: number;
  epaPerPlay: number | null;
  successRate: number | null;
  passPlays: number;
  passEpaPerPlay: number | null;
  rushPlays: number;
  rushEpaPerPlay: number | null;
};

export type TeamAnalytics = {
  team: string;
  completedGames: number;
  offense: RateMetrics;
  defense: RateMetrics;
  ranks: {
    offenseEpa: number | null;
    defenseEpa: number | null;
    offenseSuccess: number | null;
    defenseSuccess: number | null;
  };
};

export type SeasonAnalytics = {
  schemaVersion: 1;
  season: number;
  analysisUpdatedAt: string | null;
  throughDate: string | null;
  throughWeek: number | null;
  analyzedGameIds: string[];
  pendingGameIds: string[];
  definitions: { epaPerPlay: string; successRate: string; passRush: string; scope: string };
  sources: { schedule: string; pbp: string; methodology: string };
  teams: TeamAnalytics[];
  games: {
    id: string;
    date: string;
    week: number;
    opponent: string;
    opponentDisplay: string;
    atHome: boolean;
    offense: RateMetrics;
    defense: RateMetrics;
    bigSwings: { playId: number; desc: string; qtr: number; secondsLeft: number | null; wpa: number }[];
  }[];
};

export function epaLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function rateLabel(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}
