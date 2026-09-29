import { rank, type Board, type Game } from "./games";

export type ArchiveSort = "swing" | "recent" | "oldest";
export type ArchiveFilters = { season: string; opponent: string; query: string; sort: ArchiveSort };

export function gameHref(id: string, board: Board): string {
  return `/morgue?${new URLSearchParams({ game: id, board }).toString()}`;
}

export function archiveFilters(params: URLSearchParams): ArchiveFilters {
  const sort = params.get("sort");
  return {
    season: params.get("season") || "all",
    opponent: params.get("opponent") || "all",
    query: params.get("q") || "",
    sort: sort === "recent" || sort === "oldest" ? sort : "swing",
  };
}

export function archiveBoard(params: URLSearchParams, games: Game[]): Board {
  const board = params.get("board");
  if (board === "heartbreak" || board === "miracle") return board;
  return games.find((game) => game.id === params.get("game"))?.outcome === "win" ? "miracle" : "heartbreak";
}

export function filterArchive(games: Game[], board: Board, filters: ArchiveFilters): Game[] {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = rank(games, board).filter((game) => {
    if (filters.season !== "all" && String(game.season) !== filters.season) return false;
    if (filters.opponent !== "all" && game.opponentDisplay !== filters.opponent) return false;
    const searchable = `${game.opponentDisplay} ${game.opponent} ${game.id} ${game.date} ${game.season} ${game.keyPlay.desc ?? ""} ${game.jetsScore} ${game.oppScore}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  if (filters.sort !== "swing") {
    list.sort((a, b) => (a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) * (filters.sort === "recent" ? -1 : 1));
  }
  return list;
}
