import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CoverageSnapshot } from "./coverage";
import { loadFootballState } from "./load-football";

export async function loadCoverage({ live = true } = {}): Promise<CoverageSnapshot | null> {
  if (live) return (await loadFootballState()).edition.coverage;
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "coverage.json"), "utf8");
    const snapshot = JSON.parse(raw) as CoverageSnapshot;
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.news?.items) || !Array.isArray(snapshot.roster?.players) || !Array.isArray(snapshot.stats?.players)) {
      throw new Error("Unsupported team coverage snapshot");
    }
    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
