import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  url: { type: "string", default: "http://127.0.0.1:3118/film-room/replay/wilson-cleveland" },
  output: { type: "string", default: "/tmp/wilson-motion" },
} });
const url = new URL(values.url);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Use an existing local managed HTTP preview.");
const buildId = (await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8")).trim();
await mkdir(values.output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const captures = [];
const quantile = (items, percentile) => items.length ? [...items].sort((a, b) => a - b)[Math.floor((items.length - 1) * percentile)] : null;
try {
  for (const view of ["full-snap", "protection", "coverage", "wilson-finish"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", recordVideo: { dir: values.output, size: { width: 1440, height: 1050 } } });
    const page = await context.newPage();
    await page.goto(values.url, { waitUntil: "domcontentloaded" });
    await page.locator('[data-wilson-replay][data-scene="ready"]').waitFor({ timeout: 30_000 });
    await page.getByLabel("Position labels", { exact: true }).uncheck();
    await page.getByLabel("Show inferred routes", { exact: true }).uncheck();
    await page.getByLabel("Teaching responsibilities", { exact: true }).uncheck();
    if (view === "full-snap") await page.getByRole("button", { name: "Show everyone", exact: true }).click();
    else {
      await page.getByRole("combobox", { name: "Focus player", exact: true }).selectOption(view === "protection" ? "lt" : view === "coverage" ? "d7" : "wilson");
      await page.getByRole("button", { name: "Follow player", exact: true }).click();
    }
    await page.getByRole("button", { name: "Return to snap", exact: true }).click();
    await page.getByRole("button", { name: "Expand field", exact: true }).click();
    await page.waitForFunction(() => document.fullscreenElement !== null);
    await page.locator("[data-wilson-replay] canvas").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const report = { frames: [], longTasks: [], start: null, end: null };
      window.__wilsonMotion = report;
      try { new PerformanceObserver((list) => { for (const item of list.getEntries()) if (report.longTasks.length < 100) report.longTasks.push({ at: item.startTime, duration: item.duration }); }).observe({ type: "longtask" }); } catch { /* Optional browser metric. */ }
      let started = false;
      function sample(now) {
        const root = document.querySelector("[data-wilson-replay]"), canvas = root.querySelector("canvas");
        if (root.dataset.playing === "true") {
          if (!started) { started = true; report.start = now; }
          if (report.frames.length < 1500) report.frames.push({ at: now, time: Number(root.dataset.time), renderedTime: Number(canvas.dataset.renderedTime ?? canvas.dataset.renderTime), renderFrames: Number(canvas.dataset.renderFrames) });
        } else if (started) { report.end = now; return; }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__wilsonMotion.end !== null, undefined, { timeout: 12_000 });
    await page.waitForFunction(() => Math.abs(Number(document.querySelector("[data-wilson-replay] canvas").dataset.renderedTime) - Number(document.querySelector("#replay-time").max)) < 0.01, undefined, { timeout: 2_000 });
    const raw = await page.evaluate(() => { const canvas = document.querySelector("[data-wilson-replay] canvas"), input = document.querySelector("#replay-time"); const scripts = performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname.startsWith("/_next/static/chunks/") && new URL(entry.name).pathname.endsWith(".js")).map((entry) => ({ url: entry.name, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize })); return { ...window.__wilsonMotion, scene: { ...canvas.dataset }, canvasSize: { width: canvas.width, height: canvas.height }, scripts, expanded: document.fullscreenElement !== null, duration: Number(input.max), finalTime: Number(input.value) }; });
    if (Math.abs(raw.finalTime - raw.duration) > 0.01) throw new Error(`${view} stopped at ${raw.finalTime}s before the complete ${raw.duration}s snap.`);
    const intervals = raw.frames.slice(1).map((frame, index) => frame.at - raw.frames[index].at);
    const distinct = raw.frames.filter((frame, index) => index === 0 || frame.renderFrames !== raw.frames[index - 1].renderFrames);
    const renderIntervals = distinct.slice(1).map((frame, index) => frame.at - distinct[index].at);
    const timing = { sampledFrames: raw.frames.length, sampledDuration: raw.end - raw.start, rafMs: { p50: quantile(intervals, 0.5), p95: quantile(intervals, 0.95), max: Math.max(...intervals), over50: intervals.filter((value) => value > 50).length }, submittedRenderIntervalsMs: { count: renderIntervals.length, p50: quantile(renderIntervals, 0.5), p95: quantile(renderIntervals, 0.95), max: Math.max(...renderIntervals) } };
    const destination = path.join(values.output, view === "wilson-finish" ? "wilson-finish.webm" : `wilson-${view}.webm`);
    await page.waitForTimeout(250);
    await context.close();
    await page.video().saveAs(destination);
    await page.video().delete();
    captures.push({ view, video: destination, timing, ...raw });
    console.log(JSON.stringify({ view, video: destination, timing }));
  }
  const finalBuildId = (await readFile(new URL("../.next/BUILD_ID", import.meta.url), "utf8")).trim();
  if (buildId !== finalBuildId) throw new Error("Build changed during capture; repeat under a frozen build.");
  await writeFile(path.join(values.output, "wilson-motion-metadata.json"), `${JSON.stringify({ buildId, createdAt: new Date().toISOString(), browser: await browser.version(), url: values.url, viewport: { width: 1440, height: 1050, dpr: 1 }, captures, limitations: ["Local desktop system Chrome, no CPU/network throttling; browser video recording is active and adds overhead.", "Videos include a short setup prefix and finish hold around the full six-second playback.", "RAF and submitted-frame intervals are browser observations, not GPU completion times, sustained device benchmarks, or physical phone performance.", "All animation is authored/inferred; motion review does not validate tracking, assignments, timing or technique."] }, null, 2)}\n`);
} finally { await browser.close(); }
