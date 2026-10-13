import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readDrives, type Drive, type DrivesFile } from "./drives";

/** One game's drives, or null when its season has no drive file or the game is missing from it. */
export async function loadGameDrives(season: number, gameId: string): Promise<Drive[] | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "drives", `${season}.json`), "utf8");
    const file = JSON.parse(raw) as DrivesFile;
    if (file.schemaVersion !== 1 || file.season !== season || !Array.isArray(file.results)) throw new Error("Unsupported drives file");
    return readDrives(file, gameId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
