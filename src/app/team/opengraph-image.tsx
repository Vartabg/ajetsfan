import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Jets team desk from The Back Page: roster, player stats and news";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const roster = coverage && coverage.roster.status !== "unavailable" && coverage.roster.season === season ? coverage.roster.players.length : null;
  return ShareImage({
    eyebrow: season ? `${season} Jets` : "New York Jets",
    title: "The team.",
    detail: roster ? `${roster} roster profiles · player production · official team news.` : "The players. Their production. What’s happening in Florham Park.",
  });
}
