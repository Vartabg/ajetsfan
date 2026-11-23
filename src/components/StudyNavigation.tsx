import Link from "next/link";
import styles from "./ReplayStudies.module.css";

const links = [
  ["throws", "Throw to the sticks"],
  ["pass-rush", "Four or five rushers"],
  ["fourth-down", "Make the fourth-down call"],
] as const;

export default function StudyNavigation({ current }: { current: typeof links[number][0] }) {
  return <nav aria-label="Replay studies" className={styles.navigation}>
    {links.map(([id, title]) => <Link key={id} href={"/replay/studies/" + id} prefetch={false} aria-current={id === current ? "page" : undefined}>{title}</Link>)}
  </nav>;
}
