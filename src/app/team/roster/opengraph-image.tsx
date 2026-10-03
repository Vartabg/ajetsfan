import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Jets roster from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const roster = coverage && coverage.roster.status !== "unavailable" ? coverage.roster : null;
  return ShareImage({
    eyebrow: season ? `${season} Jets · The players` : "The players",
    title: "The roster.",
    detail: roster ? `${roster.players.length} players in the ${roster.season} roster · find a player by name, number or position.` : "Find a player by name, number or position.",
  });
}
