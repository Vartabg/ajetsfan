import { test, expect } from "@playwright/test";
import { siteOrigin } from "../src/lib/site";

test("home, Team and History lead readers to real people and back", async ({ page }) => {
  await page.goto("/");
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  expect(ids.indexOf("people")).toBe(ids.indexOf("last") + 1);
  await expect(page.locator("#people h2")).toHaveText("Curtis Martin");
  await page.locator("#people").getByRole("link", { name: /^Meet Curtis/ }).click();
  await expect(page.locator("h1")).toHaveText("Curtis Martin");
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/legends");
  await page.locator("#person").getByRole("link", { name: /Meet the other/ }).click();
  await expect(page).toHaveURL(/\/legends#people$/);
  await expect(page.locator("[data-legend-card]")).toHaveCount(34);
  for (const route of ["/team", "/history"]) {
    await page.goto(route);
    const link = page.locator(route === "/team" ? "#players" : "#people").getByRole("link", { name: /Jets legends/ });
    await expect(link).toHaveAttribute("href", "/legends");
  }
});

test("a shared legend has its own canonical metadata, valid image and sitemap entry", async ({ page, request }) => {
  for (const route of ["/legends", "/legends/curtis-martin", "/legends/dennis-byrd"]) {
    await page.goto(route);
    if (siteOrigin()) await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new URL(route, siteOrigin()).href);
    else await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", await page.title());
    const url = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!, page.url());
    expect(url.pathname).toBe(`${route}/opengraph-image`);
    const response = await request.get(url.pathname + url.search);
    expect(response.status()).toBe(200);
    const png = await response.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }
  const sitemap = await request.get("/sitemap.xml");
  if (siteOrigin()) expect(await sitemap.text()).toContain("/legends/dennis-byrd</loc>");
  else expect(await sitemap.text()).not.toContain("<loc>");
});
