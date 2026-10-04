import { openPlaybookTools } from "./film-disclosures";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { offensiveFormations, defensiveFormations, createPlay, validatePlayDesign } from "../src/lib/playbook";

const labFor = (page: Page) => page.locator("#playbook-lab");
const imageFixture = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: imageFixture }));
});

test("formation changes preserve twenty-two editable players and remain independent of historical film", async ({ page }) => {
  await page.goto("/film-room?play=hall-miami#playbook-lab");
  await openPlaybookTools(page);
  const lab = labFor(page);
  for (const formation of offensiveFormations) {
    await lab.getByLabel("Offensive formation", { exact: true }).selectOption(formation.id);
    await expect(lab.locator('[data-lab-player]')).toHaveCount(22);
    await expect(lab).toContainText(formation.description);
  }
  for (const formation of defensiveFormations) {
    await lab.getByLabel("Defensive front", { exact: true }).selectOption(formation.id);
    await expect(lab.locator('[data-lab-player]')).toHaveCount(22);
    await expect(lab).toContainText(formation.description);
  }
  await expect(page.locator("#film-room")).toHaveCount(0);
  const workspace = page.getByRole("navigation", { name: "Film Room workspaces" });
  await workspace.getByRole("button", { name: "Game record", exact: true }).click();
  await expect(page.locator("#film-room")).toBeVisible();
  await expect(page.locator("#film-room")).toHaveAttribute("data-film", "hall-miami");
  await workspace.getByRole("button", { name: "Chalkboard", exact: true }).click();
  await expect(lab).toBeVisible();
  await expect(lab.getByLabel("Offensive formation", { exact: true })).toHaveValue(offensiveFormations.at(-1)!.id);
  await expect(lab.getByLabel("Defensive front", { exact: true })).toHaveValue(defensiveFormations.at(-1)!.id);
  await expect(lab).toHaveAttribute("data-running", "false");
  await expect(lab).toHaveAttribute("data-time", "0.00");
});

test("a keyboard edit, route pattern and undo change the diagram rather than its source notebook", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  await openPlaybookTools(page);
  const lab = labFor(page);
  await lab.getByRole("button", { name: "Start a teaching play", exact: true }).click();
  const x = lab.getByLabel("Start X", { exact: true });
  const initialX = await x.inputValue();
  await x.fill("220");
  await lab.getByRole("button", { name: "Move to position", exact: true }).click();
  await expect(x).toHaveValue("220");
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await expect(x).toHaveValue(initialX);
  await lab.locator('[data-lab-player="x"]').focus();
  await lab.locator('[data-lab-player="x"]').press("ArrowRight");
  await expect(x).toHaveValue(String(Number(initialX) + 5));
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await lab.getByLabel("Route pattern", { exact: true }).selectOption("post");
  await lab.getByRole("button", { name: "Apply route pattern", exact: true }).click();
  const route = lab.locator('[data-lab-path="x"]');
  const customRoute = await route.getAttribute("points");
  await lab.getByLabel("Defensive front", { exact: true }).selectOption("three-four");
  await expect(route).toHaveAttribute("points", customRoute!);
  await expect(lab).toHaveAttribute("data-time", "0.00");
  await expect(page.locator("#film-room")).toHaveCount(0);
  const workspace = page.getByRole("navigation", { name: "Film Room workspaces" });
  await workspace.getByRole("button", { name: "Game record", exact: true }).click();
  await expect(page.locator("#film-room")).toBeVisible();
  await expect(page.locator("#film-room")).toHaveAttribute("data-film", "wilson-cleveland");
  await workspace.getByRole("button", { name: "Chalkboard", exact: true }).click();
  await expect(lab).toBeVisible();
  await expect(route).toHaveAttribute("points", customRoute!);
  await expect(lab.getByLabel("Defensive front", { exact: true })).toHaveValue("three-four");
  await expect(lab).toHaveAttribute("data-time", "0.00");
});

test("field drawing, dragging and defender assignments are real edits with usable undo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/film-room#playbook-lab");
  await openPlaybookTools(page);
  const lab = labFor(page);
  await lab.getByRole("button", { name: "Start a teaching play", exact: true }).click();
  await lab.getByRole("button", { name: "Clear assignment", exact: true }).click();
  await lab.getByRole("button", { name: "Draw assignment", exact: true }).click();
  const field = lab.locator("svg");
  const bounds = (await field.boundingBox())!;
  await field.click({ position: { x: bounds.width * .2, y: bounds.height * .3 } });
  await field.click({ position: { x: bounds.width * .4, y: bounds.height * .15 } });
  await expect(lab.locator('[data-route-point]')).toHaveCount(2);
  const route = lab.locator('[data-lab-path="x"]');
  const drawn = await route.getAttribute("points");
  await lab.getByRole("button", { name: "Move players", exact: true }).click();
  const player = lab.locator('[data-lab-player="x"]');
  await player.scrollIntoViewIfNeeded();
  const marker = (await player.boundingBox())!;
  const startX = await player.getAttribute("data-x");
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  await page.mouse.move(marker.x + marker.width / 2 + 40, marker.y + marker.height / 2 + 15, { steps: 5 });
  await page.mouse.up();
  await expect(player).not.toHaveAttribute("data-x", startX!);
  await expect(lab.locator('[data-route-point]')).toHaveCount(2);
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await expect(player).toHaveAttribute("data-x", startX!);
  await expect(route).toHaveAttribute("points", drawn!);
  await lab.getByLabel("Selected player", { exact: true }).selectOption("d1");
  await lab.getByRole("button", { name: "Rush the quarterback", exact: true }).click();
  await expect(lab.locator('[data-route-point]')).toHaveCount(2);
  await expect(lab.locator('[data-lab-status]')).toContainText("rush path");
  await lab.getByLabel("Selected player", { exact: true }).selectOption("d5");
  await lab.getByLabel("Receiver to follow", { exact: true }).selectOption("x");
  await lab.getByRole("button", { name: "Draw follow assignment", exact: true }).click();
  await expect(lab.locator('[data-route-point]')).toHaveCount(2);
  await expect(lab.locator('[data-lab-status]')).toContainText("follows X WR");
});

test("shared UTF-8 diagrams round-trip without sending the payload to the server or losing edits to section anchors", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard unavailable"); } } }));
  await page.goto("/film-room?play=hall-miami&keep=notebook#playbook-lab");
  await openPlaybookTools(page);
  const lab = labFor(page);
  await lab.getByLabel("Offensive formation", { exact: true }).selectOption("bunch");
  const name = "Jets 🏈 — Third-down design";
  await lab.getByLabel("Design name", { exact: true }).fill(name);
  await lab.getByLabel("Design name", { exact: true }).press("Tab");
  await lab.getByRole("button", { name: "Copy diagram link", exact: true }).click();
  const shared = await lab.getByLabel("Diagram link", { exact: true }).inputValue();
  const url = new URL(shared);
  expect(url.searchParams.get("diagram")).toBeNull();
  expect(url.searchParams.get("keep")).toBe("notebook");
  expect(url.hash).toMatch(/^#playbook-lab:/);
  await expect(lab.locator('[data-lab-status]')).toContainText("did not grant clipboard access");
  await page.goto(shared);
  await openPlaybookTools(page);
  await expect(lab.getByLabel("Design name", { exact: true })).toHaveValue(name);
  await expect(lab.getByLabel("Offensive formation", { exact: true })).toHaveValue("bunch");
  await expect(lab).toHaveAttribute("data-time", "0.00");
  await lab.getByLabel("Start X", { exact: true }).fill("230");
  await lab.getByRole("button", { name: "Move to position", exact: true }).click();
  await page.getByRole("navigation", { name: "Film Room workspaces" }).getByRole("button", { name: "Game record", exact: true }).click();
  await page.locator("#film-room summary").filter({ hasText: "Choose a game study" }).click();
  await page.locator('[data-film-case="sanchez-thanksgiving"]').click();
  await page.getByRole("navigation", { name: "Film Room workspaces" }).getByRole("button", { name: "Chalkboard", exact: true }).click();
  await expect(lab.getByLabel("Start X", { exact: true })).toHaveValue("230");
  await expect(lab.getByLabel("Design name", { exact: true })).toHaveValue(name);
  await expect(page.locator("#film-room")).toHaveAttribute("data-film", "sanchez-thanksgiving");
});

test("malformed sharing and unavailable storage leave a usable design with an honest status", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("Storage denied"); } }));
  await page.goto("/film-room#playbook-lab:not-valid-json");
  await openPlaybookTools(page);
  const lab = labFor(page);
  await expect(lab.locator('[data-lab-status]')).toContainText("invalid or too large");
  await expect(lab.locator('[data-lab-player]')).toHaveCount(22);
  await lab.getByRole("button", { name: "Save in browser", exact: true }).click();
  await expect(lab.locator('[data-lab-status]')).toContainText("could not save");
  await lab.getByRole("button", { name: "Load saved design", exact: true }).click();
  await expect(lab.locator('[data-lab-status]')).toContainText("could not be read");
  await expect(lab.locator('[data-lab-player]')).toHaveCount(22);
});

test("explicit playback moves the diagram, pauses, scrubs and returns to the snap with reduced motion", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  await openPlaybookTools(page);
  const lab = labFor(page);
  await expect(lab).toHaveAttribute("data-running", "false");
  await expect(lab).toHaveAttribute("data-time", "0.00");
  const before = await lab.locator('[data-lab-player]').evaluateAll((players) => players.map((player) => player.getAttribute("transform")));
  await lab.getByRole("button", { name: "Run play", exact: true }).click();
  await expect(lab).toHaveAttribute("data-running", "true");
  await expect.poll(async () => Number(await lab.getAttribute("data-time"))).toBeGreaterThan(.2);
  await lab.getByRole("button", { name: "Pause play", exact: true }).click();
  const paused = Number(await lab.getAttribute("data-time"));
  await expect(lab).toHaveAttribute("data-running", "false");
  expect(await lab.locator('[data-lab-player]').evaluateAll((players) => players.map((player) => player.getAttribute("transform")))).not.toEqual(before);
  await page.waitForTimeout(150);
  expect(Number(await lab.getAttribute("data-time"))).toBe(paused);
  const timeline = lab.getByLabel("Play timeline", { exact: true });
  await timeline.focus();
  await timeline.press("End");
  await expect(lab).toHaveAttribute("data-time", "6.00");
  await expect(lab).toHaveAttribute("data-running", "false");
  await lab.getByRole("button", { name: "Back to snap", exact: true }).click();
  await expect(lab).toHaveAttribute("data-time", "0.00");
  expect(await lab.locator('[data-lab-player]').evaluateAll((players) => players.map((player) => player.getAttribute("transform")))).toEqual(before);
});

test("saved plays survive reload and explicit load restores an edited formation", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  await openPlaybookTools(page);
  const lab = labFor(page);
  const formation = offensiveFormations[4];
  await lab.getByLabel("Offensive formation", { exact: true }).selectOption(formation.id);
  await lab.getByRole("button", { name: "Save in browser", exact: true }).click();
  await page.reload();
  await openPlaybookTools(page);
  await lab.getByRole("button", { name: "Load saved design", exact: true }).click();
  await expect(lab.getByLabel("Offensive formation", { exact: true })).toHaveValue(formation.id);
  await expect(lab.locator('[data-lab-player]')).toHaveCount(22);
});

test("play export and import round-trip a diagram and reject corrupt player data without replacing it", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  await openPlaybookTools(page);
  const lab = labFor(page);
  await lab.getByRole("button", { name: "Start a teaching play", exact: true }).click();
  await lab.getByLabel("Offensive formation", { exact: true }).selectOption(offensiveFormations[2].id);
  const downloadPromise = page.waitForEvent("download");
  await lab.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  const json = await readFile((await download.path())!, "utf8");
  expect(validatePlayDesign(JSON.parse(json))).not.toBeNull();
  await lab.getByLabel("Offensive formation", { exact: true }).selectOption(offensiveFormations[0].id);
  await lab.getByText("Import a playbook design", { exact: true }).click();
  await lab.getByLabel("Playbook JSON", { exact: true }).fill(json);
  await lab.getByRole("button", { name: "Import JSON", exact: true }).click();
  await expect(lab.getByLabel("Offensive formation", { exact: true })).toHaveValue(offensiveFormations[2].id);
  const corrupt = { ...createPlay(), players: [] };
  await lab.getByLabel("Playbook JSON", { exact: true }).fill(JSON.stringify(corrupt));
  await lab.getByRole("button", { name: "Import JSON", exact: true }).click();
  await expect(lab.locator("[data-lab-status]")).toContainText("Import rejected");
  await expect(lab.getByLabel("Offensive formation", { exact: true })).toHaveValue(offensiveFormations[2].id);
  await expect(lab.locator('[data-lab-player]')).toHaveCount(22);
  const portable = JSON.parse(json);
  portable.players = portable.players.map((player: { id: string }) => ({ ...player, id: `p-${player.id}` }));
  portable.ball.carrierId = `p-${portable.ball.carrierId}`;
  portable.ball.targetId = `p-${portable.ball.targetId}`;
  await lab.getByLabel("Import JSON file", { exact: true }).setInputFiles({ name: "portable.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(portable)) });
  await expect(lab.locator('[data-lab-status]')).toContainText("JSON file imported");
  await lab.getByLabel("Selected player", { exact: true }).selectOption("p-d1");
  await expect(lab.getByLabel("Receiver to follow", { exact: true })).toHaveValue("p-x");
  await lab.getByRole("button", { name: "Draw follow assignment", exact: true }).click();
  await expect(lab.locator('[data-lab-status]')).toContainText("follows X WR");
});

for (const view of [{ width: 1280, enlarged: false }, { width: 390, enlarged: false }, { width: 320, enlarged: false }, { width: 320, enlarged: true }]) {
  test(`playbook controls reflow and remain accessible at ${view.width}px${view.enlarged ? " with doubled text" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: 1000 });
    await page.goto("/film-room#playbook-lab");
    await openPlaybookTools(page);
    if (view.enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    const lab = labFor(page);
    const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, outside: Array.from(document.querySelectorAll("main *")).filter((element) => element.getBoundingClientRect().right > innerWidth + 1).map((element) => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}px`).slice(0, 10) }));
    expect(geometry.width, geometry.outside.join(", ")).toBeLessThanOrEqual(geometry.viewport);
    // Closed native disclosures can expose zero-size layout boxes in Chrome.
    // Touch targets apply to rendered controls; the open assignment ledger is
    // exercised separately in jets-snap-interactions.spec.ts.
    for (const button of await lab.locator("button:visible").all()) {
      const bounds = await button.boundingBox();
      if (bounds) expect(bounds.height, await button.textContent() ?? "button").toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run(document.getElementById("playbook-lab"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
  });
}
