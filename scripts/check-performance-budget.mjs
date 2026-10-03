import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

// Compressed build assets are deterministic guardrails, not field Web Vitals.
// Check after `next build`; leave room for normal editorial/data growth.
const budgets = [
  // 2026-10-02: the front page prints the latest game's probability curve as static SVG; see docs/performance.md.
  { route: "/", file: "index", html: 14, js: 200 },
  { route: "/film-room", file: "film-room", html: 22, js: 220 },
  { route: "/media", file: "media", html: 24, js: 205 },
  { route: "/team", file: "team", html: 12, js: 200 },
  { route: "/game-day", file: "game-day", html: 28, js: 200 },
  { route: "/stories", file: "stories", html: 18, js: 200 },
  { route: "/history", file: "history", html: 14, js: 195 },
  // 143 trades with their pick chains measured 39.1 KiB at launch; a few trades are added each year.
  { route: "/history/trades", file: "history/trades", html: 48, js: 195 },
  { route: "/puzzle", file: "puzzle", html: 18, js: 200 },
  { route: "/team/roster", file: "team/roster", html: 22, js: 205 },
  { route: "/team/news", file: "team/news", html: 14, js: 195 },
  { route: "/team/stats", file: "team/stats", html: 14, js: 200 },
  { route: "/morgue", file: "morgue", html: 90, js: 205 },
  { route: "/seasons/2010", file: "seasons/2010", html: 28, js: 215 },
  { route: "/seasons/2010/guide", file: "seasons/2010/guide", html: 14, js: 195 },
];

const build = path.join(process.cwd(), ".next");
const compressed = (content) => gzipSync(content, { level: 9 }).byteLength / 1024;
let failures = 0;
for (const budget of budgets) {
  const html = await readFile(path.join(build, "server", "app", `${budget.file}.html`), "utf8");
  const scripts = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="(\/_next\/[^"?]+\.js)(?:\?[^"\s]*)?"/g)].map((match) => match[1]))];
  if (!scripts.length) throw new Error(`No initial scripts found for ${budget.route}; check the build output format.`);
  const assets = await Promise.all(scripts.map((src) => readFile(path.join(build, src.slice("/_next/".length)))));
  const sizes = { html: compressed(html), js: assets.reduce((sum, content) => sum + compressed(content), 0) };
  const exceeded = ["html", "js"].filter((key) => sizes[key] > budget[key]);
  console.log(`${exceeded.length ? "FAIL" : "PASS"} ${budget.route}: HTML ${sizes.html.toFixed(1)}/${budget.html} KiB; initial JS ${sizes.js.toFixed(1)}/${budget.js} KiB gzip`);
  failures += exceeded.length;
}
if (failures) {
  console.error("Page weight exceeded its budget. Inspect added data/imports before increasing the limits.");
  process.exitCode = 1;
}
