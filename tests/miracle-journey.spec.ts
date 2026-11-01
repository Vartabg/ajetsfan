import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const journey = "/stories/monday-night-miracle";
const miami = "2000_08_MIA_NYJ";
const storageKey = "ajetsfan:miracle-journey:v1";
type Bookmark = { version: number; step: string; moment: number; progress: number };
const steps = (page: Page) => page.getByRole("navigation", { name: "Comeback journey steps" });
const resume = (page: Page) => page.getByRole("link", { name: "Continue your saved journey", exact: true });
const actions = (page: Page) => page.locator("#journey-next");
const remove = (page: Page) => actions(page).getByRole("button", { name: /Remove.*saved|Remove.*journey|Forget.*journey/i });
const saved = (page: Page) => page.evaluate((key) => {
  const value = localStorage.getItem(key);
  return value === null ? null : JSON.parse(value) as Bookmark;
}, storageKey);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("the homepage invitation joins the Miami story, Elliott illustration and Cleveland comparison", async ({ page }) => {
  await page.goto("/");
  await page.locator("#miracle").getByRole("link", { name: /Follow the comeback/ }).click();
  const story = page.locator("#visual-story");
  await expect(story).toHaveAttribute("data-story", miami);
  await expect(steps(page).locator('[aria-current="step"]')).toContainText("Relive the comeback");
  await expect(page.locator("[data-focus-moment]")).toHaveCount(4);
  await expect(page.locator("[data-focus-field]")).toHaveCount(0);
  await story.getByRole("button", { name: /The winning kick/ }).click();
  await expect(story.locator("[data-story-clock]")).toHaveText("OT");
  await expect(story.locator("[data-story-probability]")).toContainText("78.6%");
  expect(await saved(page)).toBeNull();
  await actions(page).getByRole("link", { name: /Next: explore Elliott’s catch/ }).click();
  await expect(story).toHaveCount(0);
  const field = page.locator("#journey-stage [data-focus-field]");
  await expect(field).toHaveAttribute("data-time", "0.0");
  await page.locator("#journey-stage").getByRole("button", { name: "Play it", exact: true }).click();
  await expect(field).toHaveAttribute("data-time", "6.0");
  await expect(page.locator("#journey-stage figcaption")).toContainText("Drawn to show the idea, not traced from film.");
  const filmLink = page.getByRole("link", { name: /Open this play in the Film Room/ });
  await expect(filmLink).toHaveAttribute("href", "/film-room#play-elliott-miami");
  await filmLink.click();
  await expect(page.locator("#play-elliott-miami")).toBeInViewport();
  await page.goBack();
  await expect(steps(page).locator('[aria-current="step"]')).toContainText("Elliott");
  await actions(page).getByRole("link", { name: /Next: compare with Cleveland/ }).click();
  await expect(page.getByRole("slider", { name: "Comeback sequence progress" })).toBeVisible();
  await expect(page.locator("#journey-stage figure")).toHaveCount(2);
  await expect(page.locator("[data-focus-field], #visual-story")).toHaveCount(0);
  await expect(page.locator("#journey-stage")).toContainText("not elapsed time or matching game situations");
  await page.goBack();
  await expect(page.locator("[data-focus-field]")).toBeVisible();
  await page.reload();
  await expect(steps(page).locator('[aria-current="step"]')).toContainText("Elliott");
});

test("direct story links stay in Miami and comparison progress is bounded and keyboard controlled", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { Object.assign(window, { invalidJourneyShare: value }); } } }));
  for (const query of ["step=unknown&story=2022_02_NYJ_CLE&moment=2", `step=story&story=${miami}&moment=99999`, "step=film&step=compare&progress=99"]) {
    await page.goto(`${journey}?${query}`);
    await expect(page.locator("#visual-story")).toHaveAttribute("data-story", miami);
    await expect(page.locator("#visual-story")).toHaveAttribute("data-selected-index", "0");
    await expect(steps(page).locator('[aria-current="step"]')).toContainText("Relive the comeback");
    await actions(page).getByRole("button", { name: "Save this journey", exact: true }).click();
    await expect.poll(() => saved(page)).toEqual({ version: 1, step: "story", moment: 1, progress: 0 });
    await actions(page).getByRole("button", { name: "Share this step", exact: true }).click();
    const shared = new URL(await page.evaluate(() => (window as unknown as { invalidJourneyShare: string }).invalidJourneyShare));
    expect(shared.pathname).toBe(journey);
    expect(Object.fromEntries(shared.searchParams)).toEqual({ step: "story", story: miami, moment: "1" });
    await remove(page).click();
    await expect.poll(() => saved(page)).toBeNull();
  }
  for (const [input, value] of [["-9", "0"], ["101", "100"], ["NaN", "0"], ["Infinity", "0"], ["45.6", "46"]]) {
    await page.goto(`${journey}?step=compare&progress=${input}`);
    await expect(page.getByRole("slider", { name: "Comeback sequence progress" })).toHaveValue(value);
  }
  const slider = page.getByRole("slider", { name: "Comeback sequence progress" });
  await slider.focus();
  await slider.press("Home");
  const before = await page.locator("#journey-stage figure").allTextContents();
  await slider.press("End");
  await expect(slider).toHaveValue("100");
  expect(new URL(page.url()).searchParams.get("progress")).toBe("100");
  await expect(page.locator('#journey-stage svg[aria-label*="at 100% of recorded play progress"]')).toHaveCount(2);
  expect(await page.locator("#journey-stage figure").allTextContents()).not.toEqual(before);
  await expect(slider).toBeFocused();
  await page.reload();
  await expect(slider).toHaveValue("100");
});

test("an explicitly saved place follows later selections and resumes from home", async ({ page }) => {
  await page.goto(`${journey}?step=story&story=${miami}&moment=2`);
  const slider = page.getByRole("slider", { name: "Story play sequence" });
  await expect(slider).toHaveValue("2");
  expect(await saved(page)).toBeNull();
  await actions(page).getByRole("button", { name: "Save this journey", exact: true }).click();
  await expect.poll(() => saved(page)).toEqual({ version: 1, step: "story", moment: 2, progress: 0 });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect.poll(() => saved(page)).toEqual({ version: 1, step: "story", moment: 3, progress: 0 });
  await page.goto("/");
  await resume(page).click();
  await expect(page.locator("#visual-story")).toHaveAttribute("data-selected-index", "2");
  await page.reload();
  await expect(page.getByRole("slider", { name: "Story play sequence" })).toHaveValue("3");
  await steps(page).getByRole("link", { name: /Compare with Cleveland/ }).click();
  const comparison = page.getByRole("slider", { name: "Comeback sequence progress" });
  await comparison.focus();
  await comparison.press("End");
  await expect.poll(() => saved(page)).toEqual({ version: 1, step: "compare", moment: 1, progress: 100 });
  await page.goto("/");
  await resume(page).click();
  await expect(comparison).toHaveValue("100");
  await remove(page).click();
  await expect.poll(() => saved(page)).toBeNull();
  await page.goto("/");
  await expect(resume(page)).toHaveCount(0);
});

test("invalid bookmarks stay hidden and valid changes synchronize between open tabs", async ({ page, context }) => {
  await page.goto("/");
  const editor = await context.newPage();
  await editor.goto(`${journey}?step=compare&progress=42`);
  await page.evaluate(() => {
    Object.assign(window, { journeyStorageEvents: 0 });
    addEventListener("storage", () => { (window as unknown as { journeyStorageEvents: number }).journeyStorageEvents++; });
  });
  const invalid = ["broken json", JSON.stringify({ version: 99, step: "story", moment: 1, progress: 0 }), JSON.stringify({ version: 1, step: "https://example.com", moment: 1, progress: 0 }), JSON.stringify({ version: 1, step: "story", moment: "2", progress: 0 })];
  for (const [index, value] of invalid.entries()) {
    await editor.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value });
    await expect.poll(() => page.evaluate(() => (window as unknown as { journeyStorageEvents: number }).journeyStorageEvents)).toBe(index + 1);
    await expect(resume(page)).toHaveCount(0);
  }
  // A second open journey must display remote saves without overwriting them
  // with its own older location or resurrecting a remotely removed bookmark.
  const stale = await context.newPage();
  await stale.goto(`${journey}?step=story&story=${miami}&moment=2`);
  await expect(actions(stale).getByRole("button", { name: "Save this journey", exact: true })).toBeVisible();
  await actions(editor).getByRole("button", { name: "Save this journey", exact: true }).click();
  await expect(resume(page)).toHaveAttribute("href", /step=compare&progress=42/);
  await expect(remove(stale)).toBeVisible();
  expect(await saved(stale)).toEqual({ version: 1, step: "compare", moment: 1, progress: 42 });
  const slider = editor.getByRole("slider", { name: "Comeback sequence progress" });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(resume(page)).toHaveAttribute("href", /step=compare&progress=43/);
  await remove(editor).click();
  await expect(resume(page)).toHaveCount(0);
  await expect(actions(stale).getByRole("button", { name: "Save this journey", exact: true })).toBeVisible();
  expect(await saved(stale)).toBeNull();
  await stale.close();
  await editor.close();
});

test("denied storage access leaves the journey readable and navigable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("Storage denied"); } }));
  await page.goto(`${journey}?step=film`);
  await actions(page).getByRole("button", { name: "Save this journey", exact: true }).click();
  await expect(actions(page).getByRole("status").filter({ hasText: /couldn|could not|unavailable|unable|failed/i })).toBeVisible();
  await steps(page).getByRole("link", { name: /Compare with Cleveland/ }).click();
  await expect(page.getByRole("slider", { name: "Comeback sequence progress" })).toBeVisible();
  await page.goto("/");
  await expect(resume(page)).toHaveCount(0);
  await expect(page.locator("#miracle")).toBeVisible();
  expect(errors).toEqual([]);
});

test("failed writes and removals do not report a saved or cleared journey", async ({ page }) => {
  await page.goto(`${journey}?step=compare&progress=25`);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Object.assign(window, { restoreJourneyStorage: () => Object.defineProperty(Storage.prototype, "setItem", { configurable: true, value: original }) });
    Object.defineProperty(Storage.prototype, "setItem", { configurable: true, value: function (name: string, value: string) {
      if (name === key) throw new Error("Quota exceeded");
      return original.call(this, name, value);
    } });
  }, storageKey);
  await actions(page).getByRole("button", { name: "Save this journey", exact: true }).click();
  await expect(actions(page).getByRole("status").filter({ hasText: /couldn|could not|unavailable|unable|failed/i })).toBeVisible();
  expect(await saved(page)).toBeNull();
  await expect(remove(page)).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { restoreJourneyStorage: () => void }).restoreJourneyStorage());
  await actions(page).getByRole("button", { name: "Save this journey", exact: true }).click();
  const expected = { version: 1, step: "compare", moment: 1, progress: 25 };
  await expect.poll(() => saved(page)).toEqual(expected);
  await page.evaluate((key) => {
    const original = Storage.prototype.removeItem;
    Object.defineProperty(Storage.prototype, "removeItem", { configurable: true, value: function (name: string) {
      if (name === key) throw new Error("Removal denied");
      return original.call(this, name);
    } });
  }, storageKey);
  await remove(page).click();
  await expect(actions(page).getByRole("status").filter({ hasText: /couldn|could not|unavailable|unable|failed/i })).toBeVisible();
  expect(await saved(page)).toEqual(expected);
  await expect(remove(page)).toBeVisible();
});

test("sharing uses only the selected journey state and provides a selectable fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const harness = { values: [] as string[], fail: false, delayed: false, resolve: () => {} };
    Object.assign(window, { journeyClipboard: harness });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (value: string) => {
      harness.values.push(value);
      if (harness.fail) return Promise.reject(new Error("Clipboard denied"));
      return harness.delayed ? new Promise<void>((resolve) => { harness.resolve = resolve; }) : Promise.resolve();
    } } });
  });
  await page.goto(`${journey}?step=compare&progress=37&private=omit&story=unexpected#journey-next`);
  expect(await page.evaluate(() => (window as unknown as { journeyClipboard: { values: string[] } }).journeyClipboard.values)).toEqual([]);
  await actions(page).getByRole("button", { name: "Share this step", exact: true }).click();
  const value = await page.evaluate(() => (window as unknown as { journeyClipboard: { values: string[] } }).journeyClipboard.values[0]);
  const url = new URL(value);
  expect(url.pathname).toBe(journey);
  expect(Object.fromEntries(url.searchParams)).toEqual({ step: "compare", progress: "37" });
  expect(url.hash).toBe("#journey-stage");
  await page.evaluate(() => { (window as unknown as { journeyClipboard: { fail: boolean } }).journeyClipboard.fail = true; });
  await actions(page).getByRole("button", { name: "Share this step", exact: true }).click();
  const fallback = actions(page).locator("input[readonly], textarea[readonly]");
  await expect(fallback).toHaveValue(value);
  await fallback.focus();
  await expect(fallback).toBeFocused();
  await page.evaluate(() => {
    const harness = (window as unknown as { journeyClipboard: { fail: boolean; delayed: boolean } }).journeyClipboard;
    harness.fail = false; harness.delayed = true;
  });
  await actions(page).getByRole("button", { name: "Share this step", exact: true }).click();
  await steps(page).getByRole("link", { name: /Explore Elliott’s catch/ }).click();
  await expect(page.locator("#journey-stage [data-focus-field]")).toBeVisible();
  await page.evaluate(() => (window as unknown as { journeyClipboard: { resolve: () => void } }).journeyClipboard.resolve());
  await expect(actions(page).getByRole("status").filter({ hasText: /copied/i })).toHaveCount(0);
  await expect(actions(page).locator("input[readonly], textarea[readonly]")).toHaveCount(0);
});

test("the introduction, step links, source accounts and onward paths work without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#miracle").getByRole("link", { name: /Follow the comeback/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Monday Night Miracle.");
  await expect(page.locator("#visual-story")).toContainText("A 23-point comeback.");
  await actions(page).getByRole("link", { name: /Next: explore Elliott’s catch/ }).click();
  await expect(page.locator("#journey-stage figcaption")).toContainText("Drawn to show the idea");
  await expect(actions(page).getByRole("link", { name: /Watch the official NFL highlight/ })).toHaveAttribute("href", /^https:\/\//);
  await actions(page).getByRole("link", { name: /Next: compare with Cleveland/ }).click();
  await expect(page.locator("#journey-stage figure")).toHaveCount(2);
  await expect(page.locator("#journey-stage")).toContainText("Final: Jets 31, Cleveland 30.");
  await expect(actions(page).getByRole("link", { name: /Jets account of the Cleveland comeback/ })).toHaveAttribute("href", /^https:\/\//);
  await steps(page).getByRole("link", { name: /Relive the comeback/ }).click();
  await expect(page.locator("#visual-story")).toHaveAttribute("data-story", miami);
  await context.close();
});

test("the saved home invitation stays usable at 320px with enlarged text", async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: { version: 1, step: "compare", moment: 1, progress: 52 } });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
  await expect(resume(page)).toHaveAttribute("href", /step=compare&progress=52/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const target of await page.locator("#miracle a:visible, #miracle button:visible").all()) {
    const rect = (await target.boundingBox())!;
    expect(rect.height, await target.textContent() ?? "").toBeGreaterThanOrEqual(44);
    expect(rect.width, await target.textContent() ?? "").toBeGreaterThanOrEqual(44);
  }
});

for (const view of [
  { step: "story", width: 1280, colorScheme: "light" as const, enlarged: false },
  { step: "film", width: 390, colorScheme: "dark" as const, enlarged: false },
  { step: "compare", width: 320, colorScheme: "dark" as const, enlarged: true },
]) {
  test(`${view.step} reflows and passes whole-page accessibility at ${view.width}px in ${view.colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: view.colorScheme });
    await page.goto(`${journey}?step=${view.step}`);
    if (view.enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("[data-focus-page]")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/stories");
    if (view.step === "story") await expect(page.getByRole("button", { name: "Play story", exact: true })).toBeDisabled();
    if (view.step === "film") {
      await page.getByRole("button", { name: "Play it", exact: true }).click();
      await expect(page.locator("[data-focus-field]")).toHaveAttribute("data-time", "6.0");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
    });
    expect(violations).toEqual([]);
  });
}
