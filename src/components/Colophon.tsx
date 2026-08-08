import styles from "./Colophon.module.css";

/**
 * The one-line colophon a newspaper carries at the foot of the page. Sources and
 * the single excluded game are disclosed here rather than on a page of their own.
 */
export default function Colophon() {
  return (
    <footer className={`${styles.foot} agate`}>
      <p>
        Play-by-play and win probability from{" "}
        <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
          nflverse
        </a>
        . The archive holds 449 games from 1999 to 2025; one is kept out of the
        rankings — Sept. 29, 2002 at Jacksonville, whose play-by-play scoring never
        reaches the official final. An independent fan project, not affiliated with
        the New York Jets or the NFL.
      </p>
    </footer>
  );
}
