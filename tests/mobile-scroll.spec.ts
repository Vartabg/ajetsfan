import { test, expect, type Page } from "@playwright/test";

async function scrollGesture(page: Page, distance: number) {
  // Wait for the browser to finish the gesture and any snap animation, so a
  // transient position before it pulls back cannot satisfy the assertion.
  const settled = page.evaluate(() => new Promise<void>((resolve) => {
    const finish = () => { clearTimeout(timer); removeEventListener("scrollend", finish); resolve(); };
    const timer = setTimeout(finish, 1500);
    addEventListener("scrollend", finish, { once: true });
  }));
  try { await page.mouse.wheel(0, distance); }
  finally { await settled; }
}

for (const width of [320, 390, 768]) {
  test(`short landing-page scrolls stop where the reader leaves them at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(width / 2, 400);
    for (let step = 1; step <= 6; step++) {
      await scrollGesture(page, 160);
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(step * 160, 0);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator("[data-focus-page] > header")).toBeInViewport({ ratio: 1 });
    }
    // Reverse direction near the second section's boundary as well.
    await scrollGesture(page, -160);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(800, 0);
  });
}

test("expanded mobile content remains freely readable through section boundaries", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.mouse.move(195, 400);
  for (let step = 1; step <= 10; step++) {
    await scrollGesture(page, 160);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(step * 160, 0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
