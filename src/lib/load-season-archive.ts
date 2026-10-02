import "server-only";
import { loadCurrent, loadGames } from "./load-games";
import { mediaCollection } from "./media-catalog";
import { buildSeasonArchive } from "./season-archive";

export async function loadSeasonArchive() {
  const [games, current] = await Promise.all([loadGames(), loadCurrent()]);
  return buildSeasonArchive(games, current, mediaCollection.items, mediaCollection.checkedAt);
}
