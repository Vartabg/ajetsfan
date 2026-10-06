import { test, expect } from "@playwright/test";

test("the global navigation uses plain destinations without automatic scrolling animation", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await page.goto("/team");
  const navigation = page.getByRole("navigation", { name: "Site sections" });
  await expect(navigation.getByRole("link")).toHaveText(["Home", "Team", "Film Room", "Media", "Seasons", "The Morgue"]);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});

for (const [route, section] of [
  ["/team/roster", "/team"],
  ["/seasons/2010", "/seasons"],
  ["/games/2002_18_IND_NYJ", "/seasons"],
  ["/history", "/seasons"],
  ["/stories", "/seasons"],
]) {
  test(`${route} keeps its parent section highlighted`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", section);
  });
}

test("a slow destination acknowledges the click while leaving the current page available", async ({ page }) => {
  await page.goto("/team");
  let release!: () => void;
  const destinationReady = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === "/media", async (route) => {
    await destinationReady;
    await route.continue();
  });
  const link = page.getByRole("navigation", { name: "Site sections" }).getByRole("link", { name: "Media", exact: true });
  const opening = link.click();
  try {
    await expect(link.locator('[data-link-pending="true"]')).toHaveCount(1);
    await expect(link.getByRole("status")).toHaveText("Opening page…");
    await expect(page.locator("main")).toBeVisible();
  } finally {
    release();
    await opening;
  }
  await expect(page).toHaveURL(/\/media$/);
  await expect(page.locator('[data-link-pending="true"]')).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/media");
});
