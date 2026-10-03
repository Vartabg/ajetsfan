import { ShareImage } from "@/lib/share-image";

export const alt = "Jets history from The Back Page: classics and rivalries";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "Classics and rivalries",
    title: "Jets history.",
    detail: "Super Bowl III, memorable Jets games and the rivalry record. Sourced moments, each with its game evidence.",
  });
}
