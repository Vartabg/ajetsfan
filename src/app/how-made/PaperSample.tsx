"use client";

import { useState } from "react";
import { WEAR_NOTE } from "@/lib/paper";
import styles from "./page.module.css";

export default function PaperSample() {
  const [wear, setWear] = useState(0);
  return (
    <section aria-labelledby="paper-example">
      <h2 id="paper-example">The season leaves a mark</h2>
      <p>The page carries a subtle stock tint that follows the streak. Compare the original five paper conditions in this specimen; it does not change the archive or the current streak.</p>
      <label className={styles.control}>
        <span>Paper condition</span>
        <input type="range" min="0" max="4" step="1" value={wear}
          aria-valuetext={WEAR_NOTE[wear]} onChange={(event) => setWear(Number(event.target.value))} />
      </label>
      <figure className={styles.sample} data-wear={wear}>
        <p className="label">A sample from the composing room · stock {wear}/4</p>
        <p className={`${styles.sampleTitle} hed`}>The feeling<br />has a texture.</p>
        <figcaption role="status" aria-live="polite" aria-atomic="true">{WEAR_NOTE[wear]}</figcaption>
      </figure>
      <p className={styles.small}>A win resets the paper. Losses progress through one–two, three–four, five–six, and seven or more games. A tie uses the first worn condition. Text describes every state, so the meaning survives without the color or texture.</p>
    </section>
  );
}
