import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { mediaCollection } from "../src/lib/media-catalog";
import { mediaImage } from "../src/lib/media";

const items = mediaCollection.items;
const visibleCount = (rows: typeof items) => ["video", "post", "article", "audio"].reduce((count, kind) => count + Math.min(8, rows.filter((item) => item.kind === kind).length), 0);
const posts = items.filter((item) => item.kind === "post");
const firstPost = posts[0];
const secondPost = posts[1];
const thirdPost = posts[2];
const video = items.find((item) => item.youtubeId && item.embedAllowed === true);
const restrictedVideo = items.find((item) => item.youtubeId && item.embedAllowed === false);
const season2010 = items.filter((item) => item.seasons?.includes(2010));
const playoffArticle = season2010.find((item) => item.kind === "article")!;
const retrospective = items.find((item) => item.id === "pff-jets-2025-season-review")!;
const room = (page: Page) => page.locator("[data-media-room]");
const itemSelector = (id: string) => `[data-media-select="${id}"]`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "application/javascript", body: `window.YT={Player:function(iframe,options){var player=this;this.destroy=function(){iframe.remove();};setTimeout(function(){options.events.onReady({target:player});},0);}};window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady();` }));
  await page.route("https://platform.twitter.com/widgets.js", (route) => route.fulfill({ contentType: "application/javascript", body: `window.twttr={widgets:{createTweet:function(id,target){var node=document.createElement('blockquote');node.textContent='Publisher post '+id;node.dataset.mockTweet=id;target.appendChild(node);return Promise.resolve(node);}}};` }));
});

test("the entry view starts with stories and keeps extra filters, provider notes and source bars optional", async ({ page }) => {
  await page.goto("/media");
  const media = room(page);
  await expect(media.locator("[data-media-card]")).toHaveCount(visibleCount(items));
  await expect(media.getByLabel("Search Jets media")).toBeVisible();
  await expect(media.getByRole("group", { name: "Coverage format" })).toBeVisible();
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  await expect(media.locator("[data-media-source]")).toBeHidden();
  await expect(media.locator("[data-media-season]")).toBeHidden();
  await expect(media.getByRole("group", { name: "Coverage topics" })).toBeHidden();
  await expect(media.locator("[data-media-coverage]")).toBeHidden();
  await expect(media.locator("[data-media-source-ledger] > ul")).toBeHidden();
  const more = media.locator("[data-media-more-filters] > summary");
  await more.focus();
  await more.press("Enter");
  await expect(media.locator("[data-media-source]")).toBeVisible();
  await expect(media.locator("[data-media-season]")).toBeVisible();
  await more.press("Space");
  await expect(media.locator("[data-media-source]")).toBeHidden();
});

test("more stories remain searchable and a reloaded deep link returns to its own card", async ({ page }) => {
  const articles = items.filter((item) => item.kind === "article").sort((a, b) => Number(a.context === "archive") - Number(b.context === "archive") || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id));
  test.skip(articles.length <= 8, "This edition has no additional articles.");
  const deep = articles[8];
  await page.goto("/media?type=article#collection");
  const media = room(page);
  await expect(media.locator("[data-media-card]")).toHaveCount(8);
  await media.locator('[data-media-more="article"]').click();
  await expect(media.locator("[data-media-card]")).toHaveCount(Math.min(16, articles.length));
  await media.locator(itemSelector(deep.id)).click();
  await page.reload();
  await expect(media.locator(`[data-media-card="${deep.id}"] [data-media-context]`)).toContainText(deep.title);
  await media.locator("[data-media-back-results]").click();
  await expect(media.locator(itemSelector(deep.id))).toBeVisible();
  await expect(media.locator(itemSelector(deep.id))).toBeFocused();
  await expect(media.locator(itemSelector(deep.id))).toBeInViewport();
  await media.getByLabel("Search Jets media").fill("no-matching-story-zzzz");
  await expect(media.locator("[data-media-card]")).toHaveCount(0);
  await media.getByLabel("Search Jets media").fill("");
  await expect(media.locator("[data-media-card]")).toHaveCount(Math.min(16, articles.length));
});

test("the automatic source directory exposes real checks alongside the dated archive", async ({ page }) => {
  await page.goto("/media#collection");
  const media = room(page);
  await media.locator("[data-media-source-ledger] > summary").click();
  await expect(media.locator("[data-media-feed-status] li")).toHaveCount(mediaCollection.sources!.length);
  await expect(media.locator("[data-media-source-ledger]")).toContainText("Publisher feeds refresh automatically");
  await expect(media.locator("[data-media-source-ledger]")).toContainText("Archive selections reviewed");
  expect(items.some((item) => item.id.startsWith("auto-") && item.kind === "article")).toBe(true);
  expect(items.some((item) => item.id.startsWith("auto-") && item.kind === "audio")).toBe(true);
  expect(items.some((item) => item.id.startsWith("auto-") && item.youtubeId)).toBe(true);
});

test("formats keep their own sections, current coverage leads, and cards distinguish verified art from title cards", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/media");
  const media = room(page);
  for (const kind of ["video", "article", "audio"]) {
    const more = media.locator(`[data-media-more="${kind}"]`);
    while (await more.count()) await more.click();
  }
  const groups = media.locator("[data-media-group]");
  expect(await groups.evaluateAll((sections) => sections.map((section) => section.getAttribute("data-media-group")))).toEqual(["video", "post", "article", "audio"]);
  for (const kind of ["video", "post", "article", "audio"] as const) {
    const ids = await media.locator(`[data-media-group="${kind}"] [data-media-card]`).evaluateAll((cards) => cards.map((card) => card.getAttribute("data-media-card")!));
    const listed = ids.map((id) => items.find((item) => item.id === id)!);
    expect(listed.every((item) => item.kind === kind)).toBe(true);
    expect(listed).toHaveLength(items.filter((item) => item.kind === kind).length);
    const firstArchive = listed.findIndex((item) => item.context === "archive");
    if (firstArchive >= 0) expect(listed.slice(firstArchive).every((item) => item.context === "archive"), kind).toBe(true);
    const current = listed.filter((item) => item.context === "current").map((item) => item.publishedAt ?? "");
    expect(current, kind).toEqual([...current].sort().reverse());
  }
  const pictured = items.filter((item) => { const image = mediaImage(item); return item.kind !== "post" && image && image.width >= 600 && image.height >= 300; });
  await expect(media.locator("[data-media-card] [data-media-thumbnail] img:not([data-media-title-card])")).toHaveCount(pictured.length);
  await expect(media.locator("[data-media-card] [data-media-title-card]")).toHaveCount(items.filter((item) => item.kind !== "post").length - pictured.length);
  await expect(media.locator('[data-media-card="espn-2010-divisional-rapid-reaction"] [data-media-title-card]')).toHaveCount(1);
  const tallest = Math.max(...await media.locator("[data-media-card]").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height)));
  expect(tallest).toBeLessThan(340);
  const nativeVideo = items.find((item) => item.kind === "video" && item.outletId === "sny" && !item.youtubeId && item.image)!;
  await media.locator(itemSelector(nativeVideo.id)).click();
  const local = media.locator(`[data-media-card="${nativeVideo.id}"]`);
  await expect(local.locator("[data-media-viewer]")).toHaveCount(1);
  await expect(local.locator("[data-media-context]")).toContainText(nativeVideo.title);
  await expect(page.locator("#media-selected-coverage")).toHaveCount(0);
  await media.locator(itemSelector(firstPost.id)).click();
  await expect(media.locator(`[data-media-card="${firstPost.id}"] [data-media-context]`)).toContainText(firstPost.author);
});

test("closing an inline selection keeps its card in place without clearing filters or comparison", async ({ page }) => {
  await page.goto("/media?keep=place&type=post&season=2026#media-room");
  const media = room(page);
  await media.locator(`[data-media-card-compare="${firstPost.id}"]`).click();
  await media.locator(`[data-media-card-compare="${secondPost.id}"]`).click();
  await expect(media.locator("[data-media-compared]")).toHaveCount(2);
  const origin = media.locator(itemSelector(secondPost.id));
  await origin.scrollIntoViewIfNeeded();
  const before = (await origin.boundingBox())!;
  await origin.click();
  await expect(media.locator("[data-media-viewer]")).toBeVisible();
  await expect(media.locator("[data-media-embed-guide] p")).toBeHidden();
  await media.locator("[data-media-back-results]").click();
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  await expect(origin).toBeFocused();
  expect(Math.abs((await origin.boundingBox())!.y - before.y)).toBeLessThanOrEqual(2);
  await expect(media.locator("[data-media-compared]")).toHaveCount(2);
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ keep: "place", type: "post", season: "2026" });
  expect(new URL(page.url()).hash).toBe("#media-room");
});

test("following a story topic transfers keyboard focus to its filtered results and preserves the browsing context", async ({ page }) => {
  const topic = firstPost.topics[0];
  await page.goto(`/media?keep=topic&type=post&season=2026&media=${firstPost.id}#media-room`);
  const media = room(page);
  await media.locator(`[data-media-compare="${firstPost.id}"]`).click();
  const context = media.locator("[data-media-context]");
  await context.getByText("Related topics", { exact: true }).click();
  const control = context.getByRole("button", { name: topic, exact: true });
  await control.focus();
  await control.press("Enter");
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  const heading = page.locator("#media-results-heading");
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(heading).toHaveText(topic);
  await expect(media.locator("[data-media-card]")).toHaveCount(posts.filter((item) => item.seasons?.includes(2026) && item.topics.includes(topic)).length);
  await expect(media.locator("[data-media-compared]")).toHaveCount(1);
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ keep: "topic", type: "post", season: "2026", topic });
  expect(new URL(page.url()).hash).toBe("#media-room");
});

test("football seasons follow the source content through selection, Back and reload", async ({ page }) => {
  await page.goto("/media?keep=football&season=2010#media-room");
  const media = room(page);
  await expect(media.locator("[data-media-season]")).toHaveValue("2010");
  await expect(media.locator("[data-media-card]")).toHaveCount(season2010.length);
  await media.locator(itemSelector(playoffArticle.id)).click();
  await expect(media).toHaveAttribute("data-media-selected", playoffArticle.id);
  await expect(media.locator("[data-media-context]")).toContainText("Football season: 2010");
  // The January 2011 report is explicitly part of the 2010 football season.
  expect(new Date(playoffArticle.publishedAt!).getUTCFullYear()).toBe(2011);
  await expect(media.locator("[data-media-context] time")).toHaveAttribute("datetime", playoffArticle.publishedAt!);
  await expect(media.locator("[data-media-context] time")).toHaveText("Jan 16, 2011 ET");
  await media.locator("[data-media-more-filters] > summary").click();
  await media.locator("[data-media-season]").selectOption("2025");
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  await media.locator(itemSelector(retrospective.id)).click();
  await expect(media).toHaveAttribute("data-media-selected", retrospective.id);
  await expect(media.locator("[data-media-card]")).toHaveCount(items.filter((item) => item.seasons?.includes(2025)).length);
  await expect(media.locator("[data-media-context]")).toContainText("Football season: 2025");
  expect(new Date(retrospective.publishedAt!).getUTCFullYear()).toBe(2026);
  await page.goBack();
  await expect(media.locator("[data-media-season]")).toHaveValue("2025");
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  await page.goBack();
  await expect(media).toHaveAttribute("data-media-selected", playoffArticle.id);
  await expect(media.locator("[data-media-season]")).toHaveValue("2010");
  await page.reload();
  await expect(media).toHaveAttribute("data-media-selected", playoffArticle.id);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("football");
  expect(new URL(page.url()).hash).toBe("#media-room");
});

test("format, source, topic and search filters show an honest empty state and reset only media parameters", async ({ page }) => {
  await page.goto("/media?keep=research#media-room");
  const media = room(page);
  await expect(media).toHaveAttribute("data-media-selected", "");
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  await expect(media.locator("[data-media-card]")).toHaveCount(visibleCount(items));
  await media.locator('[data-media-type="post"]').click();
  await expect(media.locator("[data-media-card]")).toHaveCount(posts.length);
  await media.locator("[data-media-more-filters] > summary").click();
  await media.locator("[data-media-source]").selectOption(firstPost.outletId);
  const bySource = posts.filter((item) => item.outletId === firstPost.outletId);
  await expect(media.locator("[data-media-card]")).toHaveCount(visibleCount(bySource));
  const topic = firstPost.topics[0];
  await media.locator(`[data-media-topic="${topic}"]`).click();
  await expect(media.locator("[data-media-card]")).toHaveCount(bySource.filter((item) => item.topics.includes(topic)).length);
  await media.locator("[data-media-search]").fill("this-search-has-no-coverage-58279");
  await expect(media.locator("[data-media-empty]")).toBeVisible();
  await expect(media.locator("[data-media-card]")).toHaveCount(0);
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  await expect(media.locator("[data-media-results]")).toHaveText("0 items match your filters");
  await page.reload();
  await expect(media.locator("[data-media-empty]")).toBeVisible();
  await media.locator("[data-media-reset]").click();
  await expect(media.locator("[data-media-card]")).toHaveCount(visibleCount(items));
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ keep: "research" });
  expect(new URL(page.url()).hash).toBe("#media-room");
  await media.locator("[data-media-search]").fill(firstPost.author);
  await expect(media.locator("[data-media-card]")).toHaveCount(items.filter((item) => `${item.title} ${item.summary} ${item.author} ${mediaCollection.outlets.find((outlet) => outlet.id === item.outletId)?.name ?? ""} ${item.topics.join(" ")}`.toLocaleLowerCase().includes(firstPost.author.toLocaleLowerCase())).length);
});

test("an unavailable football season stays empty instead of silently opening the current collection", async ({ page }) => {
  await page.goto("/media?keep=history&season=1979#media-room");
  const media = room(page);
  await expect(media.locator("[data-media-season]")).toHaveValue("1979");
  await expect(media.locator("[data-media-empty]")).toContainText("1979 football season");
  await expect(media.locator("[data-media-card]")).toHaveCount(0);
  await expect(media).toHaveAttribute("data-media-selected", "");
  await media.getByRole("button", { name: /Reset the collection/ }).click();
  await expect(media.locator("[data-media-card]")).toHaveCount(visibleCount(items));
  expect(new URL(page.url()).searchParams.get("keep")).toBe("history");
  expect(new URL(page.url()).searchParams.has("season")).toBe(false);
});

test("coverage bars count actual filtered items and provide keyboard outlet exploration", async ({ page }) => {
  await page.goto("/media?type=post");
  const media = room(page);
  for (const outlet of mediaCollection.outlets) {
    const count = posts.filter((item) => item.outletId === outlet.id).length;
    const bar = media.locator(`[data-media-coverage-source="${outlet.id}"]`);
    if (count) await expect(bar.locator("strong")).toHaveText(String(count));
    else await expect(bar).toHaveCount(0);
  }
  await expect(media.locator("[data-media-coverage]")).toBeHidden();
  const disclosure = media.locator("[data-media-source-bars] > summary");
  await disclosure.focus();
  await disclosure.press("Enter");
  const bar = media.locator(`[data-media-coverage-source="${firstPost.outletId}"]`);
  await bar.focus();
  await bar.press("Enter");
  await expect(media.locator("[data-media-source]")).toHaveValue(firstPost.outletId);
  await expect(media.locator("[data-media-card]")).toHaveCount(posts.filter((item) => item.outletId === firstPost.outletId).length);
  await expect(media.locator("[data-media-coverage]")).toContainText("do not measure audience");
});

test("comparison holds two original sources, prevents a third and recovers after removal", async ({ page }) => {
  await page.goto(`/media?media=${firstPost.id}`);
  const media = room(page);
  await media.locator(`[data-media-compare="${firstPost.id}"]`).click();
  await expect(media.locator("[data-media-compared]")).toHaveCount(1);
  await media.locator(itemSelector(secondPost.id)).click();
  await media.locator(`[data-media-compare="${secondPost.id}"]`).click();
  await expect(media.locator("[data-media-compared]")).toHaveCount(2);
  await media.locator(itemSelector(thirdPost.id)).click();
  await expect(media.locator(`[data-media-compare="${thirdPost.id}"]`)).toBeDisabled();
  await expect(media.locator(`[data-media-card-compare="${thirdPost.id}"]`)).toBeDisabled();
  const originals = media.locator("[data-media-compared] a");
  await expect(originals).toHaveCount(2);
  expect(await originals.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))).toEqual([firstPost.url, secondPost.url]);
  await expect(media.locator("[data-media-comparison]")).toContainText("not proof that the reporting agrees");
  await media.locator(`[data-media-compared="${firstPost.id}"]`).getByRole("button", { name: /^Remove / }).click();
  await expect(media.locator("[data-media-compared]")).toHaveCount(1);
  await expect(media.locator(`[data-media-compare="${thirdPost.id}"]`)).toBeEnabled();
  await media.locator(`[data-media-compare="${thirdPost.id}"]`).click();
  await expect(media.locator("[data-media-compared]")).toHaveCount(2);
  await media.getByRole("button", { name: /Clear comparison/ }).click();
  await expect(media.locator("[data-media-comparison]")).toHaveCount(0);
});

test("the original X SDK loads on request and replaces its exact post locally after a new selection", async ({ page }) => {
  let requests = 0;
  await page.route("https://platform.twitter.com/widgets.js", (route) => {
    requests += 1;
    return route.fulfill({ contentType: "application/javascript", body: `window.twttr={widgets:{createTweet:function(id,target,options){var node=document.createElement('blockquote');node.textContent='Mock publisher post '+id;node.dataset.mockTweet=id;node.dataset.dnt=String(options.dnt);target.appendChild(node);return Promise.resolve(node);}}};` });
  });
  await page.goto(`/media?media=${firstPost.id}`);
  const media = room(page);
  await expect(media.locator(`[data-inline-media="${firstPost.id}"]`)).toHaveAttribute("data-inline-open", "true");
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
  await expect(media.locator("[data-media-x-status]")).toHaveCount(0);
  expect(requests).toBe(0);
  await media.locator(`[data-media-load="${firstPost.id}"]`).click();
  await expect(media.locator("[data-media-x-status]")).toHaveAttribute("data-media-x-status", "ready");
  await expect(media.locator(`[data-mock-tweet="${firstPost.tweetId}"]`)).toHaveAttribute("data-dnt", "true");
  expect(requests).toBe(1);
  await expect(media.locator(`[data-inline-media="${firstPost.id}"] [data-media-embed-guide] a`)).toHaveAttribute("href", firstPost.url);
  await media.locator(itemSelector(secondPost.id)).click();
  await expect(media.locator("[data-media-viewer]")).toHaveAttribute("data-embed-requested", "true");
  await expect(media.locator(`[data-mock-tweet="${firstPost.tweetId}"]`)).toHaveCount(0);
  await expect(media.locator(`[data-mock-tweet="${secondPost.tweetId}"]`)).toBeVisible();
  expect(requests).toBe(1);
  await media.locator("[data-media-close]").click();
  await expect(media.locator("[data-media-x-status]")).toHaveCount(0);
});

test("X SDK failure leaves the original source usable and does not fabricate post content", async ({ page }) => {
  await page.route("https://platform.twitter.com/widgets.js", (route) => route.abort("failed"));
  await page.goto(`/media?media=${firstPost.id}`);
  const media = room(page);
  await media.locator(`[data-media-load="${firstPost.id}"]`).click();
  await expect(media.locator("[data-media-x-status]")).toHaveAttribute("data-media-x-status", "failed");
  await expect(media.locator("[data-media-x-status]")).toContainText(/original|publisher|source/i);
  await expect(media.locator(`[data-inline-media="${firstPost.id}"] [data-media-embed-guide] a`)).toHaveAttribute("href", firstPost.url);
  await expect(media.locator("[data-media-viewer] iframe")).toHaveCount(0);
});

test("a hanging X renderer times out with a bounded source fallback", async ({ page }) => {
  await page.route("https://platform.twitter.com/widgets.js", (route) => route.fulfill({ contentType: "application/javascript", body: `window.mediaXPending=false;window.twttr={widgets:{createTweet:function(){window.mediaXPending=true;return new Promise(function(){});}}};` }));
  await page.goto(`/media?media=${firstPost.id}`);
  const media = room(page);
  await page.clock.install();
  await media.locator(`[data-media-load="${firstPost.id}"]`).click();
  await expect(media.locator("[data-media-x-status]")).toHaveAttribute("data-media-x-status", "loading");
  await expect.poll(() => page.evaluate(() => (window as unknown as { mediaXPending?: boolean }).mediaXPending)).toBe(true);
  await page.clock.runFor(16001);
  await expect(media.locator("[data-media-x-status]")).toHaveAttribute("data-media-x-status", "failed");
  await expect(media.locator(`[data-inline-media="${firstPost.id}"] [data-media-embed-guide] a`)).toHaveAttribute("href", firstPost.url);
});

test("a late X result cannot attach to another selected source", async ({ page }) => {
  await page.route("https://platform.twitter.com/widgets.js", (route) => route.fulfill({ contentType: "application/javascript", body: `window.mediaXHarness={pending:false,complete:function(){}};window.twttr={widgets:{createTweet:function(id,target){if(window.mediaXHarness.pending){var post=document.createElement('blockquote');post.textContent='Current publisher post '+id;target.appendChild(post);return Promise.resolve(post);}return new Promise(function(resolve){window.mediaXHarness.pending=true;window.mediaXHarness.complete=function(){var node=document.createElement('blockquote');node.dataset.lateTweet=id;target.appendChild(node);resolve(node);};});}}};` }));
  await page.goto(`/media?media=${firstPost.id}`);
  const media = room(page);
  await media.locator(`[data-media-load="${firstPost.id}"]`).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { mediaXHarness?: { pending?: boolean } }).mediaXHarness?.pending)).toBe(true);
  await media.locator(itemSelector(secondPost.id)).click();
  await expect(media).toHaveAttribute("data-media-selected", secondPost.id);
  await page.evaluate(() => (window as unknown as { mediaXHarness: { complete: () => void } }).mediaXHarness.complete());
  await expect(media.locator("[data-late-tweet]")).toHaveCount(0);
  await expect(media.locator("[data-media-x-status]")).toHaveAttribute("data-media-x-status", "ready");
  await expect(media.locator("[data-media-viewer]")).toHaveAttribute("data-embed-requested", "true");
});

test("permitted YouTube playback uses the privacy domain and starts only after reader action", async ({ page }) => {
  test.skip(!video, "No source in this catalog has verified embedding permission yet.");
  let requests = 0;
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => {
    requests += 1;
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><p>Mock publisher player</p></body></html>" });
  });
  await page.goto(`/media?media=${video!.id}`);
  const media = room(page);
  await expect(media.locator("[data-media-viewer] iframe")).toHaveCount(0);
  expect(requests).toBe(0);
  await media.locator(`[data-media-load="${video!.id}"]`).click();
  const frame = media.locator("[data-media-youtube]");
  await expect(frame).toHaveAttribute("title", new RegExp(video!.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const src = new URL((await frame.getAttribute("src"))!);
  expect(src.hostname).toBe("www.youtube-nocookie.com");
  expect(src.pathname).toBe(`/embed/${video!.youtubeId}`);
  expect(src.searchParams.get("autoplay")).toBe("1");
  await expect.poll(() => requests).toBe(1);
  await expect(frame).toHaveAttribute("allowfullscreen", "");
  await media.locator("[data-media-close]").click();
  await expect(frame).toHaveCount(0);
  await expect(media.locator("[data-media-viewer]")).toHaveCount(0);
});

test("source-restricted clips keep their publisher link without offering an unsupported player", async ({ page }) => {
  test.skip(!restrictedVideo, "Every catalog video is permitted to embed.");
  await page.goto(`/media?media=${restrictedVideo!.id}`);
  const media = room(page);
  await expect(media.locator(`[data-inline-media="${restrictedVideo!.id}"]`)).toHaveAttribute("data-inline-open", "true");
  await media.locator(itemSelector(restrictedVideo!.id)).click();
  await expect(media.locator("[data-media-viewer] iframe")).toHaveCount(0);
  await expect(media.locator(`[data-inline-media="${restrictedVideo!.id}"] [data-media-embed-guide] a`)).toHaveAttribute("href", restrictedVideo!.url);
  const guide = media.locator("[data-media-embed-guide]");
  await expect(guide.locator("p")).toBeHidden();
  await guide.locator("summary").click();
  await expect(guide.locator("p")).toContainText(/unavailable|publisher|source|restricted/i);
});

for (const fails of [false, true]) {
  test(`clipboard ${fails ? "fallback" : "success"} preserves season/filter links and ignores late feedback after Back`, async ({ page }) => {
    await page.addInitScript(({ fails }) => {
      const harness = { value: "", delayed: true, complete: () => {} };
      Object.assign(window, { mediaClipboard: harness });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (value: string) => {
        harness.value = value;
        if (!harness.delayed) return fails ? Promise.reject(new Error("Unavailable")) : Promise.resolve();
        return new Promise<void>((resolve, reject) => { harness.complete = () => fails ? reject(new Error("Unavailable")) : resolve(); });
      } } });
    }, { fails });
    await page.goto(`/media?keep=share&media=${firstPost.id}&season=2026&type=post#media-room`);
    const media = room(page);
    await media.locator("[data-media-share]").click();
    await media.locator(itemSelector(secondPost.id)).click();
    await page.goBack();
    await expect(media).toHaveAttribute("data-media-selected", firstPost.id);
    await page.evaluate(() => (window as unknown as { mediaClipboard: { complete: () => void } }).mediaClipboard.complete());
    await expect(media.getByLabel("Selection link", { exact: true })).toHaveCount(0);
    await expect(media.locator("[data-media-context] [role=status]")).toHaveCount(0);
    await page.evaluate(() => { (window as unknown as { mediaClipboard: { delayed: boolean } }).mediaClipboard.delayed = false; });
    await media.locator("[data-media-share]").click();
    await expect(media.locator("[data-media-context] [role=status]")).toHaveText(fails ? "Copy this link to share your selection." : "Link copied. Your selection and filters are included.");
    const value = await page.evaluate(() => (window as unknown as { mediaClipboard: { value: string } }).mediaClipboard.value);
    const shared = new URL(value);
    expect(Object.fromEntries(shared.searchParams)).toEqual({ keep: "share", media: firstPost.id, season: "2026", type: "post" });
    expect(shared.hash).toBe("#media-room");
    if (fails) {
      const input = media.getByLabel("Selection link", { exact: true });
      await expect(input).toHaveValue(value);
      await input.focus();
      expect(await input.evaluate((element) => (element as HTMLInputElement).selectionEnd! - (element as HTMLInputElement).selectionStart!)).toBe(value.length);
    }
  });
}

test("the collection reflows at 320px and 200% text with usable targets and accessible expanded controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/media?media=${firstPost.id}`);
  const media = room(page);
  await media.locator(`[data-media-compare="${firstPost.id}"]`).click();
  await media.locator(`[data-media-card-compare="${secondPost.id}"]`).click();
  await media.locator("[data-media-source-ledger] summary").click();
  await media.locator("[data-media-more-filters] > summary").click();
  await media.locator("[data-media-source-bars] > summary").click();
  await media.locator("[data-media-embed-guide] > summary").click();

  for (const scale of [100, 200]) {
    await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale}%`; }, scale);
    const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(width.content, `${scale}% text`).toBeLessThanOrEqual(width.viewport + 1);
    // Measured in one pass in the page: one round trip per target outgrows the timeout as the catalog grows.
    const small = await media.evaluate((room) => [...room.querySelectorAll<HTMLElement>("button, input, select, summary, a")]
      .filter((target) => target.checkVisibility())
      .map((target) => ({ text: target.textContent?.trim().slice(0, 60), ...target.getBoundingClientRect().toJSON() }))
      .filter((rect) => rect.height < 44 || rect.width < 44)
      .map((rect) => `${rect.text} ${Math.round(rect.width)}×${Math.round(rect.height)}`));
    expect(small, `${scale}% text`).toEqual([]);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run(document.querySelector("[data-media-room]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});
