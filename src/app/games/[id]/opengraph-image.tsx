import { notFound } from "next/navigation";
import { formatDate } from "@/lib/current";
import { fanMemoryForGame } from "@/lib/fan-memories";
import { loadGamePage } from "@/lib/load-game-page";
import { ShareImage } from "@/lib/share-image";

export const alt = "A Jets game case from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const edition = await loadGamePage((await params).id);
  if (!edition) notFound();
  const game = edition.game;
  return ShareImage({
    eyebrow: `${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"} · Week ${game.week}`,
    title: (edition.kind === "analysis" ? fanMemoryForGame(edition.game)?.title : null) ?? `Jets ${game.atHome ? "vs" : "at"} ${game.opponentDisplay}`,
    detail: `NYJ ${game.jetsScore} — ${game.opponentDisplay} ${game.oppScore} · ${formatDate(game.date)} · Final${edition.kind === "analysis" && edition.game.wentToOt ? " / OT" : ""}${edition.kind === "drives" ? " · Verified drives" : ""}`,
    score: `${game.jetsScore}–${game.oppScore}`,
  });
}
