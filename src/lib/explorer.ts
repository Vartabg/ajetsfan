import { rank, type Board, type Game } from "./games";
import type { ResultGame } from "./current";
import { teamIdentity, teamName } from "./teams";

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

type SearchableGame = ResultGame & { keyPlay?: Game["keyPlay"] };

function opponentSearchName(game: Pick<ResultGame, "opponentDisplay" | "season">): string {
  if (game.opponentDisplay === "WAS") {
    if (game.season < 2020) return "Washington Redskins";
    if (game.season < 2022) return "Washington Football Team";
    return "Washington Commanders";
  }
  return teamName(game.opponentDisplay);
}

const normalize = (value: string) => value.toLowerCase().replace(/[.'’]/g, "").replace(/[–—]/g, "-").replace(/[,!?;]+/g, " ");

export function gameSearchMatcher(query: string) {
  // With a nickname, LA is the city. A bare LA is the source code for the Rams.
  const words = normalize(query).replace(/\bla\s+(?=chargers\b|rams\b)/g, "los angeles ").trim().split(/\s+/).filter(Boolean);
  const terms = words.length > 1 ? words.filter((word) => word !== "vs" && word !== "versus") : words;
  // The Saints’ source code is also a word in play descriptions such as “no good”.
  const teamCodes = new Set(terms.filter((word) => (word !== "no" || terms.length === 1) && teamIdentity(word.toUpperCase())));

  return (game: SearchableGame, related = "") => {
    if (!terms.length) return true;
    const codes = ["NYJ", game.opponent, game.opponentDisplay].map((code) => code.toLowerCase());
    const searchable = normalize([
      game.id, game.date, game.season, game.keyPlay?.desc, game.jetsScore, game.oppScore, `${game.jetsScore}-${game.oppScore}`,
      teamName("NYJ"), game.atHome ? "vs" : "at", opponentSearchName(game), related,
    ].join(" "));
    return terms.every((term) => teamCodes.has(term) ? codes.includes(term) : searchable.includes(term));
  };
}

export function filterArchive(games: Game[], board: Board, filters: ArchiveFilters): Game[] {
  const matches = gameSearchMatcher(filters.query);
  const list = rank(games, board).filter((game) => {
    if (filters.season !== "all" && String(game.season) !== filters.season) return false;
    if (filters.opponent !== "all" && game.opponentDisplay !== filters.opponent) return false;
    return matches(game);
  });
  if (filters.sort !== "swing") {
    list.sort((a, b) => (a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) * (filters.sort === "recent" ? -1 : 1));
  }
  return list;
}
