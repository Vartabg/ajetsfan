import { ShareImage } from "@/lib/share-image";

export const alt = "The Back Page — football, heartbreak, and occasional signs of life.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({ eyebrow: "For the green & white", title: "We’re watching anyway.", detail: "Sunday stories. The names on our jerseys. And a Morgue for the leads we couldn’t keep." });
}
