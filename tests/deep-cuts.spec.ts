import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDiscoveries } from "../src/lib/discoveries";
import { publishedGames } from "../src/lib/published-pages";
import { pct, type Game } from "../src/lib/games";
import type { CurrentSnapshot } from "../src/lib/current";

const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public/data", file), "utf8")) as T;
const findings = buildDiscoveries(publishedGames(read<Game[]>("games.json"), read<CurrentSnapshot>("current.json")));

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test("Deep cuts connects its scoped findings to the matching game evidence", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("#top, footer")).toHaveCount(0);
  await expect(page.locator("#evidence")).toContainText(`${findings.scope.games} published Jets game cases`);
  if (findings.sameScore) {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Two ${findings.sameScore.jetsScore}–${findings.sameScore.oppScore} wins.`);
    for (const game of [findings.sameScore.low, findings.sameScore.high]) await expect(page.locator(`#same-score a[href="/games/${game.id}"]`)).toHaveCount(1);
  }
  const wins = page.locator("#one-percent ul a");
  await expect(wins).toHaveCount(findings.belowOnePercent.length);
  expect(await wins.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(findings.belowOnePercent.map((game) => `/games/${game.id}`));
  const losses = page.locator("#ninety-five ul a");
  await expect(losses).toHaveCount(findings.aboveNinetyFivePercent.length);
  await expect(page.locator("#one-play")).toContainText("saved second-half key plays");
  await page.locator("#one-play summary").click();
  await expect(page.locator("#one-play ul a")).toHaveCount(Math.min(10, findings.biggestKeyPlays.length));
  const game = findings.belowOnePercent[0];
  if (game) {
    await page.locator(`#one-percent a[href="/games/${game.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/games/${game.id}$`));
    await expect(page.locator("#final")).toContainText(`${game.jetsScore}–${game.oppScore}`);
  }
});

test("the comparison keeps both selected play descriptions and shareable progress coherent", async ({ page }) => {
  test.skip(!findings.sameScore, "This edition has no matching score pair.");
  const pair = findings.sameScore!;
  await page.goto("/discover?keep=football&progress=50#same-score");
  const slider = page.getByRole("slider", { name: /Compare at the same play progress/ });
  await expect(slider).toHaveValue("50");
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("100");
  await expect(page).toHaveURL(/keep=football&progress=100#same-score$/);
  for (const [index, game] of [pair.low, pair.high].entries()) {
    const points = read<{ wp: number; desc: string | null }[]>(`curves/${game.id}.json`).filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1);
    const last = points.at(-1)!;
    const figure = page.locator("#same-score details figure").nth(index);
    await expect(figure).toContainText(`${pct(last.wp)} pre-play win chance`);
    if (last.desc) await expect(figure).toContainText(last.desc);
  }
  await page.reload();
  await expect(slider).toHaveValue("100");
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(page.locator("#same-score")).toBeInViewport();
});

test("the home page leads into the discovery without loading the comparison", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#discovery")).toBeVisible();
  await expect(page.locator("#discovery input, #discovery svg")).toHaveCount(0);
  await page.locator("#discovery a").click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.locator("#same-score-heading")).toBeInViewport();
});

test("the calculation link reveals its source note directly", async ({ page }) => {
  await page.goto("/discover#evidence");
  await page.getByRole("link", { name: "Inspect the calculations", exact: false }).click();
  await expect(page).toHaveURL(/\/how-made#discovery-methods$/);
  await expect(page.locator("#discovery-methods")).toBeVisible();
  await expect(page.locator("#discovery-methods")).toContainText("strict thresholds");
});

for (const view of [{ width: 1280, dark: false }, { width: 390, dark: false }, { width: 320, dark: true }]) {
  test(`discoveries reflow and pass automated accessibility at ${view.width}px${view.dark ? " in dark mode" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({ colorScheme: view.dark ? "dark" : "light" });
    await page.goto("/discover");
    await page.locator("#same-score summary").click();
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations);
    expect(violations).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("discoveries remain readable and their case links work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? "3107"}/discover`);
  await expect(page.locator("#evidence")).toContainText(`${findings.scope.games} published Jets game cases`);
  await page.locator("#same-score summary").click();
  await expect(page.locator("#same-score details svg")).toHaveCount(2);
  if (findings.sameScore) {
    await page.locator(`#same-score a[href="/games/${findings.sameScore.low.id}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await context.close();
});
