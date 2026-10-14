import { loadDrivesSeason } from "@/lib/load-drives";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!/^\d{4}$/.test(season) || Number(season) < 1999 || Number(season) > 2200)
    return Response.json({ status: "not_found" }, { status: 404, headers });
  const file = await loadDrivesSeason(Number(season));
  return file ? Response.json(file, { headers }) : Response.json({ status: "not_found" }, { status: 404, headers });
}
