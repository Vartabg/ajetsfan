import { ShareImage } from "@/lib/share-image";
export const alt = "The Monday Night Miracle: from 30–7 down to a 40–37 Jets win";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return ShareImage({ eyebrow: "A Jets journey", title: "The Monday Night Miracle.", detail: "Relive the rally. Explore Elliott’s catch. Compare two comebacks." });
}
