import { test, expect } from "@playwright/test";

test("the history page presents the sourced championship result and selected archive cases", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/history#fan-stand");
  await expect(page).toHaveURL(/\/history#fan-stand$/);
  const stand = page.getByRole("region", { name: "Jets history." });
  const heading = stand.getByRole("heading", { name: "Jets history.", exact: true });
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => {
    const [h, n] = await Promise.all([heading.boundingBox(), page.getByRole("navigation", { name: "Site sections" }).boundingBox()]);
    return h!.y - (n!.y + n!.height);
  }).toBeGreaterThanOrEqual(0);
  const guarantee = stand.getByRole("complementary", { name: "Super Bowl III." });
  await expect(guarantee).toContainText("1968 season");
  await expect(guarantee.locator("time")).toHaveAttribute("datetime", "1969-01-12");
  await expect(guarantee).toContainText("16");
  await expect(guarantee).toContainText("7");
  await expect(guarantee.getByRole("link")).toHaveAttribute("href", "https://www.newyorkjets.com/news/super-bowl-iii-jets-16-colts-7-2507141");
  await expect(guarantee.locator('a[href^="/morgue"]')).toHaveCount(0);
  await expect(stand.locator("#remembered-cases")).toBeVisible();
});

test("Morgue shortcuts keep both the classic cases and full archive easy to reach", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/morgue");
  const index = page.getByRole("navigation", { name: "In The Morgue" });
  await index.getByRole("link", { name: /^Find a game/ }).click();
  await expect(page).toHaveURL(/#archive-filters$/);
  await expect(page.getByLabel("Search games", { exact: true })).toBeInViewport();
  await page.goBack();
  await index.getByRole("link", { name: /^The classic cases/ }).click();
  await expect(page).toHaveURL(/#fan-memories$/);
  await expect(page.locator("#fan-memories-heading")).toBeInViewport();
});
