import "server-only";
import { completedGames } from "./current";
import { confirmedDriveGame } from "./drive-game-page.mjs";
import { gameSearchMatcher } from "./explorer";
import { filmGameIds } from "./film-room";
import { searchGameReports } from "./game-discovery";
import { loadDrivesSeason } from "./load-drives";
import { loadFootballState } from "./load-football";
import { loadCurve } from "./load-games";
import { loadPublishedGames } from "./load-published-pages";
import { visualStoryIds } from "./visual-story";

const materialGames = new Set<string>([...visualStoryIds, ...filmGameIds]);

export async function loadGameDiscovery(query: string) {
  const [analyzed, football] = await Promise.all([loadPublishedGames(), loadFootballState()]);
  const { current } = football.edition;
  const publishedIds = new Set(analyzed.map((game) => game.id));
  const matches = gameSearchMatcher(query);
  const driveCandidates = completedGames(current).filter((game) =>
    game.season === current.season && !publishedIds.has(game.id) && matches(game));

  const [curves, driveSeason] = await Promise.all([
    Promise.all(analyzed.filter((game) => materialGames.has(game.id)).map(async (game) => [game.id, await loadCurve(game.id)] as const)),
    driveCandidates.length ? loadDrivesSeason(current.season) : null,
  ]);
  const verified = driveSeason ? driveCandidates.filter((game) => confirmedDriveGame(game.id, current, driveSeason)) : [];
  return searchGameReports(analyzed, verified, Object.fromEntries(curves), query);
}
