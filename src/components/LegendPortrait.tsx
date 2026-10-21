"use client";

import Image from "next/image";
import { useState } from "react";
import type { Legend } from "@/lib/legends";
import styles from "./Legends.module.css";

type Props = {
  name: string; photo: Legend["photo"]; eager?: boolean; card?: boolean;
};
/** Altered portraits disclose their treatment and retain the credited original. */
export default function LegendPortrait(props: Props) {
  return <Portrait key={`${props.name}:${props.photo?.src ?? "none"}`} {...props} />;
}
function Portrait({ name, photo, eager = false, card = false }: Props) {
  const [failed, setFailed] = useState(false);
  return <figure className={`${styles.portrait} ${card ? styles.cardPortrait : ""}`} data-legend-portrait={name}>
    <div className={styles.photoFrame}>
      {photo && !failed ? <Image key={photo.src} src={photo.src} alt={photo.alt} fill
        sizes={card ? "(min-width: 1400px) 320px, (min-width: 700px) 42vw, 92vw" : "(min-width: 1400px) 500px, (min-width: 700px) 45vw, 92vw"}
        loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"}
        className={styles.photo} onError={() => setFailed(true)} />
        : <div className={styles.photoMissing} role="status"><p>{name}&rsquo;s photograph is unavailable here.</p>
          {photo ? <p>The original is linked below.</p> : <p>The story continues below.</p>}
        </div>}
    </div>
    <figcaption className={styles.photoCredit}>{photo ? <>
      {photo.treatment ? <span className={styles.photoTreatment}>{photo.treatment === "ai-enhanced"
        ? "AI-enhanced from the original photograph." : "AI-generated illustration."}</span> : null}
      <span className={styles.photoLinks}><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer"
        aria-label={`Photo source for ${name}: ${photo.credit} (opens in a new tab)`}>{photo.credit} <span aria-hidden="true">↗</span></a>
        {photo.originalSrc ? <a href={photo.originalSrc} target="_blank" rel="noopener noreferrer"
          aria-label={`View original photo of ${name} (opens in a new tab)`}>View original photo <span aria-hidden="true">↗</span></a> : null}</span>
    </>
      : "No verified portrait in this edition."}</figcaption>
  </figure>;
}
