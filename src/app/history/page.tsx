import { pageMetadata } from "@/lib/site";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { loadLeagueHistory } from "@/lib/load-league-history";
import FanStand from "@/components/FanStand";
import FocusShell from "@/components/FocusShell";
import LegendHomeFeature from "@/components/LegendHomeFeature";
import OnThisDayMoment from "@/components/OnThisDayMoment";
import { selectFanMemories } from "@/lib/fan-memories";
import { record } from "@/lib/focus-format";
import { newYorkToday, onThisDay } from "@/lib/on-this-day";
import { publishedGames } from "@/lib/published-pages";
import { focusFonts } from "../focus-fonts";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ path: "/history", title: "Jets History — classics and rivalries", description: "Super Bowl III, memorable Jets games and the rivalry record. Revisit sourced moments and open their game evidence." });
export default async function HistoryPage() {
  const [games, snapshot, history] = await Promise.all([loadGames(), loadCurrent(), loadLeagueHistory()]);
  const memories = selectFanMemories(games).length;
  // The page renders per request, so "today" is the reader's New York date.
  const today = history ? onThisDay(history.games, newYorkToday(), new Set(publishedGames(games, snapshot).map((game) => game.id))) : null;
  return <FocusShell page="history" entries={[
    { id: "fan-stand", title: "Jets history", answer: "The games that stay" },
    ...(memories ? [{ id: "memories", title: "Selected games", answer: `${memories} archive cases` }] : []),
    { id: "rivals", title: "AFC East", answer: "The rivalry record" },
    ...(today ? [{ id: "today", title: `On this day · ${today.day}`, answer: today.games.length === 1 ? `${today.games[0].outcome === "win" ? "A win" : today.games[0].outcome === "loss" ? "A loss" : "A tie"}, ${today.games[0].year}` : `${record(today.wins, today.losses, today.ties)} since ${today.from}` }] : []),
    { id: "people", title: "Jets legends", answer: "The people behind the games" },
  ]} checkedAt={snapshot?.checkedAt ?? null} className={focusFonts}>
    <FanStand games={games} snapshot={snapshot} />
    {today ? <OnThisDayMoment today={today} /> : null}
    <LegendHomeFeature />
  </FocusShell>;
}
