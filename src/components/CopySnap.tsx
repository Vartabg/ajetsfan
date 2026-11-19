"use client";

import { useState } from "react";
import styles from "./SnapReader.module.css";

export default function CopySnap({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  async function copy() {
    const url = new URL(path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setFallback(url);
    }
  }
  return <span className={styles.share}>
    <button type="button" onClick={copy}>Copy play link</button>
    <span role="status">{copied && "Link copied."}</span>
    {fallback && <input aria-label="Link to this play" readOnly value={fallback} onFocus={event => event.currentTarget.select()} />}
  </span>;
}
