import type { MouseEvent } from "react";
import styles from "./DiagramLinks.module.css";

type DiagramProps = {
  chalk: boolean;
  fieldHref: string;
  chalkHref: string;
  onChoose?: (event: MouseEvent<HTMLAnchorElement>, chalk: boolean) => void;
};

export function DiagramLinks({ chalk, fieldHref, chalkHref, onChoose }: DiagramProps) {
  return <nav className={styles.views} aria-label="Play diagram">
    <a href={fieldHref} aria-current={!chalk || undefined} onClick={onChoose && (e => onChoose(e, false))}>Field position</a>
    <a href={chalkHref} aria-current={chalk || undefined} onClick={onChoose && (e => onChoose(e, true))}>Xs &amp; Os</a>
  </nav>;
}
