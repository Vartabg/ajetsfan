import Image from "next/image";
import type { MediaImage } from "@/lib/media";
import shared from "./Focus.module.css";

/** A publisher's own picture, cropped to the frame; square artwork stays square. */
export default function FocusPicture({ image, eager = false }: { image: MediaImage; eager?: boolean }) {
  return <div className={`${shared.picture} ${Math.abs(image.width / image.height - 1) < .2 ? shared.square : ""}`}>
    <Image src={image.url} alt="" fill priority={eager} sizes="(max-width: 959px) calc(100vw - 32px), 760px" />
  </div>;
}
