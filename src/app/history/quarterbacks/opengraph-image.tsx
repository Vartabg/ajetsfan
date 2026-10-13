import { loadLeagueHistory } from "@/lib/load-league-history";
import { buildCarousel } from "@/lib/quarterbacks";
import { ShareImage } from "@/lib/share-image";

export const alt = "Every Jets starting quarterback since 1999, from ajetsfan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const history = await loadLeagueHistory();
  const carousel = history ? buildCarousel(history.games) : null;
  return ShareImage({
    eyebrow: carousel ? `Jets history · ${carousel.from}–${carousel.to}` : "Jets history",
    title: carousel ? `${carousel.quarterbacks.length} starting quarterbacks.` : "The quarterbacks.",
    detail: carousel ? `${carousel.games} games, ${carousel.changes} changes of starter. Every game coloured by who started it.` : "Every Jets game coloured by who started it.",
  });
}
