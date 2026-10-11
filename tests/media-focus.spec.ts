import { test, expect } from "@playwright/test";
import path from "node:path";
import { mediaCollection } from "../src/lib/media-catalog";
import { mediaPlayback } from "../src/lib/media-playback";

const newest = [...mediaCollection.items].filter((item) => item.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
const video = newest.find((item) => item.kind === "video" && mediaPlayback(item)) ?? newest.find((item) => item.kind === "video");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>' }));
});

test("Media is a focus page: what it is, the newest story of each format, then the collection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/media");
  await expect(page.locator("#top")).toHaveCount(0);
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  expect(ids[0]).toBe("about");
  expect(ids.slice(-2)).toEqual(["collection", "more"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Media Room");
  await expect(page.locator("#about")).toContainText(`${mediaCollection.items.length} stories`);
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveCount(ids.length);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/media");
  if (video) await expect(page.locator("#watch h2")).toHaveText(video.title);
  await expect(page.locator("#posts img")).toHaveCount(0);
  await expect(page.locator("#collection [data-media-room]")).toBeVisible();
});

test("a story plays in its opening moment and a format filters the collection", async ({ page }) => {
  test.skip(!video, "This edition has no video.");
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Publisher player</p>" }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "application/javascript", body: "window.YT={Player:function(frame,o){this.destroy=function(){frame.remove();};o.events.onReady({target:this});}};window.onYouTubeIframeAPIReady();" }));
  await page.goto("/media#watch");
  const moment = page.locator("#watch");
  await moment.locator("[data-media-open]").click();
  await expect(moment.locator("[data-media-viewer]")).toBeVisible();
  await expect(moment.locator("[data-media-close]")).toBeFocused();
  expect(new URL(page.url()).search).toBe("");
  await moment.getByRole("link", { name: /^Every video/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("type")).toBe("video");
  await expect(page.locator("[data-media-results]")).toContainText(`${mediaCollection.items.filter((item) => item.kind === "video").length} items`);
  await page.goBack();
  await expect(moment.locator("[data-media-youtube]")).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`Media uses compact story headings and content-height sections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/media");
    await page.evaluate(() => document.fonts.ready);
    expect((await page.locator("#about").boundingBox())!.height).toBeLessThan(240);
    expect((await page.locator("#watch > h2").boundingBox())!.y).toBeLessThan(340);
    const post = page.locator("#posts");
    const box = await post.boundingBox();
    expect(box!.height).toBeLessThan(750);
    const font = await page.locator("#watch > h2").evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize));
    expect(font).toBeLessThanOrEqual(width >= 1024 ? 42 : 34);
    const snap = await page.locator("html").evaluate((root) => getComputedStyle(root).scrollSnapType);
    expect(snap).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Media's compact presentation does not change the landing page focus layout", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/media");
  const mediaHeading = await page.locator("#watch > h2").evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize));
  await page.goto("/");
  const landingHeading = await page.locator("#media > h2").evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize));
  expect(landingHeading).toBeGreaterThan(mediaHeading);
  expect((await page.locator("#media").boundingBox())!.height).toBeGreaterThanOrEqual(1000);
});

test("page navigation shortcuts leave a focused inline media control at its own location", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Publisher player</p>" }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "application/javascript", body: "window.YT={Player:function(frame,o){this.destroy=function(){frame.remove();};o.events.onReady({target:this});}};window.onYouTubeIframeAPIReady();" }));
  await page.goto("/media#watch");
  const moment = page.locator("#watch");
  const trigger = moment.locator("[data-media-open]");
  await trigger.focus();
  const before = await page.evaluate(() => window.scrollY);
  await trigger.press("j");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await trigger.press("Enter");
  const close = moment.locator("[data-media-close]");
  await expect(close).toBeFocused();
  const playingAt = await page.evaluate(() => window.scrollY);
  await close.press("k");
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(playingAt);
  await expect(moment.locator("[data-media-viewer]")).toHaveCount(1);
});

for (const width of [1280, 390, 320]) {
  test(`Media passes automated accessibility and reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/media");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Phones show progress dashes; they keep their width until the bar runs out of room.
    if (width < 1024) expect((await page.locator("header [aria-hidden=true] i").first().boundingBox())!.width).toBeGreaterThanOrEqual(width >= 390 ? 13 : 3);
  });
}

test("Media reflows at 320px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/media");
  await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
