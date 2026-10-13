import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkPerformanceBudgets, dynamicPageFile, performanceOrigin, runtimeHtml, startProductionServer } from "./check-performance-budget.mjs";

const html = '<!doctype html><html><body><h1>Jets coverage</h1><script src="/_next/static/chunks/main.js?dpl=fixture"></script></body></html>';
const media = { route: "/media", file: "media", html: 38, js: 205 };
const rants = { route: "/media/rants", file: "media/rants", html: 18, js: 200 };
const manifests = () => ({
  appRoutes: { "/media/page": "/media", "/media/rants/page": "/media/rants", "/seasons/[year]/page": "/seasons/[year]" },
  appPaths: { "/media/page": "app/media/page.js", "/media/rants/page": "app/media/rants/page.js", "/seasons/[year]/page": "app/seasons/[year]/page.js" },
  prerender: { routes: {}, dynamicRoutes: {}, notFoundRoutes: [] },
  routes: { dynamicRoutes: [{ page: "/seasons/[year]", regex: "^/seasons/([^/]+?)(?:/)?$" }] },
});

async function fixture(t, { staticPage = false, metadata = manifests() } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ajetsfan-performance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const save = async (name, value) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
    return file;
  };
  await save(".next/static/chunks/main.js", 'console.log("edition");');
  for (const file of Object.values(metadata.appPaths)) await save(`.next/server/${file}`, "// compiled fixture\n");
  for (const [file, value] of [
    ["app-path-routes-manifest.json", metadata.appRoutes], ["server/app-paths-manifest.json", metadata.appPaths],
    ["prerender-manifest.json", metadata.prerender], ["routes-manifest.json", metadata.routes],
  ]) await save(`.next/${file}`, JSON.stringify(value));
  if (staticPage) await save(".next/server/app/media.html", html);
  return { root, save };
}

test("static HTML keeps its existing budgets without starting a server", async (t) => {
  const { root, save } = await fixture(t, { staticPage: true });
  // A wholly static build does not need runtime classification manifests.
  await rm(path.join(root, ".next/app-path-routes-manifest.json"));
  const output = [];
  const options = { root, budgets: [media], log: (line) => output.push(line), startServer: () => { throw new Error("unexpected server"); } };
  assert.equal(await checkPerformanceBudgets(options), 0);
  assert.match(output[0], /^PASS \/media: HTML .*\/38 KiB; initial JS .*\/205 KiB gzip$/);
  await save(".next/server/app/media.html", html.replace("<h1>", '<h1 data-content="' + "x".repeat(1000) + '">'));
  assert.equal(await checkPerformanceBudgets({ ...options, budgets: [{ ...media, html: 0.001, js: 0.001 }] }), 2);
  assert.match(output.at(-1), /^FAIL \/media:/);
});

test("missing static, ISR, partial, unknown and not-found pages cannot bypass their budgets", () => {
  const metadata = manifests();
  assert.equal(dynamicPageFile("/media", metadata), "app/media/page.js");
  assert.equal(dynamicPageFile("/seasons/2010", metadata), "app/seasons/[year]/page.js");
  for (const staticRecord of [
    { compute: "static", initialRevalidateSeconds: false }, { initialRevalidateSeconds: 60 },
    { renderingMode: "PARTIALLY_STATIC", experimentalPPR: true },
  ]) assert.throws(() => dynamicPageFile("/media", { ...metadata, prerender: { ...metadata.prerender, routes: { "/media": staticRecord } } }), /Missing prerendered HTML/);
  for (const fallback of [{ fallback: false }, { compute: "static", response: "complete" }, { compute: "blocking", response: "empty", experimentalPPR: true }]) {
    assert.throws(() => dynamicPageFile("/seasons/2010", { ...metadata, prerender: { ...metadata.prerender, dynamicRoutes: { "/seasons/[year]": fallback } } }), /Missing prerendered HTML/);
  }
  assert.throws(() => dynamicPageFile("/media", { ...metadata, prerender: { ...metadata.prerender, notFoundRoutes: ["/media"] } }), /Missing prerendered HTML/);
  assert.throws(() => dynamicPageFile("/unknown", metadata), /No dynamic App page/);
  assert.throws(() => dynamicPageFile("/media", { ...metadata, appPaths: {} }), /No dynamic App page/);
  assert.throws(() => dynamicPageFile("/media", { ...metadata, prerender: {} }), /Invalid Next build manifests/);
});

test("a missing declared-static output fails before a server is launched", async (t) => {
  const metadata = manifests();
  metadata.prerender.routes["/media"] = { initialRevalidateSeconds: false };
  const { root } = await fixture(t, { metadata });
  await assert.rejects(checkPerformanceBudgets({ root, budgets: [media], startServer: () => { throw new Error("unexpected server"); } }), /Missing prerendered HTML/);
});

test("dynamic pages use one owned ephemeral server, measure local JS, and stop it after a budget failure", async (t) => {
  const { root, save } = await fixture(t);
  const nextBin = await save("next-fixture.mjs", `
    import http from "node:http";
    const server = http.createServer((request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end(${JSON.stringify(html)}); });
    server.listen(0, "127.0.0.1", () => {
      const address = "- Local:         http://127.0.0.1:" + server.address().port;
      process.stdout.write(address.slice(0, -2));
      setTimeout(() => console.log(address.slice(-2)), 25);
    });
    process.on("SIGTERM", () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
  `);
  let starts = 0, address;
  const output = [];
  const originalSignals = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM"), process.listenerCount("exit")];
  const failures = await checkPerformanceBudgets({ root, budgets: [media, { ...rants, js: 0.001 }], log: (line) => output.push(line),
    startServer: async () => { starts++; const server = await startProductionServer({ root, nextBin }); address = server.baseUrl; return server; },
  });
  assert.equal(starts, 1);
  assert.equal(failures, 1);
  assert.match(output[0], /^PASS \/media:/);
  assert.match(output[1], /^FAIL \/media\/rants:/);
  assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM"), process.listenerCount("exit")], originalSignals);
  await assert.rejects(fetch(address, { signal: AbortSignal.timeout(1000) }));
});

test("render and asset failures also stop the owned server; existing servers are never stopped", async (t) => {
  const { root } = await fixture(t);
  let stops = 0;
  const startServer = async () => ({ baseUrl: "http://127.0.0.1:3198", stop: async () => { stops++; } });
  await assert.rejects(checkPerformanceBudgets({ root, budgets: [media], startServer, fetcher: async () => new Response("not found", { status: 404 }) }), /Invalid production HTML response/);
  assert.equal(stops, 1);
  const missingAsset = html.replace("main.js", "missing.js");
  await assert.rejects(checkPerformanceBudgets({ root, budgets: [media], startServer, fetcher: async () => new Response(missingAsset, { headers: { "Content-Type": "text/html" } }) }), /ENOENT/);
  assert.equal(stops, 2);
  assert.equal(await checkPerformanceBudgets({ root, budgets: [media], baseUrl: "http://127.0.0.1:3198", log: () => {},
    startServer: () => { throw new Error("unexpected owned server"); }, fetcher: async () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
  }), 0);
  assert.equal(stops, 2);
});

test("runtime HTML is bounded, must be successful HTML, and cannot redirect", async () => {
  const origin = "http://127.0.0.1:3198";
  for (const result of [
    new Response(html, { status: 503, headers: { "Content-Type": "text/html" } }),
    new Response('{}', { headers: { "Content-Type": "application/json" } }),
    new Response("not a document", { headers: { "Content-Type": "text/html" } }),
    new Response(html, { headers: { "Content-Type": "text/html", "Content-Length": "99999999" } }),
  ]) await assert.rejects(runtimeHtml(origin, "/media", { fetcher: async () => result }), /Invalid production HTML/);
  let request;
  await assert.rejects(runtimeHtml(origin, "/media", { maxBytes: 32, fetcher: async (_url, options) => { request = options; return new Response(html, { headers: { "Content-Type": "text/html" } }); } }), /bounded response size/);
  assert.equal(request.redirect, "error");
  assert.equal(request.cache, "no-store");
  assert.equal(request.credentials, "omit");
  assert.equal(request.signal instanceof AbortSignal, true);
});

test("external, secret-bearing and path-bearing performance origins are rejected", () => {
  for (const value of ["https://ajetsfan.com", "http://127.0.0.1", "http://user:secret@127.0.0.1:3198", "http://127.0.0.1:3198/media", "http://localhost:3198?key=secret", "http://127.0.0.1:3198#fragment"]) {
    assert.throws(() => performanceOrigin(value), (error) => /local HTTP origin/.test(error.message) && !/secret/.test(error.message));
  }
  assert.equal(performanceOrigin("http://localhost:3198/"), "http://localhost:3198");
  assert.equal(performanceOrigin("http://[::1]:3198/"), "http://[::1]:3198");
});

test("failed startup and readiness timeouts release the owned child and signal listeners", async (t) => {
  const { root, save } = await fixture(t);
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM"), process.listenerCount("exit")];
  const missing = path.join(root, "missing-next.mjs");
  await assert.rejects(startProductionServer({ root, nextBin: missing }), /exited before listening/);
  const stalled = await save("stalled-next.mjs", 'setInterval(() => {}, 1000); process.on("SIGTERM", () => {});');
  await assert.rejects(startProductionServer({ root, nextBin: stalled, readyTimeoutMs: 100, shutdownTimeoutMs: 30 }), /did not start within/);
  assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM"), process.listenerCount("exit")], before);
});
