import { ShareImage } from "@/lib/share-image";

export const alt = "Wilson’s winning touchdown — 3D Film Room on ajetsfan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "Film Room · 3D replay",
    title: "Wilson’s winning touchdown.",
    detail: "September 18, 2022 at Cleveland. Move the camera, scrub slow motion, and inspect what is recorded versus inferred.",
    score: "31–30",
  });
}
