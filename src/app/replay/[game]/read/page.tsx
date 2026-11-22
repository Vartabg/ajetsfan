import { notFound } from "next/navigation";
import DriveReader from "@/components/DriveReader";
import FocusShell from "@/components/FocusShell";
import { buildDriveRead } from "@/lib/drive-read";
import { driveReadHref } from "@/lib/drive-read-links";
import { loadChartedSnapGame } from "@/lib/load-snaps";
import { pageMetadata } from "@/lib/site";
import type { SearchValues } from "@/lib/snap-explorer";

type Props = { params: Promise<{ game: string }>; searchParams: Promise<SearchValues> };

export async function generateMetadata({ params }: Props) {
  const { game } = await params;
  return pageMetadata({ path: driveReadHref(game), title: "Read the drive · ajetsfan",
    description: "Study the formation, follow a player, and reveal one play at a time." });
}

export default async function DriveReadPage({ params, searchParams }: Props) {
  const [{ game: id }, { play, phase, series, follow }] = await Promise.all([params, searchParams]);
  if ((play !== undefined && typeof play !== "string") || (follow !== undefined && typeof follow !== "string") ||
      (phase !== undefined && phase !== "snap" && phase !== "action") || (series !== undefined && series !== "cleveland-15")) notFound();
  const game = await loadChartedSnapGame(id);
  const frame = game && buildDriveRead(game, { play, phase, series, follow });
  if (!frame) notFound();
  return <FocusShell page="drive-read" section="/replay" name="Read the drive" checkedAt={null}
    entries={[{ id: "drive-reader", title: "Read the drive", answer: "Field and scoreboard" }]}>
    <DriveReader frame={frame}/>
  </FocusShell>;
}
