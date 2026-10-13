import { scheduleStaleFootballRecovery } from "@/lib/load-football";
import { loadFootballViewerStatus } from "@/lib/football-viewer-status";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET() {
  const status = await loadFootballViewerStatus();
  await scheduleStaleFootballRecovery();
  return Response.json(status,
  { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
