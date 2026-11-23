import { ShareImage } from "@/lib/share-image";

export const alt = "Jets team stats and player leaders from ajetsfan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "New York Jets",
    title: "Team stats.",
    detail: "Third downs, red-zone trips, play calling and player leaders across the regular season.",
  });
}
