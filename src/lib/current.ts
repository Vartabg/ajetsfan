import type { Game, Outcome } from "./games";

export type ScheduledGame = {
  id: string;
  season: number;
  week: number;
  seasonType: "REG" | "POST";
  date: string;
  kickoff: string | null;
  opponent: string;
  opponentDisplay: string;
  atHome: boolean;
  jetsScore: number | null;
  oppScore: number | null;
  outcome: Outcome | null;
  status: "final" | "scheduled";
};

export type CurrentSnapshot = {
  schemaVersion: 1;
  season: number;
  checkedAt: string;
  analysisUpdatedAt: string | null;
  latestAnalyzedGameId: string | null;
  sources: { schedule: string; pbp: string };
  schedule: ScheduledGame[];
};

export type ResultGame = Pick<Game,
  "id" | "season" | "week" | "seasonType" | "date" | "opponent" |
  "opponentDisplay" | "atHome" | "jetsScore" | "oppScore" | "outcome"
>;

export type FinalGame = ScheduledGame & { jetsScore: number; oppScore: number; outcome: Outcome };

const byDate = (a: ResultGame | ScheduledGame, b: ResultGame | ScheduledGame) =>
  a.date.localeCompare(b.date) || a.week - b.week || a.id.localeCompare(b.id);

/** Final scores are authoritative even when play-by-play has not arrived. */
export function completedGames(snapshot: CurrentSnapshot | null): FinalGame[] {
  if (!snapshot) return [];
  return snapshot.schedule.filter((game): game is FinalGame =>
    game.status === "final" && game.outcome !== null &&
    Number.isFinite(game.jetsScore) && Number.isFinite(game.oppScore) &&
    game.date <= snapshot.checkedAt.slice(0, 10),
  ).sort(byDate);
}

export function currentSeasonSummary(snapshot: CurrentSnapshot | null) {
  const finals = completedGames(snapshot).filter((game) => game.season === snapshot?.season && game.seasonType === "REG");
  const pointsFor = finals.reduce((total, game) => total + game.jetsScore, 0);
  const pointsAgainst = finals.reduce((total, game) => total + game.oppScore, 0);
  return {
    season: snapshot?.season ?? null,
    wins: finals.filter((game) => game.outcome === "win").length,
    losses: finals.filter((game) => game.outcome === "loss").length,
    ties: finals.filter((game) => game.outcome === "tie").length,
    pointsFor,
    pointsAgainst,
    pointDifferential: pointsFor - pointsAgainst,
    finals,
    recent: finals.slice(-5).reverse(),
  };
}

/** Merge by game ID; a schedule-confirmed result wins over the analysis copy. */
export function mergeResults(games: Game[], snapshot: CurrentSnapshot | null): ResultGame[] {
  const results = new Map<string, ResultGame>(games.map((game) => [game.id, game]));
  if (snapshot) {
    // A scheduled fixture must not inherit an unconfirmed final from an archive.
    for (const game of snapshot.schedule) results.delete(game.id);
    for (const game of completedGames(snapshot)) results.set(game.id, game);
  }
  return [...results.values()].sort(byDate);
}

export function nextScheduledGame(snapshot: CurrentSnapshot | null) {
  if (!snapshot) return null;
  const finals = completedGames(snapshot).filter((game) => game.season === snapshot.season);
  const latest = finals.at(-1);
  const game = snapshot.schedule.filter((game) =>
    game.season === snapshot.season && game.status === "scheduled" &&
    (!latest || byDate(game, latest) > 0),
  ).sort(byDate)[0];
  if (!game) return null;
  const overdue = game.kickoff
    ? Date.parse(game.kickoff) <= Date.parse(snapshot.checkedAt)
    : game.date < snapshot.checkedAt.slice(0, 10);
  return { game, overdue };
}

export type LeadSelection = {
  kind: "current" | "archive" | "empty";
  result: ResultGame | null;
  analysis: Game | null;
  analysisStatus: "ready" | "pending" | "suspect" | "unavailable";
};

export function selectLead(games: Game[], snapshot: CurrentSnapshot | null): LeadSelection {
  const result = completedGames(snapshot).filter((game) => game.season === snapshot?.season).at(-1);
  if (result) {
    const analysis = games.find((game) => game.id === result.id) ?? null;
    const agrees = analysis && analysis.date === result.date && analysis.outcome === result.outcome &&
      analysis.jetsScore === result.jetsScore && analysis.oppScore === result.oppScore;
    const status = analysis?.dataSuspect ? "suspect" :
      !agrees ? "pending" : analysis.swing == null ? "unavailable" : "ready";
    return { kind: "current", result, analysis: agrees ? analysis : null, analysisStatus: status };
  }
  const archive = games.filter((game) => !game.dataSuspect && game.swing !== null)
    .sort((a, b) => Math.abs(b.swing! - 0.5) - Math.abs(a.swing! - 0.5) || byDate(b, a))[0];
  return archive
    ? { kind: "archive", result: archive, analysis: archive, analysisStatus: "ready" }
    : { kind: "empty", result: null, analysis: null, analysisStatus: "unavailable" };
}

export function archiveCoverage(games: Game[]) {
  const ordered = [...games].sort(byDate);
  const seasons = games.map((game) => game.season);
  const firstSeason = seasons.length ? Math.min(...seasons) : null;
  const lastSeason = seasons.length ? Math.max(...seasons) : null;
  return {
    count: games.length,
    firstSeason,
    lastSeason,
    firstDate: ordered[0]?.date ?? null,
    lastDate: ordered.at(-1)?.date ?? null,
    seasonLabel: firstSeason === null ? "No analyzed seasons" :
      firstSeason === lastSeason ? `${firstSeason}` : `${firstSeason}–${lastSeason}`,
  };
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

export function formatCheckedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Chicago", timeZoneName: "short",
  }).format(new Date(iso));
}
