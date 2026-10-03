import { ShareImage } from "@/lib/share-image";

export const alt = "How The Back Page is made: sources, calculations and checks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "Sources and methods",
    title: "How the paper is made.",
    detail: "Every game has a story. These are the sources, calculations and checks behind the numbers.",
  });
}
