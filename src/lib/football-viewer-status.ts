import "server-only";
import { loadFootballState } from "./load-football";
import { loadAnalysisState } from "./load-analysis";
import { footballRevision } from "./football-envelope.mjs";
import { footballActiveWindow } from "../../scripts/refresh-football.mjs";

export async function loadFootballViewerStatus() {
  const [football, analysis] = await Promise.all([loadFootballState(), loadAnalysisState()]);
  const { current, live } = football.edition;
  return { schemaVersion: 1, revision: footballRevision(football.edition, analysis.edition?.revision ?? ""),
    season: current.season, live: live?.games.some((game) => game.state === "live") ?? false,
    active: footballActiveWindow(current.schedule, new Date(), live), checkedAt: current.checkedAt };
}
