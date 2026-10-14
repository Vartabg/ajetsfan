import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import type { LeagueHistory } from "./league-history";
import { loadAnalysisState } from "./load-analysis";
import { loadFootballState } from "./load-football";
import { validateRuntimeHistory } from "./postgame-evidence.mjs";
import { selectLeagueHistory } from "./postgame-consumers.mjs";

const loadBakedHistory = cache(async (): Promise<LeagueHistory | null> => {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "league-history.json"), "utf8");
    return validateRuntimeHistory(JSON.parse(raw)) as LeagueHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
});

export async function loadLeagueHistory({ live = true } = {}): Promise<LeagueHistory | null> {
  if (!live) return loadBakedHistory();
  const [baked, analysis, football] = await Promise.all([loadBakedHistory(), loadAnalysisState(), loadFootballState()]);
  return selectLeagueHistory({ baked, runtime: analysis.edition?.history ?? null, current: football.edition.current }) as LeagueHistory | null;
}
