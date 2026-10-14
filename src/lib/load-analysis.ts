import "server-only";
import { cache } from "react";
import { readMediaBlob } from "./media-blob-store";
import { validateAnalysisEnvelope } from "./analysis-envelope.mjs";
import type { CurrentSnapshot } from "./current";
import type { SeasonAnalytics } from "./analytics";
import type { Game } from "./games";
import type { SeasonRankings } from "./season-rankings";
import type { NextGenCollection } from "./nextgen-stats";
import type { LeagueHistory } from "./league-history";
import type { RuntimeDrives } from "./drives";

export const ANALYSIS_EDITION_PATH = "analysis/v1/collection.json";
export type AnalysisEdition = { version: 1; season: number; updatedAt: string; durationMs: number; revision: string;
  current: Pick<CurrentSnapshot, "analysisCheck" | "analysisUpdatedAt" | "latestAnalyzedGameId">;
  analytics: SeasonAnalytics | null; games: Game[]; curves: Record<string, string>;
  rankings: SeasonRankings | null; nextgen: NextGenCollection | null;
  history?: LeagueHistory | null; drives?: RuntimeDrives | null };
export type AnalysisState = { edition: AnalysisEdition | null; mode: "snapshot" | "runtime" | "fallback" };
let memo: { expiresAt: number; pending: Promise<AnalysisState> } | null = null;
let lastValid: AnalysisEdition | null = null;
export function clearAnalysisReadCache() { memo = null; }

async function readState(): Promise<AnalysisState> {
  if (!process.env.BLOB_STORE_ID || process.env.VERCEL_ENV !== "production") return { edition: null, mode: "snapshot" };
  try {
    const record = await readMediaBlob(ANALYSIS_EDITION_PATH);
    if (!record) throw new Error("Analysis edition missing");
    lastValid = validateAnalysisEnvelope(record.value) as AnalysisEdition;
    return { edition: lastValid, mode: "runtime" };
  } catch { return { edition: lastValid, mode: "fallback" }; }
}
export const loadAnalysisState = cache(async () => {
  const now = Date.now();
  if (!memo || memo.expiresAt <= now) memo = { expiresAt: now + 30_000, pending: readState() };
  return memo.pending;
});

/** Scores can advance first; analysis is attached only to matching confirmed finals. */
export function analysisMatchesCurrent(analysis: AnalysisEdition, current: CurrentSnapshot) {
  const checked = Date.parse(analysis.current.analysisCheck?.checkedAt ?? analysis.current.analysisUpdatedAt ?? "1970-01-01");
  const bakedChecked = Date.parse(current.analysisCheck?.checkedAt ?? current.analysisUpdatedAt ?? "1970-01-01");
  return checked >= bakedChecked && analysis.season === current.season && analysis.games.every((game) => current.schedule.some((fixture) =>
    fixture.id === game.id && fixture.status === "final" && fixture.jetsScore === game.jetsScore && fixture.oppScore === game.oppScore));
}
