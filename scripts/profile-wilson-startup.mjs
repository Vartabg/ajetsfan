import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  url: { type: "string", default: "http://127.0.0.1:3118/film-room/replay/wilson-cleveland" },
  output: { type: "string", default: "/tmp/wilson-startup-profile.json" },
  pairs: { type: "string", default: "2" },
} });
const pairs = Number(values.pairs);
if (!Number.isInteger(pairs) || pairs < 1 || pairs > 5) throw new Error("--pairs must be 1–5.");
const url = new URL(values.url);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Use an existing local managed HTTP preview.");
const buildId = (await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8")).trim();

function instrument() {
  const marks = { rootAt: null, fieldVisibleAt: null, fieldPaintProxyAt: null, interactionAttemptAt: null, interactionClickedAt: null, interactionReadyAt: null, gateClickedAt: null, loadingAt: null, sceneReadyAt: null, first3DFrameAt: null, firstSkinnedFrameAt: null, first3DPaintProxyAt: null, initialFieldTag: null };
  const longTasks = [];
  window.__wilsonStartup = { marks, longTasks };
  try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (longTasks.length < 100) longTasks.push({ startTime: entry.startTime, duration: entry.duration }); }).observe({ type: "longtask", buffered: true }); } catch { /* Browser support is reported by an empty sample. */ }
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    if (button.getAttribute("aria-label") === "Forward 1 second" && marks.interactionClickedAt === null) marks.interactionClickedAt = performance.now();
    if (button.textContent?.trim().startsWith("Load 3D replay") && marks.gateClickedAt === null) marks.gateClickedAt = performance.now();
  }, true);
  function sample() {
    const now = performance.now(), root = document.querySelector("[data-wilson-replay]");
    if (root) {
      if (marks.rootAt === null) marks.rootAt = now;
      const field = [...root.querySelectorAll("svg[role=img],canvas")].find((element) => {
        const box = element.getBoundingClientRect(), style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      if (field && marks.fieldVisibleAt === null) {
        marks.fieldVisibleAt = now; marks.initialFieldTag = field.tagName.toLowerCase();
        requestAnimationFrame(() => requestAnimationFrame(() => { marks.fieldPaintProxyAt = performance.now(); }));
      }
      if (marks.interactionClickedAt !== null && Number(root.dataset.time) > 0 && marks.interactionReadyAt === null) marks.interactionReadyAt = now;
      if (root.dataset.scene === "loading" && marks.loadingAt === null) marks.loadingAt = now;
      if (root.dataset.scene === "ready" && marks.sceneReadyAt === null) marks.sceneReadyAt = now;
      const canvas = root.querySelector("canvas");
      if (canvas && Number(canvas.dataset.renderFrames) > 0 && marks.first3DFrameAt === null) {
        marks.first3DFrameAt = now;
        requestAnimationFrame(() => requestAnimationFrame(() => { marks.first3DPaintProxyAt = performance.now(); }));
      }
      if (canvas && Number(canvas.dataset.renderFrames) > 0 && canvas.dataset.playerBodiesReady === "true" && Number(canvas.dataset.skinnedPlayerCount) === 22 && marks.firstSkinnedFrameAt === null) marks.firstSkinnedFrameAt = now;
    }
    if (now < 30_000 && (marks.first3DPaintProxyAt === null || marks.firstSkinnedFrameAt === null || marks.interactionReadyAt === null)) requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

const difference = (end, start) => Number.isFinite(end) && Number.isFinite(start) ? end - start : null;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const trials = [];
try {
  for (let pair = 1; pair <= pairs; pair++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: "light" });
    await context.addInitScript(instrument);
    const page = await context.newPage();
    for (const cache of ["cold-context", "warm-reload"]) {
      if (cache === "cold-context") await page.goto(values.url, { waitUntil: "domcontentloaded" });
      else await page.reload({ waitUntil: "domcontentloaded" });
      await page.evaluate(() => { window.__wilsonStartup.marks.interactionAttemptAt = performance.now(); });
      await page.getByRole("button", { name: "Forward 1 second", exact: true }).click();
      await page.waitForFunction(() => window.__wilsonStartup.marks.interactionReadyAt !== null);
      await page.getByRole("button", { name: "Return to snap", exact: true }).click();
      const gate = page.getByRole("button", { name: "Load 3D replay", exact: true });
      const manualGate = await gate.count() > 0;
      if (manualGate) await gate.click();
      await page.waitForFunction(() => window.__wilsonStartup.marks.first3DPaintProxyAt !== null, undefined, { timeout: 30_000 });
      await page.waitForFunction(() => window.__wilsonStartup.marks.firstSkinnedFrameAt !== null, undefined, { timeout: 30_000 });
      const raw = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]));
        const scripts = performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname.endsWith(".js")).map((entry) => ({ url: entry.name, startTime: entry.startTime, responseEnd: entry.responseEnd, duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize }));
        const playerResources = performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname.endsWith(".glb")).map((entry) => ({ url: entry.name, startTime: entry.startTime, responseEnd: entry.responseEnd, duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize }));
        const gl = document.querySelector("[data-wilson-replay] canvas")?.getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        const appMarks = Object.fromEntries(performance.getEntriesByType("mark").filter((entry) => entry.name.startsWith("wilson:")).map((entry) => [entry.name, entry.startTime]));
        const canvas = document.querySelector("[data-wilson-replay] canvas");
        const initialization = canvas ? { buildMs: Number(canvas.dataset.initBuildMs), compileMs: Number(canvas.dataset.initCompileMs), firstFrameMs: Number(canvas.dataset.initFirstFrameMs), parallelShaderCompile: canvas.dataset.parallelShaderCompile ?? null } : null;
        const players = canvas ? { asset: canvas.dataset.playerAsset, ready: canvas.dataset.playerBodiesReady, count: Number(canvas.dataset.skinnedPlayerCount), bytes: Number(canvas.dataset.playerAssetBytes) } : null;
        return { ...window.__wilsonStartup, navigation: nav.toJSON(), paints, scripts, playerResources, players, appMarks, initialization, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null };
      });
      const start = raw.appMarks["wilson:3d-import-start"] ?? raw.marks.gateClickedAt ?? raw.marks.loadingAt ?? 0;
      const resourceBoundary = raw.appMarks["wilson:3d-module-ready"] ?? raw.marks.first3DPaintProxyAt;
      const deferred = raw.scripts.filter((entry) => new URL(entry.url).origin === url.origin && new URL(entry.url).pathname.startsWith("/_next/static/chunks/") && entry.startTime >= start && entry.responseEnd <= resourceBoundary);
      const firstResource = deferred.length ? Math.min(...deferred.map((entry) => entry.startTime)) : null;
      const lastResource = deferred.length ? Math.max(...deferred.map((entry) => entry.responseEnd)) : null;
      const timing = {
        navigationTTFB: raw.navigation.responseStart,
        requestTTFB: raw.navigation.responseStart - raw.navigation.requestStart,
        firstContentfulPaint: raw.paints["first-contentful-paint"] ?? null,
        fieldVisible: raw.marks.fieldVisibleAt,
        fieldPaintProxy: raw.marks.fieldPaintProxyAt,
        firstWorkingInteraction: raw.marks.interactionReadyAt,
        probeActionabilityWait: difference(raw.marks.interactionClickedAt, raw.marks.interactionAttemptAt),
        interactionResponse: difference(raw.marks.interactionReadyAt, raw.marks.interactionClickedAt),
        hydratedEffect: raw.appMarks["wilson:hydrated"] ?? null,
        importStarted: raw.appMarks["wilson:3d-import-start"] ?? null,
        moduleReady: raw.appMarks["wilson:3d-module-ready"] ?? null,
        importToModuleReady: difference(raw.appMarks["wilson:3d-module-ready"], raw.appMarks["wilson:3d-import-start"]),
        moduleToReady: difference(raw.appMarks["wilson:3d-ready"], raw.appMarks["wilson:3d-module-ready"]),
        gateClicked: raw.marks.gateClickedAt,
        sceneReady: raw.marks.sceneReadyAt,
        first3DFrame: raw.marks.first3DFrameAt,
        firstSkinnedFrame: raw.marks.firstSkinnedFrameAt,
        first3DPaintProxy: raw.marks.first3DPaintProxyAt,
        triggerToFirstResource: difference(firstResource, start),
        deferredResourceSpan: difference(lastResource, firstResource),
        lastResourceToSceneReady: difference(raw.marks.sceneReadyAt, lastResource),
        first3DFrameToVisibleReady: difference(raw.marks.sceneReadyAt, raw.marks.first3DFrameAt),
        gateToFirst3DFrame: difference(raw.marks.first3DFrameAt, raw.marks.gateClickedAt),
      };
      trials.push({ pair, cache, manualGate, timing, deferredScriptCount: deferred.length, ...raw });
      console.log(JSON.stringify({ pair, cache, manualGate, timing }));
    }
    await context.close();
  }
  const finalBuildId = (await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8")).trim();
  if (finalBuildId !== buildId) throw new Error("The production build changed during profiling; repeat under a frozen build.");
  const report = { createdAt: new Date().toISOString(), buildId, url: values.url, browser: await browser.version(), viewport: { width: 1440, height: 1050, dpr: 1 }, reducedMotion: true, throttling: "none", trials, limitations: [
    "Cold means a fresh browser context HTTP cache; the production server, OS and GPU caches are not cold. Warm is a reload in that context. Browser launch is excluded.",
    "First working playback response is a hydration/readiness proxy, not an internal React hydration measurement. Playwright may scroll controls into view.",
    "HTML field visibility is a DOM/style observation; two following animation frames approximate paint. The first 3D render counter records submitted rendering, not GPU completion.",
    "Last deferred script response to scene-ready includes module evaluation, scene/resource setup and React commit; it does not isolate module initialization or GPU time.",
    "Local deferred chunks are bounded by import-start and module-ready where available. External analytics scripts are excluded. A submitted frame may precede the React commit that makes the host visible.",
    "The manual gate is clicked immediately after the same playback readiness probe/reset; real users may wait arbitrarily longer. No percentage or phone-performance claim follows from this sample.",
  ] };
  await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved ${values.output}`);
} finally { await browser.close(); }
