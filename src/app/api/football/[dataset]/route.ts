import { loadFootballState } from "@/lib/load-football";
import { loadCurrent, loadGames, loadAnalytics } from "@/lib/load-games";
import { loadCoverage } from "@/lib/load-coverage";
import { loadRankingsCollection, loadNextGenCollection } from "@/lib/load-season-statistics";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  const loaders: Record<string, () => Promise<unknown>> = {
    current: loadCurrent, coverage: loadCoverage, games: loadGames, analytics: loadAnalytics,
    "season-rankings": loadRankingsCollection, "nextgen-stats": loadNextGenCollection,
    live: async () => (await loadFootballState()).edition.live,
  };
  if (!Object.hasOwn(loaders, dataset)) return Response.json({ status: "not_found" }, { status: 404, headers });
  return Response.json(await loaders[dataset](), { headers });
}
