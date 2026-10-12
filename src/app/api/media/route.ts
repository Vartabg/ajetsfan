import { loadMediaCollection } from "@/lib/load-media";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loadMediaCollection(), { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
