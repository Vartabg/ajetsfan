import { notFound } from "next/navigation";
import { loadPublishedPlayer } from "@/lib/load-published-pages";
import { ShareImage } from "@/lib/share-image";

export const alt = "A Jets player profile from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const profile = await loadPublishedPlayer((await params).id);
  if (!profile) notFound();
  const { player, season } = profile;
  return ShareImage({
    eyebrow: `${season} edition · The player programme`, title: player.name,
    detail: `${player.position}${player.jersey !== null ? ` · No. ${player.jersey}` : ""} · New York Jets`,
  });
}
