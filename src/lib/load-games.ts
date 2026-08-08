import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Game } from "./games";

export async function loadGames(): Promise<Game[]> {
  const raw = await readFile(
    path.join(process.cwd(), "public", "data", "games.json"),
    "utf8",
  );
  return JSON.parse(raw) as Game[];
}
