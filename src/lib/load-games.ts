import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Game } from "./games";
import type { CurrentSnapshot } from "./current";
import type { SeasonAnalytics } from "./analytics";
import { loadFootballState } from "./load-football";
import { loadAnalysisState, analysisMatchesCurrent } from "./load-analysis";
import { readMediaBlob } from "./media-blob-store";
import { cache } from "react";
import { footballSnapshot } from "./football-snapshot";
import { gameAgreesWithFootball, checkedRuntimeCurve } from "./football-evidence.mjs";

const loadBakedGames = cache(() => footballSnapshot<Game[]>("games.json"));

export async function loadAnalytics({ live = true } = {}): Promise<SeasonAnalytics | null> {
  if (live) {
    const [state, football] = await Promise.all([loadAnalysisState(), loadFootballState()]);
    const edition = state.edition;
    if (edition?.analytics && analysisMatchesCurrent(edition, football.edition.current)) {
      const baked = await loadAnalytics({ live: false });
      if (!baked || baked.season !== edition.season || Date.parse(edition.analytics.analysisUpdatedAt ?? "1970-01-01") >= Date.parse(baked.analysisUpdatedAt ?? "1970-01-01")) return edition.analytics;
    }
  }
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "analytics.json"), "utf8");
    const snapshot = JSON.parse(raw) as SeasonAnalytics;
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.teams) || !Array.isArray(snapshot.games)) {
      throw new Error("Unsupported analytics snapshot");
    }
    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadCurrent({ live = true } = {}): Promise<CurrentSnapshot | null> {
  if (live) {
    const [football, analysis] = await Promise.all([loadFootballState(), loadAnalysisState()]);
    const current = football.edition.current;
    const edition = analysis.edition;
    return edition && analysisMatchesCurrent(edition, current)
      && Date.parse(edition.current.analysisCheck?.attemptedAt ?? edition.updatedAt) >= Date.parse(current.analysisCheck?.attemptedAt ?? "1970-01-01")
      ? { ...current, ...edition.current } : current;
  }
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "current.json"), "utf8");
    const snapshot = JSON.parse(raw) as CurrentSnapshot;
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.schedule)) {
      throw new Error("Unsupported current-season snapshot");
    }
    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadGames({ live = true } = {}): Promise<Game[]> {
  const baked = await loadBakedGames();
  if (!live) return baked;
  const [state, football] = await Promise.all([loadAnalysisState(), loadFootballState()]);
  const verified = baked.filter((game) => gameAgreesWithFootball(game, football.edition.current));
  if (!state.edition || !analysisMatchesCurrent(state.edition, football.edition.current)) return verified;
  const games = new Map(verified.map((game) => [game.id, game]));
  for (const game of state.edition.games) games.set(game.id, game);
  return [...games.values()];
}

export type CurvePoint = {
  q: number;
  t: number | null;
  wp: number;
  d: number | null;
  desc: string | null;
  type: string | null;
};

/** The lead story's chart is set at build time, so the page needs no client fetch. */
export async function loadCurve(gameId: string): Promise<CurvePoint[]> {
  const [state, football, baked] = await Promise.all([loadAnalysisState(), loadFootballState(), loadBakedGames()]);
  if (state.edition && analysisMatchesCurrent(state.edition, football.edition.current) && state.edition.curves[gameId]) {
    try {
      const record = await readMediaBlob(state.edition.curves[gameId]);
      if (Array.isArray(record?.value)) return checkedRuntimeCurve(record.value, state.edition.curves[gameId], state.edition.games.find((game) => game.id === gameId)) as CurvePoint[];
    } catch { /* Compiled evidence remains available during a storage interruption. */ }
  }
  const compiledGame = baked.find((game) => game.id === gameId);
  if (!compiledGame || !gameAgreesWithFootball(compiledGame, football.edition.current)) return [];
  try {
    const raw = await readFile(
      path.join(process.cwd(), "public", "data", "curves", `${gameId}.json`),
      "utf8",
    );
    return (JSON.parse(raw) as CurvePoint[]).filter((p) => typeof p.wp === "number");
  } catch {
    return [];
  }
}
