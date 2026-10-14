import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { readDrives, type Drive, type DrivesFile, type RuntimeDrives } from "./drives";
import { loadAnalysisState } from "./load-analysis";
import { loadFootballState } from "./load-football";
import { footballSnapshot, loadBakedFootball } from "./football-snapshot";
import type { Game } from "./games";
import { validateDrivesData } from "./postgame-evidence.mjs";
import { selectDriveSeason } from "./postgame-consumers.mjs";

const loadBakedDrives = cache(async (season: number): Promise<DrivesFile | null> => {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "drives", `${season}.json`), "utf8");
    const file = validateDrivesData(JSON.parse(raw)) as DrivesFile;
    if (file.season !== season) throw new Error("Unsupported drives season");
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
});
const loadCompiledGames = cache(() => footballSnapshot<Game[]>("games.json"));

/** Historical seasons stay compiled; current charts follow the published source edition. */
export async function loadDrivesSeason(season: number, { live = true } = {}): Promise<DrivesFile | RuntimeDrives | null> {
  if (!Number.isInteger(season) || season < 1999 || season > 2200) return null;
  if (!live) return loadBakedDrives(season);
  const [baked, compiled] = await Promise.all([loadBakedDrives(season), loadBakedFootball()]);
  if (season < compiled.current.season) return baked;
  const [analysis, football, compiledGames] = await Promise.all([loadAnalysisState(), loadFootballState(), loadCompiledGames()]);
  if (season !== football.edition.current.season) return baked;
  return selectDriveSeason({ baked, runtime: analysis.edition?.drives ?? null,
    compiledCurrent: compiled.current, compiledGames, current: football.edition.current }) as RuntimeDrives | null;
}

/** One verified game's drives; absence never becomes an invented empty chart. */
export async function loadGameDrives(season: number, gameId: string): Promise<Drive[] | null> {
  const file = await loadDrivesSeason(season);
  return file ? readDrives(file, gameId) : null;
}
