import { cronAuthorized } from "@/lib/cron-authorized.mjs";
import { refreshHostedFootball } from "@/lib/hosted-football-refresh";
import { clearFootballReadCache } from "@/lib/load-football";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!cronAuthorized(process.env.CRON_SECRET, request.headers.get("authorization")))
    return Response.json({ status: "unauthorized" }, { status: 401, headers });
  try {
    const result = await refreshHostedFootball();
    clearFootballReadCache();
    console.info(JSON.stringify({ event: "hosted-football-refresh", ...result }));
    return Response.json(result, { status: result.status === "degraded" ? 503 : 200, headers });
  } catch {
    console.error("Hosted football refresh failed; see football freshness health.");
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
