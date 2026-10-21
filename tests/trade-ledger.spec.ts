import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("the trade ledger prints every recorded trade and follows a pick through its later trades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const ledger = JSON.parse(await readFile("public/data/draft-trades.json", "utf8"));
  const newest = Math.max(...ledger.trades.map((trade: { season: number }) => trade.season));
  await page.goto("/history/trades");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The trade ledger.");
  // Every trade is in the page, folded by year: only the newest year starts open.
  await expect(page.locator("[data-trade]")).toHaveCount(ledger.trades.length);
  await expect(page.locator("details[id^='trades-'][open]")).toHaveCount(1);
  await expect(page.locator(`#trades-${newest}`)).toHaveAttribute("open", "");
  const darnold = page.locator('[data-trade="1284"]');
  await expect(darnold).toBeHidden();
  await page.locator("#trades-2018 > summary").click();
  await expect(darnold).toBeVisible();
  await expect(darnold).toContainText("Sam Darnold");
  await expect(darnold).toContainText("Quenton Nelson");
  await expect(darnold).toContainText("selected by Indianapolis Colts");
  await expect(page.locator("footer", { hasText: "No valuation is applied" })).toBeVisible();
});

test("a link to a trade year opens that year", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/history/trades#trades-2020");
  await expect(page.locator("#trades-2020")).toHaveAttribute("open", "");
  await expect(page.locator("#trades-2020")).toBeInViewport();
  const adams = page.locator('[data-trade="1513"]');
  await expect(adams).toBeVisible();
  await expect(adams).toContainText("Jamal Adams");
  await expect(adams).toContainText("Traded to Minnesota Vikings");
  await expect(adams).toContainText("Alijah Vera-Tucker");
  await expect(adams.getByText("Alijah Vera-Tucker", { exact: false })).toHaveCount(1);
  await expect(adams).toContainText("in the deal listed above");
  // A later change of hash, as from a shared link, opens its year too.
  await page.evaluate(() => { location.hash = "#trades-2010"; });
  await expect(page.locator("#trades-2010")).toHaveAttribute("open", "");
  await expect(page.locator("#trades-2010")).toBeInViewport();
});

test("Back returns to the ledger with the year the reader opened", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history/trades");
  await page.locator("#trades-2018 > summary").click();
  await expect(page.locator("#trades-2018")).toHaveAttribute("open", "");
  await page.locator('[data-trade="1284"]').scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: /^History/ }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.goBack();
  await expect(page.locator("#trades-2018")).toHaveAttribute("open", "");
  await expect(page.locator("#trades-2018")).toBeInViewport();
  // The year's row reads as one name: the year and its count.
  await expect(page.locator("#trades-2018 > summary")).toHaveAccessibleName(/^2018 \d+ trades?$/);
});

test("each closed year is one short row on a phone, and every year still opens without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/history/trades");
  const years = page.locator("details[id^='trades-']");
  expect(await years.count()).toBeGreaterThan(20);
  const closedRows = await years.evaluateAll((rows) => rows.filter((row) => !(row as HTMLDetailsElement).open).map((row) => row.getBoundingClientRect().height));
  expect(Math.max(...closedRows)).toBeLessThanOrEqual(72);
  await page.locator("#trades-2005 > summary").click();
  await expect(page.locator("#trades-2005")).toHaveAttribute("open", "");
  await context.close();
});
