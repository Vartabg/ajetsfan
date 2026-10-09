import { test, expect } from "@playwright/test";

// The rail lists the current page's moments, so a page below its section names itself and links back up.
for (const view of [
  { route: "/seasons", back: null, name: "Seasons" },
  { route: "/seasons/2026", back: { label: "Seasons", href: "/seasons" }, name: "2026 season" },
  { route: "/games/2026_03_NYJ_DET", back: { label: "Seasons", href: "/seasons" }, name: "2026 · Week 3" },
  { route: "/team/roster", back: { label: "Team", href: "/team" }, name: null },
]) {
  test(`${view.route} says whose moments the rail lists`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(view.route);
    const rail = page.locator("aside").filter({ has: page.getByRole("navigation", { name: "On this page" }) });
    await expect(rail.getByRole("navigation", { name: "On this page" }).getByText("On this page", { exact: true })).toBeVisible();
    const back = rail.getByRole("link", { name: /^Back to / });
    if (view.back) {
      await expect(back).toHaveAccessibleName(`Back to ${view.back.label}`);
      await expect(back.locator('[aria-hidden="true"]')).toHaveText("←");
      await expect(back).toHaveAttribute("href", view.back.href);
      const box = await back.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    } else await expect(back).toHaveCount(0);
    if (view.name) await expect(rail.locator("p").filter({ hasText: new RegExp(`^${view.name}$`) })).toBeVisible();
  });
}

test("the phone menu carries the same back link and page name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/seasons/2026");
  await page.getByRole("button", { name: "Menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet.getByRole("link", { name: "Back to Seasons" })).toHaveAttribute("href", "/seasons");
  await expect(sheet.locator("p").filter({ hasText: /^2026 season$/ })).toBeVisible();
});
