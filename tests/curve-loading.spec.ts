import { test, expect, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gameHref } from "../src/lib/explorer";

const gameId = "2018_16_GB_NYJ";
const body = readFileSync(path.join(process.cwd(), `public/data/curves/${gameId}.json`), "utf8");

for (const moveFocus of [false, true]) {
  test(`a failed curve has an announced retry state, avoids duplicate requests, and ${moveFocus ? "respects focus moved elsewhere" : "returns keyboard focus to the recovered chart"}`, async ({ page }) => {
    let requests = 0;
    let release!: (route: Route) => void;
    const pending = new Promise<Route>((resolve) => { release = resolve; });
    await page.route(`**/data/curves/${gameId}.json`, async (route) => {
      requests += 1;
      if (requests === 1) await route.fulfill({ status: 503, body: "Unavailable" });
      else release(route);
    });
    await page.goto(gameHref(gameId, "heartbreak"));
    const error = page.getByRole("status").filter({ hasText: "Couldn't load this game's probability curve." });
    await expect(error).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry curve", exact: true });
    await retry.focus();
    await retry.press("Enter");
    const held = await pending;
    const loading = page.getByRole("button", { name: "Loading curve…", exact: true });
    await expect(loading).toBeFocused();
    await expect(loading).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Loading game curve…" })).toBeVisible();
    await loading.press("Enter");
    expect(requests).toBe(2);
    const elsewhere = page.getByRole("button", { name: "Back to results", exact: true });
    if (moveFocus) await elsewhere.focus();
    await held.fulfill({ status: 200, contentType: "application/json", body });
    const slider = page.getByRole("slider", { name: "Play sequence", exact: true });
    await expect(slider).toBeVisible();
    if (moveFocus) await expect(elsewhere).toBeFocused();
    else await expect(slider).toBeFocused();
    await expect(retry).toHaveCount(0);
    await expect(loading).toHaveCount(0);
    expect(requests).toBe(2);
  });
}

test("a retry with no usable points keeps an honest status and a useful focus destination", async ({ page }) => {
  let requests = 0;
  await page.route(`**/data/curves/${gameId}.json`, (route) => {
    requests += 1;
    return route.fulfill({ status: requests === 1 ? 503 : 200, contentType: "application/json", body: requests === 1 ? "null" : "[]" });
  });
  await page.goto(gameHref(gameId, "heartbreak"));
  const retry = page.getByRole("button", { name: "Retry curve", exact: true });
  await retry.focus();
  await retry.press("Enter");
  const empty = page.getByRole("status").filter({ hasText: "No usable curve is published for this game." });
  await expect(empty).toBeVisible();
  await expect(empty).toBeFocused();
  await expect(page.getByRole("slider", { name: "Play sequence", exact: true })).toHaveCount(0);
});
