import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";
import { gzipSync } from "node:zlib";

// Compressed build assets are deterministic guardrails, not field Web Vitals.
// Check after `next build`; leave room for normal editorial/data growth.
export const performanceBudgets = [
  // 2026-10-02: the front page prints the latest game's probability curve as static SVG; see docs/performance.md.
  { route: "/", file: "index", html: 14, js: 203 },
  // 2026-10-06: the focus view adds the frame, a list of the plays and one drawn moment per play (about 2.4 KiB).
  { route: "/film-room", file: "film-room", html: 24, js: 220 },
  // 2026-10-10: 24 sources, 96 items with measured artwork, inline controls and the rant archive.
  { route: "/media", file: "media", html: 38, js: 205 },
  { route: "/media/rants", file: "media/rants", html: 18, js: 200 },
  { route: "/team", file: "team", html: 12, js: 200 },
  { route: "/game-day", file: "game-day", html: 28, js: 200 },
  { route: "/stories", file: "stories", html: 18, js: 200 },
  // Deep cuts carries two recorded paths; their charts also print in the static fallback.
  { route: "/discover", file: "discover", html: 24, js: 200 },
  { route: "/history", file: "history", html: 14, js: 195 },
  // 143 trades with their pick chains measured 39.1 KiB at launch; a few trades are added each year.
  { route: "/history/trades", file: "history/trades", html: 48, js: 195 },
  // 2026-10-13: 454 game squares and their readout data measured 13.4 KiB; one more row a season.
  { route: "/history/quarterbacks", file: "history/quarterbacks", html: 18, js: 200 },
  { route: "/puzzle", file: "puzzle", html: 18, js: 200 },
  // 2026-10-13: runtime roster now renders its player cards on the server;
  // the former static response carried a loading fallback. Measured 26.4 KiB.
  { route: "/team/roster", file: "team/roster", html: 28, js: 205 },
  { route: "/team/news", file: "team/news", html: 14, js: 195 },
  { route: "/team/stats", file: "team/stats", html: 14, js: 200 },
  { route: "/morgue", file: "morgue", html: 90, js: 205 },
  { route: "/seasons/2010", file: "seasons/2010", html: 28, js: 217 },
  { route: "/seasons/2010/guide", file: "seasons/2010/guide", html: 14, js: 195 },
];

const compressed = (content) => gzipSync(content, { level: 9 }).byteLength / 1024;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const MAX_HTML_BYTES = 4 * 1024 * 1024;

/** A missing static output is a build failure, never permission to skip its budget. */
export function dynamicPageFile(route, { appRoutes, appPaths, prerender, routes }) {
  if (!record(appRoutes) || !record(appPaths) || !record(prerender?.routes) || !record(prerender?.dynamicRoutes)
    || !Array.isArray(prerender.notFoundRoutes) || !Array.isArray(routes?.dynamicRoutes)) {
    throw new Error("Invalid Next build manifests for performance verification.");
  }
  if (Object.hasOwn(prerender.routes, route) || prerender.notFoundRoutes.includes(route)) {
    throw new Error(`Missing prerendered HTML for ${route}; repair the build output.`);
  }
  for (const [appPath, pathname] of Object.entries(appRoutes)) {
    if (!appPath.endsWith("/page") || typeof pathname !== "string" || typeof appPaths[appPath] !== "string") continue;
    const matching = pathname === route || routes.dynamicRoutes.some((entry) => entry.page === pathname
      && typeof entry.regex === "string" && new RegExp(entry.regex).test(route));
    if (!matching) continue;
    // Next 16 records static/ISR/partial shells in the prerender manifest. A
    // registered App page with no prerender is rendered on demand (including
    // force-dynamic pages). Only an explicitly blocking fallback is eligible.
    const fallback = prerender.dynamicRoutes[pathname];
    if (fallback && (fallback.compute !== "blocking" || fallback.response !== "empty" || fallback.experimentalPPR)) {
      throw new Error(`Missing prerendered HTML for ${route}; repair the build output.`);
    }
    return appPaths[appPath];
  }
  throw new Error(`No dynamic App page is registered for ${route}; repair the build output.`);
}

/** An optional existing server must remain local to the build being measured. */
export function performanceOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new Error("PERFORMANCE_BASE_URL must be a local HTTP origin with a port and no credentials or path."); }
}

function boundedWait(operation, milliseconds) {
  let timer;
  return Promise.race([operation.then(() => true), new Promise((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

/** Own one production child on an OS-assigned port; never reuse or stop another server. */
export async function startProductionServer({ root, nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next"),
  readyTimeoutMs = 30_000, shutdownTimeoutMs = 5000 } = {}) {
  // Next's CLI accepts port 0 and logs the actual listening address. Keeping
  // allocation in the child avoids the reserve/close/rebind port race.
  const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
  });
  let ended = false, stopping;
  const closed = new Promise((resolve) => {
    child.once("close", () => { ended = true; resolve(); });
    child.once("error", () => { ended = true; resolve(); });
  });
  // Drain without forwarding framework diagnostics, which can contain provider
  // errors or environment values unrelated to page weight.
  child.stderr.resume();
  const killOnExit = () => { if (!ended) child.kill("SIGKILL"); };
  const stop = () => stopping ??= (async () => {
    process.off("SIGINT", onInterrupt); process.off("SIGTERM", onTerminate);
    if (!ended) {
      child.kill("SIGTERM");
      if (!await boundedWait(closed, shutdownTimeoutMs)) {
        child.kill("SIGKILL");
        if (!await boundedWait(closed, 2000)) throw new Error("The owned performance server could not be stopped.");
      }
    }
    process.off("exit", killOnExit);
  })();
  const onInterrupt = () => { void stop().finally(() => process.exit(130)); };
  const onTerminate = () => { void stop().finally(() => process.exit(143)); };
  process.once("SIGINT", onInterrupt); process.once("SIGTERM", onTerminate); process.once("exit", killOnExit);
  try {
    const baseUrl = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => finish(new Error("The owned production server did not start within 30 seconds.")), readyTimeoutMs);
      const finish = (error, origin) => {
        clearTimeout(timer); child.stdout.off("data", onOutput); child.off("error", onError); child.off("exit", onExit);
        child.stdout.resume();
        if (error) reject(error); else resolve(origin);
      };
      const onError = () => finish(new Error("The owned production server could not start."));
      const onExit = () => finish(new Error("The owned production server exited before listening."));
      const onOutput = (chunk) => {
        output = (output + chunk.toString()).slice(-16_384);
        // Wait for the entire log line: stdout can split in the middle of a port.
        const match = stripVTControlCharacters(output).match(/Local:[ \t]+(http:\/\/127\.0\.0\.1:[1-9]\d{0,4})[ \t]*\r?\n/);
        if (match) finish(null, performanceOrigin(match[1]));
      };
      child.stdout.on("data", onOutput); child.once("error", onError); child.once("exit", onExit);
    });
    return { baseUrl, stop };
  } catch (error) { await stop(); throw error; }
}

export async function runtimeHtml(origin, route, { fetcher = fetch, timeoutMs = 30_000, maxBytes = MAX_HTML_BYTES } = {}) {
  const response = await fetcher(new URL(route, performanceOrigin(origin)), {
    redirect: "error", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "text/html", "Cache-Control": "no-cache" },
  });
  if (response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "")
    || !response.body || Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Invalid production HTML response for ${route}.`);
  }
  const chunks = [], reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error(`Production HTML exceeds the bounded response size for ${route}.`); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const html = Buffer.concat(chunks).toString("utf8");
  if (!/<html(?:\s|>)/i.test(html)) throw new Error(`Invalid production HTML document for ${route}.`);
  return html;
}

export async function checkPerformanceBudgets({ root = process.cwd(), budgets = performanceBudgets, baseUrl,
  startServer = startProductionServer, fetcher = fetch, log = console.log } = {}) {
  const build = path.join(root, ".next");
  let failures = 0, server, manifests;
  let origin = baseUrl ? performanceOrigin(baseUrl) : null;
  try {
    for (const budget of budgets) {
      let html;
      try { html = await readFile(path.join(build, "server", "app", `${budget.file}.html`), "utf8"); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (!manifests) {
          const names = ["app-path-routes-manifest.json", "server/app-paths-manifest.json", "prerender-manifest.json", "routes-manifest.json"];
          const [appRoutes, appPaths, prerender, routes] = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(build, name), "utf8"))));
          manifests = { appRoutes, appPaths, prerender, routes };
        }
        const pageFile = dynamicPageFile(budget.route, manifests);
        const absolute = path.resolve(build, "server", pageFile);
        if (!absolute.startsWith(path.join(build, "server") + path.sep)) throw new Error("Invalid compiled App page path.");
        await access(absolute);
        if (!origin) { server = await startServer({ root }); origin = performanceOrigin(server.baseUrl); }
        html = await runtimeHtml(origin, budget.route, { fetcher });
      }
      const scripts = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="(\/_next\/[^"?]+\.js)(?:\?[^"\s]*)?"/g)].map((match) => match[1]))];
      if (!scripts.length) throw new Error(`No initial scripts found for ${budget.route}; check the build output format.`);
      const assets = await Promise.all(scripts.map((src) => {
        const file = path.resolve(build, src.slice("/_next/".length));
        if (!file.startsWith(build + path.sep)) throw new Error("Invalid initial script path.");
        return readFile(file);
      }));
      const sizes = { html: compressed(html), js: assets.reduce((sum, content) => sum + compressed(content), 0) };
      const exceeded = ["html", "js"].filter((key) => sizes[key] > budget[key]);
      log(`${exceeded.length ? "FAIL" : "PASS"} ${budget.route}: HTML ${sizes.html.toFixed(1)}/${budget.html} KiB; initial JS ${sizes.js.toFixed(1)}/${budget.js} KiB gzip`);
      failures += exceeded.length;
    }
    return failures;
  } finally { if (server) await server.stop(); }
}

async function main() {
  const { values } = parseArgs({ options: { "base-url": { type: "string" } }, allowPositionals: false });
  const failures = await checkPerformanceBudgets({ baseUrl: values["base-url"] ?? process.env.PERFORMANCE_BASE_URL });
  if (failures) {
    console.error("Page weight exceeded its budget. Inspect added data/imports before increasing the limits.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
