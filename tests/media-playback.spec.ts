import { test, expect } from "@playwright/test";
import { mediaPlayback, safeMediaPlaybackMetadata } from "../src/lib/media-playback";
import type { MediaItem } from "../src/lib/media";

const item = (change: Partial<MediaItem> = {}): MediaItem => ({
  id: "verified-recording", title: "Verified recording", kind: "video", outletId: "jets",
  author: "Publisher", publishedAt: "2026-10-09T12:00:00Z", url: "https://www.youtube.com/watch?v=s657QMErTG4",
  youtubeId: "s657QMErTG4", summary: "A publisher recording.", topics: ["Reporting"], context: "current", ...change,
});
const audacy = "https://www.audacy.com/podcasts/25b5d2554a72264c79052c27fbb94319/episodes/jets_take_step_forward_giants_-8352937";
const audacyPlayer = "https://player.amperwavepodcasting.com?&feed-link=https%3A%2F%2Frss.amperwave.net%2Fv2%2Fepisode%2F8352937_2026-05-01-155737&withPlaylist=false&theme=blurred&playerDisplay-logoType=Audacy";

test("verified YouTube identity can play without an inferred permission flag", () => {
  expect(mediaPlayback(item())).toEqual({ kind: "youtube", id: "s657QMErTG4" });
  expect(mediaPlayback(item({ embedAllowed: true }))).toEqual({ kind: "youtube", id: "s657QMErTG4" });
  expect(mediaPlayback(item({ embedAllowed: false }))).toBeNull();
});

test("a video cannot borrow a different recording or a disguised YouTube host", () => {
  for (const change of [
    { youtubeId: "4KHPQmrqDUY" }, { youtubeId: "invalid" }, { kind: "article" as const },
    { url: "https://youtube.com.evil.example/watch?v=s657QMErTG4" },
    { url: "https://www.youtube.com/watch?v=s657QMErTG4&v=s657QMErTG4" },
    { url: "https://www.youtube.com/playlist?v=s657QMErTG4" },
  ]) expect(mediaPlayback(item(change))).toBeNull();
});

test("Apple episode playback preserves the episode and removes outbound tracking", () => {
  const episode = item({ kind: "audio", youtubeId: undefined,
    url: "https://podcasts.apple.com/ca/podcast/previewing-the-ny-jets-2026-season-with-daily-news/id863176413?i=1000788748520&uo=4&utm_source=site" });
  expect(mediaPlayback(episode)).toEqual({ kind: "apple",
    url: "https://embed.podcasts.apple.com/ca/podcast/previewing-the-ny-jets-2026-season-with-daily-news/id863176413?i=1000788748520" });
});

test("Apple show links, duplicate IDs, invalid IDs and other publishers cannot become episode players", () => {
  const prefix = "https://podcasts.apple.com/us/podcast/example/id863176413";
  for (const url of [prefix, `${prefix}?i=0`, `${prefix}?i=not-an-id`, `${prefix}?i=1000788748520&i=1000788748521`,
    "https://podcasts.apple.com.evil.example/us/podcast/example/id863176413?i=1000788748520",
    "https://podcasts.apple.com/us/podcast/example/id863176413/extra?i=1000788748520",
  ]) expect(mediaPlayback(item({ kind: "audio", youtubeId: undefined, url }))).toBeNull();
  expect(mediaPlayback(item({ kind: "video", youtubeId: undefined, url: `${prefix}?i=1000788748520` }))).toBeNull();
});

test("social posts expand only the exact publisher status identity", () => {
  const post = item({ kind: "post", youtubeId: undefined, tweetId: "2106032567530987540",
    url: "https://x.com/BrianCoz/status/2106032567530987540" });
  expect(mediaPlayback(post)).toEqual({ kind: "post", id: "2106032567530987540" });
  expect(mediaPlayback({ ...post, tweetId: "2106032567530987541" })).toBeNull();
  expect(mediaPlayback({ ...post, url: "https://x.com/BrianCoz/status/2106032567530987540/extra" })).toBeNull();
});

test("SNY native playback accepts only its publisher-declared JW MP4 form", () => {
  const recording = item({ youtubeId: undefined, url: "https://sny.tv/video/bart-scott-on-the-outlook-of-jets-running-game-without-breece-hall-jets-game-plan",
    playback: { kind: "video", url: "https://cdn.jwplayer.com/videos/DVpjLn82-1lACodv2.mp4", type: "video/mp4" } });
  expect(safeMediaPlaybackMetadata(recording)).toBe(true);
  expect(mediaPlayback(recording)).toEqual(recording.playback);
  for (const change of [
    { url: "https://www.newyorkjets.com/video/example" }, { kind: "article" as const },
    { playback: { ...recording.playback!, url: "https://cdn.jwplayer.com/videos/DVpjLn82-1lACodv2.mp4?redirect=evil" } },
    { playback: { ...recording.playback!, url: "https://cdn.jwplayer.com/videos/wrong.mp4" } },
    { playback: { ...recording.playback!, type: "text/html" } },
  ]) expect(mediaPlayback({ ...recording, ...change })).toBeNull();
});

test("Audacy iframe preserves its original episode ID through the nested feed URL", () => {
  const episode = item({ kind: "audio", youtubeId: undefined, url: audacy,
    playback: { kind: "iframe", url: audacyPlayer } });
  expect(safeMediaPlaybackMetadata(episode)).toBe(true);
  expect(mediaPlayback(episode)).toEqual(episode.playback);
  const invalid = [
    audacyPlayer.replace("8352937", "8682198"),
    audacyPlayer.replace("rss.amperwave.net", "rss.amperwave.net.evil.example"),
    audacyPlayer.replace("player.amperwavepodcasting.com", "player.amperwavepodcasting.com.evil.example"),
    `${audacyPlayer}&feed-link=https%3A%2F%2Fexample.com`, `${audacyPlayer}&redirect=https://example.com`,
    audacyPlayer.replace("withPlaylist=false", "withPlaylist=true"),
    audacyPlayer.replace("%2Fv2%2Fepisode", "%2Fbad%2Fepisode"),
  ];
  for (const url of invalid) expect(mediaPlayback({ ...episode, playback: { kind: "iframe", url } }), url).toBeNull();
  expect(mediaPlayback({ ...episode, kind: "video" })).toBeNull();
});

test("watch pages and arbitrary URLs cannot become players even when metadata requests it", () => {
  for (const url of ["https://www.newyorkjets.com/video/example", "https://www.espn.com/video/clip/_/id/12345", "https://example.com/player"]) {
    expect(mediaPlayback(item({ youtubeId: undefined, url, playback: { kind: "iframe", url } }))).toBeNull();
  }
  for (const url of ["http://www.youtube.com/watch?v=s657QMErTG4", "javascript:alert(1)",
    "https://user:pass@www.youtube.com/watch?v=s657QMErTG4", "https://www.youtube.com:8443/watch?v=s657QMErTG4",
    "https://www.youtube.com\\@evil.example/watch?v=s657QMErTG4", " https://www.youtube.com/watch?v=s657QMErTG4",
  ]) expect(mediaPlayback(item({ url })), url).toBeNull();
});
