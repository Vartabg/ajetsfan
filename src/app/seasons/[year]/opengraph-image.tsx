import { notFound } from "next/navigation";
import { loadSeasonArchive } from "@/lib/load-season-archive";
import { phaseResults, seasonNumbers } from "@/lib/season-archive";
import { ShareImage } from "@/lib/share-image";

export const alt = "A Jets football season from The Back Page archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const season = (await loadSeasonArchive()).find((entry) => String(entry.year) === year);
  if (!season) notFound();
  const regular = seasonNumbers(phaseResults(season, "regular")), playoffs = seasonNumbers(phaseResults(season, "playoffs"));
  return ShareImage({ eyebrow: `${year} football season · ${season.current ? "In progress" : "The season archive"}`,
    title: `${year} Jets football.`,
    detail: regular.games ? `${regular.games} recorded regular-season finals${playoffs.games ? ` · Playoffs ${playoffs.wins}–${playoffs.losses}` : ""}. Scores, game evidence and sourced memories.` : "Selected historical sources. Full season results are not in this archive yet.",
    score: regular.games ? `${regular.wins}–${regular.losses}${regular.ties ? `–${regular.ties}` : ""}` : undefined,
  });
}
