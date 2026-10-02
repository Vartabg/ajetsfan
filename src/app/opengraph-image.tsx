import { ShareImage } from "@/lib/share-image";

export const alt = "The Back Page — Jets scores, plays, and probability, with sources in view.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({ eyebrow: "An independent Jets publication", title: "Jets football. On the record.", detail: "Final scores. Turning plays. Team efficiency. The historical record, with sources in view." });
}
