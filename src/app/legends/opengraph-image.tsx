import { ShareImage } from "@/lib/share-image";

export const alt = "Meet the Jets legends — The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({ eyebrow: "The people behind the Jets", title: "Meet the Jets legends.",
    detail: "Faces, stories and connections. Ring of Honor, Canton and retired-number tributes." });
}
