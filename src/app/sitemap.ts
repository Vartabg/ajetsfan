import type { MetadataRoute } from "next";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { loadCoverage } from "@/lib/load-coverage";
import { publishedGames, publishedPlayers } from "@/lib/published-pages";
import { siteOrigin } from "@/lib/site";
import { loadSeasonArchive } from "@/lib/load-season-archive";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) return [];
  const [games, current, coverage, seasons] = await Promise.all([loadGames(), loadCurrent(), loadCoverage(), loadSeasonArchive()]);
  const paths = ["/", "/team", "/morgue", "/film-room", "/media", "/seasons", "/how-made",
    ...seasons.map((season) => `/seasons/${season.year}`),
    ...publishedGames(games, current).map((game) => `/games/${encodeURIComponent(game.id)}`),
    ...publishedPlayers(coverage, current?.season ?? coverage?.season ?? null).map((player) => `/players/${encodeURIComponent(player.id)}`),
  ];
  // Check times are not content modification times; omit lastmod rather than invent it.
  return paths.map((path) => ({ url: new URL(path, origin).href }));
}
