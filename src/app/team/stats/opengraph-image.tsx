import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { ShareImage } from "@/lib/share-image";

export const alt = "Jets player stats from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const through = coverage && coverage.stats.season === season && coverage.stats.status !== "unavailable" ? coverage.stats.throughWeek : null;
  return ShareImage({
    eyebrow: season ? `${season} Jets · On the field` : "On the field",
    title: "Player stats.",
    detail: `Passing, rushing and receiving leaders${through != null ? ` through Week ${through}` : ""} · confirmed regular-season games.`,
  });
}
