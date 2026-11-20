import { loadChartedSnapGame } from "@/lib/load-snaps";

export async function GET(_request: Request, { params }: { params: Promise<{ game: string }> }) {
  const game = await loadChartedSnapGame((await params).game);
  if (!game?.plays.length) return Response.json({ error: "Replay unavailable" }, { status: 404 });
  return Response.json(game, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
}
