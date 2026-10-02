import { mergeResults, type CurrentSnapshot, type ResultGame, type ScheduledGame } from "./current";
import { gameHref } from "./explorer";
import type { Game } from "./games";

export const RIVALS = [
  { opponent: "BUF", name: "Buffalo", quip: "Two trips a year. No love lost." },
  { opponent: "MIA", name: "Miami", quip: "That shade of aqua still raises the pulse." },
  { opponent: "NE", name: "New England", quip: "Some wins never leave Foxborough." },
] as const;

export type RivalOpponent = typeof RIVALS[number]["opponent"];
export type RivalryEntry = {
  opponent: RivalOpponent;
  name: string;
  quip: string;
  wins: number;
  losses: number;
  ties: number;
  count: number;
  firstSeason: number | null;
  lastSeason: number | null;
  latest: ResultGame | null;
  latestAnalysisHref: string | null;
  next: { game: ScheduledGame; overdue: boolean; kickoffKnown: boolean } | null;
  archiveHref: string;
};

export type RivalryLedger = {
  entries: RivalryEntry[];
  firstSeason: number | null;
  lastSeason: number | null;
  throughDate: string | null;
  checkedAt: string | null;
  scheduleSource: string | null;
  excludedArchiveResults: number;
};

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function validResult(game: ResultGame): boolean {
  return !!game.id && Number.isInteger(game.season) && game.season >= 1960 &&
    Number.isInteger(game.week) && game.week > 0 && validDate(game.date) &&
    Number.isInteger(game.jetsScore) && game.jetsScore >= 0 &&
    Number.isInteger(game.oppScore) && game.oppScore >= 0 &&
    game.outcome === (game.jetsScore > game.oppScore ? "win" : game.jetsScore < game.oppScore ? "loss" : "tie");
}

const byDate = (a: ResultGame | ScheduledGame, b: ResultGame | ScheduledGame) =>
  a.date.localeCompare(b.date) || a.week - b.week || a.id.localeCompare(b.id);

function sourceUrl(source: string | undefined): string | null {
  if (!source) return null;
  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:" ? source : null;
  } catch {
    return null;
  }
}

/** A corrected score must never open a probability curve for the old result. */
export function rivalAnalysisHref(result: ResultGame | null, games: Game[]): string | null {
  if (!result || !validResult(result) || result.outcome === "tie") return null;
  const analysis = games.find((game) => game.id === result.id &&
    !game.dataSuspect && game.swing != null && Number.isFinite(game.swing) && game.swing >= 0 && game.swing <= 1 &&
    game.season === result.season && game.week === result.week && game.seasonType === result.seasonType &&
    game.date === result.date && game.opponent === result.opponent && game.opponentDisplay === result.opponentDisplay && game.atHome === result.atHome &&
    game.jetsScore === result.jetsScore && game.oppScore === result.oppScore && game.outcome === result.outcome);
  return analysis ? gameHref(result.id, result.outcome === "win" ? "miracle" : "heartbreak") : null;
}

/**
 * These are sampled records against today's three AFC East opponents, not a
 * historical division record. Indianapolis also belonged to the East before 2002.
 * Flagged archive scores stay out until a schedule-confirmed replacement exists.
 */
export function rivalryLedger(games: Game[], snapshot: CurrentSnapshot | null): RivalryLedger {
  const checkedAt = snapshot && Number.isFinite(Date.parse(snapshot.checkedAt)) ? snapshot.checkedAt : null;
  const cutoff = checkedAt?.slice(0, 10);
  const archive = games.filter((game) => !game.dataSuspect && validResult(game));
  const results = mergeResults(archive, snapshot).filter((game) =>
    game.seasonType === "REG" && validResult(game) && (!cutoff || game.date <= cutoff),
  ).sort(byDate);
  const resultIds = new Set(results.map((game) => game.id));
  const omittedIds = new Set(games.filter((game) =>
    game.seasonType === "REG" && RIVALS.some((rival) => rival.opponent === game.opponent) &&
    (game.dataSuspect || !validResult(game)) && !resultIds.has(game.id),
  ).map((game) => game.id));
  const entries = RIVALS.map((rival): RivalryEntry => {
    const meetings = results.filter((game) => game.opponent === rival.opponent);
    const latest = meetings.at(-1) ?? null;
    const seasons = meetings.map((game) => game.season);
    const scheduled = checkedAt ? snapshot?.schedule.filter((game) =>
      game.season === snapshot.season && game.seasonType === "REG" &&
      game.opponent === rival.opponent && game.status === "scheduled" && validDate(game.date) &&
      (!latest || byDate(game, latest) > 0),
    ).sort(byDate)[0] : undefined;
    const kickoffKnown = !!scheduled?.kickoff && Number.isFinite(Date.parse(scheduled.kickoff));
    const overdue = !!scheduled && !!checkedAt && (kickoffKnown
      ? Date.parse(scheduled.kickoff!) <= Date.parse(checkedAt)
      : scheduled.date <= checkedAt.slice(0, 10));
    return {
      ...rival,
      wins: meetings.filter((game) => game.outcome === "win").length,
      losses: meetings.filter((game) => game.outcome === "loss").length,
      ties: meetings.filter((game) => game.outcome === "tie").length,
      count: meetings.length,
      firstSeason: seasons.length ? Math.min(...seasons) : null,
      lastSeason: seasons.length ? Math.max(...seasons) : null,
      latest,
      latestAnalysisHref: rivalAnalysisHref(latest, games),
      next: scheduled ? { game: scheduled, overdue, kickoffKnown } : null,
      archiveHref: `/morgue?${new URLSearchParams({ board: "heartbreak", opponent: rival.opponent, sort: "recent" }).toString()}`,
    };
  });
  const seasons = results.map((game) => game.season);
  return {
    entries,
    firstSeason: seasons.length ? Math.min(...seasons) : null,
    lastSeason: seasons.length ? Math.max(...seasons) : null,
    throughDate: results.at(-1)?.date ?? null,
    checkedAt,
    scheduleSource: sourceUrl(snapshot?.sources.schedule),
    excludedArchiveResults: omittedIds.size,
  };
}

export function rivalryRecord(entry: Pick<RivalryEntry, "wins" | "losses" | "ties">): string {
  return `${entry.wins}–${entry.losses}${entry.ties ? `–${entry.ties}` : ""}`;
}

export function rivalrySeasons(first: number | null, last: number | null): string {
  return first === null || last === null ? "No included seasons" : first === last ? `${first} season` : `${first}–${last} seasons`;
}
