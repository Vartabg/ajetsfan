export type RankEntry = {
  id: string;
  name: string;
  value: number;
  rank: number;
  tied: boolean;
  games: number;
  teams?: string[];
  jetsValue?: number;
  jetsGames?: number;
  position?: string;
};

export type RankingMetric = {
  id: string;
  label: string;
  unit: "perGame" | "yards" | "count" | "sacks";
  direction: "higher" | "lower";
  populationLabel: string;
  population: number;
  jets: RankEntry | null;
  leaders: RankEntry[];
  players?: RankEntry[];
  note: string;
};

export type RankingPhase = {
  phase: "all" | "regular" | "playoffs";
  expectedGames: number;
  teamGames: number;
  playerGames: number;
  missingTeamGames: string[];
  missingPlayerGames: string[];
  jetsGames: number;
  throughDate: string | null;
  team: RankingMetric[];
  individual: RankingMetric[];
  notes: string[];
};

export type SeasonRankings = {
  year: number;
  checkedAt: string;
  status?: "ready" | "retained";
  attemptedAt?: string;
  sources: { schedule: string; teams: string; players: string };
  phases: Record<"all" | "regular" | "playoffs", RankingPhase>;
};

export type RankingsCollection = {
  schemaVersion: 1;
  checkedAt: string;
  seasons: SeasonRankings[];
};
