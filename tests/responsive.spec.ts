import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/lib/games";
import { archiveFilters, filterArchive, gameHref } from "../src/lib/explorer";
import { FOCUS_ROUTES, SECTIONS } from "../src/lib/site-sections";

const imageFixture = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>';
const routes = ["/", "/team", "/team/roster", "/team/stats", "/team/news", "/game-day", "/stories", "/history", "/morgue", "/how-made", "/seasons", "/seasons/2010", "/media"];
const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({
    status: 200, contentType: "image/svg+xml", body: imageFixture,
  }));
});

async function enlargeText(page: Page) {
  // Model browser text-only enlargement without changing the CSS viewport.
  await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
}

async function checkLayout(page: Page, route: string, enlarged = false) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  if (enlarged) await enlargeText(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("main")).toBeVisible();
  if (route === "/game-day") {
    await page.locator("summary").filter({ hasText: "See every unit number" }).click();
    await expect(page.getByText("The season in margins.", { exact: true })).toBeVisible();
  }
  const navigation = page.getByRole("navigation", { name: "Site sections" });
  const links = navigation.getByRole("link");
  if (FOCUS_ROUTES.includes(route)) {
    // Focus pages: the way in is the Menu (phones) or the moment index (wide screens).
    const entry = page.viewportSize()!.width >= 1024 ? page.getByRole("navigation", { name: "On this page" }) : page.getByRole("link", { name: "Menu", exact: true });
    await expect(entry).toBeVisible();
    await expect(links).toHaveCount(SECTIONS.length);
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect.soft(box!.height, `${route}: section link height`).toBeGreaterThanOrEqual(44);
      expect.soft(box!.x + box!.width, `${route}: section link stays inside the page`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  } else {
    await expect(links).toHaveCount(6);
    const boxes = [];
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect.soft(box!.width, `${route}: navigation hit width`).toBeGreaterThanOrEqual(44);
      expect.soft(box!.height, `${route}: navigation hit height`).toBeGreaterThanOrEqual(44);
      expect.soft(box!.x, `${route}: navigation remains within the left edge`).toBeGreaterThanOrEqual(0);
      expect.soft(box!.x + box!.width, `${route}: navigation remains within the right edge`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
      boxes.push(box!);
    }
    for (let index = 1; index < boxes.length; index += 1) {
      if (Math.abs(boxes[index].y - boxes[index - 1].y) < 1) expect.soft(boxes[index].x, `${route}: adjacent navigation targets do not overlap`).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].width - 1);
      else expect.soft(boxes[index].y, `${route}: navigation rows do not overlap`).toBeGreaterThanOrEqual(boxes[index - 1].y + boxes[index - 1].height - 1);
    }
  }
  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    outside: Array.from(document.querySelectorAll("main *, header *, footer *"))
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .sort((left, right) => right.getBoundingClientRect().right - left.getBoundingClientRect().right)
      .slice(0, 6).map((element) => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}px (${element.textContent?.trim().slice(0, 40)})`),
  }));
  expect.soft(geometry.documentWidth, `${route}: no page-wide horizontal overflow (${geometry.outside.join(", ")})`).toBeLessThanOrEqual(geometry.viewportWidth);
}

test("three-digit archive positions leave space before the date on narrow phones and with enlarged text", async ({ page }) => {
  const selected = filterArchive(games, "heartbreak", archiveFilters(new URLSearchParams()))[124];
  test.skip(!selected, "This archive has fewer than 125 ranked losses.");
  if (!selected) return;
  for (const view of [{ width: 320, enlarged: false }, { width: 390, enlarged: false }, { width: 320, enlarged: true }]) {
    await page.setViewportSize({ width: view.width, height: 1000 });
    await page.goto(gameHref(selected.id, "heartbreak"));
    if (view.enlarged) await enlargeText(page);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: "Back to results", exact: true }).click();
    const row = page.locator(`#archive-game-${selected.id}`);
    await expect(row).toBeFocused();
    const gap = await row.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element.firstElementChild!);
      return element.querySelector("time")!.getBoundingClientRect().left - range.getBoundingClientRect().right;
    });
    expect(gap, `Rank/date spacing at ${view.width}px${view.enlarged ? " with 200% text" : ""}`).toBeGreaterThanOrEqual(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const width of [641, 768, 900]) {
  test(`all public routes reflow through the tablet transition at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) await checkLayout(page, route);
  });
}

for (const width of [320, 390, 768]) {
  test(`all public routes preserve navigation and reflow at ${width}px with 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) await checkLayout(page, route, true);
  });
}

for (const view of [{ width: 641, enlarged: false }, { width: 768, enlarged: false }, { width: 390, enlarged: true }]) {
  test(`team page changes reveal the heading below the sticky navigation at ${view.width}px${view.enlarged ? " with 200% text" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: 1000 });
    await page.goto("/team/roster", { waitUntil: "domcontentloaded" });
    if (view.enlarged) await enlargeText(page);
    await page.getByRole("navigation", { name: "Team sections" }).getByRole("link", { name: "Player stats", exact: true }).click();
    await expect(page).toHaveURL(/\/team\/stats$/);
    const heading = page.getByRole("heading", { level: 1, name: "Player stats.", exact: true });
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect.poll(async () => {
      const [target, navigation] = await Promise.all([
        heading.boundingBox(), page.getByRole("navigation", { name: "Site sections" }).boundingBox(),
      ]);
      return target && navigation ? target.y - (navigation.y + navigation.height) : -1;
    }).toBeGreaterThanOrEqual(0);
  });
}

for (const width of [320, 768]) {
  test(`failed leader photos keep the original source unclipped at ${width}px with 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.unrouteAll({ behavior: "wait" });
    await page.route((url) => url.pathname === "/_next/image", (route) => route.abort("failed"));
    await page.goto("/team/stats", { waitUntil: "domcontentloaded" });
    await enlargeText(page);
    const figure = page.locator("#season-leaders figure").first();
    test.skip(await figure.count() === 0, "This edition has no verified leader photograph.");
    await figure.scrollIntoViewIfNeeded();
    await expect(figure.getByText("Photograph unavailable", { exact: true })).toBeVisible();
    const original = figure.getByRole("link", { name: "View the original Jets coverage", exact: false });
    await expect(original).toBeVisible();
    await original.focus();
    await expect(original).toBeFocused();
    await expect(original).toHaveAttribute("href", /^https:\/\/www\.newyorkjets\.com\//);
    const [frame, source] = await Promise.all([figure.locator(":scope > div").boundingBox(), original.boundingBox()]);
    expect(frame).not.toBeNull();
    expect(source).not.toBeNull();
    expect(source!.x).toBeGreaterThanOrEqual(frame!.x);
    expect(source!.y).toBeGreaterThanOrEqual(frame!.y);
    expect(source!.x + source!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1);
    expect(source!.y + source!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
    expect(source!.height).toBeGreaterThanOrEqual(44);
  });
}

for (const width of [320, 901, 1440]) {
  test(`the hero requests a sufficiently sized image at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const image = page.locator("#latest-game figure img").first();
    test.skip(await image.count() === 0, "This edition has no verified latest-game photograph.");
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const sizing = await image.evaluate((element) => ({
      requested: Number(new URL((element as HTMLImageElement).currentSrc).searchParams.get("w")),
      needed: element.getBoundingClientRect().width * devicePixelRatio,
    }));
    expect(sizing.requested).toBeGreaterThanOrEqual(sizing.needed - 1);
  });
}

test("leader photos avoid a desktop-size request in the narrow three-column layout", async ({ page }) => {
  await page.setViewportSize({ width: 901, height: 1000 });
  await page.goto("/team/stats", { waitUntil: "domcontentloaded" });
  const image = page.locator("#season-leaders figure img").first();
  test.skip(await image.count() === 0, "This edition has no verified leader photograph.");
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const sizing = await image.evaluate((element) => ({
    requested: Number(new URL((element as HTMLImageElement).currentSrc).searchParams.get("w")),
    needed: element.getBoundingClientRect().width * devicePixelRatio,
  }));
  expect(sizing.requested).toBeGreaterThanOrEqual(sizing.needed - 1);
  expect(sizing.requested).toBeLessThan(sizing.needed * 2);
});

test("leader photos request enough detail when text is enlarged at 768px", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto("/team/stats", { waitUntil: "domcontentloaded" });
  await enlargeText(page);
  const image = page.locator("#season-leaders figure img").first();
  test.skip(await image.count() === 0, "This edition has no verified leader photograph.");
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const sizing = await image.evaluate((element) => ({
    requested: Number(new URL((element as HTMLImageElement).currentSrc).searchParams.get("w")),
    needed: element.getBoundingClientRect().width * devicePixelRatio,
  }));
  expect(sizing.requested).toBeGreaterThanOrEqual(sizing.needed - 1);
});
