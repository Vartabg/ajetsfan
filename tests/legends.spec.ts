import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

async function shell(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toHaveAttribute("href", "#main");
}
async function accessibility(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
  });
}

test("all 34 people and profile links exist in server-rendered HTML", async ({ page, request }) => {
  const response = await request.get("/legends");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html.match(/data-legend-card="/g)).toHaveLength(34);
  for (const slug of ["curtis-martin", "joe-namath", "darrelle-revis", "dennis-byrd", "brett-favre"]) expect(html).toContain(`/legends/${slug}`);
  await page.goto("/legends");
  await shell(page);
  await expect(page.locator("[data-legend-card]")).toHaveCount(34);
  await expect(page.locator("[data-legend-count]")).toContainText("34 of 34 people");
  await expect(page.locator("#legends h2")).toHaveText("Curtis Martin");
  await expect(page.locator('#legends [data-legend-portrait="Curtis Martin"] img')).toHaveAttribute("alt", /Curtis Martin/i);
});

test("native GET filters find people, preserve choices and offer a clear empty-state exit", async ({ page }) => {
  await page.goto("/legends?q=Wayne&q=Joe&honor=not-an-honor&era=not-an-era");
  await expect(page.locator("[data-legend-card]")).toHaveCount(1);
  await expect(page.getByLabel("Name or role")).toHaveValue("Wayne");
  await expect(page.getByRole("combobox", { name: "Honor", exact: true })).toHaveValue("all");
  await expect(page.getByRole("combobox", { name: "Jets era", exact: true })).toHaveValue("all");
  await page.goto("/legends#people");
  const form = page.getByRole("form", { name: "Find Jets legends" });
  await expect(form).toHaveAttribute("method", "get");
  await expect(form).toHaveAttribute("action", "/legends#people");
  await page.getByLabel("Name or role").fill("Wayne");
  await page.getByLabel("Name or role").press("Enter");
  await expect(page).toHaveURL(/q=Wayne.*#people$/);
  await expect(page.locator("[data-legend-card]")).toHaveCount(1);
  await expect(page.locator('[data-legend-card="wayne-chrebet"]')).toBeVisible();
  await expect(page.getByLabel("Name or role")).toHaveValue("Wayne");
  await page.getByLabel("Name or role").fill("");
  await page.getByRole("combobox", { name: "Honor", exact: true }).selectOption("hall");
  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.locator('[data-legend-card="brett-favre"]')).toHaveCount(1);
  await expect(page.locator('[data-legend-card="dennis-byrd"]')).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Honor", exact: true })).toHaveValue("hall");
  await page.getByLabel("Name or role").fill("no-such-jets-person");
  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.locator("[data-legend-card]")).toHaveCount(0);
  await expect(page.locator("[data-legend-count]")).toContainText("0 of 34 people");
  await expect(page.getByRole("heading", { name: "No people match those choices." })).toBeVisible();
  await page.getByRole("link", { name: /^Show everyone/ }).click();
  await expect(page.locator("[data-legend-card]")).toHaveCount(34);
  await expect(page.getByLabel("Name or role")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Honor", exact: true })).toHaveValue("all");
  await page.goBack();
  await expect(page.getByLabel("Name or role")).toHaveValue("no-such-jets-person");
  await expect(page.getByRole("combobox", { name: "Honor", exact: true })).toHaveValue("hall");
  await page.goForward();
  await expect(page.getByLabel("Name or role")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Honor", exact: true })).toHaveValue("all");
  await page.getByRole("combobox", { name: "Jets era", exact: true }).selectOption("1960s");
  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.locator('[data-legend-card="joe-namath"]')).toHaveCount(1);
  await expect(page.locator('[data-legend-card="darrelle-revis"]')).toHaveCount(0);
});

test("profiles distinguish team honors, Canton classes and brief Jets tenures", async ({ page, request }) => {
  const profiles = [
    { slug: "curtis-martin", name: "Curtis Martin", hall: "2012", ring: "2010", retired: "28" },
    { slug: "joe-namath", name: "Joe Namath", hall: "1985", ring: "2010", retired: "12" },
    { slug: "darrelle-revis", name: "Darrelle Revis", hall: "2023", ring: "2022" },
    { slug: "dennis-byrd", name: "Dennis Byrd", retired: "90" },
    { slug: "brett-favre", name: "Brett Favre", hall: "2016" },
  ];
  for (const person of profiles) {
    await page.goto(`/legends/${person.slug}`);
    await shell(page);
    await expect(page.locator("h1")).toHaveText(person.name);
    const honors = page.locator("#person ul");
    if (person.hall) await expect(honors).toContainText(`Pro Football Hall of Fame · ${person.hall}`);
    else await expect(honors).not.toContainText("Pro Football Hall of Fame");
    if (person.ring) await expect(honors).toContainText(`Jets Ring of Honor · ${person.ring}`);
    else await expect(honors).not.toContainText("Jets Ring of Honor");
    if (person.retired) await expect(honors).toContainText(`Jets retired number · ${person.retired}`);
    if (person.slug === "brett-favre") await expect(page.locator("#person")).toContainText("Jets 2008");
    const sources = page.getByRole("navigation", { name: `Sources for ${person.name}` }).getByRole("link");
    expect(await sources.count()).toBeGreaterThan(0);
    for (const href of await sources.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))) {
      expect(new URL(href).protocol).toBe("https:");
      expect(new URL(href).hostname).toMatch(/(^|\.)(newyorkjets\.com|profootballhof\.com|nfl\.com)$/);
    }
  }
  expect((await request.get("/legends/someone-who-is-not-in-the-archive")).status()).toBe(404);
});

test("portrait errors preserve the person's story and credited original source", async ({ page }) => {
  await page.route("**/_next/image?**", (route) => route.abort());
  await page.goto("/legends/curtis-martin");
  const portrait = page.locator('[data-legend-portrait="Curtis Martin"]');
  await expect(portrait).toContainText("Curtis Martin’s photograph is unavailable here.");
  await expect(portrait.getByRole("link", { name: /^Photo source for Curtis Martin/ })).toHaveAttribute("href", /^https:\/\//);
  await expect(page.locator("h1")).toHaveText("Curtis Martin");
  await expect(page.locator("#story")).toContainText("Their Jets story.");
});

test("people pages retain semantic access, readable reflow and visible controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 320, height: 900 });
  for (const route of ["/legends", "/legends/darrelle-revis"]) {
    await page.goto(route);
    await shell(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(await accessibility(page)).toEqual([]);
  }
  await page.goto("/legends#people");
  const search = page.getByLabel("Name or role");
  await search.focus();
  expect(await search.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  for (const control of [search, page.getByRole("combobox", { name: "Honor", exact: true }), page.getByRole("combobox", { name: "Jets era", exact: true }), page.getByRole("button", { name: "Find people" })]) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await search.fill("Joe Namath");
  await search.press("Enter");
  await expect(page.locator("[data-legend-card]")).toHaveCount(1);
});
