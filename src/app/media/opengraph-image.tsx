import { loadMediaCollection } from "@/lib/load-media";
import { ShareImage } from "@/lib/share-image";

export const dynamic = "force-dynamic";
export const alt = "The Jets Media Room from The Back Page: beat reporting, TV, radio and film";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const mediaCollection = await loadMediaCollection();
  return ShareImage({
    eyebrow: "Beat reporting, TV, radio and film",
    title: "Media Room.",
    detail: `${mediaCollection.items.length} items from ${mediaCollection.outlets.length} outlets · independent Jets voices, WFAN, ESPN New York and SNY. Play and listen right here.`,
  });
}
