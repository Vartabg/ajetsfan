import type { MediaItem } from "./media";
import { mediaPlayback } from "./media-playback";

/** Mixed-sport episodes may stay in the room; the home feature leads with the Jets. */
export function selectHomeMedia(items: MediaItem[]): MediaItem | undefined {
  const focused = items.filter((item) => item.publishedAt && /\b(?:jets|nyj)\b/i.test(item.title))
    .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
  return focused.find((item) => mediaPlayback(item)) ?? focused[0];
}
