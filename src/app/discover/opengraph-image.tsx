import { ShareImage } from "@/lib/share-image";

export const alt = "Deep cuts: surprising Jets discoveries from the record";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({ eyebrow: "Jets Deep cuts", title: "What a score can hide.", detail: "Same-score stories, improbable finishes and the plays that changed the odds. Open the evidence." });
}
