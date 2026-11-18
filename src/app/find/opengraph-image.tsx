import { ShareImage } from "@/lib/share-image";

export const alt = "Find a Jets game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({ eyebrow: "Jets game search", title: "Find the game you remember.", detail: "Search published game reports by opponent, season or play." });
}
