import { notFound } from "next/navigation";
import { formatDate } from "@/lib/current";
import { fanMemoryForGame } from "@/lib/fan-memories";
import { loadPublishedGame } from "@/lib/load-published-pages";
import { ShareImage } from "@/lib/share-image";

export const alt = "A Jets game case from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadPublishedGame((await params).id);
  if (!game) notFound();
  return ShareImage({
    eyebrow: `${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"} · Week ${game.week}`,
    title: fanMemoryForGame(game)?.title ?? `Jets ${game.atHome ? "vs" : "at"} ${game.opponentDisplay}`,
    detail: `NYJ ${game.jetsScore} — ${game.opponentDisplay} ${game.oppScore} · ${formatDate(game.date)} · Final${game.wentToOt ? " / OT" : ""}`,
    score: `${game.jetsScore}–${game.oppScore}`,
  });
}
