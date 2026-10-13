import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LeagueHistory } from "./league-history";

export async function loadLeagueHistory(): Promise<LeagueHistory | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "league-history.json"), "utf8");
    const history = JSON.parse(raw) as LeagueHistory;
    if (history.schemaVersion !== 1 || !Array.isArray(history.games) || !history.games.length || !Array.isArray(history.playoffsByWins?.rows)) throw new Error("Unsupported league history");
    return history;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
