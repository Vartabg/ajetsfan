import { jetsCalendar } from "@/lib/calendar";
import { loadCurrent, loadGames } from "@/lib/load-games";
import { loadLeagueHistory } from "@/lib/load-league-history";
import { publishedGames } from "@/lib/published-pages";
import { siteOrigin } from "@/lib/site";

// The schedule changes only with a new data edition, and every edition is a new deployment.
export const dynamic = "force-static";

export async function GET() {
  const [snapshot, history, games] = await Promise.all([loadCurrent(), loadLeagueHistory(), loadGames()]);
  if (!snapshot) return new Response("The schedule is unavailable in this edition.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const reports = new Set(publishedGames(games, snapshot).map((game) => game.id));
  const body = jetsCalendar({ snapshot, history: history?.games ?? [], origin: siteOrigin()?.origin ?? null, reports });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="jets.ics"' } });
}
