import { securePlaybackUrl, safeMediaPlaybackMetadata } from "./media-playback-validation.mjs";
export { safeMediaPlaybackMetadata } from "./media-playback-validation.mjs";
import type { MediaItem } from "./media";

/** Playback locations explicitly published by the item's own publisher. */
export type MediaPlaybackMetadata = {
  kind: "video" | "audio" | "iframe";
  url: string;
  type?: string;
};

type PlaybackItem = Pick<MediaItem, "kind" | "url" | "youtubeId" | "tweetId" | "embedAllowed"> & {
  playback?: MediaPlaybackMetadata;
};

export type MediaPlayback =
  | { kind: "youtube"; id: string }
  | { kind: "apple"; url: string }
  | { kind: "post"; id: string }
  | MediaPlaybackMetadata;

/** Resolve only verified recording identities and official publisher players. */
export function mediaPlayback(item: PlaybackItem): MediaPlayback | null {
  const source = securePlaybackUrl(item.url);
  if (!source) return null;
  if (item.kind === "video" && item.embedAllowed !== false && item.youtubeId
    && /^[A-Za-z0-9_-]{11}$/.test(item.youtubeId) && ["youtube.com", "www.youtube.com"].includes(source.hostname)
    && source.pathname === "/watch" && source.searchParams.getAll("v").length === 1
    && source.searchParams.get("v") === item.youtubeId) return { kind: "youtube", id: item.youtubeId };
  if (item.kind === "post" && item.tweetId && /^\d{15,22}$/.test(item.tweetId)
    && ["x.com", "twitter.com"].includes(source.hostname)
    && new RegExp(`^/[A-Za-z0-9_]+/status/${item.tweetId}$`).test(source.pathname)) return { kind: "post", id: item.tweetId };
  if (item.kind === "audio" && source.hostname === "podcasts.apple.com"
    && /^\/[a-z]{2}\/podcast\/(?:[^/]+\/)?id[1-9]\d{0,14}$/.test(source.pathname)
    && source.searchParams.getAll("i").length === 1 && /^[1-9]\d{0,19}$/.test(source.searchParams.get("i") ?? "")) {
    const embed = new URL(`https://embed.podcasts.apple.com${source.pathname}`);
    embed.searchParams.set("i", source.searchParams.get("i")!);
    return { kind: "apple", url: embed.href };
  }
  return safeMediaPlaybackMetadata(item) ? { ...item.playback! } : null;
}
