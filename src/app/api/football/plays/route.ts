import { loadFootballLive } from "@/lib/load-football";
import { espnSummaryUrl, parseEspnSummary, playsEvent, type LivePlays } from "@/lib/live-plays";

export const dynamic = "force-dynamic";

const reply = (body: LivePlays, seconds: number) => Response.json(body, {
  // Readers share one cached answer, so ESPN sees a few requests a minute however many are watching.
  headers: { "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`, "X-Robots-Tag": "noindex" },
});

/** Play by play for the Jets game the site is showing as live, from ESPN; anything else is idle. */
export async function GET(request: Request) {
  const now = new Date();
  const event = playsEvent(await loadFootballLive(), new URL(request.url).searchParams.get("event"));
  if (!event) return reply({ state: "idle", updatedAt: now.toISOString() }, 60);
  try {
    const response = await fetch(espnSummaryUrl(event), { signal: AbortSignal.timeout(6_000), cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
    return reply(parseEspnSummary(await response.json(), now), 15);
  } catch {
    return reply({ state: "unavailable", updatedAt: now.toISOString() }, 15);
  }
}
