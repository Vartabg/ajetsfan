import { notFound } from "next/navigation";
import { loadSeasonArchive } from "@/lib/load-season-archive";
import { ShareImage } from "@/lib/share-image";

export const alt = "Sources and definitions for a Jets season, from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  if (!/^\d{4}$/.test(year) || !(await loadSeasonArchive()).some((season) => String(season.year) === year)) notFound();
  return ShareImage({
    eyebrow: `${year} season guide`,
    title: "The details.",
    detail: `Definitions, source coverage and calculation notes for the ${year} Jets season.`,
  });
}
