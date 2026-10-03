import { loadGames } from "@/lib/load-games";
import { archiveCoverage } from "@/lib/current";
import { rank } from "@/lib/games";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Morgue from The Back Page: Jets finishes ranked by second-half model probability";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const games = await loadGames();
  const archive = archiveCoverage(games);
  return ShareImage({
    eyebrow: `The game archive · ${archive.seasonLabel}`,
    title: "The Morgue.",
    detail: `${archive.count} analyzed games · ${rank(games, "heartbreak").length} losses and ${rank(games, "miracle").length} wins ranked by second-half model probability.`,
  });
}
