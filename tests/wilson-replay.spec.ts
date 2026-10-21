import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { REPLAY } from "../src/lib/wilson-replay.mjs";
import { TEACHING } from "../src/lib/wilson-teaching.mjs";

const replayPath = "/film-room/replay/wilson-cleveland";
const eventTime = (id: string) => REPLAY.events.find((event) => event.id === id)!.at;
const article = "https://www.newyorkjets.com/news/jets-joe-cool-puts-cleveland-in-the-deep-freeze-with-a-stirring-comeback-victory";

async function openReplay(page: Page, waitUntil: "load" | "domcontentloaded" = "load") {
  await page.goto(replayPath, { waitUntil });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wilson’s winning touchdown");
}

async function openPositionBrowser(page: Page) {
  const browser = page.locator("details[data-position-browser]");
  if (await browser.getAttribute("open") === null) await browser.locator("summary").filter({ hasText: "Browse all 22 positions" }).click();
  await expect(browser).toHaveJSProperty("open", true);
}

async function expectTime(page: Page, expected: number) {
  await expect.poll(async () => Number(await page.getByLabel("Replay time", { exact: true }).inputValue())).toBeCloseTo(expected, 2);
}

async function seekTo(page: Page, time: number) {
  await page.getByLabel("Replay time", { exact: true }).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(value));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  await expectTime(page, time);
}

async function expectArticleSource(page: Page) {
  const sources = page.locator("#evidence > details");
  if (await sources.getAttribute("open") === null) await sources.locator("summary").click();
  await expect(sources.locator(`a[href="${article}"]`).first()).toBeVisible();
}

function vectorGap(first: string | null, second: string | null) {
  const a = first?.split(",").map(Number), b = second?.split(",").map(Number);
  if (!a || !b || a.length !== 3 || b.length !== 3 || ![...a, ...b].every(Number.isFinite)) return Infinity;
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

async function seriousAxeViolations(page: Page) {
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  });
}

async function disableWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...options: unknown[]) {
      if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") return null;
      return original.apply(this, [contextId, ...options] as Parameters<typeof original>);
    } as typeof original;
  });
}

test("the source record and evidence limits remain readable during automatic 3D startup", async ({ page }) => {
  await openReplay(page);
  await expect(page.getByRole("button", { name: "Load 3D replay", exact: true })).toHaveCount(0);
  await expectTime(page, 0);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  for (const label of ["Recorded", "Observed", "Reported", "Inferred"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("15-yard touchdown");
  await expect(page.getByRole("main")).toContainText("2022_02_NYJ_CLE:4199");
  await expect(page.getByRole("main")).toContainText(/not (measured )?player tracking|no (player )?tracking/i);
  const sourceFrame = page.getByRole("link", { name: "Official replay at 4:11", exact: true });
  await expect(sourceFrame).toBeVisible();
  const sourceUrl = new URL((await sourceFrame.getAttribute("href"))!);
  expect(sourceUrl.searchParams.get("v")).toBe("LR1zPFNjOMM");
  expect(sourceUrl.searchParams.get("t")).toMatch(/^251s?$/);
  await expect(page.locator("[data-wilson-replay]")).toContainText("Related paused frame; this teaching timeline is not synchronized.");
  await expect(page.locator("[data-wilson-replay]")).toContainText("Teaching time, not a synchronized game or video clock.");
  for (const [id, label, sourceClock, sourceSeconds] of [["release", "Throwing window", "4:14", 254], ["catch", "Catch and finish", "4:15", 255]] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expectTime(page, eventTime(id));
    const related = page.getByRole("link", { name: `Official replay at ${sourceClock}`, exact: true });
    await expect(related).toBeVisible();
    expect(new URL((await related.getAttribute("href"))!).searchParams.get("t")).toMatch(new RegExp(`^${sourceSeconds}s?$`));
  }
  await expectArticleSource(page);
});

test("the result, attribution and source links survive without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await openReplay(page);
  await expect(page.getByRole("main")).toContainText("Flacco");
  await expect(page.getByRole("main")).toContainText("15-yard touchdown");
  await expect(page.getByRole("main")).toContainText("Inferred");
  await expect(page.locator("[data-fallback-player]")).toHaveCount(22);
  await expect(page.getByRole("img", { name: /Top-down teaching diagram/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the window opens", exact: true })).toBeVisible();
  await expect(page.locator("#film-study")).toContainText("Conklin");
  await expect(page.locator("#film-study")).toContainText("Owusu-Koramoah");
  await expectArticleSource(page);
  await context.close();
});

test("the tactical study binds the window, exact charting and analytics to source-specific claims", async ({ page }) => {
  await openReplay(page);
  const study = page.locator("#film-study");
  await expect(study.getByRole("heading", { name: "How the window opens", exact: true })).toBeVisible();
  await expect(study).toContainText("Conklin");
  await expect(study).toContainText("Owusu-Koramoah");
  await expect(study).toContainText("Cover 6 · zone");
  await expect(study).toContainText("4 rushers · 0 blitzers");
  await expect(study).toContainText("2.036 seconds");
  await expect(study).toContainText("26.1% → 57.2%");
  await expect(study).toContainText("14 air + 1 YAC");
  await expect(study).toContainText("41.5%");
  await page.getByRole("button", { name: "1 · Recognize the structure", exact: true }).click();
  await expectTime(page, 0);
  await expect(page.locator('[data-role-study="wilson"]')).toHaveAttribute("data-study-phase", "pre");
  const before = await page.locator('[data-role-study="wilson"]').innerText();
  await page.getByRole("button", { name: "3 · Deliver behind", exact: true }).click();
  await expectTime(page, eventTime("release"));
  await expect(page.locator('[data-role-study="wilson"]')).toHaveAttribute("data-study-phase", "flight");
  expect(await page.locator('[data-role-study="wilson"]').innerText()).not.toBe(before);
  await study.locator("summary").filter({ hasText: "Charting, route terminology" }).click();
  await expect(study).toContainText("POST");
  await study.locator("[data-analysis-provenance] > summary").click();
  await expect(study).toContainText(/historical 2022 encoding remains unconfirmed/i);
  await study.locator("summary").filter({ hasText: "The 22 charted participants" }).click();
  await expect(study.locator("tbody tr")).toHaveCount(22);
  await expect(study).toContainText("Braxton Berrios");
  await expect(study).toContainText("Isaiah Thomas");
  await expect(study.locator('a[href="https://www.pff.com/news/week-2-coverage-update"]').first()).toBeVisible();
  await expect(study.locator('a[href="https://jetsxfactor.com/2022/09/21/zach-wilson-weeks-1-2-jets/"]').first()).toBeVisible();
});

test("the all-22 field plays while the deferred 3D renderer is pending and hands over at the same time", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  let releaseChunk = () => {};
  const heldChunk = new Promise<void>((resolve) => { releaseChunk = resolve; });
  let holding = false;
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    // The public canvas description identifies the renderer without coupling this
    // check to a build-specific chunk filename or obstructing the client shell.
    if (body.includes("Three-dimensional schematic of Garrett Wilson")) {
      holding = true;
      await heldChunk;
    }
    await route.fulfill({ response, body });
  });
  try {
    await page.goto(replayPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wilson’s winning touchdown");
    await expect.poll(() => holding, { timeout: 15_000, message: "Deferred scene chunk was identified" }).toBe(true);
    const replay = page.locator("[data-wilson-replay]");
    await expect(replay).toHaveAttribute("data-scene", "loading");
    const diagram = page.getByRole("img", { name: /Top-down teaching diagram/ });
    await expect(diagram).toBeVisible();
    await expect(diagram.locator("[data-fallback-player]")).toHaveCount(22);
    await expectTime(page, 0);
    const start = await diagram.locator("[data-fallback-player]").evaluateAll((actors) => Object.fromEntries(actors.map((actor) => [actor.getAttribute("data-fallback-player"), [Number(actor.getAttribute("data-x")), Number(actor.getAttribute("data-z"))]])));
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(await replay.getAttribute("data-time"))).toBeGreaterThan(0.2);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const paused = Number(await replay.getAttribute("data-time"));
    const moved = await diagram.locator("[data-fallback-player]").evaluateAll((actors) => Object.fromEntries(actors.map((actor) => [actor.getAttribute("data-fallback-player"), [Number(actor.getAttribute("data-x")), Number(actor.getAttribute("data-z"))]])));
    for (const actor of REPLAY.actors) expect(moved[actor.id], actor.id).not.toEqual(start[actor.id]);
    await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption("lt");
    await expect(page.locator('[data-selected-player="lt"]')).toBeVisible();
    await expect(replay.locator("canvas")).toHaveCount(0);
    await page.evaluate(() => {
      const root = document.querySelector("[data-wilson-replay]")!;
      const result = { firstVisible: null as null | Record<string, string | undefined> };
      (window as unknown as { __wilsonHandoff: typeof result }).__wilsonHandoff = result;
      const observer = new MutationObserver(() => {
        if (root.getAttribute("data-scene") !== "ready") return;
        result.firstVisible = { ...(root.querySelector("canvas") as HTMLCanvasElement).dataset };
        observer.disconnect();
      });
      observer.observe(root, { attributes: true, attributeFilter: ["data-scene"] });
    });
    releaseChunk();
    await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
    const firstVisible = await page.evaluate(() => (window as unknown as { __wilsonHandoff: { firstVisible: Record<string, string> } }).__wilsonHandoff.firstVisible);
    expect(firstVisible.labelsVisible).toBe("false");
    expect(firstVisible.routesVisible).toBe("false");
    expect(firstVisible.selectedActor).toBe("lt");
    expect(Number(firstVisible.renderedTime)).toBeCloseTo(paused, 2);
    await expect.poll(async () => Number(await replay.locator("canvas").getAttribute("data-render-time"))).toBeCloseTo(paused, 2);
    await expect(diagram).toHaveCount(0);
    await expectTime(page, paused);
  } finally { releaseChunk(); }
});

test("the field stays usable while player bodies load and the first visible bodies inherit the current study", async ({ page }) => {
  let releaseBody = () => {};
  const heldBody = new Promise<void>(resolve => { releaseBody = resolve; });
  let requests = 0;
  await page.route("**/film-room/art/*.glb", async route => {
    requests++;
    await heldBody;
    await route.continue();
  });
  try {
    await openReplay(page, "domcontentloaded");
    const replay = page.locator("[data-wilson-replay]");
    await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(replay).toHaveAttribute("data-scene", "loading");
    await expect(page.getByRole("img", { name: /Top-down teaching diagram/ })).toBeVisible();
    await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
    await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption("lt");
    await expectTime(page, 1);
    await page.evaluate(() => {
      const root = document.querySelector("[data-wilson-replay]")!;
      const result = { firstVisible: null as null | Record<string, string | undefined> };
      (window as unknown as { __wilsonBodyHandoff: typeof result }).__wilsonBodyHandoff = result;
      const observer = new MutationObserver(() => {
        if (root.getAttribute("data-scene") !== "ready") return;
        result.firstVisible = { ...(root.querySelector("canvas") as HTMLCanvasElement).dataset };
        observer.disconnect();
      });
      observer.observe(root, { attributes: true, attributeFilter: ["data-scene"] });
    });
    releaseBody();
    await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
    const first = await page.evaluate(() => (window as unknown as { __wilsonBodyHandoff: { firstVisible: Record<string, string> } }).__wilsonBodyHandoff.firstVisible);
    expect(first.playerBodiesReady).toBe("true");
    expect(first.skinnedPlayerCount).toBe("22");
    expect(first.playerAsset).toBe("quaternius-standard");
    expect(Number(first.playerAssetBytes)).toBeGreaterThan(0);
    expect(requests, "body and motion are each requested once for all 22 players").toBe(2);
    expect(first.selectedActor).toBe("lt");
    expect(Number(first.renderedTime)).toBeCloseTo(1, 2);
  } finally { releaseBody(); }
});

test("a failed player download keeps the diagram working and retries at the same study time", async ({ page }) => {
  await page.route("**/film-room/art/*.glb", route => route.abort("failed"));
  await openReplay(page, "domcontentloaded");
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "failed", { timeout: 20_000 });
  await expect(replay.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Top-down teaching diagram/ })).toBeVisible();
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 1);
  await page.unroute("**/film-room/art/*.glb");
  await page.getByRole("button", { name: "Try 3D again", exact: true }).click();
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  await expect(replay.locator("canvas")).toHaveCount(1);
  await expect(replay.locator("canvas")).toHaveAttribute("data-skinned-player-count", "22");
  await expect.poll(async () => Number(await replay.locator("canvas").getAttribute("data-render-time"))).toBeCloseTo(1, 3);
  await expectTime(page, 1);
});

test("optional CC0 turf maps load after usable 3D without resetting the study, and a failed map stays optional", async ({ page }) => {
  let releaseMaps = () => {};
  const heldMaps = new Promise<void>((resolve) => { releaseMaps = resolve; });
  const pendingMaps = new Set<string>();
  await page.route("**/film-room/art/grass005-*.webp", async (route) => {
    pendingMaps.add(new URL(route.request().url()).pathname);
    await heldMaps;
    await route.continue();
  });
  try {
    await openReplay(page, "domcontentloaded");
    const replay = page.locator("[data-wilson-replay]");
    const canvas = replay.locator("canvas");
    await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
    await expect.poll(() => pendingMaps.size, { message: "Both optional turf maps are held" }).toBe(2);
    await expect(canvas).toHaveAttribute("data-turf", "loading");
    expect(Number(await canvas.getAttribute("data-render-frames"))).toBeGreaterThan(0);
    await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption("lt");
    await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
    await expectTime(page, 1);
    await expect(canvas).toHaveAttribute("data-selected-actor", "lt");
    await expect.poll(async () => Number(await canvas.getAttribute("data-render-time"))).toBeCloseTo(1, 3);
    await expect(canvas).toHaveAttribute("data-turf", "loading");
    releaseMaps();
    await expect(canvas).toHaveAttribute("data-turf", "ready", { timeout: 10_000 });
    await expectTime(page, 1);
    await expect(canvas).toHaveAttribute("data-selected-actor", "lt");
    await expect(page.locator('[data-selected-player="lt"]')).toBeVisible();
    await expect.poll(async () => Number(await canvas.getAttribute("data-render-time"))).toBeCloseTo(1, 3);
  } finally { releaseMaps(); }

  // A fresh navigation with the normal map unavailable must retain the usable
  // renderer and HTML transport; the base-color request still loads normally.
  await page.unroute("**/film-room/art/grass005-*.webp");
  await page.route("**/film-room/art/grass005-normalgl.webp", (route) => route.abort("failed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  await expect(replay.locator("canvas")).toHaveAttribute("data-turf", "partial", { timeout: 10_000 });
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 1);
  await expect(replay.locator("canvas")).toHaveAttribute("data-selected-actor", "wilson");
  await expect(page.getByRole("status").filter({ hasText: /3D unavailable/i })).toHaveCount(0);
});

test("playback, slow motion, rewind and native keyboard scrubbing share one timeline", async ({ page }) => {
  await openReplay(page);
  const time = page.getByLabel("Replay time", { exact: true });
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 1);
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 2);
  await page.getByRole("button", { name: "Rewind 1 second", exact: true }).click();
  await expectTime(page, 1);
  await time.focus();
  await time.press("ArrowRight");
  expect(Number(await time.inputValue())).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Return to snap", exact: true }).click();
  await expectTime(page, 0);
  const speed = page.getByRole("combobox", { name: "Playback speed", exact: true });
  for (const value of ["0.25", "0.5", "1"]) {
    await speed.selectOption(value);
    await expect(speed).toHaveValue(value);
  }
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(0.15);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedTime = await time.inputValue();
  await page.waitForTimeout(180);
  await expect(time).toHaveValue(pausedTime);
  await time.focus();
  await time.press("End");
  expect(Number(await time.inputValue())).toBe(Number(await time.getAttribute("max")));
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  expect(Number(await time.inputValue())).toBe(Number(await time.getAttribute("max")));
  await page.getByRole("button", { name: "Return to snap", exact: true }).click();
  await page.getByRole("button", { name: "Rewind 1 second", exact: true }).click();
  await expectTime(page, 0);
});

test("a controlled elapsed clock makes quarter speed slower and rewind run backwards", async ({ page }) => {
  await page.clock.install();
  await openReplay(page);
  // install() advances during RPC/actionability waits. Keep the freeze target
  // beyond this test's wall-time budget so a busy CI renderer cannot overtake
  // it between evaluate() and pauseAt(). Playback is still paused here.
  const freezeLead = Math.max(test.info().timeout, 60_000);
  await page.clock.pauseAt(await page.evaluate(lead => Date.now() + lead, freezeLead));
  const time = page.getByLabel("Replay time", { exact: true });
  const speed = page.getByRole("combobox", { name: "Playback speed", exact: true });
  await speed.selectOption("0.25");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.clock.runFor(1_000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const slowTime = Number(await time.inputValue());
  expect(slowTime).toBeGreaterThan(0.2);
  expect(slowTime).toBeLessThan(0.3);
  await page.getByRole("button", { name: "Return to snap", exact: true }).click();
  await speed.selectOption("1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.clock.runFor(1_000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const normalTime = Number(await time.inputValue());
  expect(normalTime).toBeGreaterThan(slowTime * 3.5);
  expect(normalTime).toBeLessThan(slowTime * 4.5);
  await page.getByRole("button", { name: "Rewind", exact: true }).click();
  await page.clock.runFor(500);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(Number(await time.inputValue())).toBeLessThan(normalTime - 0.4);
  expect(Number(await time.inputValue())).toBeGreaterThan(normalTime - 0.6);
});

test("camera presets and player focus remain keyboard accessible", async ({ page }) => {
  await openReplay(page);
  await expect(page.locator("[data-wilson-replay]")).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  for (const name of ["Sideline", "End zone", "Overhead", "Behind Flacco"]) {
    const previousCamera = await page.locator("[data-wilson-replay] canvas").getAttribute("data-camera-position");
    const camera = page.getByRole("button", { name, exact: true });
    await camera.focus();
    await camera.press("Enter");
    await expect(camera).toHaveAttribute("aria-pressed", "true");
    if (name !== "Sideline") await expect.poll(() => page.locator("[data-wilson-replay] canvas").getAttribute("data-camera-position")).not.toBe(previousCamera);
  }
  const beforeKeyboardMove = await page.locator("[data-wilson-replay] canvas").getAttribute("data-camera-position");
  const rotate = page.getByRole("button", { name: "Rotate camera left", exact: true });
  await rotate.focus();
  await rotate.press("Enter");
  await expect.poll(() => page.locator("[data-wilson-replay] canvas").getAttribute("data-camera-position")).not.toBe(beforeKeyboardMove);
  const focus = page.getByRole("combobox", { name: "Focus player", exact: true });
  const options = await focus.locator("option").allTextContents();
  expect(options.some((name) => name.includes("Wilson"))).toBe(true);
  expect(options.some((name) => name.includes("Flacco"))).toBe(true);
  await focus.selectOption({ label: options.find((name) => name.includes("Flacco"))! });
  await expect(focus.locator("option:checked")).toContainText("Flacco");
  await expect(page.locator("[data-selected-player=qb]").getByRole("heading", { level: 2, name: "Joe Flacco", exact: true })).toBeVisible();
  const routes = page.getByLabel("Show inferred routes", { exact: true });
  await routes.check();
  await routes.uncheck();
  await expect(routes).not.toBeChecked();
  await routes.check();
  await expect(routes).toBeChecked();
  const beforeExpand = (await page.locator("[data-wilson-replay] canvas").boundingBox())!;
  await page.getByRole("button", { name: "Expand field", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect.poll(async () => (await page.locator("[data-wilson-replay] canvas").boundingBox())!.width).toBeGreaterThan(beforeExpand.width);
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 1);
  await page.getByRole("button", { name: "Exit expanded field", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expectTime(page, 1);
});

test("all 22 players expose their position and teaching job without inventing assessments", async ({ page }) => {
  await openReplay(page);
  const roster = page.locator("[data-all22]");
  await expect(page.locator("details[data-position-browser]")).toHaveJSProperty("open", false);
  await expect(roster.locator("[data-roster-player]")).toHaveCount(22);
  await expect(roster.locator('[data-roster-player][data-unit="offense"]')).toHaveCount(11);
  await expect(roster.locator('[data-roster-player][data-unit="defense"]')).toHaveCount(11);
  await expect(roster.locator("[data-roster-player]").first()).not.toBeVisible();
  await openPositionBrowser(page);
  for (const player of TEACHING.players) {
    const actor = REPLAY.actors.find((item) => item.id === player.id)!;
    const button = roster.locator(`[data-roster-player="${player.id}"]`);
    await expect(button).toHaveAccessibleName(`${actor.name} · ${player.position}`);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(roster.locator('[aria-pressed="true"]')).toHaveCount(1);
    const selected = page.locator(`[data-selected-player="${player.id}"]`);
    await expect(selected).toContainText(player.position);
    await expect(selected.locator("[data-teaching-job]")).toContainText(player.lesson);
    await expect(selected.locator('[data-teaching-job] [data-basis="inferred"]')).toHaveText("Illustration");
    const assessment = selected.locator("[data-player-assessment]");
    const recordedIdentity = ["qb", "wilson"].includes(player.id);
    await expect(selected).toHaveAttribute("data-assessment-basis", recordedIdentity ? "recorded" : "unknown");
    if (recordedIdentity) {
      await expect(selected.getByRole("heading", { name: "Source-supported action", exact: true })).toBeVisible();
      await expect(assessment).toContainText("touchdown");
      const reportedIdea = selected.getByRole("heading", { name: "The reported idea", exact: true }).locator("..");
      await expect(reportedIdea).toContainText(player.reportedConcept!);
    } else {
      await expect(selected.getByRole("heading", { name: "Source-supported action", exact: true })).toHaveCount(0);
      await expect(selected.getByRole("heading", { name: "The reported idea", exact: true })).toHaveCount(0);
      await expect(assessment).toContainText("The actual assignment and individual outcome are unestablished");
    }
    const assessmentEvidence = assessment.locator("details");
    if (await assessmentEvidence.getAttribute("open") === null) await assessmentEvidence.locator("summary").click();
    await expect(assessmentEvidence).toContainText(player.assessment.detail);
    const evidence = selected.locator("details").filter({ hasText: "Evidence for this player" });
    if (await evidence.getAttribute("open") === null) await evidence.locator("summary").click();
    await expect(evidence).toContainText(actor.note);
    await expect(evidence).toContainText(player.teachingJob);
    if (player.reportedIntent) await expect(evidence).toContainText(player.reportedIntent);
    if (!recordedIdentity) {
      await expect(evidence).toContainText("Authored 3D teaching reconstruction");
      await expect(evidence.locator("a")).toHaveCount(0);
    }
  }
  await openPositionBrowser(page);
  await roster.locator('[data-roster-player="d5"]').click();
  const assessment = page.locator('[data-selected-player="d5"] [data-player-assessment]');
  const originalAssessment = await assessment.innerText();
  await page.getByRole("button", { name: "Touchdown · 30–30", exact: true }).click();
  await expectTime(page, eventTime("finish"));
  await expect(page.locator('[data-selected-player="d5"]')).toHaveAttribute("data-assessment-basis", "unknown");
  await expect(assessment).toHaveText(originalAssessment, { useInnerText: true });
});

test("movement, position labels and teaching responsibilities are independent rendered layers", async ({ page }) => {
  await openReplay(page);
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
  await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption("lt");
  await page.getByRole("button", { name: "Throwing window", exact: true }).click();
  const routes = page.getByLabel("Show inferred routes", { exact: true });
  const labels = page.getByLabel("Position labels", { exact: true });
  const responsibilities = page.getByLabel("Teaching responsibilities", { exact: true });
  await routes.check();
  await labels.check();
  await expect(canvas).toHaveAttribute("data-routes-visible", "true");
  await expect(canvas).toHaveAttribute("data-labels-visible", "true");
  await expect(canvas).toHaveAttribute("data-responsibilities-visible", "false");
  await expect.poll(async () => Number(await canvas.getAttribute("data-label-count"))).toBeGreaterThan(0);
  await responsibilities.check();
  await expect(canvas).toHaveAttribute("data-responsibilities-visible", "true");
  const responsibilityCount = String(TEACHING.relationships.length);
  await expect(canvas).toHaveAttribute("data-responsibility-count", responsibilityCount);
  await expect.poll(async () => (await canvas.getAttribute("data-highlighted-actors"))?.split(",").sort()).toEqual(["d1", "lt"]);
  const initialRoutes = await canvas.getAttribute("data-route-count");
  expect(Number(initialRoutes)).toBeGreaterThan(0);
  await labels.uncheck();
  await expect(canvas).toHaveAttribute("data-label-count", "0");
  await expect(canvas).toHaveAttribute("data-routes-visible", "true");
  await expect(canvas).toHaveAttribute("data-route-count", initialRoutes!);
  await expect(canvas).toHaveAttribute("data-responsibility-count", responsibilityCount);
  await routes.uncheck();
  await expect(canvas).toHaveAttribute("data-route-count", "0");
  await expect(canvas).toHaveAttribute("data-responsibilities-visible", "true");
  await expect(canvas).toHaveAttribute("data-responsibility-count", responsibilityCount);
  await expect(canvas).toHaveAttribute("data-selected-highlight", "true");
  await labels.check();
  await expect.poll(async () => Number(await canvas.getAttribute("data-label-count"))).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute("data-routes-visible", "false");
  await responsibilities.uncheck();
  await expect(canvas).toHaveAttribute("data-responsibility-count", "0");
  await expect(canvas).toHaveAttribute("data-highlighted-actors", "lt");
  await routes.check();
  await expect(canvas).toHaveAttribute("data-route-count", initialRoutes!);
  await expect(canvas).toHaveAttribute("data-labels-visible", "true");
  await expect(canvas).toHaveAttribute("data-selected-actor", "lt");
  await expectTime(page, eventTime("release"));
  await expect(page.locator('[data-selected-player="lt"]')).toHaveAttribute("data-assessment-basis", "unknown");
});

test("the field dominates tablet and desktop layouts, and follow player survives a narrow resize", async ({ page }) => {
  await openReplay(page);
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
  for (const viewport of [{ width: 610, height: 760 }, { width: 1440, height: 1050 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(async () => (await canvas.boundingBox())!.height / viewport.height, { message: `The actual field occupies half the ${viewport.width}×${viewport.height} viewport` }).toBeGreaterThanOrEqual(0.5);
    const bounds = (await canvas.boundingBox())!;
    expect(bounds.y, "The field starts near the top, before control browsing").toBeGreaterThanOrEqual(0);
    expect(bounds.y, "The field starts within the first 170 pixels").toBeLessThanOrEqual(170);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "The layout has no horizontal overflow").toBe(true);
    for (const control of [
      page.getByRole("button", { name: "Play", exact: true }),
      page.getByRole("button", { name: "Rewind", exact: true }),
      page.getByLabel("Replay time", { exact: true }),
      page.getByRole("combobox", { name: "Focus player", exact: true }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport({ ratio: 1 });
      await expect(control).toBeEnabled();
    }
  }
  await page.getByLabel("Position labels", { exact: true }).check();
  const expectTargetAtSelection = async () => {
    await expect.poll(async () => vectorGap(await canvas.getAttribute("data-camera-target"), await canvas.getAttribute("data-selected-anchor"))).toBeLessThan(0.01);
  };
  const wideBounds = (await canvas.boundingBox())!;
  expect(wideBounds.width / wideBounds.height).toBeGreaterThan(0.85);
  const follow = page.getByRole("button", { name: "Follow player", exact: true });
  await follow.focus();
  await follow.press("Enter");
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-follow-selection", "true");
  await expectTargetAtSelection();
  const beforeMovement = await canvas.getAttribute("data-camera-target");
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTargetAtSelection();
  await expect.poll(() => canvas.getAttribute("data-camera-target")).not.toBe(beforeMovement);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(async () => { const bounds = (await canvas.boundingBox())!; return bounds.width / bounds.height; }).toBeLessThan(0.85);
  await expectTargetAtSelection();
  await expect(canvas).toHaveAttribute("data-follow-selection", "true");
  await page.getByRole("button", { name: "Catch and finish", exact: true }).click();
  await expectTime(page, eventTime("catch"));
  await expectTargetAtSelection();
  await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption("lt");
  await expect(canvas).toHaveAttribute("data-selected-actor", "lt");
  await expectTargetAtSelection();
  const closeCamera = await canvas.getAttribute("data-camera-position");
  const everyone = page.getByRole("button", { name: "Show everyone", exact: true });
  await everyone.focus();
  await everyone.press("Enter");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-follow-selection", "false");
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(closeCamera);
  await expect(canvas).toHaveAttribute("data-label-count", "22");
  await expect(canvas).toHaveAttribute("data-selected-actor", "lt");
  await expectTime(page, eventTime("catch"));
});

test("the loaded 3D scene renders, accepts camera drags and stops rendering at rest", async ({ page }) => {
  await openReplay(page);
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
  await expect(canvas).toHaveAccessibleName(/Three-dimensional schematic of Garrett Wilson/);
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute("data-player-anchors", /^\{/);
  const pickBounds = (await canvas.boundingBox())!;
  const anchors = JSON.parse((await canvas.getAttribute("data-player-anchors"))!) as Record<string, { x: number; y: number }>;
  await page.mouse.click(pickBounds.x + anchors.qb.x, pickBounds.y + anchors.qb.y);
  await expect(page.locator("[data-selected-player=qb]")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-selected-actor", "qb");
  // The snap click has already queried every body's bounds. Moving native
  // bodies must remain pickable without rebuilding all skinned bounds per frame.
  for (const [time, id] of [[3, "wilson"], [0.35, "qb"]] as const) {
    await seekTo(page, time);
    await expect.poll(async () => Number(await canvas.getAttribute("data-render-time"))).toBeCloseTo(time, 3);
    await canvas.scrollIntoViewIfNeeded();
    const currentBounds = (await canvas.boundingBox())!;
    const currentAnchors = JSON.parse((await canvas.getAttribute("data-player-anchors"))!) as Record<string, { x: number; y: number }>;
    await page.mouse.click(currentBounds.x + currentAnchors[id].x, currentBounds.y + currentAnchors[id].y);
    await expect(canvas, `The moved ${id} is pickable at ${time}s`).toHaveAttribute("data-selected-actor", id);
  }
  const cameraPosition = await canvas.getAttribute("data-camera-position");
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(cameraPosition);
  await expect(canvas).toHaveAttribute("data-selected-actor", "qb");
  // Wait for any scheduled interaction frame to settle, then an idle canvas must stay idle.
  await page.waitForTimeout(300);
  const idleFrames = await canvas.getAttribute("data-render-frames");
  expect(Number(idleFrames)).toBeGreaterThan(0);
  await page.waitForTimeout(220);
  await expect(canvas).toHaveAttribute("data-render-frames", idleFrames!);
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("data-render-frames"))).toBeGreaterThan(Number(idleFrames));
});

test("all 22 rendered bodies move continuously and seeking restores their actual pose", async ({ page }) => {
  // The bounded dense scan performs nearly 300 UI seeks; allow it to complete
  // on a busy desktop without relaxing any geometric continuity threshold.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openReplay(page);
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
  type Motion = { action: string; position: number[]; joints: number[]; bodyJoints: number[]; handPositions: number[][]; feet: boolean[]; footPositions: number[][]; dive: number; footCycles: { plantAt: number; liftOffAt: number }[]; visibleBody: { handPositions: number[][]; footPositions: number[][]; endpointErrors: number[]; bodyJoints: number[]; limbJoints: number[]; clipCount: number; meshCount: number; boneCount: number } };
  const poseAt = async (time: number) => {
    await seekTo(page, time);
    await expect.poll(async () => Number(await canvas.getAttribute("data-render-time"))).toBeCloseTo(time, 3);
    return JSON.parse((await canvas.getAttribute("data-actor-motion"))!) as Record<string, Motion>;
  };
  const sampleBatch = async (times: number[]) => page.evaluate(async (times) => {
    const input = document.querySelector("#replay-time") as HTMLInputElement;
    const canvas = document.querySelector("[data-wilson-replay] canvas") as HTMLCanvasElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const result: Record<string, Motion>[] = [];
    for (const time of times) {
      setter.call(input, String(time));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (Math.abs(Number(canvas.dataset.renderedTime) - time) > 0.001) throw new Error(`The scene did not submit the requested ${time}s frame`);
      result.push(JSON.parse(canvas.dataset.actorMotion!));
    }
    return result;
  }, times);
  await expect(page.getByLabel("Position labels", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Show inferred routes", { exact: true })).not.toBeChecked();
  const first = await poseAt(0.91);
  const next = await poseAt(1.01);
  expect(Object.keys(first).sort()).toEqual(REPLAY.actors.map((actor) => actor.id).sort());
  for (const { id } of REPLAY.actors) {
    const movement = Math.hypot(...next[id].position.map((value, index) => value - first[id].position[index]));
    expect(movement, `${id} moves during the same 100 ms interval`).toBeGreaterThan(0.001);
    expect(movement, `${id} has no discontinuous position jump`).toBeLessThan(1);
    expect(next[id].joints, `${id} has animated actual limb joints`).not.toEqual(first[id].joints);
    expect(next[id].footPositions.flat().every(Number.isFinite), `${id} has finite actual feet`).toBe(true);
    expect(next[id].bodyJoints, `${id} exposes actual root, pelvis, torso and head rotations`).toHaveLength(16);
    expect(next[id].handPositions.flat().every(Number.isFinite), `${id} has finite actual hands`).toBe(true);
    expect(next[id].visibleBody.boneCount, `${id} uses the imported skeleton`).toBe(65);
    expect(next[id].visibleBody.meshCount).toBe(3);
    expect(next[id].visibleBody.clipCount).toBe(4);
    expect(next[id].visibleBody.handPositions).toHaveLength(2);
    expect(next[id].visibleBody.footPositions).toHaveLength(2);
    expect(next[id].visibleBody.endpointErrors).toHaveLength(4);
    expect(next[id].visibleBody.bodyJoints).toHaveLength(16);
    expect(next[id].visibleBody.limbJoints).toHaveLength(48);
    expect(next[id].visibleBody.handPositions.flat().every(Number.isFinite)).toBe(true);
    expect(next[id].visibleBody.footPositions.flat().every(Number.isFinite)).toBe(true);
  }
  await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption("qb");
  await expect(page.locator('[data-selected-player="qb"] [data-player-action]')).toHaveAttribute("data-player-action", "set");
  await poseAt(eventTime("release"));
  await expect(page.locator('[data-selected-player="qb"] [data-player-action]')).toHaveAttribute("data-player-action", "throw");
  const late = await poseAt(5.4);
  expect(late.d6.action).toBe("recover");
  expect(late.d6.dive).toBeGreaterThan(0);
  const restored = await poseAt(0.91);
  // These are final rig transforms after IK, not values re-sampled from the model.
  for (const { id } of REPLAY.actors) {
    expect(restored[id], `${id} restores all final body, hand and foot transforms after rewind`).toEqual(first[id]);
  }
  const continuityMetrics: Record<string, { samples: number; maxFootYardsPer10ms: number; maxJointRadiansPer10ms: number; footAt: string; jointAt: string }> = {};
  const collectContinuity = (id: string, before: Motion, after: Motion, at: number) => {
    const metric = continuityMetrics[id] ??= { samples: 0, maxFootYardsPer10ms: 0, maxJointRadiansPer10ms: 0, footAt: "", jointAt: "" };
    metric.samples++;
    for (let foot = 0; foot < 2; foot++) {
      const displacement = Math.hypot(...after.footPositions[foot].map((value, axis) => value - before.footPositions[foot][axis]));
      if (displacement >= metric.maxFootYardsPer10ms) metric.footAt = `${id} foot ${foot} at ${at.toFixed(2)}s`;
      metric.maxFootYardsPer10ms = Math.max(metric.maxFootYardsPer10ms, displacement);
    }
    const beforeJoints = [...before.joints, ...before.bodyJoints, ...before.visibleBody.limbJoints, ...before.visibleBody.bodyJoints], afterJoints = [...after.joints, ...after.bodyJoints, ...after.visibleBody.limbJoints, ...after.visibleBody.bodyJoints];
    for (let joint = 0; joint < beforeJoints.length; joint += 4) {
      const a = beforeJoints.slice(joint, joint + 4), b = afterJoints.slice(joint, joint + 4);
      const cosine = Math.abs(a.reduce((sum, value, axis) => sum + value * b[axis], 0)) / (Math.hypot(...a) * Math.hypot(...b));
      const radians = 2 * Math.acos(Math.min(1, cosine));
      if (radians >= metric.maxJointRadiansPer10ms) metric.jointAt = `${id} limb ${joint / 4} at ${at.toFixed(2)}s`;
      metric.maxJointRadiansPer10ms = Math.max(metric.maxJointRadiansPer10ms, radians);
    }
  };
  // These boundaries previously moved a foot more than a yard in 10ms. Root
  // paths can be smooth while foot planting or a mode switch still visibly pops.
  for (const [id, at] of [["d1", 0.6], ["d7", 1.95], ["lt", 4.5], ["d6", 5.28]] as const) {
    const before = await poseAt(at - 0.01), after = await poseAt(at);
    collectContinuity(id, before[id], after[id], at);
  }
  // Scan each 10ms interval through the QB set/throw, including the old .65s
  // anchor resets. A single favorable sample would miss the planted-foot reset.
  const qbSamples = await sampleBatch(Array.from({ length: 151 }, (_, index) => (index + 80) / 100));
  for (let index = 1; index < qbSamples.length; index++) {
    collectContinuity("qb", qbSamples[index - 1].qb, qbSamples[index].qb, (index + 80) / 100);
  }
  const plantedHeight = { samples: 0, maximum: -Infinity, minimum: Infinity, maximumAt: "", minimumAt: "" };
  const visiblePlantedHeight = { samples: 0, maximum: -Infinity, minimum: Infinity, at: "" };
  const visibleEndpoints = { samples: 0, maximum: 0, at: "" };
  const collectPlantedHeight = (id: string, motion: Motion, at: number) => {
    if (motion.dive > 0) return;
    motion.feet.forEach((planted, foot) => {
      if (!planted) return;
      const height = motion.footPositions[foot][1];
      plantedHeight.samples++;
      if (height >= plantedHeight.maximum) plantedHeight.maximumAt = `${id} foot ${foot} at ${at.toFixed(2)}s`;
      if (height <= plantedHeight.minimum) plantedHeight.minimumAt = `${id} foot ${foot} at ${at.toFixed(2)}s`;
      plantedHeight.maximum = Math.max(plantedHeight.maximum, height);
      plantedHeight.minimum = Math.min(plantedHeight.minimum, height);
      const visibleHeight = motion.visibleBody.footPositions[foot][1];
      visiblePlantedHeight.samples++;
      if (visibleHeight >= visiblePlantedHeight.maximum) visiblePlantedHeight.at = `${id} visible foot ${foot} at ${at.toFixed(2)}s`;
      visiblePlantedHeight.maximum = Math.max(visiblePlantedHeight.maximum, visibleHeight);
      visiblePlantedHeight.minimum = Math.min(visiblePlantedHeight.minimum, visibleHeight);
    });
  };
  for (const [id, at] of [["d8", 1.9], ["d7", 1.65], ["d10", 2.35]] as const) {
    let probeAt = at;
    let poses = await poseAt(at);
    if (!poses[id].feet.some(Boolean)) {
      // Speed-driven footfalls can put this old fixed-cadence timestamp in
      // flight. Check its adjacent actual stance, preserving the ground limit.
      const cycle = [...poses[id].footCycles].sort((a, b) => b.plantAt - a.plantAt)[0];
      probeAt = Math.round((cycle.plantAt + cycle.liftOffAt) * 50) / 100;
      expect(Math.abs(probeAt - at)).toBeLessThan(0.5);
      poses = await poseAt(probeAt);
    }
    expect(poses[id].feet.some(Boolean), `${id} has a planted foot in the nearby stance`).toBe(true);
    collectPlantedHeight(id, poses[id], probeAt);
  }
  const plantedSamples = await sampleBatch(Array.from({ length: REPLAY.duration * 20 + 1 }, (_, index) => index / 20));
  const bodyContinuity = { samples: 0, maxRadiansPer50ms: 0, at: "" };
  const rootContinuity = { samples: 0, maxYardsPer50ms: 0, maxVerticalYardsPer50ms: 0, at: "" };
  for (let step = 0; step < plantedSamples.length; step++) {
    for (const { id } of REPLAY.actors) {
      collectPlantedHeight(id, plantedSamples[step][id], step / 20);
      for (const [endpoint, error] of plantedSamples[step][id].visibleBody.endpointErrors.entries()) {
        visibleEndpoints.samples++;
        if (error >= visibleEndpoints.maximum) visibleEndpoints.at = `${id} visible endpoint ${endpoint} at ${(step / 20).toFixed(2)}s`;
        visibleEndpoints.maximum = Math.max(visibleEndpoints.maximum, error);
      }
      if (step === 0) continue;
      const previousRoot = plantedSamples[step - 1][id].position, currentRoot = plantedSamples[step][id].position;
      const travel = Math.hypot(...currentRoot.map((value, axis) => value - previousRoot[axis]));
      rootContinuity.samples++;
      if (travel >= rootContinuity.maxYardsPer50ms) rootContinuity.at = `${id} root at ${(step / 20).toFixed(2)}s`;
      rootContinuity.maxYardsPer50ms = Math.max(rootContinuity.maxYardsPer50ms, travel);
      rootContinuity.maxVerticalYardsPer50ms = Math.max(rootContinuity.maxVerticalYardsPer50ms, Math.abs(currentRoot[1] - previousRoot[1]));
      const before = [...plantedSamples[step - 1][id].bodyJoints, ...plantedSamples[step - 1][id].visibleBody.bodyJoints], after = [...plantedSamples[step][id].bodyJoints, ...plantedSamples[step][id].visibleBody.bodyJoints];
      for (let joint = 0; joint < before.length; joint += 4) {
        const a = before.slice(joint, joint + 4), b = after.slice(joint, joint + 4);
        const cosine = Math.abs(a.reduce((sum, value, axis) => sum + value * b[axis], 0)) / (Math.hypot(...a) * Math.hypot(...b));
        const radians = 2 * Math.acos(Math.min(1, cosine));
        bodyContinuity.samples++;
        if (radians >= bodyContinuity.maxRadiansPer50ms) bodyContinuity.at = `${id} body joint ${joint / 4} at ${(step / 20).toFixed(2)}s`;
        bodyContinuity.maxRadiansPer50ms = Math.max(bodyContinuity.maxRadiansPer50ms, radians);
      }
    }
  }
  await test.info().attach("actual-rig-continuity", { body: JSON.stringify({ continuityMetrics, plantedHeight, bodyContinuity, rootContinuity, visiblePlantedHeight, visibleEndpoints }, null, 2), contentType: "application/json" });
  for (const metric of Object.values(continuityMetrics)) {
    expect(metric.maxFootYardsPer10ms, metric.footAt).toBeLessThan(0.2);
    expect(metric.maxJointRadiansPer10ms, metric.jointAt).toBeLessThan(0.25);
  }
  expect(plantedHeight.maximum, plantedHeight.maximumAt).toBeLessThan(0.15);
  expect(plantedHeight.minimum, plantedHeight.minimumAt).toBeGreaterThan(-0.02);
  expect(plantedHeight.samples).toBeGreaterThan(1_000);
  expect(bodyContinuity.maxRadiansPer50ms, bodyContinuity.at).toBeLessThan(0.45);
  expect(rootContinuity.maxYardsPer50ms, rootContinuity.at).toBeLessThan(0.6);
  expect(rootContinuity.maxVerticalYardsPer50ms, "support changes do not pop the body vertically").toBeLessThan(0.2);
  expect(visiblePlantedHeight.samples).toBeGreaterThan(1_000);
  expect(visiblePlantedHeight.maximum, visiblePlantedHeight.at).toBeLessThan(0.15);
  expect(visiblePlantedHeight.minimum, "visible skinned feet do not penetrate the ground").toBeGreaterThan(-0.02);
  expect(visibleEndpoints.maximum, visibleEndpoints.at).toBeLessThan(0.15);
});

test("the rendered ball meets a player's hands at release and catch", async ({ page }) => {
  await openReplay(page);
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
  for (const { label: event, at: time } of REPLAY.events.filter((event) => ["release", "catch"].includes(event.id))) {
    const previousFrames = Number(await canvas.getAttribute("data-render-frames"));
    await page.getByRole("button", { name: event, exact: true }).click();
    await expectTime(page, time);
    await expect.poll(async () => Number(await canvas.getAttribute("data-render-frames"))).toBeGreaterThan(previousFrames);
    await expect(canvas).toHaveAttribute("data-render-time", /^\d+(?:\.\d+)?$/);
    await expect.poll(async () => Number(await canvas.getAttribute("data-render-time"))).toBeCloseTo(time, 3);
    await expect(canvas).toHaveAttribute("data-ball-contact-error", /^\d+(?:\.\d+)?$/);
    const error = Number(await canvas.getAttribute("data-ball-contact-error"));
    expect(Number.isFinite(error)).toBe(true);
    expect(error).toBeLessThan(0.15);
    await expect(canvas).toHaveAttribute("data-visible-ball-contact-error", /^\d+(?:\.\d+)?$/);
    expect(Number(await canvas.getAttribute("data-visible-ball-contact-error")), "the imported player's palm meets the actual ball").toBeLessThan(0.15);
  }
});

test("a lost WebGL context recovers to the usable HTML controls", async ({ page }) => {
  await openReplay(page);
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const lostContext = await replay.locator("canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  test.skip(!lostContext, "This browser does not expose WEBGL_lose_context.");
  await expect(page.getByRole("status").filter({ hasText: /3D unavailable/i })).toBeVisible();
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 1);
  await expectArticleSource(page);
});

test("a failed WebGL context leaves the timeline and evidence usable", async ({ page }) => {
  await disableWebGL(page);
  await openReplay(page);
  const unavailable = page.getByRole("status").filter({ hasText: /3D unavailable/i });
  await expect(unavailable).toBeVisible();
  const diagram = page.getByRole("img", { name: /Top-down teaching diagram/ });
  await expect(diagram).toBeVisible();
  const diagramBounds = (await diagram.boundingBox())!;
  const statusBounds = (await unavailable.boundingBox())!;
  expect(statusBounds.y >= diagramBounds.y + diagramBounds.height || statusBounds.y + statusBounds.height <= diagramBounds.y).toBe(true);
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 1);
  await page.getByRole("button", { name: "Return to snap", exact: true }).click();
  await expectTime(page, 0);
  await expectArticleSource(page);
  await expect(page.getByText("Recorded", { exact: true }).first()).toBeVisible();
});

test("label setup failure after WebGL allocation removes the canvas and allows a clean retry", async ({ page }) => {
  await page.addInitScript(() => {
    const probe = { webglContexts: 0, rejected2dContexts: 0, block2d: true };
    (window as unknown as { __wilsonInitProbe: typeof probe }).__wilsonInitProbe = probe;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...options: unknown[]) {
      if (contextId === "2d" && probe.webglContexts > 0 && probe.block2d) {
        probe.rejected2dContexts++;
        return null;
      }
      const result = original.apply(this, [contextId, ...options] as Parameters<typeof original>);
      if ((contextId === "webgl2" || contextId === "webgl") && result) probe.webglContexts++;
      return result;
    } as typeof original;
  });
  await openReplay(page);
  await expect(page.locator("[data-wilson-replay]")).toHaveAttribute("data-scene", "failed");
  await expect(page.getByRole("status").filter({ hasText: /3D unavailable/i })).toBeVisible();
  const probe = await page.evaluate(() => (window as unknown as { __wilsonInitProbe: { webglContexts: number; rejected2dContexts: number } }).__wilsonInitProbe);
  expect(probe.webglContexts).toBeGreaterThan(0);
  expect(probe.rejected2dContexts).toBeGreaterThan(0);
  await expect(page.locator("[data-wilson-replay] canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
  await expectTime(page, 1);
  await expectArticleSource(page);
  await page.evaluate(() => { (window as unknown as { __wilsonInitProbe: { block2d: boolean } }).__wilsonInitProbe.block2d = false; });
  await page.getByRole("button", { name: "Try 3D again", exact: true }).click();
  await expect(page.locator("[data-wilson-replay]")).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  await expect(page.locator("[data-wilson-replay] canvas")).toHaveCount(1);
  await expectTime(page, 1);
});

test("reduced motion starts static and hiding the document pauses playback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReplay(page);
  await expectTime(page, 0);
  await page.waitForTimeout(180);
  await expectTime(page, 0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel("Replay time", { exact: true }).inputValue())).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const pausedTime = await page.getByLabel("Replay time", { exact: true }).inputValue();
  await page.waitForTimeout(180);
  await expect(page.getByLabel("Replay time", { exact: true })).toHaveValue(pausedTime);
});

test("the narrow fallback reflows and passes light and dark accessibility checks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await disableWebGL(page);
  await openReplay(page);
  await expect(page.getByRole("status").filter({ hasText: /3D unavailable/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await openPositionBrowser(page);
  await page.locator('[data-roster-player="d5"]').click();
  await page.getByLabel("Teaching responsibilities", { exact: true }).check();
  await expect(page.locator('[data-selected-player="d5"]')).toHaveAttribute("data-assessment-basis", "unknown");
  await expect(page.locator('[data-selected-player="d5"] [data-player-assessment]')).toContainText("Not established");
  await expect(page.getByText("Responsibility links show an illustrative teaching scheme. Actual blocking and coverage assignments are unestablished.", { exact: true })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});
