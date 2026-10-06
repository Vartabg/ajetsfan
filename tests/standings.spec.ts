import { test, expect } from "@playwright/test";

test("game day shows the division table or says the standings are pending", async ({ page }) => {
  await page.goto("/game-day");
  const table = page.locator("[data-standings]");
  if (await table.count()) {
    await expect(table.getByRole("heading", { name: "AFC East" })).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(4);
    await expect(table.locator("tbody tr").filter({ hasText: "Jets" })).toHaveCount(1);
    await expect(table).toContainText("tiebreaking procedure is not applied");
    await page.goto("/");
    const moment = page.locator("#division");
    await expect(moment).toContainText("AFC East");
    await expect(moment.getByRole("link", { name: /^Standings/ })).toHaveAttribute("href", "/game-day#standings");
  } else {
    await expect(page.locator("[data-standings-pending]")).toHaveText("Division standings publish with the next results check.");
    await page.goto("/");
    await expect(page.locator("#division")).toHaveCount(0);
  }
});
