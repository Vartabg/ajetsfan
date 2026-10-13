import { loadCurrent, loadAnalytics } from "@/lib/load-games";
import { loadCoverage } from "@/lib/load-coverage";
import { editionHealth } from "@/lib/edition-health";
import { loadAutomationHealth } from "@/lib/load-automation-health";
import { loadLiveMediaState, scheduleStaleMediaRecovery } from "@/lib/load-media";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  try {
    const [current, coverage, analytics] = await Promise.all([loadCurrent(), loadCoverage(), loadAnalytics()]);
    const automation = await loadAutomationHealth(current?.season ?? null);
    const health = editionHealth(current, coverage, analytics, Date.now(), automation);
    const live = await loadLiveMediaState();
    const mediaScheduler = { mode: live.mode, intervalMinutes: 5, refreshIntervalMinutes: 10, targetMinutes: 30,
      updatedAt: live.updatedAt, durationMs: live.durationMs,
      status: live.mode === "snapshot" ? "not_configured" : live.mode === "fallback" ? "unavailable" :
        Date.now() - Date.parse(live.updatedAt!) >= 30 * 60_000 ? "overdue" : health.feeds.media.status === "ready" ? "ready" : "degraded" };
    await scheduleStaleMediaRecovery();
    const status = health.status === "healthy" && ["unavailable", "overdue", "degraded"].includes(mediaScheduler.status) ? "degraded" : health.status;
    return Response.json({ ...health, status, mediaScheduler, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null }, { status: status === "healthy" ? 200 : 503, headers });
  } catch {
    // Public diagnostics expose no filesystem paths, stack traces or credentials.
    return Response.json({ status: "unavailable", season: null, checkedAt: null }, { status: 503, headers });
  }
}
