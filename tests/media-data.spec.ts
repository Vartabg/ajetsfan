import { test, expect } from "@playwright/test";
import { mediaCollection } from "../src/lib/media-catalog";
import { formatMediaDate, mediaForGame, mediaForSeason, safeMediaUrl, validateMediaCollection, type MediaCollection, type MediaItem } from "../src/lib/media";

function changedItem(id: string, change: Record<string, unknown>): MediaCollection {
  const collection = structuredClone(mediaCollection);
  const index = collection.items.findIndex((item) => item.id === id);
  expect(index, `Missing fixture ${id}`).toBeGreaterThanOrEqual(0);
  collection.items[index] = { ...collection.items[index], ...change } as MediaItem;
  return collection;
}

const postId = "costello-bears-injuries-2026-10-02";
const videoId = "sny-jets-game-plan-2026-09-11";

test("the dated catalog offers distinct outlets and attributable, bounded coverage", () => {
  expect(validateMediaCollection(mediaCollection)).toBe(mediaCollection);
  expect(mediaCollection.items.length).toBeGreaterThanOrEqual(20);
  expect(mediaCollection.outlets.length).toBeGreaterThanOrEqual(11);
  expect(new Set(mediaCollection.items.map((item) => item.id)).size).toBe(mediaCollection.items.length);
  expect(new Set(mediaCollection.items.map((item) => item.url)).size).toBe(mediaCollection.items.length);
  expect(new Set(mediaCollection.items.map((item) => item.outletId)).size).toBeGreaterThanOrEqual(11);
  expect(new Set(mediaCollection.items.map((item) => item.author)).size).toBeGreaterThanOrEqual(6);
  for (const item of mediaCollection.items) {
    const outlet = mediaCollection.outlets.find((source) => source.id === item.outletId)!;
    expect(outlet.people).toContain(item.author);
    expect(item.summary.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(item.seasons?.length).toBeGreaterThan(0);
    expect(item.phase).toBeDefined();
    if (item.publishedAt) expect(Date.parse(item.publishedAt)).toBeLessThanOrEqual(Date.parse(mediaCollection.checkedAt));
  }
});

test("five social entries retain the actual verified writers, status URLs and dates", () => {
  const expected = [
    ["2106032567530987540", "Brian Costello", "https://x.com/BrianCoz/status/2106032567530987540", "2026-10-02T14:44:26.000Z"],
    ["2105329027401777638", "Zack Rosenblatt", "https://x.com/ZackBlatt/status/2105329027401777638", "2026-09-30T16:08:49.000Z"],
    ["2099498924402942304", "Rich Cimini", "https://x.com/RichCimini/status/2099498924402942304", "2026-09-14T14:02:05.000Z"],
    ["2095550117507891452", "Zack Rosenblatt", "https://x.com/ZackBlatt/status/2095550117507891452", "2026-09-03T16:30:56.000Z"],
    ["2090075043292180941", "Connor Hughes", "https://x.com/Connor_J_Hughes/status/2090075043292180941", "2026-08-19T13:54:56.000Z"],
  ];
  const posts = mediaCollection.items.filter((item) => item.kind === "post");
  expect(posts).toHaveLength(5);
  for (const [tweetId, author, url, publishedAt] of expected) {
    expect(posts.find((item) => item.tweetId === tweetId)).toMatchObject({ author, url, publishedAt, seasons: [2026] });
  }
});

test("video identities refer to the seven verified recordings rather than channel search pages", () => {
  const expected = [
    ["s657QMErTG4", "sny", "2026-09-11T15:45:37Z"],
    ["6uVZ4sOzkpQ", "espn-new-york", "2026-05-15T18:14:15Z"],
    ["u9Rh_ulKRPU", "jets", "2026-09-08T22:00:00Z"],
    ["_vHQnprws8w", "wfan", "2026-08-14T12:00:06Z"],
    ["fsJpQCFPK1g", "nfl", "2016-12-23T22:00:03Z"],
    ["fTq9p0tPljw", "jets", "2026-09-13T21:13:42Z"],
    ["Iy8saaW8rBY", "lions", "2026-09-27T20:11:13Z"],
  ];
  expect(mediaCollection.items.filter((item) => item.youtubeId)).toHaveLength(7);
  for (const [youtubeId, outletId, publishedAt] of expected) {
    expect(mediaCollection.items.find((item) => item.youtubeId === youtubeId)).toMatchObject({
      kind: "video", outletId, publishedAt, url: `https://www.youtube.com/watch?v=${youtubeId}`,
    });
  }
});

test("2010 playoff filtering follows the football season across article and upload years", () => {
  const playoffs = mediaForSeason(mediaCollection.items, 2010, "playoffs");
  expect(playoffs.map((item) => item.id).sort()).toEqual([
    "espn-2010-divisional-rapid-reaction", "nfl-2010-divisional-full-game",
  ]);
  expect(playoffs.find((item) => item.kind === "article")?.publishedAt).toBe("2011-01-17T00:50:00Z");
  expect(formatMediaDate(playoffs.find((item) => item.kind === "article")!.publishedAt)).toBe("Jan 16, 2011 ET");
  expect(formatMediaDate("2010-03-10")).toBe("Mar 10, 2010");
  expect(playoffs.find((item) => item.kind === "video")?.publishedAt).toBe("2016-12-23T22:00:03Z");
  expect(playoffs.every((item) => item.context === "archive" && item.phase === "playoffs")).toBe(true);
  expect(mediaForSeason(mediaCollection.items, 2011)).toEqual([]);
  expect(mediaForSeason(mediaCollection.items, 2016)).toEqual([]);
});

test("the championship retrospective belongs to 1968, and mixed coverage remains available in both phase views", () => {
  const historical = mediaForSeason(mediaCollection.items, 1968);
  expect(historical).toHaveLength(1);
  expect(historical[0]).toMatchObject({ id: "jets-namath-super-season-1968", publishedAt: "2010-03-10", phase: "mixed", context: "archive" });
  expect(mediaForSeason(mediaCollection.items, 1968, "regular")).toEqual(historical);
  expect(mediaForSeason(mediaCollection.items, 1968, "playoffs")).toEqual(historical);
  expect(mediaForSeason(mediaCollection.items, 2010)).not.toContain(historical[0]);
  const before = JSON.stringify(mediaCollection);
  const regular = mediaForSeason(mediaCollection.items, 2026, "regular");
  expect(regular.every((item) => item.seasons?.includes(2026) && ["regular", "mixed"].includes(item.phase!))).toBe(true);
  expect(regular.some((item) => item.phase === "offseason")).toBe(false);
  expect(JSON.stringify(mediaCollection)).toBe(before);
});

test("a later source check does not rewrite archival publication dates or make them current", () => {
  const collection = structuredClone(mediaCollection);
  collection.checkedAt = new Date(Date.parse(collection.checkedAt) + 86_400_000).toISOString();
  const archives = collection.items.filter((item) => item.context === "archive");
  expect(archives.length).toBeGreaterThanOrEqual(4);
  const before = JSON.stringify(archives);
  validateMediaCollection(collection);
  expect(JSON.stringify(archives)).toBe(before);
  expect(archives.every((item) => item.context === "archive")).toBe(true);
});

test("source links accept the verified publishers and reject disguised or unsafe destinations", () => {
  for (const item of mediaCollection.items) expect(safeMediaUrl(item.url), item.url).toBe(true);
  const invalid = [
    "http://x.com/BrianCoz/status/2106032567530987540",
    "javascript:alert(1)", "data:text/html,unsafe", "https://untrusted.example/article",
    "https://x.com.evil.example/article", "https://x.com@evil.example/article",
    "https://evil.example@x.com/article", "https://user:password@x.com/article",
    "https://x.com:8443/article", " https://x.com/article", "https://x.com/article ",
    "https://x.com/line\nbreak", "https://x.com\\@evil.example/article",
  ];
  for (const url of invalid) {
    expect(safeMediaUrl(url), url).toBe(false);
    expect(() => validateMediaCollection(changedItem(postId, { url })), url).toThrow();
  }
});

test("unknown publishers and duplicate editorial identities cannot enter the trusted catalog", () => {
  expect(() => validateMediaCollection(changedItem(postId, { outletId: "unknown-publisher" }))).toThrow();
  for (const field of ["id", "url"] as const) {
    const collection = structuredClone(mediaCollection);
    collection.items[1][field] = collection.items[0][field];
    expect(() => validateMediaCollection(collection)).toThrow();
  }
  const collection = structuredClone(mediaCollection);
  collection.outlets.push(structuredClone(collection.outlets[0]));
  expect(() => validateMediaCollection(collection)).toThrow();
});

test("missing dates remain unknown while invalid or future publication dates fail publication", () => {
  expect(validateMediaCollection(changedItem(postId, { publishedAt: null })).items.find((item) => item.id === postId)?.publishedAt).toBeNull();
  for (const publishedAt of ["not-a-date", "", new Date(Date.parse(mediaCollection.checkedAt) + 1).toISOString()]) {
    expect(() => validateMediaCollection(changedItem(postId, { publishedAt }))).toThrow();
  }
  expect(() => validateMediaCollection({ ...mediaCollection, checkedAt: "not-a-date" })).toThrow();
});

test("a social embed cannot borrow another status ID, content kind or publisher URL", () => {
  const changes = [
    { tweetId: "2106032567530987541" }, { tweetId: "invalid" }, { tweetId: undefined },
    { kind: "article" }, { url: "https://www.espn.com/article/status/2106032567530987540" },
    { url: "https://x.com/BrianCoz/status/2106032567530987541" },
    { url: "https://x.com/BrianCoz/status/%322106032567530987540" },
  ];
  for (const change of changes) expect(() => validateMediaCollection(changedItem(postId, change)), JSON.stringify(change)).toThrow();
});

test("a video embed must preserve its canonical recording identity and require a verified recording ID", () => {
  const changes = [
    { youtubeId: "6uVZ4sOzkpQ" }, { youtubeId: "not-an-id" }, { kind: "article" },
    { url: "https://www.youtube.com/watch?v=6uVZ4sOzkpQ" },
    { url: "https://nypost.com/recording", embedAllowed: true },
    { url: "https://www.youtube.com/playlist?v=s657QMErTG4", embedAllowed: true },
    { url: "https://www.youtube.com/watch?v=s657QMErTG4&v=6uVZ4sOzkpQ", embedAllowed: true },
    { youtubeId: undefined, embedAllowed: true },
  ];
  for (const change of changes) expect(() => validateMediaCollection(changedItem(videoId, change)), JSON.stringify(change)).toThrow();
  expect(() => validateMediaCollection(changedItem(postId, { embedAllowed: true }))).toThrow();
});

test("invalid football-season tags, phases and duplicate topics cannot contaminate filtered coverage", () => {
  const nextYear = new Date(mediaCollection.checkedAt).getUTCFullYear() + 1;
  for (const seasons of [[], [1959], [nextYear], [2026, 2026], [2026.5], ["2026"], "2026"]) {
    expect(() => validateMediaCollection(changedItem(postId, { seasons })), JSON.stringify(seasons)).toThrow();
  }
  expect(() => validateMediaCollection(changedItem(postId, { phase: "postseason-ish" }))).toThrow();
  expect(() => validateMediaCollection(changedItem(postId, { topics: ["injuries", "injuries"] }))).toThrow();
});

test("game-linked media attach to their own game case and stay inside its season", () => {
  expect(mediaForGame(mediaCollection.items, "2026_03_NYJ_DET").map((item) => item.id)).toEqual(["jets-lions-highlights-2026-09-27", "lions-jets-highlights-2026-09-27"]);
  expect(mediaForGame(mediaCollection.items, "2026_01_NYJ_TEN").map((item) => item.youtubeId)).toEqual(["fTq9p0tPljw"]);
  expect(mediaForGame(mediaCollection.items, "2010_19_NYJ_NE")).toEqual([]);
  const base = mediaCollection.items.find((item) => item.id === "jets-titans-highlights-2026-09-13")!;
  const collection = (gameIds: string[]) => ({ ...mediaCollection, items: [{ ...base, gameIds }] });
  expect(() => validateMediaCollection(collection(["2025_01_NYJ_TEN"]))).toThrow(/Invalid media game/);
  expect(() => validateMediaCollection(collection(["2026_01_BUF_TEN"]))).toThrow(/Invalid media game/);
  expect(() => validateMediaCollection(collection([]))).toThrow(/Invalid media game/);
});
