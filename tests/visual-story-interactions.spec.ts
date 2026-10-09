import { test, expect } from "@playwright/test";
import path from "node:path";

const cleveland = "2022_02_NYJ_CLE";
const miami = "2000_08_MIA_NYJ";

test("one recorded selection updates the clock, probability, action and marker and survives back/reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/stories?keep=context#visual-story");
  const story = page.locator("#visual-story");
  await story.getByRole("button", { name: /Possession regained/ }).click();
  await expect(story).toHaveAttribute("data-story", cleveland);
  await expect(story).toHaveAttribute("data-selected-index", "5");
  await expect(story.locator("[data-story-clock]")).toContainText("1:22");
  await expect(story.locator("[data-story-probability]")).toContainText("1.8%");
  await expect(story.locator("[data-story-delta]")).toContainText("17.6");
  await expect(story).toContainText("Justin Hardee recovers Braden Mann’s onside kick.");
  await expect(story.locator("[data-story-marker]")).toHaveAttribute("data-selected-index", "5");
  await expect(story.locator("[data-story-marker]")).toHaveAttribute("data-wp", "0.018");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("context");
  expect(new URL(page.url()).searchParams.get("moment")).toBe("6");
  await story.getByRole("button", { name: /66 yards/ }).click();
  await expect(story).toHaveAttribute("data-selected-index", "3");
  await page.goBack();
  await expect(story).toHaveAttribute("data-selected-index", "5");
  await page.reload();
  await expect(story).toHaveAttribute("data-selected-index", "5");
});

test("keyboard scrubbing preserves the last pre-play estimate and the independent confirmed final", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/stories?story=${cleveland}&moment=1#visual-story`);
  const story = page.locator("#visual-story");
  const slider = story.getByRole("slider", { name: "Story play sequence" });
  await slider.focus();
  await slider.press("End");
  await expect(story).toHaveAttribute("data-selected-index", "20");
  await expect(story.locator("[data-story-probability]")).toContainText("89.4%");
  await expect(story.locator("[data-story-marker]")).toHaveAttribute("data-wp", "0.894");
  await expect(story.getByLabel("Confirmed final: Jets 31, CLE 30", { exact: true })).toBeVisible();
  await story.getByText("Source play and methods", { exact: true }).click();
  await expect(story).toContainText("kneels");
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await expect(story).toHaveAttribute("data-selected-index", "1");
  await expect(story.locator("[data-story-probability]")).toContainText("0.7%");
});

test("overtime uses a period label and the original field-goal estimate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/stories?story=${miami}#visual-story`);
  const story = page.locator("#visual-story");
  await story.getByRole("button", { name: /The winning kick/ }).click();
  await expect(story).toHaveAttribute("data-story", miami);
  await expect(story.locator("[data-story-clock]")).toHaveText("OT");
  await expect(story.locator("[data-story-probability]")).toContainText("78.6%");
  await expect(story).toContainText("John Hall’s 40-yard field goal wins the game in overtime.");
  await expect(story.getByRole("link", { name: /Complete game evidence/i })).toHaveAttribute("href", `/games/${miami}`);
});

test("chapter playback requires a click and stops when the story leaves view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/stories?story=${cleveland}&moment=1#visual-story`);
  const story = page.locator("#visual-story");
  await expect(story.getByRole("button", { name: "Play story", exact: true })).toBeVisible();
  await expect(story).toHaveAttribute("data-selected-index", "0");
  await story.getByRole("button", { name: "Play story", exact: true }).click();
  await expect(story.getByRole("button", { name: "Pause story", exact: true })).toBeVisible();
  await expect(story).toHaveAttribute("data-selected-index", "3", { timeout: 7000 });
  await page.locator("#more").scrollIntoViewIfNeeded();
  await expect(story).not.toBeInViewport();
  await expect(story.getByRole("button", { name: "Play story", exact: true })).toBeAttached();
  const stopped = await story.getAttribute("data-selected-index");
  await story.scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute("data-selected-index", stopped!);
});

test("shared links identify the chosen moment and delayed clipboard feedback cannot follow a changed selection", async ({ page }) => {
  await page.addInitScript(() => {
    const harness = { value: "", delayed: true, resolve: () => {} };
    Object.assign(window, { storyClipboard: harness });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: (value: string) => {
        harness.value = value;
        return harness.delayed ? new Promise<void>((resolve) => { harness.resolve = resolve; }) : Promise.resolve();
      },
    } });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/stories?keep=context&story=${cleveland}&moment=1#visual-story`);
  const story = page.locator("#visual-story");
  await story.getByRole("button", { name: /Copy this moment/ }).click();
  await story.getByRole("button", { name: /Possession regained/ }).click();
  await page.evaluate(() => (window as unknown as { storyClipboard: { resolve: () => void } }).storyClipboard.resolve());
  await expect(story.getByRole("status")).toBeEmpty();
  await page.evaluate(() => { (window as unknown as { storyClipboard: { delayed: boolean } }).storyClipboard.delayed = false; });
  await story.getByRole("button", { name: /Copy this moment/ }).click();
  await expect(story.getByRole("status")).toContainText("Moment link copied.");
  const value = await page.evaluate(() => (window as unknown as { storyClipboard: { value: string } }).storyClipboard.value);
  const shared = new URL(value);
  expect(shared.pathname).toBe("/stories");
  expect(shared.searchParams.get("story")).toBe(cleveland);
  expect(shared.searchParams.get("moment")).toBe("6");
  expect(shared.searchParams.get("keep")).toBe("context");
  expect(shared.hash).toBe("#visual-story");
});

for (const view of [{ width: 1280, enlarged: false }, { width: 320, enlarged: false }, { width: 320, enlarged: true }]) {
  test(`visual story reflows and remains accessible at ${view.width}px${view.enlarged ? " with 200% text" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/stories?story=${cleveland}#visual-story`);
    if (view.enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    const story = page.locator("#visual-story");
    await story.getByRole("button", { name: /Possession regained/ }).click();
    await expect(story).toHaveAttribute("data-selected-index", "5");
    await expect(story.getByRole("button", { name: "Play story", exact: true })).toBeDisabled();
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth,
      outside: Array.from(document.querySelectorAll("#visual-story *")).filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .map((element) => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}px`).slice(0, 8),
    }));
    expect(geometry.width, geometry.outside.join(", ")).toBeLessThanOrEqual(geometry.viewport);
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run(document.getElementById("visual-story"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
  });
}
