import { completedGames, type CurrentSnapshot, type ResultGame } from "./current";
import { selectFanMemories } from "./fan-memories";
import type { Game } from "./games";
import { jetsPlays } from "./jets-playbook";
import { mediaForSeason, type MediaItem } from "./media";
import { publishedGames } from "./published-pages";

export type ArchiveFact = { id: string; season: number; phase: "regular" | "playoffs"; title: string; text: string; url: string; source: string; href?: string };
export type ArchiveSeason = { year: number; results: ResultGame[]; cases: Game[]; facts: ArchiveFact[]; media: MediaItem[]; heldAnalysis: number; current: boolean };
export type ArchivePhase = "all" | "regular" | "playoffs";

function validResult(game: ResultGame, cutoff: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(game.date) && Number.isFinite(Date.parse(`${game.date}T12:00:00Z`))
    && new Date(`${game.date}T12:00:00Z`).toISOString().slice(0, 10) === game.date;
  const teams = game.atHome ? `${game.opponentDisplay}_NYJ` : `NYJ_${game.opponentDisplay}`;
  const calendarYear = Number(game.date.slice(0, 4)), month = Number(game.date.slice(5, 7));
  const lineage: Record<string, string> = { OAK: "LV", SD: "LAC", STL: "LA" };
  return date && game.date <= cutoff && Number.isInteger(game.season) && game.season >= 1960
    && ((calendarYear === game.season && month >= 8) || (calendarYear === game.season + 1 && month <= 2))
    && Number.isInteger(game.week) && game.week >= 1 && game.week <= 30 && ["REG", "POST"].includes(game.seasonType)
    && /^[A-Z]{2,3}$/.test(game.opponentDisplay) && typeof game.atHome === "boolean"
    && (lineage[game.opponentDisplay] ?? game.opponentDisplay) === game.opponent && game.opponent !== "NYJ"
    && game.id === `${game.season}_${String(game.week).padStart(2, "0")}_${teams}`
    && Number.isInteger(game.jetsScore) && game.jetsScore >= 0 && Number.isInteger(game.oppScore) && game.oppScore >= 0
    && game.outcome === (game.jetsScore > game.oppScore ? "win" : game.jetsScore < game.oppScore ? "loss" : "tie");
}

export function archiveFacts(games: Game[]): ArchiveFact[] {
  const memories = selectFanMemories(games).map(({ memory }) => ({
    id: memory.fixture.id, season: memory.fixture.season, phase: memory.fixture.seasonType === "POST" ? "playoffs" as const : "regular" as const,
    title: memory.title, text: memory.fact, url: memory.source.url, source: memory.source.label, href: `/games/${memory.fixture.id}`,
  }));
  const plays = jetsPlays.map((play) => ({
    id: play.id, season: Number(play.date.slice(0, 4)), phase: "regular" as const,
    title: play.title, text: play.summary, url: play.sources[0].url, source: play.sources[0].label, href: `/film-room#jets-play:${play.id}`,
  }));
  return [{ id: "super-bowl-iii", season: 1968, phase: "playoffs", title: "Super Bowl III: 16–7",
    text: "The Jets beat Baltimore on January 12, 1969. The championship belongs to the 1968 football season.",
    url: "https://www.newyorkjets.com/news/super-bowl-iii-jets-16-colts-7-2507141", source: "Jets historical account of Super Bowl III" }, ...memories, ...plays];
}

/** Finals and usable analysis are distinct; bad PBP cannot erase a recorded score. */
export function buildSeasonArchive(games: Game[], current: CurrentSnapshot | null, media: MediaItem[], checkedAt: string): ArchiveSeason[] {
  const cutoff = (current?.checkedAt ?? checkedAt).slice(0, 10);
  const counts = new Map<string, number>();
  games.forEach((game) => counts.set(game.id, (counts.get(game.id) ?? 0) + 1));
  const records = new Map<string, ResultGame>();
  for (const game of games) if (counts.get(game.id) === 1 && validResult(game, cutoff) && game.season !== current?.season) records.set(game.id, game);
  if (current) {
    const fixtureCounts = new Map<string, number>();
    current.schedule.forEach((game) => fixtureCounts.set(game.id, (fixtureCounts.get(game.id) ?? 0) + 1));
    for (const game of completedGames(current)) if (game.season === current.season && fixtureCounts.get(game.id) === 1 && validResult(game, cutoff)) records.set(game.id, game);
  }
  const fields = ["season", "week", "seasonType", "date", "opponent", "opponentDisplay", "atHome", "jetsScore", "oppScore", "outcome"] as const;
  const authoritativeCurrent = current ? { ...current, schedule: current.schedule.filter((fixture) => fixture.season === current.season) } : null;
  const cases = publishedGames(games, authoritativeCurrent).filter((game) => {
    const result = records.get(game.id);
    return result && fields.every((field) => result[field] === game[field]);
  });
  const facts = archiveFacts(cases);
  const years = new Set([...records.values()].map((game) => game.season));
  facts.forEach((fact) => years.add(fact.season));
  media.forEach((item) => item.seasons?.forEach((year) => years.add(year)));
  if (current) years.add(current.season);
  return [...years].sort((a, b) => b - a).map((year) => {
    const results = [...records.values()].filter((game) => game.season === year).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const analyzed = cases.filter((game) => game.season === year);
    return { year, results, cases: analyzed, facts: facts.filter((fact) => fact.season === year), media: mediaForSeason(media, year),
      heldAnalysis: results.filter((game) => !analyzed.some((entry) => entry.id === game.id)).length, current: current?.season === year };
  });
}

export function phaseResults(season: ArchiveSeason, phase: ArchivePhase) {
  return season.results.filter((game) => phase === "all" || game.seasonType === (phase === "playoffs" ? "POST" : "REG"));
}

export function seasonNumbers(results: ResultGame[]) {
  const scored = results.reduce((sum, game) => sum + game.jetsScore, 0), allowed = results.reduce((sum, game) => sum + game.oppScore, 0);
  const wins = results.filter((game) => game.outcome === "win").length, losses = results.filter((game) => game.outcome === "loss").length, ties = results.filter((game) => game.outcome === "tie").length;
  const biggestWin = results.filter((game) => game.outcome === "win").sort((a, b) => (b.jetsScore - b.oppScore) - (a.jetsScore - a.oppScore) || a.id.localeCompare(b.id))[0] ?? null;
  return { wins, losses, ties, scored, allowed, differential: scored - allowed, games: results.length, oneScore: results.filter((game) => Math.abs(game.jetsScore - game.oppScore) <= 8).length,
    pointsPerGame: results.length ? scored / results.length : null, biggestWin };
}
