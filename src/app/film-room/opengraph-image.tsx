import { jetsPlays } from "@/lib/jets-playbook";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Film Room from The Back Page: Jets plays on an editable chalkboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "The Jets, one snap at a time",
    title: "Film Room.",
    detail: `Big Jets plays, broken down. Watch ${jetsPlays.length} of them drawn out on a chalkboard, or open the game record.`,
  });
}
