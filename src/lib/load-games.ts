import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Game } from "./games";
import type { CurrentSnapshot } from "./current";
import type { SeasonAnalytics } from "./analytics";

export async function loadAnalytics(): Promise<SeasonAnalytics | null> {
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

export async function loadCurrent(): Promise<CurrentSnapshot | null> {
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

export async function loadGames(): Promise<Game[]> {
  const raw = await readFile(
    path.join(process.cwd(), "public", "data", "games.json"),
    "utf8",
  );
  return JSON.parse(raw) as Game[];
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
