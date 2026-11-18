import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { SeasonAnalytics } from "../src/lib/analytics";
import type { CoverageSnapshot } from "../src/lib/coverage";
import type { CurrentSnapshot } from "../src/lib/current";
import { selectLead } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import type { CurvePoint } from "../src/lib/load-games";
import { buildFocus, leadPlace } from "../src/lib/focus";
import { mediaCollection } from "../src/lib/media-catalog";
import { SECTIONS } from "../src/lib/site-sections";
import { buildTeamFocus } from "../src/lib/team-focus";

const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public/data", file), "utf8")) as T;
const snapshot = read<CurrentSnapshot>("current.json");
const coverage = read<CoverageSnapshot>("coverage.json");
const games = read<Game[]>("games.json");
const lead = selectLead(games, snapshot);
const curveFile = lead.kind === "current" && lead.analysis ? `curves/${lead.analysis.id}.json` : null;
const curve = lead.kind === "current" && lead.analysisStatus === "ready" && curveFile && existsSync(path.join(process.cwd(), "public/data", curveFile)) ? read<CurvePoint[]>(curveFile).filter((point) => typeof point.wp === "number") : [];
const analytics = read<SeasonAnalytics>("analytics.json");
const focus = buildFocus({ games, snapshot, curve, media: mediaCollection, analytics });
const team = buildTeamFocus(coverage, snapshot.season);
const record = (w: number, l: number, t: number) => `${w}–${l}${t ? `–${t}` : ""}`;

test("new playable coverage remains eligible for the landing page when publisher art needs a title card", () => {
  const video = mediaCollection.items.find((item) => item.youtubeId && item.embedAllowed !== false)!;
  const result = buildFocus({ games, snapshot, curve, media: { ...mediaCollection, items: [{ ...video, image: null, context: "current" as const, seasons: [snapshot.season] }] } });
  expect(result.media?.id).toBe(video.id);
  expect(result.media?.item.image).toBeNull();
});

async function axe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await run.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
  });
}

test.beforeEach(async ({ page }) => {
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("the home page shows only this week and this season", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#top")).toHaveCount(0);
  await expect(page.locator("#miracle, #people, #today, #film, #discovery")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  if (focus.last) {
    const verb = focus.last.outcome === "win" ? "Won" : focus.last.outcome === "loss" ? "Lost" : "Tied";
    await expect(page.locator("#last-heading")).toHaveText(`${verb} ${focus.last.us}–${focus.last.them} ${focus.last.home ? "vs" : "at"} ${focus.last.place}.`);
    await expect(page.locator("#last")).toContainText(`Last game · ${focus.last.postseason ? "Playoffs" : `Week ${focus.last.week}`}`);
    await expect(page.locator("#last a").filter({ hasText: focus.last.hrefLabel })).toHaveAttribute("href", focus.last.href);
  }
  if (focus.next) await expect(page.locator("#next-heading")).toContainText(focus.next.home ? leadPlace(focus.next.place) : `At ${focus.next.place}`);
  if (focus.season) {
    await expect(page.locator("#season-heading")).toContainText(record(focus.season.wins, focus.season.losses, focus.season.ties));
    await expect(page.locator("[data-week-state]")).toHaveCount(focus.season.weeks.length);
    for (const state of ["win", "loss", "tie", "next", "bye"] as const) await expect(page.locator(`[data-week-state="${state}"]`)).toHaveCount(focus.season.weeks.filter((week) => week.state === state).length);
  }
  if (focus.division) await expect(page.locator("#division-heading")).toContainText(focus.division.place === 1 ? "in the" : focus.division.leader);
  if (team.stats.leaders.length) {
    await expect(page.locator("#leaders")).toBeVisible();
    await expect(page.locator("#leaders").getByRole("link", { name: /^Every player’s numbers/ })).toHaveAttribute("href", "/team/stats");
    await expect(page.locator("#leaders").getByRole("link", { name: /^Find a player/ })).toHaveAttribute("href", "/team/roster");
  }
  if (team.news.lead) {
    await expect(page.locator("#headlines")).toBeVisible();
    await expect(page.locator("#headlines").getByRole("link", { name: /^All team news/ })).toHaveAttribute("href", "/team/news");
  }
  await expect(page.locator("#more").getByText(/Results checked/)).toBeVisible();
});

test("every section stays one step away, and the home page mounts none of the heavy experiences", async ({ page }) => {
  await page.goto("/");
  const sections = page.getByRole("navigation", { name: "Site sections" });
  expect(await sections.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(SECTIONS.map((section) => section.href));
  await expect(page.locator("#visual-story, #fan-stand, #game-evidence, #playbook-lab, [data-home-disclosure]")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Browse sections", exact: true }).click();
  const directory = page.getByRole("dialog", { name: "Browse sections" });
  await expect(directory.getByRole("link", { name: "Find a game" })).toBeInViewport();
  await expect(directory.getByRole("navigation", { name: "All sections" }).getByRole("link")).toHaveCount(SECTIONS.length);
});

test("On this page opens a sheet over the current screen and puts the reader back where they were", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  await page.locator(`#${ids[1]}`).scrollIntoViewIfNeeded();
  await page.evaluate((id) => document.getElementById(id)!.scrollIntoView({ block: "start" }), ids[1]);
  const before = await page.evaluate(() => scrollY);
  const opener = page.getByRole("link", { name: "On this page", exact: true });
  // Tap the sticky bar without scrolling it into view.
  const box = (await opener.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const menu = page.getByRole("dialog", { name: "On this page" });
  await expect(menu).toBeVisible();
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveCount(ids.length - 1);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await opener.click();
  await menu.getByRole("navigation", { name: "On this page" }).getByRole("link").last().click();
  await expect(menu).toBeHidden();
  await expect(page.locator(`#${ids.at(-2)}`)).toBeInViewport();
  await opener.click();
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(menu).toBeHidden();
});

test("each moment shows one thing and opens its detail in place", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  // Each moment is as tall as what it shows: below its last visible element there is only its own padding.
  const slack = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => {
    const bottom = Math.max(...[...moment.children].map((child) => child.getBoundingClientRect()).filter((box) => box.height > 0).map((box) => box.bottom));
    return moment.getBoundingClientRect().bottom - bottom - Number.parseFloat(getComputedStyle(moment).paddingBottom);
  }));
  expect(Math.max(...slack)).toBeLessThanOrEqual(24);
  if (focus.last && focus.last.line.length >= 2) {
    const chart = page.locator("[data-focus-chart]");
    await expect(chart).toHaveAttribute("aria-label", new RegExp(`${Math.round(focus.last.line[0][0] * 100)}% at kickoff`));
    await page.getByRole("button", { name: "Show chart labels" }).click();
    await expect(page.locator("[data-focus-keys] span")).toHaveCount(3);
    await chart.focus();
    await page.keyboard.press("ArrowRight");
    await expect(chart.getByRole("status")).toHaveText(new RegExp(`^Q1 · ${Math.round(focus.last.line[0][0] * 100)}%$`));
  }
  if (team.news.lead) {
    const leadNews = page.locator(`#headlines [data-inline-news="${team.news.lead.id}"]`);
    await leadNews.locator(":scope > summary").click();
    await expect(leadNews.locator("[data-news-details]")).toBeVisible();
  }
  if (focus.media) {
    await expect(page.locator(`#media [data-inline-media="${focus.media.id}"]`)).toBeVisible();
    await expect(page.locator("#media a")).toHaveAttribute("href", "/media");
  }
});

test("the turning point sits on its play and opens from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const marker = page.locator("#last summary").filter({ hasText: "Turning point" });
  const turningPoint = focus.last?.turningPoint;
  if (!turningPoint) {
    await expect(marker).toHaveCount(0);
    return;
  }
  const chart = page.locator("[data-focus-chart]");
  const plot = (await chart.locator("svg").boundingBox())!;
  const target = (await marker.boundingBox())!;
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  expect(target.x + target.width / 2).toBeCloseTo(plot.x + plot.width * turningPoint.index / (focus.last!.line.length - 1), 0);
  expect(target.y + target.height / 2).toBeCloseTo(plot.y + plot.height * (1 - focus.last!.line[turningPoint.index][0]), 0);
  const description = page.getByText(turningPoint.description, { exact: true });
  await expect(description).toBeHidden();
  await chart.focus();
  await page.keyboard.press("Tab");
  await expect(marker).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(description).toBeVisible();
  await expect(page.locator("#last")).toContainText(turningPoint.clock);
  await expect(page.locator("#last")).toContainText(turningPoint.change);
  await expect(page.getByRole("link", { name: "See the play in the game report" })).toHaveAttribute("href", turningPoint.href);
  await page.keyboard.press("Space");
  await expect(description).toBeHidden();
});

test("the turning point opens by touch without JavaScript and links to the source play", async ({ browser, baseURL }) => {
  const turningPoint = focus.last?.turningPoint;
  test.skip(!turningPoint, "No turning point is published for this edition");
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, hasTouch: true, viewport: { width: 320, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.locator("#last summary").filter({ hasText: "Turning point" }).tap();
    await expect(page.getByText(turningPoint!.description, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "See the play in the game report" }).tap();
    await expect(page).toHaveURL((url) => url.hash === "#play");
    await expect(page.locator("#play")).toContainText(turningPoint!.description);
  } finally {
    await context.close();
  }
});

test("wide screens keep an index of the moments that follows the one in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const index = page.getByRole("navigation", { name: "On this page" });
  await expect(index).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse sections", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "On this page", exact: true })).toBeHidden();
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  await expect(index.getByRole("link")).toHaveCount(ids.length);
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", `#${ids[0]}`);
  await page.locator("body").click({ position: { x: 900, y: 120 } });
  await page.keyboard.press("ArrowDown");
  await expect(index.locator("a[aria-current]")).toHaveAttribute("href", `#${ids[1]}`);
});

for (const width of [1280, 390, 320]) {
  test(`the home page reflows and passes automated accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await axe(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("main")).toHaveCount(1);
  });
}

test("old section bookmarks open the new destination and preserve unrelated URL state", async ({ page }) => {
  for (const [hash, target, anchor] of [
    ["postgame", "/games/", "#game-report-heading"],
    ["game-evidence", "/games/", "#game-evidence"],
    ["sunday-briefing", "/game-day", "#sunday-briefing"],
    ["visual-story", "/stories", "#visual-story"],
    ["fan-stand", "/history", "#fan-stand"],
    ["remembered-cases", "/history", "#remembered-cases"],
    ["rivalry-desk", "/history", "#rivalry-desk"],
    ["miracle", "/stories/monday-night-miracle", "#journey"],
    ["people", "/history", "#people"],
    ["film", "/film-room", "#play-wilson-cleveland"],
    ["discovery", "/discover", "#same-score"],
  ]) {
    await page.goto(`/?keep=orientation#${hash}`);
    await expect.poll(() => new URL(page.url()).pathname).toContain(target);
    await expect(page.locator(anchor)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("keep")).toBe("orientation");
    expect(new URL(page.url()).hash).toBe(anchor);
  }
  await page.goto("/?keep=orientation#season");
  await expect(page.locator("#season")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).hash).toBe("#season");
});

test("the home page reflows at 320px with 200% text and keeps usable targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const target of await page.locator("main a:visible, main button:visible, header a:visible").all()) {
    const rect = await target.boundingBox();
    expect(rect!.height, await target.textContent() ?? "").toBeGreaterThanOrEqual(44);
    expect(rect!.width, await target.textContent() ?? "").toBeGreaterThanOrEqual(44);
  }
});

test("page exploration still works with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? "3107"}/`);
  if (focus.last) {
    await page.locator("#last a").filter({ hasText: focus.last.hrefLabel }).click();
    await expect(page).toHaveURL(new RegExp(focus.last.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? "3107"}/`);
  await page.getByRole("navigation", { name: "Site sections" }).getByRole("link", { name: /^Game Day/ }).click();
  await expect(page).toHaveURL(/\/game-day$/);
  const schedule = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "See the full" }) });
  await schedule.locator("summary").click();
  await expect(schedule.locator("ol")).toBeVisible();
  await context.close();
});

test("a stale static edition warns the reader after the updater stops", async ({ page }) => {
  await page.clock.install({ time: new Date(Date.parse(snapshot.checkedAt) + 3 * 24 * 60 * 60_000) });
  await page.goto("/");
  const status = page.getByRole("status", { name: "Results update status" });
  await expect(status).toContainText("Update overdue.");
  await expect(status).toContainText("newer results may be missing");
});

test("the home matchup follows the available units and current fixture", () => {
  test.skip(!focus.next?.matchup, "No upcoming measured fixture in this edition");
  const opponent = snapshot.schedule.find((game) => game.id === focus.next!.id)!;
  const build = (sample: SeasonAnalytics, current = snapshot) => buildFocus({ games, snapshot: current, curve, media: mediaCollection, analytics: sample }).next;
  const missingPassOffense = {
    ...analytics,
    teams: analytics.teams.map((team) => team.team === opponent.opponent
      ? { ...team, offense: { ...team.offense, passEpaPerPlay: null } }
      : team),
  };
  const alternative = build(missingPassOffense)?.matchup;
  if (alternative) expect(alternative.href).not.toContain("pass-defense");
  expect(build({ ...analytics, season: analytics.season - 1 })?.matchup).toBeNull();
  if (opponent.kickoff) expect(build(analytics, { ...snapshot, checkedAt: opponent.kickoff })?.matchup).toBeNull();
});

test("the kickoff opens the measured matchup and falls back when the edition ages", async ({ page }) => {
  test.skip(!focus.next?.matchup || !snapshot.checkedAt, "No upcoming measured matchup in this edition");
  const matchup = focus.next!.matchup!;
  const checked = Date.parse(snapshot.checkedAt);
  await page.clock.install({ time: new Date(checked) });
  await page.goto("/");
  const action = page.locator("#next a");
  await expect(action).toHaveText(new RegExp(matchup.label));
  await expect(action).toHaveAttribute("href", matchup.href);
  await action.click();
  const unit = page.locator(`[id="${matchup.href.split("#")[1]}"]`);
  await expect(unit.getByRole("heading")).toHaveText(matchup.label);
  await expect(unit).toBeInViewport();
  await page.goBack();
  await page.clock.fastForward(86_400_000 + 120_000);
  await expect(action).toHaveAttribute("href", "/game-day");
});
