import { loadCurrent, loadAnalytics } from "@/lib/load-games";
import { loadCoverage } from "@/lib/load-coverage";
import { editionHealth } from "@/lib/edition-health";
import { loadAutomationHealth } from "@/lib/load-automation-health";
import { loadLiveMediaState, scheduleStaleMediaRecovery } from "@/lib/load-media";
import { loadFootballState, scheduleStaleFootballRecovery } from "@/lib/load-football";
import { footballActiveWindow } from "../../../../scripts/refresh-football.mjs";
import { loadAnalysisState } from "@/lib/load-analysis";
import { analysisFailedSourceIds } from "@/lib/analysis-refresh-coordinator.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  try {
    const [current, coverage, analytics, football, analysis] = await Promise.all([loadCurrent(), loadCoverage(), loadAnalytics(), loadFootballState(), loadAnalysisState()]);
    const automation = await loadAutomationHealth(current?.season ?? null);
    const active = footballActiveWindow(football.edition.current.schedule, new Date(), football.edition.live);
    const health = editionHealth(current, coverage, analytics, Date.now(), automation, football.mode === "snapshot" ? undefined : { edition: football.edition, active });
    const live = await loadLiveMediaState();
    const mediaScheduler = { mode: live.mode, intervalMinutes: 5, refreshIntervalMinutes: 10, targetMinutes: 30,
      updatedAt: live.updatedAt, durationMs: live.durationMs,
      status: live.mode === "snapshot" ? "not_configured" : live.mode === "fallback" ? "unavailable" :
        Date.now() - Date.parse(live.updatedAt!) >= 30 * 60_000 ? "overdue" : health.feeds.media.status === "ready" ? "ready" : "degraded" };
    await scheduleStaleMediaRecovery();
    await scheduleStaleFootballRecovery();
    const footballScheduler = { mode: football.mode, intervalMinutes: 1, refreshIntervalMinutes: active ? 1 : 5,
      active, updatedAt: football.updatedAt, durationMs: football.durationMs,
      status: football.mode === "snapshot" ? "not_configured" : football.mode === "fallback" ? "unavailable" :
        Date.now() - Date.parse(football.updatedAt!) >= (active ? 3 : 10) * 60_000 ? "overdue" :
          [football.edition.live, football.edition.scheduleCheck, coverage?.news, coverage?.roster, coverage?.stats].some((feed) => !feed || feed.status !== "ready") ? "degraded" : "ready" };
    const analysisScheduler = { mode: analysis.mode, intervalMinutes: 10, targetMinutes: 30, updatedAt: analysis.edition?.updatedAt ?? null,
      durationMs: analysis.edition?.durationMs ?? null,
      status: analysis.mode === "snapshot" ? "not_configured" : analysis.mode === "fallback" ? "unavailable" :
        Date.now() - Date.parse(analysis.edition!.updatedAt) >= 25 * 60_000 ? "overdue" :
          analysis.edition!.season !== current?.season || analysisFailedSourceIds(analysis.edition!).length ? "degraded" : "ready" };
    const status = health.status === "healthy" && [mediaScheduler, footballScheduler, analysisScheduler].some((scheduler) => ["unavailable", "overdue", "degraded"].includes(scheduler.status)) ? "degraded" : health.status;
    return Response.json({ ...health, status, mediaScheduler, footballScheduler, analysisScheduler, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null }, { status: status === "healthy" ? 200 : 503, headers });
  } catch {
    // Public diagnostics expose no filesystem paths, stack traces or credentials.
    return Response.json({ status: "unavailable", season: null, checkedAt: null }, { status: 503, headers });
  }
}
