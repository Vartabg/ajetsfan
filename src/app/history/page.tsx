import { pageMetadata } from "@/lib/site";
import { loadGames, loadCurrent } from "@/lib/load-games";
import FanStand from "@/components/FanStand";
import FocusShell from "@/components/FocusShell";
import { selectFanMemories } from "@/lib/fan-memories";
import { focusFonts } from "../focus-fonts";

export const metadata = pageMetadata({ path: "/history", title: "Jets History — classics and rivalries", description: "Super Bowl III, memorable Jets games and the rivalry record. Revisit sourced moments and open their game evidence." });
export default async function HistoryPage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const memories = selectFanMemories(games).length;
  return <FocusShell page="history" entries={[
    { id: "fan-stand", title: "Jets history", answer: "The games that stay" },
    ...(memories ? [{ id: "memories", title: "Selected games", answer: `${memories} archive cases` }] : []),
    { id: "rivals", title: "AFC East", answer: "The rivalry record" },
  ]} checkedAt={snapshot?.checkedAt ?? null} className={focusFonts}>
    <FanStand games={games} snapshot={snapshot} />
  </FocusShell>;
}
