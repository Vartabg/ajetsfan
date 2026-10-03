import { loadSeasonArchive } from "@/lib/load-season-archive";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Jets season archive from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const seasons = await loadSeasonArchive();
  return ShareImage({
    eyebrow: "The season archive",
    title: "Pick a year. Go back in.",
    detail: `${seasons.length} Jets seasons · final scores, playoff runs, game evidence, reporting and replays. Game coverage begins in 1999.`,
  });
}
