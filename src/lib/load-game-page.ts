import "server-only";
import { cache } from "react";
import type { FinalGame } from "./current";
import type { Game } from "./games";
import { readDrives, type Drive, type RuntimeDrives } from "./drives";
import { loadDrivesSeason } from "./load-drives";
import { loadFootballState } from "./load-football";
import { loadPublishedGame } from "./load-published-pages";
import { confirmedDriveGame } from "./drive-game-page.mjs";

export type GamePageEdition = { kind: "analysis"; game: Game }
  | { kind: "drives"; game: FinalGame; file: RuntimeDrives; drives: Drive[] };

/** Shared by page, metadata and share image; unknown fixtures stay unpublished. */
export const loadGamePage = cache(async (id: string): Promise<GamePageEdition | null> => {
  if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(id)) return null;
  const analyzed = await loadPublishedGame(id);
  if (analyzed) return { kind: "analysis", game: analyzed };
  const current = (await loadFootballState()).edition.current;
  if (!current.schedule.some((game) => game.id === id && game.season === current.season && game.status === "final")) return null;
  const file = await loadDrivesSeason(current.season);
  const verified = confirmedDriveGame(id, current, file) as { game: FinalGame; file: RuntimeDrives } | null;
  if (!verified) return null;
  const drives = readDrives(verified.file, id);
  return drives ? { kind: "drives", ...verified, drives } : null;
});
