import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("the trade ledger prints every recorded trade and follows a pick through its later trades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const ledger = JSON.parse(await readFile("public/data/draft-trades.json", "utf8"));
  await page.goto("/history/trades");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The trade ledger.");
  await expect(page.locator("[data-trade]")).toHaveCount(ledger.trades.length);
  const darnold = page.locator('[data-trade="1284"]');
  await expect(darnold).toContainText("Sam Darnold");
  await expect(darnold).toContainText("Quenton Nelson");
  await expect(darnold).toContainText("selected by Indianapolis Colts");
  const adams = page.locator('[data-trade="1513"]');
  await expect(adams).toContainText("Jamal Adams");
  await expect(adams).toContainText("Traded to Minnesota Vikings");
  await expect(adams).toContainText("Alijah Vera-Tucker");
  await expect(adams.getByText("Alijah Vera-Tucker", { exact: false })).toHaveCount(1);
  await expect(adams).toContainText("in the deal listed above");
  await page.locator('a[href="#trades-2018"]').click();
  await expect(page.locator("#trades-2018")).toBeInViewport();
  await expect(page.locator("footer", { hasText: "No valuation is applied" })).toBeVisible();
});
