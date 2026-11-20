import { ShareImage } from "@/lib/share-image";

export const alt = "A recorded Jets play on ajetsfan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return ShareImage({ eyebrow: "Play by play", title: "Follow the Jets at your pace.", detail: "Pick a play, follow the drive and see when the Jets have been here before." });
}
