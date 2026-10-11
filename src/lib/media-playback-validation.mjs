/** @param {unknown} value @returns {URL | null} */
export function securePlaybackUrl(value) {
  if (typeof value !== "string" || !value || value.length > 1500 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}

/** Fail closed: a regular publisher page is never treated as an iframe player. */
/** @param {{kind: string, url: string, playback?: {kind: string, url: string, type?: string}}} item @returns {boolean} */
export function safeMediaPlaybackMetadata(item) {
  const playback = item.playback;
  if (!playback || typeof playback !== "object") return false;
  const source = securePlaybackUrl(item.url), url = securePlaybackUrl(playback.url);
  if (!source || !url || url.hash) return false;
  if (playback.kind === "video") {
    return item.kind === "video" && ["sny.tv", "www.sny.tv"].includes(source.hostname)
      && /^\/video\/[^/]+$/.test(source.pathname) && url.hostname === "cdn.jwplayer.com"
      && /^\/videos\/[A-Za-z0-9]{8}-[A-Za-z0-9]{8}\.mp4$/.test(url.pathname) && !url.search
      && (playback.type === undefined || playback.type === "video/mp4");
  }
  if (playback.kind === "iframe") {
    if (playback.type !== undefined || item.kind !== "audio" || source.hostname !== "www.audacy.com"
      || url.hostname !== "player.amperwavepodcasting.com" || url.pathname !== "/") return false;
    const episodeId = source.pathname.match(/^\/podcasts\/[a-f0-9]{32}\/episodes\/[^/]+-([1-9]\d*)$/)?.[1];
    const keys = [...url.searchParams.keys()];
    if (!episodeId || new Set(keys).size !== keys.length
      || keys.some((key) => !["feed-link", "withPlaylist", "theme", "playerDisplay-logoType"].includes(key))
      || url.searchParams.get("withPlaylist") !== "false" || url.searchParams.get("theme") !== "blurred"
      || url.searchParams.get("playerDisplay-logoType") !== "Audacy") return false;
    const feed = securePlaybackUrl(url.searchParams.get("feed-link"));
    return !!feed && feed.hostname === "rss.amperwave.net" && !feed.search && !feed.hash
      && new RegExp(`^/v2/episode/${episodeId}_\\d{4}-\\d{2}-\\d{2}-\\d{6}$`).test(feed.pathname);
  }
  // No direct audio host is admitted until a publisher provides a verified source.
  return false;
}
