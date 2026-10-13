import "server-only";
import { cache } from "react";
import { loadCoverage } from "./load-coverage";
import { loadCurrent, loadGames } from "./load-games";
import { publishedGames, publishedPlayers } from "./published-pages";

export const loadPublishedGames = cache(async ({ live = true } = {}) => {
  const [games, current] = await Promise.all([loadGames({ live }), loadCurrent({ live })]);
  return publishedGames(games, current);
});

export const loadPublishedGame = cache(async (id: string) =>
  (await loadPublishedGames()).find((game) => game.id === id),
);

export const loadPlayerEdition = cache(async ({ live = true } = {}) => {
  const [coverage, current] = await Promise.all([loadCoverage({ live }), loadCurrent({ live })]);
  const season = current?.season ?? coverage?.season ?? null;
  return { coverage, season, players: publishedPlayers(coverage, season) };
});

export const loadPublishedPlayer = cache(async (id: string) => {
  const edition = await loadPlayerEdition();
  const player = edition.players.find((entry) => entry.id === id);
  if (!player || !edition.coverage || edition.season === null) return null;
  return { player, coverage: edition.coverage, season: edition.season };
});
