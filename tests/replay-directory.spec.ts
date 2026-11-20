import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("a season and opponent can be selected together without revealing the game's result", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/replay");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const form = page.getByRole("form", { name: "Choose a season and opponent" });
  const seasons = form.getByLabel("Season", { exact: true });
  const years = await seasons.locator("option").allTextContents();
  await expect(page.locator("#choose-game")).toContainText("Choose a game from " + years.at(-1) + " through " + years[0] + ".");
  await seasons.selectOption("2022");
  await form.getByLabel("Opponent", { exact: true }).selectOption("CLE");
  await form.getByRole("button", { name: "Show games" }).click();
  await expect(page).toHaveURL(/\/replay\?season=2022&opponent=CLE$/);
  const games = page.getByRole("list", { name: "Games to replay" });
  await expect(games.getByRole("link")).toHaveCount(1);
  await expect(games.getByRole("link", { name: /Jets at Cleveland Browns/ })).toHaveAttribute("href", "/replay/2022_02_NYJ_CLE");
  await expect(games).toContainText("Sep 18, 2022");
  const html = await page.content();
  expect(html).not.toMatch(/Garrett Wilson|Ashtyn Davis|31[–-]30|30[–-]31|jetsScore|oppScore/);
});

test("the first archive season and a repeated postseason opponent have distinct replay links", async ({ page }) => {
  await page.goto("/replay?season=1999");
  const games = page.getByRole("list", { name: "Games to replay" });
  await expect(games.getByRole("link")).toHaveCount(16);
  await expect(games.getByRole("link").first()).toHaveAttribute("href", "/replay/1999_01_NE_NYJ");
  await page.goto("/replay?season=2002&opponent=OAK");
  const raiders = games.getByRole("link", { name: /Jets at Oakland Raiders/ });
  await expect(raiders).toHaveCount(2);
  await expect(raiders.nth(0)).toHaveAttribute("href", "/replay/2002_13_NYJ_OAK");
  await expect(raiders.nth(1)).toHaveAttribute("href", "/replay/2002_19_NYJ_OAK");
  await expect(raiders.nth(1)).toContainText("Playoffs");
  await page.goto("/replay?season=2002&opponent=LV");
  await expect(games).toHaveCount(0);
  await expect(page.getByText("No games with verified play-by-play match this selection.")).toBeVisible();
});

test("game reports, Find and exact-play pages link to the corresponding replay entrance", async ({ page }) => {
  const id = "2022_02_NYJ_CLE";
  await page.goto("/games/" + id);
  await expect(page.getByRole("link", { name: "Replay this game", exact: true })).toHaveAttribute("href", "/replay/" + id);
  await page.goto("/find?q=2022+Browns");
  await expect(page.getByRole("link", { name: /^Replay this game for Jets at Cleveland Browns/ })).toHaveAttribute("href", "/replay/" + id);
  await page.goto("/plays/" + id + "/4199");
  await expect(page.getByRole("link", { name: "Replay the game from this play" })).toHaveAttribute("href", "/replay/" + id + "?play=4199");
});
