import { test, expect } from "@playwright/test";
import path from "node:path";
import { jetsPlays } from "../src/lib/jets-playbook";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>' }));
});

test("Film Room is a focus page: what it is, one moment per play, then the tools", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/film-room");
  await expect(page.locator("#top")).toHaveCount(0);
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  expect(ids).toEqual(["reel", ...jetsPlays.map((play) => `play-${play.id}`), "tools", "more"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Big Jets plays, drawn out.");
  await expect(page.locator("#reel li a")).toHaveCount(jetsPlays.length);
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveCount(ids.length);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/film-room");
  for (const play of jetsPlays) {
    await expect(page.locator(`#play-${play.id} h2`)).toContainText(play.title.split(":")[0]);
    await expect(page.locator(`#play-${play.id} figcaption`)).toContainText(play.summary.split(". ")[0]);
  }
});

test("a play runs in place, then opens on the chalkboard, again on a second request", async ({ page }) => {
  const play = jetsPlays.at(-1)!;
  await page.goto(`/film-room#play-${play.id}`);
  const index = page.getByRole("navigation", { name: "On this page" });
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", `#play-${play.id}`);
  const moment = page.locator(`#play-${play.id}`);
  await moment.getByRole("button", { name: "Play it", exact: true }).click();
  await expect(moment.locator("[data-focus-field]")).toHaveAttribute("data-time", "6.0");
  const open = moment.getByRole("link", { name: /^Take it apart on the chalkboard/ });
  await open.click();
  await expect(page).toHaveURL(new RegExp(`#jets-play:${play.id}$`));
  await expect(page.locator("#jets-play-heading")).toHaveText(play.title);
  await expect(page.locator("#jets-play-stage")).toBeInViewport();
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", "#tools");
  await moment.scrollIntoViewIfNeeded();
  await open.click();
  await expect(page.locator("#jets-play-stage")).toBeInViewport();
});

test("arrow keys scroll inside the tall tools moment; j and k move between moments", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/film-room#tools");
  const index = page.getByRole("navigation", { name: "On this page" });
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", "#tools");
  await page.locator("#tools-heading").click();
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", "#tools");
  await page.keyboard.press("j");
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", "#more");
  await page.keyboard.press("k");
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", "#tools");
});

for (const width of [1280, 390, 320]) {
  test(`Film Room passes automated accessibility and reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/film-room");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Film Room reflows at 320px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/film-room");
  await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
