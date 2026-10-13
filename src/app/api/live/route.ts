import { loadCurrent } from "@/lib/load-games";
import { loadLeagueHistory } from "@/lib/load-league-history";
import { espnScoreboardUrl, espnSummaryUrl, findJetsEvent, inLiveWindow, parseEspnSummary, type LiveGame } from "@/lib/live";

export const dynamic = "force-dynamic";

const reply = (body: LiveGame | { error: string }, status: number, seconds: number) => Response.json(body, {
  status,
  // Readers share one cached answer per game, so ESPN sees a few requests a minute however many are watching.
  headers: { "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`, "X-Robots-Tag": "noindex" },
});

async function espn(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6_000), cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** The live state of one current-season Jets game, from ESPN, only during that game's window. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("game") ?? "";
  const snapshot = await loadCurrent();
  const game = snapshot?.schedule.find((entry) => entry.id === id && entry.season === snapshot.season);
  if (!game) return reply({ error: "Not a current Jets game" }, 404, 300);
  const now = Date.now();
  if (!inLiveWindow(game.kickoff, now)) return reply({ state: "idle", updatedAt: new Date(now).toISOString() }, 200, 300);
  try {
    const history = await loadLeagueHistory();
    const event = history?.games.find((entry) => entry.id === id)?.espn ?? findJetsEvent(await espn(espnScoreboardUrl(game.date)));
    if (!event) return reply({ state: "unavailable", updatedAt: new Date(now).toISOString() }, 200, 30);
    return reply(parseEspnSummary(await espn(espnSummaryUrl(event)), new Date(now)), 200, 15);
  } catch {
    return reply({ state: "unavailable", updatedAt: new Date(now).toISOString() }, 200, 15);
  }
}
