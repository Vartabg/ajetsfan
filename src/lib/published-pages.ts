import type { CoverageSnapshot, RosterPlayer } from "./coverage";
import type { CurrentSnapshot } from "./current";
import type { Game } from "./games";

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

const teamLineage: Record<string, string> = { OAK: "LV", SD: "LAC", STL: "LA" };

/** A published case must be trustworthy enough to open its matching game tape. */
export function publishedGames(games: Game[], current: CurrentSnapshot | null): Game[] {
  if (current && !Number.isFinite(Date.parse(current.checkedAt))) return [];
  const counts = new Map<string, number>();
  for (const game of games) counts.set(game.id, (counts.get(game.id) ?? 0) + 1);
  return games.filter((game) => {
    if (counts.get(game.id) !== 1 || !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(game.id) || game.dataSuspect ||
      !Number.isInteger(game.season) || !Number.isInteger(game.week) || game.week < 1 || game.week > 30 ||
      (game.seasonType !== "REG" && game.seasonType !== "POST") || !validDate(game.date) ||
      !Number.isInteger(game.jetsScore) || game.jetsScore < 0 || !Number.isInteger(game.oppScore) || game.oppScore < 0 ||
      typeof game.atHome !== "boolean" || !/^[A-Z]{2,3}$/.test(game.opponent) || !game.opponentDisplay ||
      game.swing === null || !Number.isFinite(game.swing) || game.swing < 0 || game.swing > 1 ||
      (game.outcome !== "win" && game.outcome !== "loss") ||
      (game.outcome === "win" ? game.jetsScore <= game.oppScore : game.jetsScore >= game.oppScore)) return false;
    // Historical game IDs retain Oakland, San Diego and St. Louis; source grouping uses today's lineage.
    if ((teamLineage[game.opponentDisplay] ?? game.opponentDisplay) !== game.opponent) return false;
    const teams = game.atHome ? `${game.opponentDisplay}_NYJ` : `NYJ_${game.opponentDisplay}`;
    if (game.id !== `${game.season}_${String(game.week).padStart(2, "0")}_${teams}`) return false;
    if (!current) return true;
    if (game.date > current.checkedAt.slice(0, 10)) return false;
    const fixtures = current.schedule.filter((fixture) => fixture.id === game.id);
    if (!fixtures.length) return game.season !== current.season;
    const fixture = fixtures.length === 1 ? fixtures[0] : null;
    return !!fixture && fixture.status === "final" &&
      (["season", "week", "seasonType", "date", "opponent", "atHome", "jetsScore", "oppScore", "outcome"] as const)
        .every((field) => fixture[field] === game[field]);
  });
}

/** Publish source profiles for this edition only; other seasons cannot inherit today's stats. */
export function publishedPlayers(coverage: CoverageSnapshot | null, editionSeason: number | null): RosterPlayer[] {
  if (!coverage || editionSeason === null || coverage.roster.status === "unavailable" || coverage.roster.season !== editionSeason) return [];
  const counts = new Map<string, number>();
  for (const player of coverage.roster.players) counts.set(player.id, (counts.get(player.id) ?? 0) + 1);
  return coverage.roster.players.filter((player) => counts.get(player.id) === 1 && /^\d{2}-\d{7}$/.test(player.id) &&
    !!player.name.trim() && !!player.position.trim());
}
