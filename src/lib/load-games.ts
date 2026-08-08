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
