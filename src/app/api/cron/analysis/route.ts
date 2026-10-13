import { cronAuthorized } from "@/lib/cron-authorized.mjs";
import { refreshHostedAnalysis } from "@/lib/hosted-analysis-refresh";
import { clearAnalysisReadCache } from "@/lib/load-analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 600;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!cronAuthorized(process.env.CRON_SECRET, request.headers.get("authorization")))
    return Response.json({ status: "unauthorized" }, { status: 401, headers });
  try {
    const result = await refreshHostedAnalysis();
    clearAnalysisReadCache();
    console.info(JSON.stringify({ event: "hosted-analysis-refresh", ...result }));
    return Response.json(result, { status: result.status === "degraded" ? 503 : 200, headers });
  } catch {
    console.error("Hosted analysis refresh failed; see analysis freshness health.");
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
