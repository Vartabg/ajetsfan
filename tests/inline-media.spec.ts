import { test, expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { mediaCollection } from "../src/lib/media-catalog";

const items = mediaCollection.items;
const newest = [...items].filter((item) => item.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
const video = newest.find((item) => item.youtubeId && item.embedAllowed !== false)!;
const leadingVideo = newest.find((item) => item.kind === "video")!;
const automaticVideo = newest.find((item) => item.id.startsWith("auto-") && item.youtubeId && item.embedAllowed !== false)!;
const audio = newest.find((item) => item.kind === "audio" && new URL(item.url).hostname === "podcasts.apple.com")!;
const seasonArticle = items.find((item) => item.id === "espn-2010-divisional-rapid-reaction")!;
const card = (page: Page, id: string) => page.locator(`[data-media-card="${id}"]`);
const youtubeSdk = `window.YT={Player:function(iframe,options){var player=this;this.destroy=function(){iframe.remove();};window.mediaYTPlayers=(window.mediaYTPlayers||0)+1;setTimeout(function(){options.events.onReady({target:player});},0);}};window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady();`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>' }));
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Publisher video player</body></html>" }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "application/javascript", body: youtubeSdk }));
  await page.route("https://embed.podcasts.apple.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Publisher podcast player</body></html>" }));
});

async function assertStaysHere(page: Page, scope: Locator, trigger: Locator) {
  await trigger.scrollIntoViewIfNeeded();
  const before = await scope.boundingBox();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const pathname = new URL(page.url()).pathname;
  const pages = page.context().pages().length;
  await trigger.click();
  expect(new URL(page.url()).pathname).toBe(pathname);
  expect(page.context().pages()).toHaveLength(pages);
  expect(Math.abs((await scope.boundingBox())!.y - before!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore)).toBeLessThanOrEqual(2);
}

test("a fresh video plays inside its clicked card in one action, without scrolling or opening another page", async ({ page }) => {
  expect(automaticVideo).toBeTruthy();
  await page.goto(`/media?type=video&q=${encodeURIComponent(automaticVideo.title)}#collection`);
  const entry = card(page, automaticVideo.id);
  await expect(entry).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await assertStaysHere(page, entry, entry.locator(`[data-media-select="${automaticVideo.id}"]`));
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(1);
  await expect(page.locator("[data-media-youtube]")).toHaveCount(1);
  const source = new URL((await entry.locator("[data-media-youtube]").getAttribute("src"))!);
  expect(source.hostname).toBe("www.youtube-nocookie.com");
  expect(source.pathname).toBe(`/embed/${automaticVideo.youtubeId}`);
  expect(source.searchParams.get("playsinline")).toBe("1");
});

test("the opening video plays at its own moment, and selecting the same recording below leaves only one player", async ({ page }) => {
  expect(leadingVideo).toBeTruthy();
  await page.goto("/media#watch");
  const moment = page.locator("#watch");
  await assertStaysHere(page, moment, moment.locator("[data-media-open]"));
  await expect(moment.locator("[data-media-viewer]")).toHaveCount(1);
  const entry = card(page, leadingVideo.id);
  await entry.locator(`[data-media-select="${leadingVideo.id}"]`).click();
  await expect(entry.locator("[data-media-viewer]")).toHaveCount(1);
  await expect(moment.locator("[data-media-viewer]")).toHaveCount(0);
  await expect(page.locator("[data-media-viewer]")).toHaveCount(1);
});

test("choosing a second recording stops the first provider instead of playing two recordings together", async ({ page }) => {
  const nextVideo = newest.find((item) => item.youtubeId && item.embedAllowed !== false && item.id !== video.id)!;
  expect(nextVideo).toBeTruthy();
  await page.goto("/media?type=video#collection");
  await card(page, video.id).locator(`[data-media-select="${video.id}"]`).click();
  await expect(card(page, video.id).locator("[data-media-youtube]")).toHaveCount(1);
  await card(page, nextVideo.id).locator(`[data-media-select="${nextVideo.id}"]`).click();
  await expect(card(page, nextVideo.id).locator("[data-media-youtube]")).toHaveCount(1);
  await expect(card(page, video.id).locator("[data-media-youtube]")).toHaveCount(0);
  await expect(page.locator("[data-media-youtube]")).toHaveCount(1);
});

for (const [code, reason] of [[100, /no longer available/], [101, /limited this video to YouTube/], [150, /limited this video to YouTube/], [153, /could not verify playback/]] as const) {
  test(`YouTube error ${code} stays at the clicked card with an honest local explanation`, async ({ page }) => {
    const error = `options.events.onError({target:player,data:${code}});`;
    await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "application/javascript", body: `window.YT={Player:function(iframe,options){var player=this;this.destroy=function(){window.mediaYTDestroyed=(window.mediaYTDestroyed||0)+1;iframe.remove();};${code === 100 ? error : `setTimeout(function(){${error}},0);`}}};window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady();` }));
    await page.goto(`/media?type=video&q=${encodeURIComponent(video.title)}#collection`);
    const entry = card(page, video.id);
    await entry.locator(`[data-media-select="${video.id}"]`).click();
    await expect(entry.locator("[data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "failed");
    await expect(entry.locator("[data-media-youtube-status]")).toContainText(reason);
    await expect(entry.locator("[data-media-youtube]")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { mediaYTDestroyed?: number }).mediaYTDestroyed ?? 0)).toBe(1);
    expect(new URL(page.url()).pathname).toBe("/media");
    expect(page.context().pages()).toHaveLength(1);
  });
}

test("a browser autoplay block retains the local player and tells the visitor where to start it", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "application/javascript", body: `window.YT={Player:function(iframe,options){var player=this;this.destroy=function(){iframe.remove();};setTimeout(function(){options.events.onReady({target:player});options.events.onAutoplayBlocked({target:player});},0);}};window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady();` }));
  await page.goto(`/media?type=video&q=${encodeURIComponent(video.title)}#collection`);
  const entry = card(page, video.id);
  await entry.locator(`[data-media-select="${video.id}"]`).click();
  await expect(entry.locator("[data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "blocked");
  await expect(entry).toContainText("Tap play in the player to start.");
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(1);
});

test("a delayed YouTube SDK cannot create a player after its local card has closed", async ({ page }) => {
  let finish: (() => Promise<void>) | undefined;
  await page.route("https://www.youtube.com/iframe_api", (route) => { finish = () => route.fulfill({ contentType: "application/javascript", body: youtubeSdk }); });
  await page.goto(`/media?type=video&q=${encodeURIComponent(video.title)}#collection`);
  const entry = card(page, video.id);
  await entry.locator(`[data-media-select="${video.id}"]`).click();
  await expect.poll(() => !!finish).toBe(true);
  await entry.locator("[data-media-close]").click();
  await finish!();
  await expect(page.locator("[data-media-youtube]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { mediaYTPlayers?: number }).mediaYTPlayers ?? 0)).toBe(0);
});

test("a publisher podcast episode gets an inline official player only after the local action", async ({ page }) => {
  expect(audio).toBeTruthy();
  let requests = 0;
  await page.route("https://embed.podcasts.apple.com/**", (route) => {
    requests += 1;
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Publisher podcast player</body></html>" });
  });
  await page.goto(`/media?type=audio&q=${encodeURIComponent(audio.title)}#collection`);
  expect(requests).toBe(0);
  const entry = card(page, audio.id);
  await assertStaysHere(page, entry, entry.locator(`[data-media-select="${audio.id}"]`));
  const frame = entry.locator("[data-media-apple]");
  await expect(frame).toHaveCount(1);
  const destination = new URL((await frame.getAttribute("src"))!);
  const publisher = new URL(audio.url);
  expect(destination.hostname).toBe("embed.podcasts.apple.com");
  expect(destination.pathname).toBe(publisher.pathname);
  expect(destination.searchParams.get("i")).toBe(publisher.searchParams.get("i"));
  await expect.poll(() => requests).toBe(1);
});

test("historical season reporting expands in its own season row without leaving the season or its filters", async ({ page }) => {
  await page.goto("/seasons/2010?phase=playoffs");
  await page.locator('[data-season-view="media"]').click();
  const row = page.locator(`[data-season-media="${seasonArticle.id}"]`);
  await assertStaysHere(page, row, row.locator("[data-media-open]"));
  await expect(row).toContainText(seasonArticle.summary);
  await expect(row.locator("[data-inline-media]")).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("phase")).toBe("playoffs");
  await expect(page.locator('[data-focus-page="season"]')).toHaveCount(1);
});

test("game replays use the player beside the clicked game coverage", async ({ page }) => {
  await page.goto("/games/2026_03_NYJ_DET#more");
  const entry = page.locator('[data-inline-media="lions-jets-highlights-2026-09-27"]');
  await assertStaysHere(page, entry, entry.locator("[data-media-open]"));
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(1);
  await expect(page.locator('[data-focus-page="game"]')).toHaveCount(1);
});

test("the landing media moment opens locally without navigating to the Media Room", async ({ page }) => {
  await page.goto("/#media");
  const moment = page.locator("#media");
  await assertStaysHere(page, moment, moment.locator("[data-media-open]"));
  await expect(moment.locator("[data-inline-media]")).toHaveCount(1);
  await expect(moment.locator("[data-media-viewer]")).toHaveCount(1);
  expect(new URL(page.url()).pathname).toBe("/");
});

test("shared selections reveal a deep card but never start a provider on arrival, reload, or Back", async ({ page }) => {
  let requests = 0;
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => {
    requests += 1;
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Publisher video player</body></html>" });
  });
  await page.goto(`/media?keep=share&type=video&media=${video.id}#collection`);
  const entry = card(page, video.id);
  await expect(entry).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(requests).toBe(0);
  await entry.locator(`[data-media-select="${video.id}"]`).click();
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(1);
  await expect.poll(() => requests).toBe(1);
  await page.reload();
  await expect(entry).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(requests).toBe(1);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("share");
  await entry.locator(`[data-media-select="${video.id}"]`).click();
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(1);
  await expect.poll(() => requests).toBe(2);
  await entry.locator("[data-media-close]").click();
  await page.goBack();
  await expect(page.locator("[data-media-room]")).toHaveAttribute("data-media-selected", video.id);
  await expect(entry).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(requests).toBe(2);
});

test("a keyboard reader opens and closes the same local player with focus returning to its trigger", async ({ page }) => {
  await page.goto(`/media?type=video&q=${encodeURIComponent(video.title)}#collection`);
  const entry = card(page, video.id);
  const trigger = entry.locator(`[data-media-select="${video.id}"]`);
  await trigger.focus();
  await trigger.press("Enter");
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(1);
  const close = entry.locator("[data-media-close]");
  await close.focus();
  await close.press("Enter");
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("a missing publisher picture becomes a clean local fallback and remains playable", async ({ page }) => {
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 404, body: "Preview unavailable" }));
  await page.goto(`/media?type=video&q=${encodeURIComponent(video.title)}#collection`);
  const entry = card(page, video.id);
  await expect(entry.locator("[data-media-image-fallback]")).toHaveAttribute("data-media-image-fallback", "true");
  await expect(entry.locator("img")).toHaveCount(0);
  await entry.locator(`[data-media-select="${video.id}"]`).click();
  await expect(entry.locator("[data-media-youtube]")).toHaveCount(1);
  await expect(page.locator("[data-media-youtube]")).toHaveCount(1);
});

test("an expanded inline player reflows and remains accessible on a narrow screen with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/media?type=video&q=${encodeURIComponent(video.title)}#collection`);
  const entry = card(page, video.id);
  await entry.locator(`[data-media-select="${video.id}"]`).click();
  await page.addStyleTag({ content: "html{font-size:200%!important}body{font-size:32px!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const frame = await entry.locator("[data-media-youtube]").boundingBox();
  expect(frame!.width).toBeLessThanOrEqual(320);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await axe.run(document.querySelector("[data-media-room]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
});
