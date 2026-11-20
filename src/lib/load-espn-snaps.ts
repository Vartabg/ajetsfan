import "server-only";
import { cache } from "react";
import { espnSnapFixture, parseEspnSnapGame } from "./espn-snaps";
import { espnSummaryUrl, LIVE_POLL_MS } from "./live-plays";
import { loadFootballState } from "./load-football";
import { loadLeagueHistory } from "./load-league-history";
import type { SnapGame } from "./snap-types";

const MAX_BYTES = 3_000_000;

/** Only published fixtures can initiate a provider request. A source outage leaves the shared key unavailable. */
export const loadEspnSnapGame = cache(async (id: string): Promise<SnapGame | null> => {
  if (!/^\d{4}_\d{2}_(?:NYJ_[A-Z]{2,3}|[A-Z]{2,3}_NYJ)$/.test(id)) return null;
  try {
    const [football, history] = await Promise.all([loadFootballState(), loadLeagueHistory().catch(() => null)]);
    const fixture = espnSnapFixture(id, football.edition.current, history?.games ?? [], football.edition.live);
    if (!fixture) return null;
    const response = await fetch(espnSummaryUrl(fixture.espn), {
      headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000),
      next: { revalidate: fixture.status === "final" ? 3600 : LIVE_POLL_MS / 1000 },
    });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return null;
    return parseEspnSnapGame(JSON.parse(new TextDecoder().decode(bytes)), fixture);
  } catch {
    return null;
  }
});
