import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { REPLAY } from "../src/lib/wilson-replay.mjs";
import { TEACHING } from "../src/lib/wilson-teaching.mjs";

const replayPath = "/film-room/replay/wilson-cleveland";
const article = "https://www.newyorkjets.com/news/jets-joe-cool-puts-cleveland-in-the-deep-freeze-with-a-stirring-comeback-victory";

async function openReplay(page: Page) {
  await page.goto(replayPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wilson’s winning touchdown");
}

async function expectTime(page: Page, expected: number) {
  await expect.poll(async () => Number(await page.getByLabel("Replay time", { exact: true }).inputValue())).toBeCloseTo(expected, 2);
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

test("the source record and evidence limits are readable before 3D loads", async ({ page }) => {
  await openReplay(page);
  await expect(page.getByRole("button", { name: "Load 3D replay", exact: true })).toBeVisible();
  await expect(page.locator("[data-wilson-replay] canvas")).toHaveCount(0);
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
  await expectArticleSource(page);
});

test("the result, attribution and source links survive without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await openReplay(page);
  await expect(page.getByRole("main")).toContainText("Flacco");
  await expect(page.getByRole("main")).toContainText("15-yard touchdown");
  await expect(page.getByRole("main")).toContainText("Inferred");
  await expectArticleSource(page);
  await context.close();
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
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
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
  await routes.uncheck();
  await expect(routes).not.toBeChecked();
  await routes.check();
  await expect(routes).toBeChecked();
});

test("all 22 players expose their position and teaching job without inventing assessments", async ({ page }) => {
  await openReplay(page);
  const roster = page.locator("[data-all22]");
  await expect(roster.locator("[data-roster-player]")).toHaveCount(22);
  await expect(roster.locator('[data-roster-player][data-unit="offense"]')).toHaveCount(11);
  await expect(roster.locator('[data-roster-player][data-unit="defense"]')).toHaveCount(11);
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
  await roster.locator('[data-roster-player="d5"]').click();
  const assessment = page.locator('[data-selected-player="d5"] [data-player-assessment]');
  const originalAssessment = await assessment.innerText();
  await page.getByRole("button", { name: "Touchdown · 30–30", exact: true }).click();
  await expectTime(page, 3);
  await expect(page.locator('[data-selected-player="d5"]')).toHaveAttribute("data-assessment-basis", "unknown");
  await expect(assessment).toHaveText(originalAssessment, { useInnerText: true });
});

test("movement, position labels and teaching responsibilities are independent rendered layers", async ({ page }) => {
  await openReplay(page);
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
  await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption("lt");
  await page.getByRole("button", { name: "Throwing window", exact: true }).click();
  const routes = page.getByLabel("Show inferred routes", { exact: true });
  const labels = page.getByLabel("Position labels", { exact: true });
  const responsibilities = page.getByLabel("Teaching responsibilities", { exact: true });
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
  await expectTime(page, 1.7);
  await expect(page.locator('[data-selected-player="lt"]')).toHaveAttribute("data-assessment-basis", "unknown");
});

test("follow player survives movement, selection and a narrow resize, then Show everyone restores the broad view", async ({ page }) => {
  await openReplay(page);
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
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
  await expectTime(page, 2.4);
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
  await expectTime(page, 2.4);
});

test("the loaded 3D scene renders, accepts camera drags and stops rendering at rest", async ({ page }) => {
  await openReplay(page);
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
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

test("the rendered ball meets a player's hands at release and catch", async ({ page }) => {
  await openReplay(page);
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
  const replay = page.locator("[data-wilson-replay]");
  await expect(replay).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const canvas = replay.locator("canvas");
  for (const [event, time] of [["Throwing window", 1.7], ["Catch and finish", 2.4]] as const) {
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
  }
});

test("a lost WebGL context recovers to the usable HTML controls", async ({ page }) => {
  await openReplay(page);
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
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
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
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
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
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
  await page.getByRole("button", { name: "Load 3D replay", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /3D unavailable/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.locator('[data-roster-player="d5"]').click();
  await page.getByLabel("Teaching responsibilities", { exact: true }).check();
  await expect(page.locator('[data-selected-player="d5"]')).toHaveAttribute("data-assessment-basis", "unknown");
  await expect(page.locator('[data-selected-player="d5"] [data-player-assessment]')).toContainText("Not established");
  await expect(page.getByText("Responsibility links show an illustrative teaching scheme. Actual blocking and coverage assignments are unestablished.", { exact: true })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});
