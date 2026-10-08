import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import { selectLead } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import type { CurvePoint } from "../src/lib/load-games";
import { buildFocus } from "../src/lib/focus";
import { mediaCollection } from "../src/lib/media-catalog";
import { SECTIONS } from "../src/lib/site-sections";

const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public/data", file), "utf8")) as T;
const snapshot = read<CurrentSnapshot>("current.json");
const games = read<Game[]>("games.json");
const lead = selectLead(games, snapshot);
const curveFile = lead.analysis ? `curves/${lead.analysis.id}.json` : null;
const curve = lead.analysisStatus === "ready" && curveFile && existsSync(path.join(process.cwd(), "public/data", curveFile)) ? read<CurvePoint[]>(curveFile).filter((point) => typeof point.wp === "number") : [];
const focus = buildFocus({ games, snapshot, curve, media: mediaCollection });
const record = (w: number, l: number, t: number) => `${w}–${l}${t ? `–${t}` : ""}`;

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

test("the home page leads with the latest final, then the next game, the season and the division", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#top")).toHaveCount(0);
  if (focus.last) {
    const verb = focus.last.outcome === "win" ? "Won" : focus.last.outcome === "loss" ? "Lost" : "Tied";
    await expect(page.locator("#last-heading")).toHaveText(`${verb} ${focus.last.us}–${focus.last.them} ${focus.last.home ? "vs" : "at"} ${focus.last.place}.`);
    await expect(page.locator("#last")).toContainText(focus.last.archive ? "From the archive" : `Last game · ${focus.last.postseason ? "Playoffs" : `Week ${focus.last.week}`}`);
    await expect(page.locator("#last a").filter({ hasText: focus.last.hrefLabel })).toHaveAttribute("href", focus.last.href);
  }
  if (focus.next) await expect(page.locator("#next-heading")).toContainText(focus.next.home ? focus.next.place : `At ${focus.next.place}`);
  if (focus.season) {
    await expect(page.locator("#season-heading")).toContainText(record(focus.season.wins, focus.season.losses, focus.season.ties));
    await expect(page.locator("[data-week-state]")).toHaveCount(focus.season.weeks.length);
    for (const state of ["win", "loss", "tie", "next", "bye"] as const) await expect(page.locator(`[data-week-state="${state}"]`)).toHaveCount(focus.season.weeks.filter((week) => week.state === state).length);
  }
  if (focus.division) await expect(page.locator("#division-heading")).toContainText(focus.division.place === 1 ? "in the" : focus.division.leader);
  await expect(page.locator("#more").getByText(/Results checked/)).toBeVisible();
});

test("every section stays one step away, and the home page mounts none of the heavy experiences", async ({ page }) => {
  await page.goto("/");
  const sections = page.getByRole("navigation", { name: "Site sections" });
  expect(await sections.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(SECTIONS.map((section) => section.href));
  await expect(page.locator("#visual-story, #fan-stand, #game-evidence, #playbook-lab, [data-home-disclosure]")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByRole("navigation", { name: "All sections" }).getByRole("link")).toHaveCount(SECTIONS.length);
});

test("Menu opens a sheet over the current screen and puts the reader back where they were", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  await page.locator(`#${ids[1]}`).scrollIntoViewIfNeeded();
  await page.evaluate((id) => document.getElementById(id)!.scrollIntoView({ block: "start" }), ids[1]);
  const before = await page.evaluate(() => scrollY);
  const opener = page.getByRole("button", { name: "Menu", exact: true });
  // Tap where the button is: a locator click would first scroll the sticky bar "into view" and move the page.
  const box = (await opener.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("navigation", { name: "This page" }).getByRole("link")).toHaveCount(ids.length - 1);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await opener.click();
  await menu.getByRole("navigation", { name: "This page" }).getByRole("link").last().click();
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
  const heights = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.getBoundingClientRect().height));
  // Each phone screen stops 28px short so the next one's edge shows.
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(844 - 56 - 28 - 1);
  if (focus.last && focus.last.line.length >= 2) {
    const chart = page.locator("[data-focus-chart]");
    await expect(chart).toHaveAttribute("aria-label", new RegExp(`${Math.round(focus.last.line[0][0] * 100)}% at kickoff`));
    // The line itself is the control: a tap shows the key moments, Enter hides them again.
    await expect(chart).toHaveAttribute("aria-pressed", "false");
    const box = (await chart.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("[data-focus-keys] span")).toHaveCount(3);
    await expect(chart).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    await chart.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-focus-keys]")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(chart.getByRole("status")).toHaveText(new RegExp(`^Q1 · ${Math.round(focus.last.line[0][0] * 100)}%$`));
  }
  if (focus.next) {
    await page.getByRole("button", { name: "What each result means" }).click();
    await expect(page.locator("#next [data-focus-reveal]")).toContainText(`A win makes them ${record((focus.season?.wins ?? 0) + 1, focus.season?.losses ?? 0, focus.season?.ties ?? 0)}`);
  }
  if (focus.film) {
    const field = page.locator("[data-focus-field]");
    await expect(field).toHaveAttribute("data-time", "0.0");
    await page.locator("[data-focus-play]").click();
    await expect(field).toHaveAttribute("data-time", "6.0");
  }
  if (focus.media) await expect(page.locator("#media a")).toHaveAttribute("href", `/media?media=${focus.media.id}`);
});

test("wide screens keep an index of the moments that follows the one in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const index = page.getByRole("navigation", { name: "On this page" });
  await expect(index).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
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
  ]) {
    await page.goto(`/?keep=orientation#${hash}`);
    await expect.poll(() => new URL(page.url()).pathname).toContain(target);
    await expect(page.locator(anchor)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("keep")).toBe("orientation");
    expect(new URL(page.url()).hash).toBe(anchor);
  }
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
