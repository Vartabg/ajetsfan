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
  await desk(page).getByLabel("Player", { exact: true }).selectOption(player.id);
  const card = desk(page).locator(`[data-nextgen-player="${player.id}"]`);
  await expect(card.getByRole("heading", { name: player.name, exact: true })).toBeVisible();
  await expect(card).toContainText(`${player.sample.toLocaleString("en-US")} ${player.sampleLabel}`);
  await expect(card.locator("[data-nextgen-metric]")).toHaveCount(player.metrics.length);
  const explanation = card.locator("[data-nextgen-explanation]");
  await expect(explanation).not.toHaveAttribute("open", "");
  for (const metric of player.metrics) {
    const item = card.locator(`[data-nextgen-metric="${metric.id}"]`);
    await expect(item.locator("dt")).toHaveText(metric.label);
    const displayed = (await item.locator("dd > span").textContent())!;
    expect(numeric(displayed), `${player.name}: ${metric.id}`).toBeCloseTo(metric.value, 2);
    const suffix = metric.id === "completion_percentage_above_expectation" ? / pp$/
      : metric.unit === "seconds" ? / sec$/ : metric.unit === "yards" ? / yd$/
        : metric.unit === "percent" ? /%$/ : metric.unit === "ratio" ? /×$/ : /[\d]$/;
    expect(displayed).toMatch(suffix);
    await expect(card.locator(`[data-nextgen-definition="${metric.id}"]`)).toBeHidden();
  }
  await explanation.getByText("What these numbers mean", { exact: true }).click();
  for (const metric of player.metrics) {
    const definition = card.locator(`[data-nextgen-definition="${metric.id}"]`);
    await expect(definition).toBeVisible();
    await expect(definition.locator("dd")).toHaveText(metric.note);
  }
  await explanation.getByText("What these numbers mean", { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("tracking starts with one player and every published sample, measurement and definition remains explorable", async ({ page }) => {
  for (const year of [current.year, 2016]) {
    const source = collection.seasons.find((season) => season.year === year)!;
    expect(source, `NGS coverage for ${year}`).toBeTruthy();
    await page.goto(`/seasons/${year}?phase=regular#advanced-evidence`);
    await expect(desk(page)).toHaveAttribute("data-advanced-stats", String(year));
    await expect(desk(page)).toBeVisible();
    for (const group of groups) {
      const control = desk(page).locator(`[data-nextgen-group="${group}"]`);
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await expect(desk(page).locator("[data-nextgen-player]")).toHaveCount(source[group].length ? 1 : 0);
      if (source[group].length) await expect(desk(page).getByLabel("Player", { exact: true }).locator("option")).toHaveCount(source[group].length);
      for (const player of source[group]) await comparePlayer(page, player);
    }
    await expect(desk(page)).not.toContainText("not reconstructed player coordinates");
    await expect(desk(page)).not.toContainText("requires authorized API access");
    const guide = new URL((await desk(page).getByRole("link", { name: "Tracking guide & sources →" }).getAttribute("href"))!, "https://ajetsfan.com");
    expect(guide.pathname).toBe(`/seasons/${year}/guide`);
    expect(guide.searchParams.get("phase")).toBe("regular");
    expect(guide.hash).toBe("#tracking");
  }
});

test("keyboard controls reveal definitions and preserve the chosen player after changing groups", async ({ page }) => {
  const player = current.receiving[1] ?? current.receiving[0];
  await page.goto(`/seasons/${current.year}?phase=regular#advanced-evidence`);
  const receivers = desk(page).locator('[data-nextgen-group="receiving"]');
  await receivers.focus();
  await receivers.press("Space");
  await expect(receivers).toHaveAttribute("aria-pressed", "true");
  const selector = desk(page).getByLabel("Player", { exact: true });
  await selector.focus();
  await selector.selectOption(player.id);
  await expect(selector).toHaveValue(player.id);
  await expect(selector).toBeFocused();
  const explanation = desk(page).locator("[data-nextgen-explanation]");
  const summary = explanation.locator("summary");
  await summary.focus();
  await summary.press("Enter");
  await expect(explanation).toHaveAttribute("open", "");
  await expect(explanation.locator("dl")).toBeVisible();
  await summary.press("Space");
  await expect(explanation.locator("dl")).toBeHidden();
  await desk(page).locator('[data-nextgen-group="passing"]').click();
  await receivers.click();
  await expect(selector).toHaveValue(player.id);
  await expect(desk(page).locator("[data-nextgen-player]")).toHaveCount(1);
  await expect(explanation.locator("dl")).toBeHidden();
});

test("2010 exposes a concise coverage boundary without importing current players or public grades", async ({ page }) => {
  await page.goto("/seasons/2010?phase=regular#advanced-evidence");
  const stats = desk(page);
  await expect(stats.locator("[data-nextgen-unavailable]")).toHaveText("Next Gen coverage begins in 2016.");
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(0);
  await expect(stats.locator("[data-nextgen-group]")).toHaveCount(0);
  await expect(stats.locator("[data-pff-grade]")).toHaveCount(0);
  await expect(stats.locator("[data-pff-unavailable]")).toHaveText("No reviewed public PFF grades for 2010.");
  await expect(stats.getByRole("link", { name: "PFF guide & sources →" })).toBeVisible();
});

test("a chosen tracking player survives refresh and a guide round trip with the season context intact", async ({ page }) => {
  const player = current.receiving.at(-1)!;
  await page.goto(`/seasons/${current.year}?phase=regular&keep=film#advanced-evidence`);
  await desk(page).locator('[data-nextgen-group="receiving"]').click();
  await desk(page).getByLabel("Player", { exact: true }).selectOption(player.id);
  const selectedUrl = new URL(page.url());
  expect(selectedUrl.searchParams.get("ngs-group")).toBe("receiving");
  expect(selectedUrl.searchParams.get("ngs-player")).toBe(player.id);
  expect(selectedUrl.searchParams.get("keep")).toBe("film");
  await page.reload();
  await expect(desk(page).getByLabel("Player", { exact: true })).toHaveValue(player.id);
  await expect(desk(page).locator('[data-nextgen-group="receiving"]')).toHaveAttribute("aria-pressed", "true");
  await desk(page).getByRole("link", { name: "Tracking guide & sources →" }).click();
  await expect(page).toHaveURL(new RegExp(`/seasons/${current.year}/guide\\?.*#tracking$`));
  await page.locator('[data-season-return="context"]').first().click();
  await expect(desk(page).getByLabel("Player", { exact: true })).toHaveValue(player.id);
  await expect(desk(page)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("keep")).toBe("film");
  expect(new URL(page.url()).searchParams.get("phase")).toBe("regular");
  expect(new URL(page.url()).hash).toBe("#advanced-evidence");
});

test("playoffs withhold regular-season excerpts and browser Back restores the selected player group", async ({ page }) => {
  await page.goto(`/seasons/${current.year}?keep=advanced&phase=regular#advanced-evidence`);
  const stats = desk(page);
  await stats.locator('[data-nextgen-group="receiving"]').click();
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(current.receiving.length ? 1 : 0);
  await expect(stats.locator("[data-pff-grade]")).toHaveCount(publicPffGrades.filter((item) => item.year === current.year).length);
  await page.locator('[data-season-scope="playoffs"]').click();
  await expect(page.locator("[data-season-archive]")).toHaveAttribute("data-season-phase", "playoffs");
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(0);
  await expect(stats.locator("[data-nextgen-group]")).toHaveCount(0);
  await expect(stats.locator("[data-pff-grade]")).toHaveCount(0);
  await expect(stats.locator("[data-nextgen-unavailable]")).toHaveText("Next Gen tracking is available for the regular season only.");
  await expect(stats.locator("[data-pff-unavailable]")).toHaveText("No reviewed postseason PFF grades for this selection.");
  await page.goBack();
  await expect(stats.locator('[data-nextgen-group="receiving"]')).toHaveAttribute("aria-pressed", "true");
  await expect(stats.locator("[data-nextgen-player]")).toHaveCount(current.receiving.length ? 1 : 0);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("advanced");
});

test("2024 Davante Adams retains the published all-club workload visibly before opening any explanation", async ({ page }) => {
  const player = collection.seasons.find((season) => season.year === 2024)!.receiving.find((entry) => entry.name === "Davante Adams")!;
  expect(player.sample).toBe(141);
  expect(player.teams).toContain("LV");
  expect(player.teams).toContain("NYJ");
  await page.goto("/seasons/2024?phase=regular#advanced-evidence");
  await desk(page).locator('[data-nextgen-group="receiving"]').click();
  await desk(page).getByLabel("Player", { exact: true }).selectOption(player.id);
  const clubs = desk(page).locator(`[data-nextgen-player="${player.id}"] [data-nextgen-clubs]`);
  await expect(clubs).toBeVisible();
  await expect(clubs).toHaveText("All-club season aggregate: LV / NYJ.");
  await comparePlayer(page, player);
});

test("PFF keeps grade scale, rank pool and date visible while its notes and verification stay optional", async ({ page }) => {
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
      await expect(card).toContainText("0–100 scale");
      await expect(card.locator("h4")).toContainText(`#${item.rank}${item.population ? ` of ${item.population}` : ""}`);
      if (item.population === null) await expect(card.locator("h4")).not.toContainText(/\bof\s+\d+\b/);
      await expect(card.getByText(item.scope, { exact: true })).toBeVisible();
      await expect(card.locator("[data-pff-source-date]")).toBeVisible();
      const explanation = card.locator("[data-pff-explanation]");
      await expect(explanation.getByText(item.note, { exact: true })).toBeHidden();
      await explanation.locator("summary").click();
      await expect(explanation.getByText(item.note, { exact: true })).toBeVisible();
      await expect(explanation.getByRole("link", { name: /Verify at PFF/ })).toHaveAttribute("href", item.source);
    }
  }
  const hall = desk(page).locator('[data-pff-grade="hall-rushing-2025"]');
  await expect(hall).toContainText("does not give the qualifier count");
  await expect(hall.locator("[data-pff-source-date]")).toHaveText("Source Mar 5, 2026");
  await expect(desk(page).locator('[data-pff-grade="geno-overall-2026"]')).toHaveCount(0);
});

test("compact controls and open explanations reflow at 320px and 200% text without losing accessibility", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`/seasons/${current.year}?phase=regular#advanced-evidence`);
  await page.evaluate(() => document.fonts.ready);
  for (const scale of [100, 200]) {
    await page.evaluate((value) => { document.documentElement.style.fontSize = `${value}%`; }, scale);
    for (const group of groups) {
      await desk(page).locator(`[data-nextgen-group="${group}"]`).click();
      const explanation = desk(page).locator("[data-nextgen-explanation]");
      if (await explanation.count()) await explanation.locator("summary").click();
      expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))).toEqual({ width: 320, viewport: 320 });
      for (const target of await desk(page).locator("button:visible, a:visible, select:visible, summary:visible").all()) {
        const box = await target.boundingBox();
        expect(box?.height, `${scale}% ${await target.textContent()}`).toBeGreaterThanOrEqual(44);
        expect(box?.width, `${scale}% ${await target.textContent()}`).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await desk(page).locator("[data-pff-explanation] summary").first().click();
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    return (await axe.run(document.querySelector("[data-advanced-stats]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});
