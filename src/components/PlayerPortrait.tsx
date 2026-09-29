"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./PlayerPortrait.module.css";

export default function PlayerPortrait({ src, name, sizes = "140px" }: { src: string | null; name: string; sizes?: string }) {
  return <Portrait key={src ?? name} src={src} name={name} sizes={sizes} />;
}
function Portrait({ src, name, sizes }: { src: string | null; name: string; sizes: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.portrait} aria-hidden="true">
    {src && !failed ? <Image src={src} alt="" fill sizes={sizes} className={styles.image} onError={() => setFailed(true)} /> : <span className={styles.initials}>{name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>}
  </div>;
}
