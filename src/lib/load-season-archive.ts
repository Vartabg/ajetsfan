import "server-only";
import { loadCurrent, loadGames } from "./load-games";
import { mediaCollection } from "./media-catalog";
import { loadMediaCollection } from "./load-media";
import { buildSeasonArchive } from "./season-archive";

export async function loadSeasonArchive({ liveMedia = true } = {}) {
  const [games, current] = await Promise.all([loadGames({ live: liveMedia }), loadCurrent({ live: liveMedia })]);
  const media = liveMedia ? await loadMediaCollection() : mediaCollection;
  return buildSeasonArchive(games, current, media.items, media.checkedAt);
}
