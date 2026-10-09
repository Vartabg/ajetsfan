import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AutomationHealthSources } from "./edition-health";
import type { RankingsCollection } from "./season-rankings";
import type { NextGenCollection } from "./nextgen-stats";
import { isNextGenCollection } from "./nextgen-stats";
import { mediaCollection } from "./media-catalog";

async function snapshot(name: string) {
  try { return JSON.parse(await readFile(path.join(process.cwd(), "public/data", name), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

/** Check each dataset's own successful source check, rather than the last site build. */
export async function loadAutomationHealth(season: number | null): Promise<AutomationHealthSources> {
  const [rankings, nextgen, trades] = await Promise.all([
    snapshot("season-rankings.json") as Promise<RankingsCollection | null>,
    snapshot("nextgen-stats.json") as Promise<NextGenCollection | null>,
    snapshot("draft-trades.json"),
  ]);
  if (rankings && (rankings.schemaVersion !== 1 || !Array.isArray(rankings.seasons))) throw new Error("Invalid rankings health snapshot");
  if (nextgen && !isNextGenCollection(nextgen)) throw new Error("Invalid tracking health snapshot");
  if (trades && (trades.schemaVersion !== 1 || !Array.isArray(trades.trades) || !trades.trades.length)) throw new Error("Invalid trade health snapshot");
  const ranking = rankings?.seasons.find((entry) => entry.year === season);
  for (const source of [ranking, nextgen, trades]) {
    if (source && (!Number.isFinite(Date.parse(source.checkedAt)) || source.status !== undefined && !["ready", "retained"].includes(source.status)
      || source.attemptedAt !== undefined && (!Number.isFinite(Date.parse(source.attemptedAt)) || Date.parse(source.attemptedAt) < Date.parse(source.checkedAt)))) throw new Error("Invalid source health state");
  }
  return {
    media: mediaCollection.sources,
    rankings: ranking ? { checkedAt: ranking.checkedAt, status: ranking.status ?? "ready" } : undefined,
    nextgen: nextgen ? { checkedAt: nextgen.checkedAt, status: nextgen.status ?? "ready" } : undefined,
    trades: trades ? { checkedAt: trades.checkedAt, status: trades.status ?? "ready" } : undefined,
  };
}
