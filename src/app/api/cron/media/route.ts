import { cronAuthorized } from "@/lib/cron-authorized.mjs";
import { refreshHostedMedia } from "@/lib/hosted-media-refresh";
import { clearMediaReadCache } from "@/lib/load-media";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  const expected = process.env.CRON_SECRET;
  const received = request.headers.get("authorization");
  const valid = cronAuthorized(expected, received);
  if (!valid) return Response.json({ status: "unauthorized" }, { status: 401, headers });
  try {
    const result = await refreshHostedMedia();
    clearMediaReadCache();
    console.info(JSON.stringify({ event: "hosted-media-refresh", ...result }));
    return Response.json(result, { status: result.status === "degraded" ? 503 : 200, headers });
  } catch {
    console.error("Hosted media refresh failed; see media freshness health.");
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
