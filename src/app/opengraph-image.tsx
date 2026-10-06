import { ShareImage } from "@/lib/share-image";

export const alt = "ajetsfan: the latest Jets result, the next game and the season, one thing at a time.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({ eyebrow: "ajetsfan", title: "The Jets, one thing at a time.", detail: "The latest result, the next game, the season, the division and the big plays." });
}
