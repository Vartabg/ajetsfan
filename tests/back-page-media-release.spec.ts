import { test, expect } from "@playwright/test";
import { selectHomeMedia } from "../src/lib/home-media";
import type { MediaItem } from "../src/lib/media";

const recording = (id: string, title: string, publishedAt: string): MediaItem => ({
  id, title, publishedAt, kind: "video", outletId: "wfan", author: "WFAN",
  url: "https://www.youtube.com/watch?v=s657QMErTG4", youtubeId: "s657QMErTG4",
  summary: "New York sports, including the Jets.", topics: ["Reporting"], context: "current",
});

test("the Jets home feature prefers a Jets headline over newer mixed-sports coverage", () => {
  const knicks = recording("knicks", "THE KNICKS ARE BACK", "2026-10-20T22:00:00Z");
  const jets = recording("jets", "Jets defense after Sunday's game", "2026-10-20T21:00:00Z");
  expect(selectHomeMedia([knicks, jets])?.id).toBe("jets");
  expect(selectHomeMedia([knicks])).toBeUndefined();
  expect(selectHomeMedia([recording("nyj", "NYJ film review", "2026-10-20T20:00:00Z"), jets])?.id).toBe("jets");
});

test("an interactive media page opens its player on the first click without another app chunk", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({
    contentType: "application/javascript",
    body: 'window.YT={Player:function(iframe,options){this.destroy=function(){iframe.remove();};options.events.onReady({target:this});}};window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady();',
  }));
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Publisher player</title>" }));
  await page.goto("/media");
  const trigger = page.locator("#watch [data-media-open]");
  await expect(trigger).toBeVisible();
  // Once the app is interactive, a slow or unavailable extra app chunk must not
  // strand a reader at Loading player. Publisher traffic is stubbed separately.
  await page.route("**/_next/static/chunks/*.js*", (route) => route.abort());
  await trigger.click();
  await expect(page.locator("#watch [data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "ready");
  await expect(page.locator("#watch iframe")).toHaveCount(1);
  await page.locator("#watch [data-media-close]").click();
  await expect(trigger).toBeFocused();
  await expect(page.locator("#watch iframe")).toHaveCount(0);
});
