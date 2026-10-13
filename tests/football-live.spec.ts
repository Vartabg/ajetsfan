import { test, expect, type Page } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { showFootballMoment } from "../src/components/football-live-card";
import { formatCheckedAt } from "../src/lib/current";
import { teamIdentity } from "../src/lib/teams";
import { validateLiveFootball, type LiveFootballFeed, type LiveFootballGame } from "../src/lib/football-live";

// Playwright transforms JSX into its own serialized objects. Compile the actual
// server component with React JSX so these fixtures exercise its real markup.
const cardFile = path.join(process.cwd(), "src/components/football-live-card.tsx");
const cardExports: { default?: (props: { feed: LiveFootballFeed; boxScore: boolean }) => React.ReactNode } = {};
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
runInNewContext(ts.transpileModule(readFileSync(cardFile, "utf8"), { fileName: cardFile,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText,
{ exports: cardExports, require: (name: string) => name === "@/lib/current" ? { formatCheckedAt }
  : name === "@/lib/teams" ? { teamIdentity } : nodeRequire(name) });
const FootballLiveCard = cardExports.default!;

const checkedAt = "2026-10-13T21:00:00.000Z";
const game: LiveFootballGame = { eventId: "401547999", gameId: "2026_06_CHI_NYJ", season: 2026, week: 6, seasonType: "REG",
  kickoff: "2026-10-13T19:00:00.000Z", opponent: "CHI", opponentDisplay: "CHI", atHome: true,
  state: "live", jetsScore: 14, oppScore: 17, period: 3, clock: "08:24", detail: "3rd quarter", provisional: true,
  players: [{ espnId: "123456", name: "Jets Quarterback", position: "QB", passing: { completions: null, attempts: 23, yards: 145, touchdowns: 0, interceptions: 1 }, rushing: null, receiving: null },
    { espnId: "654321", name: "Jets Receiver", position: "Unknown", passing: null, rushing: null, receiving: { receptions: 3, targets: null, yards: 0, touchdowns: 0 } }] };
function feed(patch: Partial<LiveFootballGame> = {}, status: LiveFootballFeed["status"] = "ready"): LiveFootballFeed {
  const featured = { ...game, ...patch };
  return validateLiveFootball({ schemaVersion: 1, season: 2026, source: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/20/schedule?season=2026&seasontype=2",
    attemptedAt: checkedAt, checkedAt: status === "unavailable" ? null : checkedAt, status,
    games: status === "unavailable" ? [] : [featured], featured: status === "unavailable" ? null : featured });
}
function markup(value: LiveFootballFeed, boxScore = false) {
  return renderToStaticMarkup(createElement(FootballLiveCard, { feed: value, boxScore }));
}
async function cardPage(page: Page, value: LiveFootballFeed, boxScore = false) {
  await page.setContent(`<html lang="en"><head><title>Jets game totals</title><style>html{--bg:#f2f4f0;--raise:#e5eae3;--ink:#10201a;--quiet:#55635b;--faint:#c6d0c7;font:16px system-ui}body{margin:16px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head><body><main>${markup(value, boxScore)}</main></body></html>`);
}

test("live score and game totals are provisional, with missing fields distinct from a recorded zero", async ({ page }) => {
  await cardPage(page, feed(), true);
  await expect(page.locator("[data-football-game-status]")).toHaveText("In progress · Q3 · 08:24 · Week 6");
  await expect(page.locator("[data-football-score]")).toHaveText("Jets 14 – Bears 17");
  await expect(page.locator("[data-football-card]")).toHaveAttribute("data-football-provisional", "true");
  await expect(page.locator("[data-football-provisional-note]")).toContainText("provisional until the source confirms the final");
  await page.locator('[data-football-player-category="passing"] summary').click();
  await expect(page.locator('[data-football-player="123456"] td')).toHaveText(["—/23", "145", "0", "1"]);
  await page.locator('[data-football-player-category="receiving"] summary').click();
  await expect(page.locator('[data-football-player="654321"] td')).toHaveText(["3", "—", "0", "0"]);
  await expect(page.locator('[data-football-player="654321"] th')).not.toContainText("Unknown");
  await expect(page.locator("[data-football-box-score]")).toContainText("Season totals are shown separately below");
});

test("a confirmed final has no live clock or provisional label and preserves its source check", async ({ page }) => {
  await cardPage(page, feed({ state: "final", provisional: false, period: 4, clock: "00:00", detail: "Final", jetsScore: 24, oppScore: 17 }), true);
  await expect(page.locator("[data-football-game-status]")).toHaveText("Final · Week 6");
  await expect(page.locator("[data-football-score]")).toHaveText("Jets 24 – Bears 17");
  await expect(page.locator("[data-football-provisional-note]")).toHaveCount(0);
  await expect(page.locator("[data-football-box-score]")).toContainText("Final game totals from ESPN");
  await expect(page.locator(`time[datetime="${checkedAt}"]`)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "ESPN game feed" })).toHaveAttribute("href", "https://www.espn.com/nfl/game/_/gameId/401547999");
});

test("team totals disclose only the provider’s exact labels and values", async ({ page }) => {
  await cardPage(page, feed({ teamStats: [{ name: "totalYards", label: "Total yards", displayValue: "245" },
    { name: "thirdDownEff", label: "Third down efficiency", displayValue: "3-10" }] }), true);
  const totals = page.locator("[data-football-team-totals]");
  await expect(totals).not.toHaveAttribute("open", "");
  await expect(totals.locator("dl")).not.toBeVisible();
  await totals.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(totals.locator("dt")).toHaveText(["Total yards", "Third down efficiency"]);
  await expect(totals.locator("dd")).toHaveText(["245", "3-10"]);
  await cardPage(page, feed({ teamStats: [] }), true);
  await expect(page.locator("[data-football-team-totals]")).toHaveCount(0);
  await cardPage(page, feed(), true);
  await expect(page.locator("[data-football-team-totals]")).toHaveCount(0);
});

test("a failed live check keeps its last known score and cannot claim a fresh clock", async ({ page }) => {
  await cardPage(page, feed({}, "retained"));
  await expect(page.locator("[data-football-game-status]")).toHaveText("Last known score · Q3 · 08:24 · Week 6");
  await expect(page.locator("[data-football-retained]")).toContainText("score or clock may have changed");
  await expect(page.locator("[data-football-score]")).toHaveText("Jets 14 – Bears 17");
  expect(markup(feed({}, "unavailable"))).toBe("");
});

test("missing player totals and suspended play remain explicit without invented zeros or a final", async ({ page }) => {
  await cardPage(page, feed({ state: "suspended", detail: "Play suspended", players: [], jetsScore: null, oppScore: null }), true);
  await expect(page.locator("[data-football-game-status]")).toContainText("Suspended");
  await expect(page.locator("[data-football-score]")).toHaveCount(0);
  await expect(page.locator("[data-football-no-player-totals]")).toContainText("Missing totals are not treated as zero");
});

test("the upcoming game returns after the caught-up postgame window", () => {
  const final = feed({ state: "final", provisional: false, detail: "Final", clock: "00:00" });
  expect(showFootballMoment(final, game.gameId, Date.parse(checkedAt))).toBe(true);
  expect(showFootballMoment(final, game.gameId, Date.parse(checkedAt) + 8 * 60 * 60_000)).toBe(false);
  expect(showFootballMoment(final, "2026_05_NYJ_MIN", Date.parse(checkedAt) + 8 * 60 * 60_000)).toBe(true);
  expect(showFootballMoment(feed({ state: "scheduled", provisional: false, jetsScore: null, oppScore: null, period: 0, clock: null, detail: "Scheduled" }), undefined, Date.parse(checkedAt))).toBe(false);
});

test("game totals reflow at 320px with doubled text and retain accessible table labels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await cardPage(page, feed(), true);
  await page.addStyleTag({ content: "html{font-size:200%!important}" });
  for (const summary of await page.locator("[data-football-player-category] summary").all()) await summary.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("region", { name: "Passing game totals", exact: true })).toBeVisible();
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map((value) => value.id);
  });
  expect(violations).toEqual([]);
});

async function watch(page: Page, destination = "/game-day?keep=context#season") {
  const response = await page.request.get("/api/football/status");
  expect(response.ok()).toBe(true);
  const actual = await response.json() as { schemaVersion: 1; revision: string; season: number; checkedAt: string | null };
  let wanted = actual.revision, checks = 0, refreshes = 0;
  page.on("request", (request) => { if (request.headers().rsc === "1" && !request.headers()["next-router-prefetch"]) refreshes++; });
  await page.route("**/api/football/status", async (route) => {
    checks++;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...actual, revision: wanted, live: true, active: true }) });
  });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>' }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const state = window as unknown as Window & { footballStatusReads: number };
    state.footballStatusReads = 0;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const input = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (new URL(input, location.href).pathname === "/api/football/status") {
        const read = response.text.bind(response);
        response.text = async () => { const value = await read(); state.footballStatusReads++; return value; };
      }
      return response;
    };
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto(destination);
  await expect(page.locator("[data-football-refresh]")).toHaveCount(1);
  await expect.poll(async () => { await page.clock.runFor(10); return checks; }).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { footballStatusReads: number }).footballStatusReads)).toBe(1);
  return { change: () => { wanted = `${actual.revision}-changed`; }, checks: () => checks, refreshes: () => refreshes };
}

test("an unchanged football revision does not refresh an open page", async ({ page }) => {
  const state = await watch(page);
  await page.clock.runFor(31_000);
  await expect.poll(state.checks).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { footballStatusReads: number }).footballStatusReads)).toBe(2);
  await page.clock.runFor(31_000);
  await expect.poll(state.checks).toBeGreaterThanOrEqual(3);
  expect(state.refreshes()).toBe(0);
});

test("idle updates preserve URL, scroll, and a native disclosure’s open state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await watch(page);
  const schedule = page.locator("#season > details");
  await schedule.locator("summary").click();
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#season").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy({ top: 110, behavior: "instant" }));
  const before = { href: page.url(), y: await page.evaluate(() => scrollY), top: (await page.locator("#season").boundingBox())!.y };
  state.change();
  await page.clock.runFor(31_000);
  await expect.poll(state.refreshes).toBe(1);
  await expect(page.locator("[data-football-refresh]")).toHaveAttribute("data-football-refresh-pending", "false");
  await page.clock.runFor(100);
  await expect(schedule).toHaveAttribute("open", "");
  expect(page.url()).toBe(before.href);
  expect(Math.abs(await page.evaluate(() => scrollY) - before.y)).toBeLessThanOrEqual(2);
  expect(Math.abs((await page.locator("#season").boundingBox())!.y - before.top)).toBeLessThanOrEqual(2);
});

test("hidden viewers stop polling and resume with one check when visible", async ({ page }) => {
  const state = await watch(page);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.runFor(180_000);
  expect(state.checks()).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.runFor(1);
  await expect.poll(state.checks).toBe(2);
  expect(state.refreshes()).toBe(0);
});

test("slow checks are serialized and are aborted when the viewer becomes hidden", async ({ page }) => {
  await watch(page);
  let checks = 0, aborted = 0, release: (() => void) | undefined;
  page.on("requestfailed", (request) => { if (new URL(request.url()).pathname === "/api/football/status") aborted++; });
  await page.route("**/api/football/status", async (route) => {
    checks++;
    await new Promise<void>((resolve) => { release = resolve; });
    try { await route.fulfill({ contentType: "application/json", body: "{}" }); } catch { /* The viewer intentionally aborted this request. */ }
  });
  await page.clock.runFor(30_001);
  await expect.poll(() => checks).toBe(1);
  // Stay below the eight-second request deadline while checking non-overlap.
  await page.clock.runFor(7000);
  expect(checks).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => aborted).toBe(1);
  release!();
  await page.clock.runFor(60_000);
  expect(checks).toBe(1);
});

test("football refresh never requests an update underneath the Media Room", async ({ page }) => {
  let checks = 0;
  await page.route("**/api/football/status", (route) => { checks++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto("/media");
  await expect(page.locator("[data-football-refresh]")).toHaveCount(1);
  await page.clock.runFor(180_000);
  expect(checks).toBe(0);
});

test("an open media player keeps its DOM and position while football changes wait", async ({ page }) => {
  const state = await watch(page, "/#media");
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "application/javascript", body: 'window.YT={Player:function(iframe,options){this.destroy=function(){iframe.remove();};options.events.onReady({target:this});}};window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady();' }));
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Player</body></html>" }));
  await page.route("https://embed.podcasts.apple.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Player</body></html>" }));
  await page.locator("#media [data-media-open]").click();
  const viewer = page.locator("#media [data-media-viewer]");
  await expect(viewer).toHaveCount(1);
  await viewer.evaluate((element) => { (element as HTMLElement).dataset.keptPlayer = "same-player"; });
  const before = { href: page.url(), y: await page.evaluate(() => scrollY) };
  state.change();
  await page.clock.runFor(31_000);
  await expect.poll(state.checks).toBe(2);
  expect(state.refreshes()).toBe(0);
  await expect(viewer).toHaveAttribute("data-kept-player", "same-player");
  expect(page.url()).toBe(before.href);
  expect(await page.evaluate(() => scrollY)).toBe(before.y);
  await page.locator("#media [data-media-close]").click();
  await page.clock.runFor(10_000);
  await expect.poll(state.refreshes).toBe(1);
});

test("a focused form and recent interaction defer an update until the reader is idle", async ({ page }) => {
  const state = await watch(page, "/game-day#ticket");
  await page.evaluate(() => { const form = document.createElement("form"); form.id = "reader-form"; form.innerHTML = '<label>Saved draft<input id="reader-draft" value="My call"></label>'; document.getElementById("ticket")!.append(form); });
  await page.locator("#reader-draft").focus();
  state.change();
  await page.clock.runFor(31_000);
  await expect.poll(state.checks).toBe(2);
  expect(state.refreshes()).toBe(0);
  await expect(page.locator("#reader-draft")).toHaveValue("My call");
  await page.locator("#reader-draft").evaluate((element) => (element as HTMLElement).blur());
  await page.evaluate(() => window.dispatchEvent(new Event("wheel")));
  await page.clock.runFor(3000);
  expect(state.refreshes()).toBe(0);
  await page.clock.runFor(7000);
  await expect.poll(state.refreshes).toBe(1);
});
