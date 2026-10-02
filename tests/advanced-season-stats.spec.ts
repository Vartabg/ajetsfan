import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextGenCollection, NextGenPlayer } from "../src/lib/nextgen-stats";
import { publicPffGrades } from "../src/lib/pff-public";

const collection = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/nextgen-stats.json"), "utf8")) as NextGenCollection;
const current = collection.seasons[0];
const groups = ["passing", "receiving", "rushing"] as const;
const desk = (page: Page) => page.locator("[data-advanced-stats]");
const numeric = (value: string) => Number(value.replace(/[^0-9.-]/g, ""));

async function comparePlayer(page: Page, player: NextGenPlayer) {
  const card = desk(page).locator(`[data-nextgen-player="${player.id}"]`);
  await expect(card.getByRole("heading", { name: player.name, exact: true })).toBeVisible();
  await expect(card).toContainText(`${player.sample.toLocaleString("en-US")} ${player.sampleLabel}`);
  await expect(card.locator("[data-nextgen-metric]")).toHaveCount(player.metrics.length);
  for (const metric of player.metrics) {
    const item = card.locator(`[data-nextgen-metric="${metric.id}"]`);
    await expect(item.locator("dt")).toHaveText(metric.label);
    const displayed = (await item.locator("dd > span").textContent())!;
    expect(numeric(displayed), `${player.name}: ${metric.id}`).toBeCloseTo(metric.value, 2);
    const suffix = metric.id === "completion_percentage_above_expectation" ? / pp$/
      : metric.unit === "seconds" ? / sec$/ : metric.unit === "yards" ? / yd$/
        : metric.unit === "percent" ? /%$/ : metric.unit === "ratio" ? /×$/ : /[\d]$/;
    expect(displayed).toMatch(suffix);
    await expect(item).toContainText(metric.note);
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("current and first covered seasons display the published player samples, measurements and units", async ({ page }) => {
  for (const year of [current.year, 2016]) {
    const source = collection.seasons.find((season) => season.year === year)!;
    expect(source, `NGS coverage for ${year}`).toBeTruthy();
    await page.goto(`/seasons/${year}?phase=regular#advanced-evidence`);
    await expect(desk(page)).toHaveAttribute("data-advanced-stats", String(year));
    for (const group of groups) {
      const control = desk(page).locator(`[data-nextgen-group="${group}"]`);
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await expect(desk(page).locator("[data-nextgen-player]")).toHaveCount(source[group].length);
      for (const player of source[group]) await comparePlayer(page, player);
    }
    await expect(desk(page)).toContainText("No unverified tracking rank is inferred");
    await expect(desk(page)).toContainText("not reconstructed player coordinates");
  }
});

test("2010 exposes the NGS coverage boundary without importing current players or public grades", async ({ page }) => {
  await page.goto("/seasons/2010?phase=regular#advanced-evidence");
  const stats = desk(page);
  await expect(stats.locator("[data-nextgen-unavailable]")).toContainText("begins in 2016");
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(0);
  await expect(stats.locator("[data-nextgen-group]")).toHaveCount(0);
  await expect(stats.locator("[data-pff-grade]")).toHaveCount(0);
  await expect(stats.locator("[data-pff-unavailable]")).toContainText("reviewed for 2010");
});

test("playoffs withhold regular-season NGS and PFF excerpts and restoring the phase restores the selected group", async ({ page }) => {
  await page.goto(`/seasons/${current.year}?keep=advanced&phase=regular#advanced-evidence`);
  const stats = desk(page);
  await stats.locator('[data-nextgen-group="receiving"]').click();
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(current.receiving.length);
  await expect(stats.locator("[data-pff-grade]")).toHaveCount(publicPffGrades.filter((item) => item.year === current.year).length);
  await page.locator('[data-season-scope="playoffs"]').click();
  await expect(page.locator("[data-season-archive]")).toHaveAttribute("data-season-phase", "playoffs");
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(0);
  await expect(stats.locator("[data-nextgen-group]")).toHaveCount(0);
  await expect(stats.locator("[data-pff-grade]")).toHaveCount(0);
  await expect(stats.locator("[data-nextgen-unavailable]")).toContainText("Postseason tracking aggregates are not included");
  await expect(stats.locator("[data-pff-unavailable]")).toContainText("No postseason PFF grade excerpt");
  await page.goBack();
  await expect(stats.locator('[data-nextgen-group="receiving"]')).toHaveAttribute("aria-pressed", "true");
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(current.receiving.length);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("advanced");
});

test("2024 Davante Adams retains the published all-club workload with an explicit trade caveat", async ({ page }) => {
  const player = collection.seasons.find((season) => season.year === 2024)!.receiving.find((entry) => entry.name === "Davante Adams")!;
  expect(player.sample).toBe(141);
  expect(player.teams).toContain("LV");
  expect(player.teams).toContain("NYJ");
  await page.goto("/seasons/2024?phase=regular#advanced-evidence");
  await desk(page).locator('[data-nextgen-group="receiving"]').click();
  await comparePlayer(page, player);
  await expect(desk(page).locator(`[data-nextgen-player="${player.id}"] [data-nextgen-clubs]`)).toHaveText("All-club season aggregate: LV / NYJ.");
  await expect(desk(page)).toContainText("may include production with every club, not only the Jets");
  await expect(desk(page)).toContainText("Missing measurements are omitted");
});

test("public PFF excerpts stay in their football season with the published rank denominator or its stated absence", async ({ page }) => {
  // Evidence checked directly on October 2: the March 2026 article discusses
  // 2025 football, and its Hall rank has no published qualifier denominator.
  const evidence = [
    ["geno-overall-2026", 2026, 74.7, 15, 36], ["geno-passing-2026", 2026, 78.3, 10, 36],
    ["jets-offense-2025", 2025, 62.6, 31, null], ["jets-defense-2025", 2025, 56.8, 26, null],
    ["hall-rushing-2025", 2025, 83.7, 8, null],
  ];
  expect(publicPffGrades.map(({ id, year, grade, rank, population }) => [id, year, grade, rank, population])).toEqual(evidence);
  for (const year of [2026, 2025]) {
    await page.goto(`/seasons/${year}?phase=regular#advanced-evidence`);
    const source = publicPffGrades.filter((item) => item.year === year);
    await expect(desk(page).locator("[data-pff-grade]")).toHaveCount(source.length);
    for (const item of source) {
      const card = desk(page).locator(`[data-pff-grade="${item.id}"]`);
      await expect(card.locator("strong")).toHaveText(item.grade.toFixed(1));
      await expect(card.locator("h4")).toContainText(`#${item.rank}${item.population ? ` of ${item.population}` : ""}`);
      if (item.population === null) await expect(card.locator("h4")).not.toContainText(/\bof\s+\d+\b/);
      await expect(card).toContainText(item.scope);
      await expect(card).toContainText(item.note);
      await expect(card.getByRole("link", { name: /Verify at PFF/ })).toHaveAttribute("href", item.source);
    }
    await expect(desk(page)).toContainText("requires authorized API access and permission to display the data");
  }
  const hall = desk(page).locator('[data-pff-grade="hall-rushing-2025"]');
  await expect(hall).toContainText("does not give the qualifier count");
  await expect(hall).toContainText("Source dated Mar 5, 2026");
  await expect(desk(page).locator('[data-pff-grade="geno-overall-2026"]')).toHaveCount(0);
});

test("all player groups reflow at 320px and 200% text with accessible controls and grade semantics", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`/seasons/${current.year}?phase=regular#advanced-evidence`);
  await page.evaluate(() => document.fonts.ready);
  for (const scale of [100, 200]) {
    await page.evaluate((value) => { document.documentElement.style.fontSize = `${value}%`; }, scale);
    for (const group of groups) {
      await desk(page).locator(`[data-nextgen-group="${group}"]`).click();
      expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))).toEqual({ width: 320, viewport: 320 });
      for (const target of await desk(page).locator("button:visible, a:visible").all()) {
        const box = await target.boundingBox();
        expect(box?.height, `${scale}% ${await target.textContent()}`).toBeGreaterThanOrEqual(44);
        expect(box?.width, `${scale}% ${await target.textContent()}`).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    return (await axe.run(document.querySelector("[data-advanced-stats]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});
