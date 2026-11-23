import Link from "next/link";
import styles from "./ReplayStudies.module.css";

const links = [
  ["throws", "Throw to the sticks"],
  ["pass-rush", "Four or five rushers"],
  ["fourth-down", "Make the fourth-down call"],
  ["defense", "Find this defense again"],
  ["player", "Player situations"],
] as const;

export default function StudyNavigation({ current, className = styles.navigation }: { current?: typeof links[number][0]; className?: string }) {
  return <nav aria-label="Replay studies" className={className}>
    {links.map(([id, title]) => <Link key={id} href={"/replay/studies/" + id} prefetch={false} aria-current={id === current ? "page" : undefined}>{title}</Link>)}
  </nav>;
}
