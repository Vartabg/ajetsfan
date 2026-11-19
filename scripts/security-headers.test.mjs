import test from "node:test";
import assert from "node:assert/strict";
import { buildCsp, buildSecurityHeaders } from "../src/lib/security-headers.mjs";

const headerMap = (rules, source) => {
  const rule = rules.find((entry) => entry.source === source);
  assert.ok(rule, `Missing header rule for ${source}`);
  return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
};

test("local production build sets strict security headers without local HTTP upgrade or HSTS", () => {
  const rules = buildSecurityHeaders({ isProduction: true, isVercel: false });
  const global = headerMap(rules, "/:path*");

  assert.equal(global["X-Frame-Options"], "DENY");
  assert.equal(global["X-Content-Type-Options"], "nosniff");
  assert.equal(global["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(global["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(global["Cross-Origin-Resource-Policy"], "same-origin");
  assert.match(global["Permissions-Policy"], /camera=\(\)/);
  assert.equal(global["Strict-Transport-Security"], undefined);

  const csp = global["Content-Security-Policy"];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src [^;]*blob:/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src [^;]*https:\/\/www\.youtube-nocookie\.com/);
  assert.match(csp, /frame-src [^;]*https:\/\/embed\.podcasts\.apple\.com/);
  assert.match(csp, /frame-src [^;]*https:\/\/player\.amperwavepodcasting\.com/);
  assert.match(csp, /frame-src [^;]*https:\/\/platform\.twitter\.com/);
  assert.match(csp, /media-src [^;]*https:\/\/cdn\.jwplayer\.com/);
  assert.doesNotMatch(csp, /'unsafe-eval'/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

test("Vercel HTTPS deployment enables upgrade-insecure-requests and HSTS", () => {
  const rules = buildSecurityHeaders({ isProduction: true, isVercel: true });
  const global = headerMap(rules, "/:path*");

  assert.equal(global["Strict-Transport-Security"], "max-age=63072000; includeSubDomains");
  assert.match(global["Content-Security-Policy"], /upgrade-insecure-requests/);
});

test("development CSP enables unsafe-eval and websocket connections for HMR", () => {
  const csp = buildCsp({ isProduction: false, isVercel: false });
  assert.match(csp, /script-src [^;]*'unsafe-eval'/);
  assert.match(csp, /connect-src [^;]*ws: wss:/);
});

test("public discovery, icon, and share-card routes allow cross-origin embeds and UTF-8 security.txt", () => {
  const rules = buildSecurityHeaders({ isProduction: true, isVercel: true });
  for (const source of [
    "/:path*/opengraph-image",
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/manifest.webmanifest",
    "/.well-known/security.txt",
  ]) {
    assert.equal(headerMap(rules, source)["Cross-Origin-Resource-Policy"], "cross-origin", source);
  }
  assert.equal(headerMap(rules, "/.well-known/security.txt")["Content-Type"], "text/plain; charset=utf-8");
});
