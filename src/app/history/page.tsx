import { pageMetadata } from "@/lib/site";
import { loadGames, loadCurrent } from "@/lib/load-games";
import FanStand from "@/components/FanStand";
import ExploreHeader from "@/components/ExploreHeader";
import styles from "../page.module.css";

export const metadata = pageMetadata({ path: "/history", title: "Jets History — classics and rivalries", description: "Super Bowl III, memorable Jets games and the rivalry record. Revisit sourced moments and open their game evidence." });
export default async function HistoryPage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  return <main id="main" className={styles.main}>
    <ExploreHeader title="Jets history." description="The games that stay with you." parent={{ href: "/seasons", label: "Seasons" }} />
    <FanStand games={games} snapshot={snapshot} />
  </main>;
}
