import { pageMetadata } from "@/lib/site";
import { loadGames, loadCurrent, loadCurve } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { buildVisualStory, visualStoryIds, type VisualStory } from "@/lib/visual-story";
import VisualGameStory from "@/components/VisualGameStory";
import ExploreHeader from "@/components/ExploreHeader";
import styles from "../page.module.css";

export const metadata = pageMetadata({ path: "/stories", title: "Jets Visual Game Stories — The Back Page", description: "Replay recorded Jets games, moment by moment, through scores, source play descriptions and model win probability." });
export default async function StoriesPage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const available = publishedGames(games, snapshot);
  const candidates = await Promise.all(visualStoryIds.map(async (id) => {
    const game = available.find((item) => item.id === id);
    return game ? buildVisualStory(game, await loadCurve(id)) : null;
  }));
  const stories = candidates.filter((story): story is VisualStory => story !== null);
  return <main id="main" className={styles.main}>
    <ExploreHeader title="Game stories." description="Pick a game. Follow every turn." parent={{ href: "/seasons", label: "Seasons" }} />
    {stories.length ? <VisualGameStory stories={stories} /> : <p>No visual game story is available in this edition.</p>}
  </main>;
}
