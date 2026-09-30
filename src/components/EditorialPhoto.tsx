"use client";

import Image from "next/image";
import { useState } from "react";
import type { EditorialPhotoAsset } from "@/lib/editorial-photos";
import styles from "./EditorialPhoto.module.css";

export default function EditorialPhoto({ photo, sizes, eager = false, className = "" }: { photo: EditorialPhotoAsset; sizes: string; eager?: boolean; className?: string }) {
  return <Photo key={photo.src} photo={photo} sizes={sizes} eager={eager} className={className} />;
}

function Photo({ photo, sizes, eager, className }: { photo: EditorialPhotoAsset; sizes: string; eager: boolean; className: string }) {
  const [failed, setFailed] = useState(false);
  return <figure className={`${styles.photo} ${className}`}>
    <div className={styles.frame}>
      {failed ? <div className={styles.unavailable}><span>Photograph unavailable</span><a href={photo.sourceHref} target="_blank" rel="noreferrer">View the original Jets coverage ↗</a></div> : <Image src={photo.src} alt={photo.alt} fill sizes={sizes} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} className={styles.image} style={{ objectPosition: photo.position }} onError={() => setFailed(true)} />}
    </div>
    <figcaption><span>{photo.caption}</span><a href={photo.sourceHref} target="_blank" rel="noreferrer">{photo.credit} <span aria-hidden="true">↗</span></a></figcaption>
  </figure>;
}
