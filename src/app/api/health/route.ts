import { loadCurrent, loadAnalytics } from "@/lib/load-games";
import { loadCoverage } from "@/lib/load-coverage";
import { editionHealth } from "@/lib/edition-health";
import { loadAutomationHealth } from "@/lib/load-automation-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  try {
    const [current, coverage, analytics] = await Promise.all([loadCurrent(), loadCoverage(), loadAnalytics()]);
    const automation = await loadAutomationHealth(current?.season ?? null);
    const health = editionHealth(current, coverage, analytics, Date.now(), automation);
    return Response.json({ ...health, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null }, { status: health.status === "healthy" ? 200 : 503, headers });
  } catch {
    // Public diagnostics expose no filesystem paths, stack traces or credentials.
    return Response.json({ status: "unavailable", season: null, checkedAt: null }, { status: 503, headers });
  }
}
