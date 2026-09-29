export type FeedState = {
  checkedAt: string | null;
  attemptedAt: string;
  status: "ready" | "retained" | "unavailable";
  source: string;
  sourceUpdatedAt: string | null;
};

export type NewsItem = { id: string; title: string; url: string; publishedAt: string };
export type RosterPlayer = {
  id: string;
  espnId: string | null;
  name: string;
  position: string;
  jersey: string | null;
  group: "offense" | "defense" | "special" | "other";
  status: string;
  statusLabel: string;
  headshot: string | null;
  height: string | null;
  weight: number | null;
  college: string | null;
  experience: number | null;
  profileUrl: string | null;
};
export type PlayerStats = {
  id: string;
  name: string;
  position: string;
  headshot: string | null;
  games: number;
  passing: { completions: number; attempts: number; yards: number; touchdowns: number; interceptions: number };
  rushing: { carries: number; yards: number; touchdowns: number };
  receiving: { targets: number; receptions: number; yards: number; touchdowns: number };
};
export type CoverageSnapshot = {
  schemaVersion: 1;
  season: number;
  news: FeedState & { items: NewsItem[] };
  roster: FeedState & { season: number; week: number | null; excludedPlayers?: number; players: RosterPlayer[] };
  stats: FeedState & {
    season: number;
    throughWeek: number | null;
    throughDate: string | null;
    analyzedGameIds: string[];
    pendingGameIds: string[];
    playerGameIds?: Record<string, string[]>;
    players: PlayerStats[];
  };
};

export function leaders(stats: CoverageSnapshot["stats"], kind: "passing" | "rushing" | "receiving", limit = 3): PlayerStats[] {
  const volume = { passing: "attempts", rushing: "carries", receiving: "targets" } as const;
  return stats.players.filter((player) => {
    const metric = player[kind] as { attempts?: number; carries?: number; targets?: number };
    return (metric[volume[kind]] ?? 0) > 0;
  }).sort((a, b) => b[kind].yards - a[kind].yards || b[kind].touchdowns - a[kind].touchdowns || a.name.localeCompare(b.name)).slice(0, limit);
}
