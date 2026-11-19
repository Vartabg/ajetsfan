import { test, expect } from "@playwright/test";
import path from "node:path";
import { STATIC_SITEMAP_PATHS } from "../src/lib/sitemap-paths";
import { siteOrigin } from "../src/lib/site";

test("security headers, public discovery endpoints, icons, and Wilson share card respond cleanly", async ({ request }) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const headers = home.headers();
  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("blob:");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");

  for (const route of ["/opengraph-image", "/film-room/replay/wilson-cleveland/opengraph-image"]) {
    const res = await request.get(route);
    expect(res.status(), route).toBe(200);
    expect(res.headers()["content-type"], route).toContain("image/png");
    expect(res.headers()["cross-origin-resource-policy"], route).toBe("cross-origin");
    const png = await res.body();
    expect(png.subarray(0, 8).toString("hex"), route).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16), route).toBe(1200);
    expect(png.readUInt32BE(20), route).toBe(630);
  }

  for (const asset of [
    { path: "/favicon.ico", type: /image\/(x-icon|vnd\.microsoft\.icon)/ },
    { path: "/apple-icon.png", type: /image\/png/ },
    { path: "/icon-192.png", type: /image\/png/ },
    { path: "/icon-512.png", type: /image\/png/ },
    { path: "/manifest.webmanifest", type: /application\/manifest\+json/ },
    { path: "/.well-known/security.txt", type: /text\/plain/ },
  ]) {
    const res = await request.get(asset.path);
    expect(res.status(), asset.path).toBe(200);
    expect(res.headers()["content-type"], asset.path).toMatch(asset.type);
    expect(res.headers()["cross-origin-resource-policy"], asset.path).toBe("cross-origin");
  }

  const securityTxt = await (await request.get("/.well-known/security.txt")).text();
  expect(securityTxt).toContain("Contact: https://garovartabedian.com/contact");
  expect(securityTxt).toContain("Canonical: https://ajetsfan.com/.well-known/security.txt");
  expect(securityTxt).not.toMatch(/github\.com/i);

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("ajetsfan");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(["/icon-192.png", "/icon-512.png"]);

  if (siteOrigin()) {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/film-room/replay/wilson-cleveland");
  }
});

test("sitemap static route list includes the 3D Wilson replay route", () => {
  expect(STATIC_SITEMAP_PATHS).toContain("/film-room/replay/wilson-cleveland");
});

test("pages expose head metadata, WebSite JSON-LD, top-level footer landmark with disclaimer, and zero CSP violations", async ({ page }) => {
  const cspViolations: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  await page.route("**/_vercel/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => {
    window.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolations?: string[] }).__cspViolations ??= [];
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${event.effectiveDirective}:${event.blockedURI}`);
    });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  for (const route of ["/", "/game-day", "/film-room/replay/wilson-cleveland"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /\/manifest\.webmanifest/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

    const ldText = await page.locator('script[type="application/ld+json"]').first().textContent();
    const ld = JSON.parse(ldText || "{}");
    expect(ld["@type"], route).toBe("WebSite");
    expect(ld.name, route).toBe("ajetsfan");

    const footer = page.getByRole("contentinfo");
    await expect(footer, route).toHaveCount(1);
    await expect(footer, route).toContainText(/unofficial New York Jets fan publication/i);
    await expect(footer, route).toContainText(/Not affiliated with or endorsed by the New York Jets or the NFL/i);
    for (const link of await footer.getByRole("link").all()) {
      const box = (await link.boundingBox())!;
      expect(box.height, route).toBeGreaterThanOrEqual(44);
      expect(box.width, route).toBeGreaterThanOrEqual(44);
    }

    const found = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
    cspViolations.push(...found.map((item) => `${route} -> ${item}`));

    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((v) => v.id);
    });
    expect(violations, route).toEqual([]);
  }

  expect(cspViolations).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  // Verify short desktop page (404) keeps footer compact rather than stretching row 2.
  await page.setViewportSize({ width: 1440, height: 900 });
  const notFound = await page.goto("/this-route-does-not-exist", { waitUntil: "domcontentloaded" });
  expect(notFound?.status()).toBe(404);
  const notFoundFooter = (await page.getByRole("contentinfo").boundingBox())!;
  expect(notFoundFooter.height).toBeLessThan(220);
  expect(pageErrors).toEqual([]);
});
