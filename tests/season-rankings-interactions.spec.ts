import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RankingsCollection, RankingMetric } from "../src/lib/season-rankings";

// The rankings builder publishes the same snapshot read by the season route.
// Keep UI expectations tied to that dataset, rather than guessed league ranks.
const collection = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/season-rankings.json"), "utf8")) as RankingsCollection;
const season = collection.seasons.find((entry) => entry.year === 2010)!;
const regular = season.phases.regular;
const playerMetric = regular.individual.find((metric) => metric.players?.length)!;
const root = (page: Page) => page.locator("[data-season-rankings]");
const numeric = (value: string) => Number(value.replace(/[^0-9.-]/g, ""));

function expectDisplayedValue(actual: string, expected: number, metric: RankingMetric) {
  const decimals = metric.unit === "perGame" || metric.unit === "sacks" ? 1 : 0;
  expect(numeric(actual)).toBeCloseTo(expected, decimals);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("team ranks show the actual regular-season league population, values and recorded Jets games", async ({ page }) => {
  await page.goto("/seasons/2010?phase=regular#season-rankings");
  const rankings = root(page);
  await expect(rankings).toHaveAttribute("data-rank-phase", "regular");
  await expect(rankings.locator("[data-team-rank]")).toHaveCount(regular.team.length);
  expect(regular.team.length).toBeGreaterThan(0);
  for (const metric of regular.team) {
    const card = rankings.locator(`[data-team-rank="${metric.id}"]`);
    await expect(card).toHaveAttribute("data-rank-population", String(metric.population));
    await expect(card.getByRole("heading", { name: metric.label, exact: true })).toBeVisible();
    if (metric.jets) {
      const rank = card.locator("[data-rank-number]").first();
      await expect(rank).toHaveAttribute("data-rank-number", String(metric.jets.rank));
      await expect(rank).toHaveAttribute("data-rank-tied", metric.jets.tied ? "true" : "false");
      await expect(rank).toHaveAttribute("data-rank-of", String(metric.population));
      expectDisplayedValue((await card.locator("[data-team-value]").textContent())!, metric.jets.value, metric);
      await expect(card).toContainText(`${metric.jets.games} Jets games with recorded stats`);
      await expect(card).toContainText(metric.populationLabel);
    }
    await expect(card).toContainText(metric.note);
  }
  const coverage = rankings.locator("[data-rank-coverage]");
  expect(await coverage.locator("strong").allTextContents()).toEqual([regular.expectedGames, regular.teamGames, regular.playerGames, regular.jetsGames].map(String));
});

test("phase changes replace rankings and populations, with combined production labeled separately", async ({ page }) => {
  await page.goto("/seasons/2010?keep=phase&phase=regular#season-rankings");
  const rankings = root(page);
  await page.locator('[data-season-scope="playoffs"]').click();
  await expect(rankings).toHaveAttribute("data-rank-phase", "playoffs");
  await expect(rankings.getByRole("heading", { name: "Where the Jets stood.", exact: true })).toBeVisible();
  await expect(rankings).toContainText("Postseason populations include participating teams");
  for (const metric of season.phases.playoffs.team) {
    const card = rankings.locator(`[data-team-rank="${metric.id}"]`);
    await expect(card).toHaveAttribute("data-rank-population", String(metric.population));
    if (metric.jets) await expect(card.locator("[data-rank-number]").first()).toHaveAttribute("data-rank-number", String(metric.jets.rank));
  }
  await page.locator('[data-season-scope="all"]').click();
  await expect(rankings).toHaveAttribute("data-rank-phase", "all");
  await expect(rankings).toContainText("Combined regular-season and playoff production is a separate comparison");
  await page.goBack();
  await expect(rankings).toHaveAttribute("data-rank-phase", "playoffs");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("phase");
  expect(new URL(page.url()).hash).toBe("#season-rankings");
  await page.reload();
  await expect(rankings).toHaveAttribute("data-rank-phase", "playoffs");
});

test("league leader disclosures expose sourced top-rank context and tie rules", async ({ page }) => {
  await page.goto("/seasons/2010?phase=regular#season-rankings");
  const rankings = root(page);
  const metric = regular.team.find((entry) => entry.leaders.length)!;
  const disclosure = rankings.locator(`[data-rank-leaders="${metric.id}"]`);
  await disclosure.locator("summary").focus();
  await disclosure.locator("summary").press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(disclosure.locator("li")).toHaveCount(metric.leaders.length);
  for (const entry of metric.leaders) await expect(disclosure).toContainText(entry.name);
  await expect(rankings).toContainText("1, 1, 3");
  await expect(rankings).toContainText("Ranks use unrounded values");
  const sources = rankings.locator('a[target="_blank"]');
  expect(await sources.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))).toEqual([season.sources.schedule, season.sources.teams, season.sources.players]);
  for (const link of await sources.all()) {
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toContainText("opens in a new tab");
  }
});

test("Jets contributors show full-league ranks and separate New York contributions", async ({ page }) => {
  await page.goto(`/seasons/2010?phase=regular&rank-view=players&rank-metric=${playerMetric.id}#season-rankings`);
  const rankings = root(page);
  await expect(rankings).toHaveAttribute("data-ranking-view", "players");
  await expect(rankings.locator("[data-rank-metric]")).toHaveValue(playerMetric.id);
  await expect(rankings.locator("[data-rank-player]")).toHaveCount(playerMetric.players!.length);
  await expect(rankings).toContainText(playerMetric.populationLabel);
  await expect(rankings).toContainText("League totals include all clubs");
  for (const entry of playerMetric.players!) {
    const row = rankings.locator(`[data-rank-player="${entry.id}"]`);
    await expect(row).toHaveAttribute("data-player-rank", String(entry.rank));
    await expect(row.locator("[data-rank-number]")).toHaveAttribute("data-rank-of", String(playerMetric.population));
    await expect(row.locator("[data-rank-number]")).toHaveAttribute("data-rank-tied", entry.tied ? "true" : "false");
    await expect(row.getByRole("heading", { name: entry.name, exact: true })).toBeVisible();
    expectDisplayedValue((await row.locator("dd").nth(1).evaluate((element) => element.childNodes[0].textContent))!, entry.value, playerMetric);
    if (entry.jetsValue != null) {
      await expect(row).toHaveAttribute("data-player-jets-value", String(entry.jetsValue));
      expectDisplayedValue((await row.locator("dd").nth(2).evaluate((element) => element.childNodes[0].textContent))!, entry.jetsValue, playerMetric);
      await expect(row).toContainText(`${entry.jetsGames} Jets ${entry.jetsGames === 1 ? "game" : "games"} with stats`);
    }
    if (entry.teams?.length) await expect(row).toContainText(`Clubs: ${entry.teams.join(" · ")}`);
  }
});

test("metric, player search and ordering preserve unrelated archive filters through history and reload", async ({ page }) => {
  await page.goto(`/seasons/2010?keep=ranks&phase=regular&q=Patriots&rank-view=players&rank-metric=${playerMetric.id}#season-rankings`);
  const rankings = root(page);
  const entry = playerMetric.players![0];
  await rankings.locator("[data-rank-search]").fill(entry.name);
  const matching = playerMetric.players!.filter((player) => `${player.name} ${player.position ?? ""} ${player.teams?.join(" ") ?? ""}`.toLowerCase().includes(entry.name.toLowerCase()));
  await expect(rankings.locator("[data-rank-player]")).toHaveCount(matching.length);
  await rankings.locator("[data-rank-search]").fill("no-ranked-player-matches-519274");
  await expect(rankings.locator("[data-rank-player-empty]")).toBeVisible();
  await expect(rankings.locator("[data-rank-results]")).toHaveText(`0 of ${playerMetric.players!.length} Jets contributors shown`);
  await rankings.getByRole("button", { name: /Clear player search/ }).click();
  await expect(rankings.locator("[data-rank-player]")).toHaveCount(playerMetric.players!.length);
  await rankings.locator("[data-rank-sort]").selectOption("name");
  expect(await rankings.locator("[data-rank-player] h4").allTextContents()).toEqual([...playerMetric.players!].sort((a, b) => a.name.localeCompare(b.name)).map((player) => player.name));
  await rankings.locator("[data-rank-sort]").selectOption("jets");
  expect(await rankings.locator("[data-rank-player]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-rank-player")))).toEqual([...playerMetric.players!].sort((a, b) => (b.jetsValue ?? 0) - (a.jetsValue ?? 0) || a.rank - b.rank || a.name.localeCompare(b.name)).map((player) => player.id));
  const anotherMetric = regular.individual.find((metric) => metric.id !== playerMetric.id && metric.players?.length)!;
  await rankings.locator("[data-rank-metric]").selectOption(anotherMetric.id);
  await expect(rankings.locator("[data-rank-player]")).toHaveCount(anotherMetric.players!.length);
  await page.goBack();
  await expect(rankings.locator("[data-rank-metric]")).toHaveValue(playerMetric.id);
  await page.reload();
  await expect(rankings.locator("[data-rank-sort]")).toHaveValue("jets");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("ranks");
  expect(new URL(page.url()).searchParams.get("q")).toBe("Patriots");
  expect(new URL(page.url()).searchParams.get("phase")).toBe("regular");
  expect(new URL(page.url()).hash).toBe("#season-rankings");
});

const multiClub = collection.seasons.flatMap((entry) => Object.values(entry.phases).flatMap((phase) => phase.individual.flatMap((metric) => (metric.players ?? []).filter((player) => (player.teams?.length ?? 0) > 1 && player.jetsValue != null && player.jetsValue !== player.value).map((player) => ({ season: entry, phase, metric, player })))))[0];
test("a player who changed clubs keeps his league total distinct from the Jets contribution", async ({ page }) => {
  expect(multiClub, "The historical snapshot should retain at least one contributor with production for multiple clubs").toBeTruthy();
  const { season: selectedSeason, phase, metric, player } = multiClub;
  await page.goto(`/seasons/${selectedSeason.year}?phase=${phase.phase}&rank-view=players&rank-metric=${metric.id}#season-rankings`);
  const row = root(page).locator(`[data-rank-player="${player.id}"]`);
  await expect(row).toContainText(`Clubs: ${player.teams!.join(" · ")}`);
  expectDisplayedValue((await row.locator("dd").nth(1).evaluate((element) => element.childNodes[0].textContent))!, player.value, metric);
  expectDisplayedValue((await row.locator("dd").nth(2).evaluate((element) => element.childNodes[0].textContent))!, player.jetsValue!, metric);
  await expect(row).toHaveAttribute("data-player-jets-value", String(player.jetsValue));
  await expect(row.locator("[data-rank-number]")).toHaveAttribute("data-rank-number", String(player.rank));
});

test("an earlier year without a full league snapshot exposes the gap instead of inferred ranks", async ({ page }) => {
  await page.goto("/seasons/1968#season-rankings");
  const rankings = root(page);
  await expect(rankings).toHaveAttribute("data-season-rankings", "1968");
  await expect(rankings.locator("[data-rank-unavailable]")).toContainText("not available for the 1968 season");
  await expect(rankings.locator("[data-team-rank]")).toHaveCount(0);
  await expect(rankings.locator("[data-rank-player]")).toHaveCount(0);
});

const noJetsFinals = collection.seasons.flatMap((entry) => Object.values(entry.phases).map((phase) => ({ season: entry, phase }))).find(({ phase }) => phase.jetsGames === 0 && phase.expectedGames > 0 && !phase.missingTeamGames.length);
test("a postseason without Jets finals does not invent a Jets league finish", async ({ page }) => {
  expect(noJetsFinals, "Historical coverage should include a postseason the Jets did not enter").toBeTruthy();
  const { season: selectedSeason, phase } = noJetsFinals!;
  await page.goto(`/seasons/${selectedSeason.year}?phase=${phase.phase}#season-rankings`);
  const rankings = root(page);
  await expect(rankings.locator("[data-rank-no-jets]")).toContainText("does not imply a Jets finish");
  await expect(rankings.locator("[data-team-rank] [data-rank-number]")).toHaveCount(0);
  await rankings.locator('[data-rank-view="players"]').click();
  await expect(rankings.locator("[data-rank-player]")).toHaveCount(0);
});

const incomplete = collection.seasons.flatMap((entry) => Object.values(entry.phases).map((phase) => ({ season: entry, phase }))).find(({ phase }) => phase.missingTeamGames.length || phase.missingPlayerGames.length);
test("incomplete league coverage names missing finals and withholds affected metric ranks", async ({ page }) => {
  test.skip(!incomplete, "This published snapshot has no incomplete league phases.");
  const { season: selectedSeason, phase } = incomplete!;
  await page.goto(`/seasons/${selectedSeason.year}?phase=${phase.phase}#season-rankings`);
  const rankings = root(page);
  const gap = rankings.locator("[data-rank-gap]");
  await expect(gap).toBeVisible();
  await expect(gap).toContainText("Affected rankings are withheld");
  await gap.locator("summary").click();
  for (const id of phase.missingTeamGames) await expect(gap).toContainText(id);
  for (const id of phase.missingPlayerGames) await expect(gap).toContainText(id);
  await expect(rankings.locator("[data-team-rank]")).toHaveCount(phase.team.length);
  // Final-score comparisons can remain complete when yardage box scores are
  // missing, and individually reconciled player metrics can remain publishable.
  // The builder owns that distinction; the UI must preserve its published set.
  await rankings.locator('[data-rank-view="players"]').click();
  await expect(rankings.locator("[data-rank-metric] option")).toHaveCount(phase.individual.length);
});

test("rank cards and expanded contributor controls reflow at 320px and 200% text with accessible targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/seasons/2010?phase=regular#season-rankings");
  const rankings = root(page);
  for (const scale of [100, 200]) {
    await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale}%`; }, scale);
    for (const view of ["team", "players"]) {
      await rankings.locator(`[data-rank-view="${view}"]`).click();
      if (view === "players") await rankings.locator("[data-rank-metric]").selectOption(playerMetric.id);
      await rankings.locator("[data-rank-leaders]").first().locator("summary").click();
      const notes = rankings.getByText("Coverage and calculation notes", { exact: false });
      if (await notes.count() && (await notes.locator("..").getAttribute("open")) === null) await notes.click();
      const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(width.content, `${scale}% text / ${view}`).toBeLessThanOrEqual(width.viewport + 1);
      for (const target of await rankings.locator("button:visible, input:visible, select:visible, summary:visible, a:visible").all()) {
        const rect = await target.boundingBox();
        expect(rect?.height, `${scale}% ${await target.textContent()}`).toBeGreaterThanOrEqual(44);
        expect(rect?.width, `${scale}% ${await target.textContent()}`).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run(document.querySelector("[data-season-rankings]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});
