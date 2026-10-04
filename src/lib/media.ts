/** A picture the publisher serves for its own link, recorded with its pixel size. */
export type MediaImage = { url: string; width: number; height: number };

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
   * author's profile picture. null records that the publisher offers only its logo. YouTube videos
   * omit it and use the recording's own thumbnail.
   */
  image?: MediaImage | null;
  summary: string;
  topics: string[];
  youtubeId?: string;
  tweetId?: string;
  embedAllowed?: boolean;
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

export type MediaCollection = { checkedAt: string; items: MediaItem[]; outlets: MediaOutlet[] };

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
// Image hosts are checked here; next.config.ts then admits each recorded URL exactly, path and query.
const imageHosts = new Set(["static.clubs.nfl.com", "assets-jpcust.jwpsrv.com", "www.audacy.com", "is1-ssl.mzstatic.com", "jetsxfactor.com", "nbcsports.brightspotcdn.com", "media.pff.com", "pbs.twimg.com"]);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && !!value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);

function safeUrl(value: unknown, allowed: Set<string>): value is string {
  if (!text(value, 1500) || value !== value.trim() || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowed.has(url.hostname);
  } catch { return false; }
}

export const safeMediaUrl = (value: unknown): value is string => safeUrl(value, hosts);

/** The picture to show for an item, or null when the publisher has none. */
export function mediaImage(item: Pick<MediaItem, "youtubeId" | "image">): MediaImage | null {
  // hqdefault exists for every upload; it is 4:3 with the 16:9 frame letterboxed inside.
  if (item.youtubeId) return { url: `https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`, width: 480, height: 360 };
  return item.image ?? null;
}

/** A bad editorial entry fails publication instead of gaining a trusted label. */
export function validateMediaCollection(collection: MediaCollection): MediaCollection {
  const checked = Date.parse(collection.checkedAt);
  if (!Number.isFinite(checked) || !Array.isArray(collection.items) || !Array.isArray(collection.outlets)) throw new Error("Invalid media collection");
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
    if (item.youtubeId ? item.image !== undefined : item.image !== null && (typeof item.image !== "object" || !safeUrl(item.image.url, imageHosts)
      || [item.image.width, item.image.height].some((size) => !Number.isInteger(size) || size < 100 || size > 4000))) throw new Error(`Invalid media image: ${item.id}`);
    if (Object.hasOwn(item, "embedAllowed") && typeof item.embedAllowed !== "boolean") throw new Error(`Invalid video embed permission: ${item.id}`);
    if (item.embedAllowed && !item.youtubeId) throw new Error(`Unverified video embed: ${item.id}`);
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
