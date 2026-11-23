import { expect, test } from "@playwright/test";

const root = "/replay/studies/";

test("the third-down comparison opens its measured throws, with score, field and a stable return path", async ({ page }) => {
  await page.goto(root + "throws?season=2022");
  const table = page.getByRole("table", { name: "Third-down throws by target depth" });
  await expect(table.getByRole("row", { name: /Short of the sticks/ })).toContainText("13 of 71");
  await expect(table.getByRole("row", { name: /At or beyond the sticks/ })).toContainText("46 of 92");
  await table.getByRole("link", { name: /Short of the sticks/ }).click();
  const reader = page.locator("#cutups");
  await expect(reader).toContainText("Play 1 of 71");
  await expect(reader).toContainText("Before the snap · Jets 0, Miami Dolphins 0");
  await expect(reader).toContainText("Q1 7:19 · Jets ball · 3rd & 13");
  await expect(reader).toContainText("11 yards short of the sticks");
  await expect(reader.locator('svg[data-full-field="action"] [data-unit="X"][data-player-id]')).toHaveCount(11);
  await expect(reader.locator('svg[data-full-field="action"] [data-unit="O"][data-player-id]')).toHaveCount(11);
  await expect(reader.getByRole("link", {name:"Read this drive from the snap"})).toHaveAttribute("href", "/replay/2022_18_NYJ_MIA/read?play=405");
  await reader.getByRole("link", {name:"Next play",exact:true}).click();
  await expect(reader).toContainText("Play 2 of 71");
  const bookmark = page.url();
  expect(new URL(bookmark).searchParams.get("clip")).toMatch(/^2022_\d{2}_[A-Z]+_[A-Z]+~\d+$/);
  await page.reload();
  await expect(reader).toContainText("Play 2 of 71");
  await reader.getByRole("link", {name:"Previous play",exact:true}).click();
  await expect(reader).toContainText("Play 1 of 71");
  await reader.getByRole("link", {name:"Next page",exact:true}).click();
  await expect(reader).toContainText("Play 9 of 71");
  await expect(reader.getByRole("listitem")).toHaveCount(8);
  await expect(reader.locator("ol")).toHaveAttribute("start", "9");
});

test.describe("native controls on a narrow phone", () => {
  test.use({ javaScriptEnabled: false, viewport: {width:320,height:740} });
  test("match exact pass-rush situations and inspect the sack without scripts", async ({ page }) => {
    await page.goto(root + "pass-rush?season=2022&down=2&distance=7");
    await page.getByRole("combobox", {name:"Down",exact:true}).selectOption("3");
    await page.getByRole("spinbutton", {name:"Yards to go"}).fill("8");
    await page.getByRole("button", {name:"Compare plays"}).click();
    const table = page.getByRole("table", {name:/Jets pass rush/});
    const five = table.getByRole("row", {name:/Five rushers/});
    await expect(table.getByRole("row", {name:/Four rushers/}).getByRole("cell")).toHaveText([/0 of 4/,/0 of 4/]);
    await expect(five.getByRole("cell")).toHaveText([/1 of 3/,/2 of 3/]);
    await five.getByRole("link").click();
    const reader = page.locator("#cutups");
    await expect(reader).toContainText("Jets 10, Green Bay Packers 3");
    await expect(reader).toContainText("Q3 6:29 · Packers ball · 3rd & 8");
    await expect(reader).toContainText("5 Jets rushed. The quarterback was sacked.");
    await expect(reader.getByRole("region", {name:"Xs & Os"})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await reader.getByRole("link", {name:"Read this drive from the snap"}).click();
    await expect(page).toHaveURL(/\/replay\/2022_06_NYJ_GB\/read\?play=2603/);
    await expect(page.locator("#drive-reader")).toContainText("Score before this play");
  });
});

test("unsupported seasons and cross-sample bookmarks cannot select another play; empty rates carry no percentage", async ({ request, page }) => {
  for (const url of ["throws?season=2008", "throws?season=2022&group=five",
    "throws?season=2022&group=short&clip=2022_06_NYJ_GB~2603", "pass-rush?season=2022&down=4&distance=99&group=four&page=2"]) {
    expect((await request.get(root + url)).status(), url).toBe(404);
  }
  await page.goto(root + "pass-rush?season=2022&down=4&distance=99");
  await expect(page.getByText("No verified plays match this situation in 2022.")).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByText("0 of 0")).toHaveCount(4);
  await expect(table.getByRole("link")).toHaveCount(0);
  await expect(table).not.toContainText("0%");
});
