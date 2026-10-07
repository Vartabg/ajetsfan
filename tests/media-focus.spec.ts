import { test, expect } from "@playwright/test";
import path from "node:path";
import { mediaImage } from "../src/lib/media";
import { mediaCollection } from "../src/lib/media-catalog";

const newest = [...mediaCollection.items].filter((item) => item.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || a.id.localeCompare(b.id));
const video = newest.find((item) => item.kind === "video" && mediaImage(item));

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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jets coverage, from the people who cover them.");
  await expect(page.locator("#about")).toContainText(`${mediaCollection.items.length} selected stories`);
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveCount(ids.length);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/media");
  if (video) await expect(page.locator("#watch h2")).toHaveText(video.title);
  await expect(page.locator("#posts img")).toHaveCount(0);
  await expect(page.locator("#collection [data-media-room]")).toBeVisible();
});

test("a story opens in the collection below, and a format filters it", async ({ page }) => {
  test.skip(!video, "This edition has no pictured video.");
  await page.goto("/media#watch");
  await page.locator("#watch").getByRole("link", { name: /^Open it here/ }).click();
  await expect(page.locator("#media-viewer-heading")).toHaveText(video!.title);
  await expect(page.locator("#media-viewer-heading")).toBeFocused();
  await expect(page.locator("#media-viewer-heading")).toBeInViewport();
  await page.locator("#watch").getByRole("link", { name: /^Every video/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("type")).toBe("video");
  await expect(page.locator("[data-media-results]")).toContainText(`${mediaCollection.items.filter((item) => item.kind === "video").length} items`);
  await page.goBack();
  await expect(page.locator("#media-viewer-heading")).toHaveText(video!.title);
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
