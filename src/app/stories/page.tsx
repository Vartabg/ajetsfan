import { pageMetadata } from "@/lib/site";
import { loadGames, loadCurrent, loadCurve } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { buildVisualStory, visualStoryIds, type VisualStory } from "@/lib/visual-story";
import VisualGameStory from "@/components/VisualGameStory";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import Link from "@/components/IntentLink";
import shared from "@/components/Focus.module.css";
import { focusFonts } from "../focus-fonts";

export const metadata = pageMetadata({ path: "/stories", title: "Jets Visual Game Stories — The Back Page", description: "Replay recorded Jets games, moment by moment, through scores, source play descriptions and model win probability." });
export default async function StoriesPage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const available = publishedGames(games, snapshot);
  const candidates = await Promise.all(visualStoryIds.map(async (id) => {
    const game = available.find((item) => item.id === id);
    return game ? buildVisualStory(game, await loadCurve(id)) : null;
  }));
  const stories = candidates.filter((story): story is VisualStory => story !== null);
  return <FocusShell page="stories" entries={[{ id: "stories", title: "Game stories", answer: "Every turn, replayed" }]} checkedAt={null} className={focusFonts}>
    <FocusMoment id="stories" first heading="Game stories." label="Recorded plays · model estimates"
      actions={<Link href="/seasons" className={shared.go}>Browse the seasons <span aria-hidden="true">→</span></Link>}>
      <p className={shared.caption}>Pick a game. Follow every turn through recorded plays, scores and the probability path.</p>
      {stories.length ? <div data-focus-tools><VisualGameStory stories={stories} /></div> : <p className={shared.caption}>No visual game story is available in this edition.</p>}
    </FocusMoment>
  </FocusShell>;
}
