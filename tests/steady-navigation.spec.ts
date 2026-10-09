import { test, expect } from "@playwright/test";
import { SECTIONS } from "../src/lib/site-sections";

test("the focus navigation uses plain destinations without automatic scrolling animation", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await page.goto("/history");
  const navigation = page.getByRole("navigation", { name: "Site sections" });
  await expect(navigation.getByRole("link")).toHaveCount(SECTIONS.length);
  for (const section of SECTIONS) {
    const link = navigation.locator(`a[href="${section.href}"]`);
    await expect(link.locator("b")).toHaveText(section.label);
    await expect(link).toContainText(section.note);
  }
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});

for (const [route, section] of [
  ["/team/roster", "/team"],
  ["/seasons/2010", "/seasons"],
  ["/seasons/2010/guide", "/seasons"],
  ["/games/2002_18_IND_NYJ", "/seasons"],
  ["/history", "/history"],
  ["/history/trades", "/history/trades"],
  ["/stories", "/stories"],
]) {
  test(`${route} keeps its parent section highlighted`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("[data-focus-page]")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    const selected = page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute("href", section);
  });
}

test("a slow destination acknowledges the click while leaving the current page available", async ({ page }) => {
  await page.goto("/history");
  let release!: () => void;
  const destinationReady = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === "/media", async (route) => {
    await destinationReady;
    await route.continue();
  });
  const link = page.getByRole("navigation", { name: "Site sections" }).locator('a[href="/media"]');
  const opening = link.click();
  try {
    await expect(link.locator('[data-link-pending="true"]')).toHaveCount(1);
    await expect(link.getByRole("status")).toHaveText("Opening page…");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator('[data-focus-page="history"]')).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe("/history");
  } finally {
    release();
    await opening;
  }
  await expect(page).toHaveURL(/\/media$/);
  await expect(page.locator('[data-link-pending="true"]')).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/media");
  await page.goBack();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.locator('[data-focus-page="history"]')).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/history");
});
