import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { historyFor, type PlayerSeasonFile } from "./player-history";

const dir = path.join(process.cwd(), "public", "data", "players");
let files: Promise<PlayerSeasonFile[]> | null = null;

/** Every season file, read once per server process; the files change only with a deploy. */
async function readAll(): Promise<PlayerSeasonFile[]> {
  let names: string[];
  try { names = (await readdir(dir)).filter((name) => /^\d{4}\.json$/.test(name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return Promise.all(names.map(async (name) => {
    const file = JSON.parse(await readFile(path.join(dir, name), "utf8")) as PlayerSeasonFile;
    if (file.schemaVersion !== 1 || !Number.isInteger(file.season) || !file.players) throw new Error(`Unsupported player file: ${name}`);
    return file;
  }));
}

export async function loadPlayerHistory(id: string) {
  files ??= readAll().catch((error) => { files = null; throw error; });
  return historyFor(id, await files);
}
