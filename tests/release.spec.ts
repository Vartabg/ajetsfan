import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { CurrentSnapshot } from "../src/lib/current";
import type { CoverageSnapshot } from "../src/lib/coverage";
import { siteOrigin, indexableSite } from "../src/lib/site";
import { telemetryUrl } from "../src/lib/telemetry";
import { editionHealth } from "../src/lib/edition-health";

const current = JSON.parse(readFileSync("public/data/current.json", "utf8")) as CurrentSnapshot;
const coverage = JSON.parse(readFileSync("public/data/coverage.json", "utf8")) as CoverageSnapshot;
const now = Date.parse("2026-10-01T03:00:00Z");
const checkedAt = new Date(now - 60_000).toISOString();
const freshCurrent = { ...current, checkedAt, analysisCheck: { attemptedAt: checkedAt, checkedAt, status: "ready" as const, reason: null } };
const freshCoverage = { ...coverage, season: current.season,
  news: { ...coverage.news, checkedAt, status: "ready" as const },
  roster: { ...coverage.roster, checkedAt, season: current.season, status: "ready" as const },
  stats: { ...coverage.stats, checkedAt, season: current.season, status: "ready" as const },
};

test("canonical home uses approved configuration or the production host, never a preview host", () => {
  expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://example.com" })?.href).toBe("https://example.com/");
  expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "paper.vercel.app" })?.href).toBe("https://paper.vercel.app/");
  expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://example.com", VERCEL_PROJECT_PRODUCTION_URL: "paper.vercel.app" })?.hostname).toBe("example.com");
  expect(siteOrigin({})).toBeUndefined();
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com/team", "https://example.com?q=secret", "https://example.com/#top", "https://127.0.0.1", "https://localhost", "https://example.com:444", "invalid"]) {
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: value })).toBeUndefined();
  }
});

test("search indexing is allowed only for a configured production edition", () => {
  const env = { NEXT_PUBLIC_SITE_URL: "https://example.com", NODE_ENV: "production" };
  expect(indexableSite(env)).toBe(true);
  expect(indexableSite({ ...env, VERCEL_ENV: "preview" })).toBe(false);
  expect(indexableSite({ ...env, VERCEL_ENV: "development" })).toBe(false);
  expect(indexableSite({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false);
});

test("telemetry omits search text, filter state, ticket fragments and URL credentials", () => {
  expect(telemetryUrl("https://example.com/team?q=private+search&player=00-1234567#roster")).toBe("https://example.com/team");
  expect(telemetryUrl("https://user:secret@example.com/morgue?season=2026#game")).toBe("https://example.com/morgue");
  expect(telemetryUrl("javascript:alert(1)")).toBeNull();
  expect(telemetryUrl("invalid")).toBeNull();
});

test("edition health distinguishes a fresh check from old source content", () => {
  const health = editionHealth(freshCurrent, { ...freshCoverage, news: { ...freshCoverage.news, sourceUpdatedAt: "2026-08-01T12:00:00Z" } }, null, now);
  expect(health.status).toBe("healthy");
  expect(health.feeds.news).toEqual({ status: "ready", checkedAt, ageMinutes: 1 });
  expect(health.feeds.analysis.checkedAt).toBe(checkedAt);
  expect(health.analysis.archiveUpdatedAt).toBe(freshCurrent.analysisUpdatedAt);
  expect(health.analysis.metricsUpdatedAt).toBeNull();
});

test("health detects stopped refreshes, unavailable sources and wrong-season roster/stats", () => {
  const stopped = editionHealth({ ...freshCurrent, checkedAt: new Date(now - 25 * 60 * 60_000).toISOString() }, freshCoverage, null, now);
  expect(stopped.status).toBe("degraded");
  expect(stopped.feeds.results.status).toBe("overdue");
  const wrongSeason = editionHealth(freshCurrent, { ...freshCoverage, season: current.season - 1 }, null, now);
  expect(wrongSeason.feeds.roster.status).toBe("unavailable");
  expect(wrongSeason.feeds.stats.status).toBe("unavailable");
  expect(editionHealth(null, null, null, now).status).toBe("unavailable");
});

test("retained analysis never receives a fabricated successful check", () => {
  const retained = editionHealth({ ...freshCurrent, analysisCheck: { attemptedAt: checkedAt, checkedAt: null, status: "retained", reason: "source-unavailable" } }, freshCoverage, null, now);
  expect(retained.status).toBe("degraded");
  expect(retained.feeds.analysis).toEqual({ status: "unknown", checkedAt: null, ageMinutes: null });
  expect(editionHealth({ ...freshCurrent, checkedAt: "invalid" }, freshCoverage, null, now).status).toBe("unavailable");
  expect(editionHealth({ ...freshCurrent, checkedAt: new Date(now + 10 * 60_000).toISOString() }, freshCoverage, null, now).status).toBe("unavailable");
});

test("deployed health exposes this edition with live freshness and no-cache diagnostics", async ({ request }) => {
  const response = await request.get("/api/health");
  expect([200, 503]).toContain(response.status());
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-robots-tag"]).toBe("noindex");
  const health = await response.json();
  expect(health.season).toBe(current.season);
  expect(health.checkedAt).toBe(current.checkedAt);
  expect(health.feeds.results.checkedAt).toBe(current.checkedAt);
  expect(JSON.stringify(health)).not.toMatch(/stack|Users\/|token|password/i);
});

test("each desk supplies its own share title and the branded image renders as PNG", async ({ page, request }) => {
  for (const path of ["/", "/team", "/morgue", "/how-made", "/media", "/seasons", "/seasons/2010"]) {
    await page.goto(path);
    const title = await page.title();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  }
  const response = await request.get("/opengraph-image");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const png = await response.body();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});
