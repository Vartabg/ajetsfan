import type { MediaItem } from "./media";
import { mediaPlayback } from "./media-playback";

/** Mixed-sport episodes may stay in the room; the home feature leads with current Jets coverage. */
export function selectHomeMedia(items: MediaItem[], season?: number | null): MediaItem | undefined {
  const focused = items.filter((item) =>
    item.publishedAt &&
    item.context === "current" &&
    (season == null || !item.seasons?.length || item.seasons.includes(season)) &&
    /\b(?:jets|nyj)\b/i.test(item.title),
  ).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
  return focused.find((item) => mediaPlayback(item)) ?? focused[0];
}
