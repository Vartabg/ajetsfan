import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { historyFor, type PlayerSeasonFile } from "./player-history";

const dir = path.join(process.cwd(), "public", "data", "players");
let files: Promise<PlayerSeasonFile[]> | null = null;

export const loadPlayerSeason = cache(async (season: number): Promise<PlayerSeasonFile | null> => {
  if (!Number.isInteger(season) || season < 1999 || season > 9999) return null;
  try {
    const file = JSON.parse(await readFile(path.join(dir, season + ".json"), "utf8")) as PlayerSeasonFile;
    if (file.schemaVersion !== 1 || file.season !== season || !file.players) throw new Error(`Unsupported player season: ${season}`);
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
});

/** Every season file, read once per server process; the files change only with a deploy. */
async function readAll(): Promise<PlayerSeasonFile[]> {
  let names: string[];
  try { names = (await readdir(dir)).filter((name) => /^\d{4}\.json$/.test(name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const seasons = await Promise.all(names.map((name) => loadPlayerSeason(Number(name.slice(0, 4)))));
  return seasons.filter((file): file is PlayerSeasonFile => file !== null);
}

export async function loadPlayerHistory(id: string) {
  files ??= readAll().catch((error) => { files = null; throw error; });
  return historyFor(id, await files);
}
