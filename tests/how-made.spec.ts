import { test, expect } from "@playwright/test";
import path from "node:path";

test("the case study explains the archive and lets a keyboard reader compare paper", async ({ page }) => {
  await page.goto("/game-day");
  const sections = page.getByRole("navigation", { name: "Site sections" });
  await page.locator("footer").getByRole("link", { name: "How it is made", exact: true }).click();
  await expect(sections.getByRole("link", { name: "Home", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/How the\s*paper is made/);
  const control = page.getByRole("slider", { name: "Paper condition" });
  await control.focus();
  await page.keyboard.press("End");
  await expect(control).toHaveValue("4");
  await expect(page.getByRole("status")).toContainText("Seven straight or more");
  await page.keyboard.press("Home");
  await expect(page.getByRole("status")).toContainText("Fresh stock");
  await expect(page.getByText("2002_04_NYJ_JAX", { exact: true })).toBeVisible();
});

for (const width of [1280, 390, 320]) {
  test(`case study is readable and passes automated accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/how-made");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });
}
