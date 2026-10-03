import { ShareImage } from "@/lib/share-image";

export const alt = "Jets visual game stories from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "Visual game stories",
    title: "Game stories.",
    detail: "Recorded Jets games, moment by moment: scores, source play descriptions and model win probability.",
  });
}
