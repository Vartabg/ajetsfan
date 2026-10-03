import { mediaCollection } from "@/lib/media-catalog";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Jets Media Room from The Back Page: beat reporting, TV, radio and film";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "Beat reporting, TV, radio and film",
    title: "Media Room.",
    detail: `${mediaCollection.items.length} checked items from ${mediaCollection.outlets.length} outlets · dated coverage that opens at the original source.`,
  });
}
