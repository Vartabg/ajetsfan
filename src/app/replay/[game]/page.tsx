import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FocusShell from "@/components/FocusShell";
import GameReplay from "@/components/GameReplay";
import { replayHref, replayView } from "@/lib/game-replay";
import { loadSnapGame } from "@/lib/load-snaps";
import { pageMetadata } from "@/lib/site";
import type { SearchValues } from "@/lib/snap-explorer";

type Props = { params: Promise<{ game: string }>; searchParams: Promise<SearchValues> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game } = await params;
  const meta = pageMetadata({ path: replayHref(game), title: "Replay a Jets game · ajetsfan",
    description: "Step through the recorded plays and follow the field, score and clock." });
  const images = [{ url: "/plays/opengraph-image", width: 1200, height: 630, alt: "Recorded Jets play-by-play on ajetsfan" }];
  return { ...meta, openGraph: { ...meta.openGraph, images }, twitter: { ...meta.twitter, images } };
}

export default async function GameReplayPage({ params, searchParams }: Props) {
  const [{ game: id }, query] = await Promise.all([params, searchParams]);
  const game = await loadSnapGame(id);
  if (!game || (query.play !== undefined && typeof query.play !== "string")) notFound();
  const view = replayView(game, query.play, query.pace === "all" ? "all" : "key");
  if (!view) notFound();
  return <FocusShell page="game-replay" name="Game replay" section="/replay" checkedAt={null}
    entries={[{ id: "replay-viewer", title: "Game replay", answer: "Field and scoreboard" }]}>
    <GameReplay key={[id, view.play.key, view.pace].join("/")} initial={view} />
  </FocusShell>;
}
