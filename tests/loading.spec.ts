import { test, expect } from "@playwright/test";

test("large sections prefetch on keyboard intent instead of competing with the first page", async ({ page }) => {
  const prefetched: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-router-prefetch"]) prefetched.push(new URL(request.url()).pathname);
  });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>' }));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  for (const route of ["/morgue", "/film-room", "/media", "/team", "/seasons"]) expect(prefetched).not.toContain(route);

  const link = page.getByRole("navigation", { name: "Site sections" }).getByRole("link", { name: /^Game archive/ });
  await link.focus();
  await expect.poll(() => prefetched).toContain("/morgue");
  await link.press("Enter");
  await expect(page).toHaveURL(/\/morgue$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
