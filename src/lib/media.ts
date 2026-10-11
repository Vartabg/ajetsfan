import { safeMediaPlaybackMetadata } from "./media-playback-validation.mjs";

/** A picture the publisher serves for its own link, recorded with its pixel size. */
export type MediaImage = { url: string; width: number; height: number; fingerprint?: string };

export type MediaItem = {
  id: string;
  title: string;
  kind: "video" | "post" | "article" | "audio";
  outletId: string;
  author: string;
  publishedAt: string | null;
  url: string;
  /**
   * The publisher's preview picture: its og:image, video poster or podcast art; for an X post, the
   * author's profile picture. null records that no suitable picture was verified. Older YouTube
   * entries omit it; refreshed videos record the best available thumbnail and its measured size.
   */
  image?: MediaImage | null;
  summary: string;
  topics: string[];
  youtubeId?: string;
  tweetId?: string;
  embedAllowed?: boolean;
  /** A recording or player explicitly declared by this item's own publisher. */
  playback?: { kind: "video" | "audio" | "iframe"; url: string; type?: string };
  context: "archive" | "current";
  /** Football seasons established by the content, not its publication year. */
  seasons?: number[];
  /** Recorded games this item covers directly, by nflverse game ID; each must fall in a listed season. */
  gameIds?: string[];
  phase?: "regular" | "playoffs" | "offseason" | "mixed";
};

export type MediaOutlet = {
  id: string;
  name: string;
  kind: "beat" | "tv" | "radio" | "official" | "independent";
  url: string;
  people: string[];
};

export type MediaSource = {
  id: string; name: string; url: string;
  status: "ready" | "retained" | "unavailable";
  checkedAt: string | null; attemptedAt: string; itemCount: number;
};
export type MediaCollection = {
  schemaVersion?: 1;
  checkedAt: string;
  curatedCheckedAt?: string;
  sources?: MediaSource[];
  items: MediaItem[]; outlets: MediaOutlet[];
};

/** Preserve date-only publisher datelines; timestamped reporting uses New York time. */
export function formatMediaDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Publication date unavailable";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: dateOnly ? "UTC" : "America/New_York",
  }).format(new Date(dateOnly ? `${value}T12:00:00Z` : value));
  return dateOnly ? label : `${label} ET`;
}

const hosts = new Set(["www.newyorkjets.com", "www.nfl.com", "www.espn.com", "espn.com", "sny.tv", "www.sny.tv", "nypost.com", "www.nj.com", "www.newsday.com", "www.nytimes.com", "www.northjersey.com", "www.audacy.com", "www.youtube.com", "youtube.com", "x.com", "twitter.com", "www.cbssports.com", "www.nbcsports.com", "jetswire.usatoday.com", "jetsxfactor.com", "podcasts.apple.com", "www.pff.com"]);
// Image hosts are checked here; the local asset route resolves only each recorded URL exactly.
const imageHosts = new Set(["static.clubs.nfl.com", "assets-jpcust.jwpsrv.com", "cdn.jwplayer.com", "www.audacy.com", "is1-ssl.mzstatic.com", "is2-ssl.mzstatic.com", "is3-ssl.mzstatic.com", "is4-ssl.mzstatic.com", "is5-ssl.mzstatic.com", "jetsxfactor.com", "nypost.com", "nbcsports.brightspotcdn.com", "media.pff.com", "pbs.twimg.com", "i.ytimg.com"]);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && !!value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);

function safeUrl(value: unknown, allowed: Set<string>): value is string {
  if (!text(value, 1500) || value !== value.trim() || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowed.has(url.hostname);
  } catch { return false; }
}

export const safeMediaUrl = (value: unknown): value is string => safeUrl(value, hosts);
export const safeMediaImageUrl = (value: unknown): value is string => safeUrl(value, imageHosts);
const sourceHosts = new Set([...hosts, "itunes.apple.com"]);

/** The picture to show for an item, or null when the publisher has none. */
export function mediaImage(item: Pick<MediaItem, "youtubeId" | "image">): MediaImage | null {
  if (Object.hasOwn(item, "image")) return item.image ?? null;
  // hqdefault exists for every upload; it is 4:3 with the 16:9 frame letterboxed inside.
  if (item.youtubeId) return { url: `https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`, width: 480, height: 360 };
  return item.image ?? null;
}

/** A bad editorial entry fails publication instead of gaining a trusted label. */
export function validateMediaCollection(collection: MediaCollection): MediaCollection {
  const checked = Date.parse(collection.checkedAt);
  if (!Number.isFinite(checked) || !Array.isArray(collection.items) || !Array.isArray(collection.outlets)) throw new Error("Invalid media collection");
  if (collection.schemaVersion !== undefined && collection.schemaVersion !== 1) throw new Error("Unsupported media snapshot");
  if (collection.curatedCheckedAt !== undefined && (!Number.isFinite(Date.parse(collection.curatedCheckedAt)) || Date.parse(collection.curatedCheckedAt) > checked)) throw new Error("Invalid curated media check");
  if (collection.sources !== undefined) {
    if (!Array.isArray(collection.sources) || !collection.sources.length) throw new Error("Invalid media sources");
    const sourceIds = new Set<string>();
    for (const source of collection.sources) {
      if (!text(source.id, 60) || !/^[a-z0-9-]+$/.test(source.id) || sourceIds.has(source.id) || !text(source.name, 120)
        || !safeUrl(source.url, sourceHosts) || !["ready", "retained", "unavailable"].includes(source.status)
        || !Number.isFinite(Date.parse(source.attemptedAt)) || !Number.isInteger(source.itemCount) || source.itemCount < 0
        || (source.checkedAt !== null && (!Number.isFinite(Date.parse(source.checkedAt)) || Date.parse(source.checkedAt) > Date.parse(source.attemptedAt) || Date.parse(source.checkedAt) > checked))
        || (source.status === "unavailable" ? source.checkedAt !== null || source.itemCount !== 0 : source.checkedAt === null)) throw new Error("Invalid media source state");
      sourceIds.add(source.id);
    }
  }
  const outletIds = new Set<string>();
  for (const outlet of collection.outlets) {
    if (!text(outlet.id, 60) || !/^[a-z0-9-]+$/.test(outlet.id) || outletIds.has(outlet.id) || !text(outlet.name, 120)
      || !["beat", "tv", "radio", "official", "independent"].includes(outlet.kind) || !safeMediaUrl(outlet.url)
      || !Array.isArray(outlet.people) || outlet.people.some((person) => !text(person, 120))) throw new Error("Invalid media outlet");
    outletIds.add(outlet.id);
  }
  const ids = new Set<string>(), urls = new Set<string>();
  for (const item of collection.items) {
    if (!text(item.id, 80) || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) || urls.has(item.url) || !outletIds.has(item.outletId)
      || !text(item.title, 250) || !text(item.author, 180) || !text(item.summary, 500) || !safeMediaUrl(item.url)
      || !["video", "post", "article", "audio"].includes(item.kind) || !["archive", "current"].includes(item.context)
      || !Array.isArray(item.topics) || !item.topics.length || item.topics.some((topic) => !text(topic, 60))
      || new Set(item.topics).size !== item.topics.length) throw new Error(`Invalid media item: ${item.id}`);
    if (item.publishedAt !== null && (!Number.isFinite(Date.parse(item.publishedAt)) || Date.parse(item.publishedAt) > checked
      || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(item.publishedAt) || new Date(item.publishedAt).toISOString().slice(0, 10) !== item.publishedAt.slice(0, 10))) throw new Error(`Invalid media date: ${item.id}`);
    if (item.seasons && (!Array.isArray(item.seasons) || !item.seasons.length || new Set(item.seasons).size !== item.seasons.length || item.seasons.some((year) => !Number.isInteger(year) || year < 1960 || year > new Date(checked).getUTCFullYear()))) throw new Error(`Invalid football season: ${item.id}`);
    if (item.phase && !["regular", "playoffs", "offseason", "mixed"].includes(item.phase)) throw new Error(`Invalid media phase: ${item.id}`);
    if (item.gameIds !== undefined && (!Array.isArray(item.gameIds) || !item.gameIds.length || new Set(item.gameIds).size !== item.gameIds.length
      || item.gameIds.some((id) => !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(id) || !id.includes("NYJ") || !item.seasons?.includes(Number(id.slice(0, 4)))))) throw new Error(`Invalid media game: ${item.id}`);
    if (item.tweetId) {
      const url = new URL(item.url);
      if (item.kind !== "post" || !/^\d{15,22}$/.test(item.tweetId) || !["x.com", "twitter.com"].includes(url.hostname)
        || !new RegExp(`^/[A-Za-z0-9_]+/status/${item.tweetId}$`).test(url.pathname)) throw new Error(`Invalid post identity: ${item.id}`);
    } else if (item.kind === "post") throw new Error(`Missing post identity: ${item.id}`);
    if (item.youtubeId) {
      if (item.kind !== "video" || !/^[A-Za-z0-9_-]{11}$/.test(item.youtubeId)) throw new Error(`Invalid video identity: ${item.id}`);
      const url = new URL(item.url);
      if (!["youtube.com", "www.youtube.com"].includes(url.hostname) || url.pathname !== "/watch" || url.searchParams.getAll("v").length !== 1 || url.searchParams.get("v") !== item.youtubeId) throw new Error(`Mismatched video identity: ${item.id}`);
    }
    if ((!item.youtubeId && item.image === undefined) || (item.image !== undefined && item.image !== null && (typeof item.image !== "object" || !safeMediaImageUrl(item.image.url)
      || [item.image.width, item.image.height].some((size) => !Number.isInteger(size) || size < 100 || size > 4000)))) throw new Error(`Invalid media image: ${item.id}`);
    if (item.image && (item.youtubeId || new URL(item.image.url).hostname === "i.ytimg.com") && (!item.youtubeId
      || !new RegExp(`^https://i\\.ytimg\\.com/vi/${item.youtubeId}/(?:maxresdefault|sddefault|hqdefault)\\.jpg$`).test(item.image.url))) throw new Error(`Mismatched video picture: ${item.id}`);
    if (item.image?.fingerprint !== undefined && !/^[a-f0-9]{16}$/.test(item.image.fingerprint)) throw new Error(`Invalid media picture fingerprint: ${item.id}`);
    if (Object.hasOwn(item, "embedAllowed") && typeof item.embedAllowed !== "boolean") throw new Error(`Invalid video embed permission: ${item.id}`);
    if (item.embedAllowed && !item.youtubeId) throw new Error(`Unverified video embed: ${item.id}`);
    if (item.playback !== undefined && !safeMediaPlaybackMetadata(item)) throw new Error(`Invalid media playback: ${item.id}`);
    ids.add(item.id); urls.add(item.url);
  }
  return collection;
}

/** Explicit membership keeps January playoff reporting attached to its season. */
export function mediaForSeason(items: MediaItem[], season: number, phase: "all" | "regular" | "playoffs" = "all") {
  return items.filter((item) => item.seasons?.includes(season) && (phase === "all" || item.phase === phase || item.phase === "mixed"));
}

/** Items that cover one recorded game directly; season-wide coverage stays on the season pages. */
export function mediaForGame(items: MediaItem[], gameId: string): MediaItem[] {
  return items.filter((item) => item.gameIds?.includes(gameId)).sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") || a.id.localeCompare(b.id));
}
