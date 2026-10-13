import { loadCurve } from "@/lib/load-games";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(id)) return Response.json([], { status: 404, headers });
  const curve = await loadCurve(id);
  return Response.json(curve, { status: curve.length ? 200 : 404, headers });
}
