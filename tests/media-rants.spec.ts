import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { mediaCollection } from "../src/lib/media-catalog";
import { isJetsRant } from "../src/lib/media-topics.mjs";

const caller = "rant-don-caller-2018";
const benigno = "rant-joe-benigno-2023";
const rantCard = (page: Page, id: string) => page.locator(`[data-rant-card="${id}"]`);
const freshRants = mediaCollection.items.filter((item) => item.id.startsWith("auto-") && ["video", "audio"].includes(item.kind) && isJetsRant(item.title))
  .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id)).slice(0, 8);
const freshAudio = freshRants.find((item) => item.kind === "audio" && new URL(item.url).hostname === "podcasts.apple.com");
const youtubeSdk = `window.YT={Player:function(frame,options){var player=this;this.destroy=function(){window.rantPlayersDestroyed=(window.rantPlayersDestroyed||0)+1;frame.remove();};setTimeout(function(){options.events.onReady({target:player});},0);}};window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady();`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>',
  }));
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><html><body>Original publisher player</body></html>",
  }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({
    contentType: "application/javascript", body: youtubeSdk,
  }));
  await page.route("https://embed.podcasts.apple.com/**", (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><html><body>Original publisher podcast player</body></html>",
  }));
});

test("the classic shelf retains older originals, their publishers, and upload dates", async ({ page }) => {
  await page.goto("/media/rants");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jets Rants");
  await expect(page.locator("#classics")).toContainText("The dates describe the uploads");
  const classics = page.locator("#classics [data-rant-card]");
  expect(await classics.count()).toBeGreaterThanOrEqual(5);
  for (const id of await classics.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-rant-card")))) {
    expect(id).not.toMatch(/^auto-/);
  }
  for (const voice of ["Don La Greca", "Joe Benigno", "Sal Licata", "Brandon Tierney", "Mike Francesa"]) {
    await expect(page.locator("#classics")).toContainText(voice);
  }
  await expect(rantCard(page, caller)).toContainText("Don La Greca · YES Network");
  await expect(rantCard(page, caller).getByText("Nov 2, 2018", { exact: true })).toBeVisible();
  const animated = rantCard(page, "rant-francesa-idzik-2014");
  await expect(animated.getByRole("heading", { level: 3 })).toContainText("2014");
  await expect(animated.getByText("Sep 13, 2018", { exact: true })).toBeVisible();
  await expect(animated).toContainText("animated treatment");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/media");
});

for (const width of [1280, 390]) {
  test(`the rant archive keeps a compact introduction and readable shelf at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/media/rants");
    await page.evaluate(() => document.fonts.ready);
    expect((await page.locator("#about").boundingBox())!.height).toBeLessThan(300);
    expect((await page.locator("#classics > h2").boundingBox())!.y).toBeLessThan(400);
    const headingSizes = await page.locator("#about > h1, #classics > h2, #fresh > h2, [data-rant-card] > h3")
      .evaluateAll((headings) => headings.map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)));
    expect(Math.max(...headingSizes)).toBeLessThanOrEqual(34);
    const first = (await rantCard(page, caller).boundingBox())!;
    const second = (await rantCard(page, benigno).boundingBox())!;
    if (width >= 960) {
      expect(Math.abs(second.y - first.y)).toBeLessThanOrEqual(1);
      expect(second.x).toBeGreaterThan(first.x + first.width);
    } else {
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    }
    expect(await page.locator("html").evaluate((root) => getComputedStyle(root).scrollSnapType)).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`a rant replaces its clicked picture with the original player without leaving or jumping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests: string[] = [];
    page.on("request", (request) => {
      if (["www.youtube.com", "www.youtube-nocookie.com"].includes(new URL(request.url()).hostname)) requests.push(request.url());
    });
    await page.goto("/media/rants#classics");
    const card = rantCard(page, caller);
    const trigger = card.locator("[data-media-open]");
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    expect(requests).toEqual([]);
    const picture = (await trigger.boundingBox())!;
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const urlBefore = page.url();
    await trigger.click();
    await expect(card.locator("[data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "ready");
    const player = card.locator("[data-media-youtube]");
    const box = (await player.boundingBox())!;
    expect(Math.abs(box.x - picture.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y - picture.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.width - picture.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore)).toBeLessThanOrEqual(2);
    expect(page.url()).toBe(urlBefore);
    expect(page.context().pages()).toHaveLength(1);
    await expect(card.locator("[data-media-open]")).toHaveCount(0);
    const destination = new URL((await player.getAttribute("src"))!);
    expect(destination.hostname).toBe("www.youtube-nocookie.com");
    expect(destination.pathname).toBe("/embed/lK7ah7u2L7s");
    expect(destination.searchParams.get("playsinline")).toBe("1");
    await card.locator("[data-media-embed-guide] summary").click();
    await expect(card.getByRole("link", { name: /Open original at YES Network/ }))
      .toHaveAttribute("href", "https://www.youtube.com/watch?v=lK7ah7u2L7s");
  });
}

test("fresh reactions show only new Jets rants and remain separate from the classic archive", async ({ page }) => {
  await page.goto("/media/rants");
  await expect(page.locator("#fresh > h2")).toHaveText("Fresh frustration");
  const cards = page.locator("#fresh [data-rant-card]");
  await expect(cards).toHaveCount(freshRants.length);
  expect(await cards.count()).toBeLessThanOrEqual(8);
  for (const card of await cards.all()) {
    expect(await card.getAttribute("data-rant-card")).toMatch(/^auto-/);
    await expect(card.getByRole("heading", { level: 3 })).toContainText(/\bjets\b|\bnyj\b/i);
  }
  await expect(page.locator("#fresh")).not.toContainText("Don LaGreca lets loose epic rant on TMKS caller");
  if (!freshRants.length) await expect(page.locator("#fresh")).toContainText("The next qualifying release will appear here after the feed check.");
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("a fresh audio rant loads its own publisher episode inside the clicked shelf card", async ({ page }) => {
  test.skip(!freshAudio, "This edition has no fresh Apple podcast rant.");
  let requests = 0;
  await page.route("https://embed.podcasts.apple.com/**", (route) => {
    requests += 1;
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Original publisher podcast player</body></html>" });
  });
  await page.goto("/media/rants#fresh");
  const card = rantCard(page, freshAudio!.id);
  const trigger = card.locator("[data-media-open]");
  await trigger.scrollIntoViewIfNeeded();
  const position = (await trigger.boundingBox())!;
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const urlBefore = page.url();
  expect(requests).toBe(0);
  await trigger.click();
  const player = card.locator("[data-media-apple]");
  await expect(player).toBeVisible();
  const destination = new URL((await player.getAttribute("src"))!);
  const original = new URL(freshAudio!.url);
  expect(destination.hostname).toBe("embed.podcasts.apple.com");
  expect(destination.pathname).toBe(original.pathname);
  expect(destination.searchParams.get("i")).toBe(original.searchParams.get("i"));
  expect(Math.abs((await player.boundingBox())!.y - position.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore)).toBeLessThanOrEqual(2);
  expect(page.url()).toBe(urlBefore);
  expect(page.context().pages()).toHaveLength(1);
  await expect.poll(() => requests).toBe(1);
});

test("starting another classic stops the previous player at its own card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/media/rants#classics");
  const first = rantCard(page, caller);
  const second = rantCard(page, benigno);
  await first.locator("[data-media-open]").click();
  await expect(first.locator("[data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "ready");
  await second.locator("[data-media-open]").click();
  await expect(second.locator("[data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "ready");
  await expect(first.locator("[data-media-youtube]")).toHaveCount(0);
  await expect(first.locator("[data-media-open]")).toBeVisible();
  await expect(page.locator("[data-media-youtube]")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { rantPlayersDestroyed?: number }).rantPlayersDestroyed ?? 0)).toBe(1);
  expect(new URL(page.url()).pathname).toBe("/media/rants");
  expect(page.context().pages()).toHaveLength(1);
});

test("keyboard playback and closing preserve focus and the reader's location", async ({ page }) => {
  await page.goto("/media/rants#classics");
  const card = rantCard(page, caller);
  const trigger = card.locator("[data-media-open]");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  const before = await page.evaluate(() => window.scrollY);
  await trigger.press("j");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await trigger.press("Enter");
  const close = card.locator("[data-media-close]");
  await expect(close).toBeFocused();
  await expect(card.locator("[data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "ready");
  await close.press("k");
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await close.press("Enter");
  await expect(card.locator("[data-media-youtube]")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThanOrEqual(2);
});

test("the rant archive reflows with enlarged text and accessible player controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/media/rants#classics");
  const card = rantCard(page, caller);
  await card.locator("[data-media-open]").click();
  await expect(card.locator("[data-media-youtube-status]")).toHaveAttribute("data-media-youtube-status", "ready");
  await page.addStyleTag({ content: "html{font-size:200%!important}body{font-size:32px!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await card.locator("[data-media-youtube]").boundingBox())!.width).toBeLessThanOrEqual(320);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
});
