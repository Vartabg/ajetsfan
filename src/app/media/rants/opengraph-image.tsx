import { ShareImage } from "@/lib/share-image";

export const alt = "Jets Rants: memorable outbursts from Benigno, La Greca, Tierney, Licata and Francesa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "The fan archive",
    title: "Jets Rants.",
    detail: "Benigno. La Greca. Tierney. Licata. Francesa. Memorable meltdowns and fresh frustration, played right where you find them.",
  });
}
