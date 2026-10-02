import { test, expect, type Locator } from "@playwright/test";
import path from "node:path";
import { getJetsPlayDesign, jetsPlays } from "../src/lib/jets-playbook";
import { getJetsStudy } from "../src/lib/jets-snap-study";
import { samplePlayer, validatePlayDesign } from "../src/lib/playbook";

const positions = (lab: Locator) => lab.locator("[data-lab-player]").evaluateAll((players) => Object.fromEntries(players.map((player) => [player.getAttribute("data-lab-player")!, {
  x: Number(player.getAttribute("data-x")), y: Number(player.getAttribute("data-y")),
}])));
const endPlay = async (lab: Locator) => {
  await lab.getByLabel("Play timeline", { exact: true }).focus();
  await lab.getByLabel("Play timeline", { exact: true }).press("End");
  await expect(lab).toHaveAttribute("data-time", "6.00");
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("the full-snap board starts paused and moves all 22 positions with visible illustrative provenance", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  const lab = page.locator("#playbook-lab");
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
  await expect(lab).toHaveAttribute("data-archive", "wilson-cleveland");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await expect(lab).toHaveAttribute("data-study-original", "true");
  await expect(lab).toHaveAttribute("data-running", "false");
  await expect(lab.getByRole("group", { name: "Jets diagram mode", exact: true }).getByRole("button", { name: "Full-snap study", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(lab.locator("[data-lab-player]")).toHaveCount(22);
  await expect(lab.locator("[data-selected-assignment]")).toBeVisible();
  await expect(lab).toContainText(/illustrative/i);
  const before = await positions(lab);
  await endPlay(lab);
  const after = await positions(lab);
  for (const id of Object.keys(before)) expect(after[id], id).not.toEqual(before[id]);
  await expect(lab).toHaveAttribute("data-running", "false");
  await lab.getByRole("button", { name: "Back to snap", exact: true }).click();
  expect(await positions(lab)).toEqual(before);
});

test("every archived play loads full-snap assignments while the source-only mode retains the sparse recorded action", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  const lab = page.locator("#playbook-lab");
  for (const play of jetsPlays) {
    await lab.locator(`[data-jets-play="${play.id}"]`).click();
    await expect(lab).toHaveAttribute("data-archive", play.id);
    await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
    await expect(lab).toHaveAttribute("data-study-original", "true");
    await expect(lab.locator("[data-lab-player]")).toHaveCount(22);
    await lab.getByText("All 22 assignments", { exact: true }).click();
    await expect(lab.locator("[data-study-assignment]")).toHaveCount(22);
    await lab.getByText("All 22 assignments", { exact: true }).click();
  }
  await lab.getByRole("button", { name: "Source-supported action", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-mode", "source-action");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await expect(lab).toHaveAttribute("data-time", "0.00");
  const source = getJetsPlayDesign("fake-spike")!;
  await endPlay(lab);
  const observed = await positions(lab);
  for (const player of source.players) {
    const expected = samplePlayer(player, 6);
    expect(observed[player.id].x).toBeCloseTo(expected.x, 2);
    expect(observed[player.id].y).toBeCloseTo(expected.y, 2);
  }
  await lab.getByRole("button", { name: "Full-snap study", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
  await expect(lab).toHaveAttribute("data-study-original", "true");
  await expect(lab).toHaveAttribute("data-time", "0.00");
  await expect(lab).toHaveAttribute("data-running", "false");
});

test("the assignment desk explains protection and coverage for the selected player and supports keyboard selection", async ({ page }) => {
  await page.goto("/film-room#jets-play:wilson-cleveland");
  const lab = page.locator("#playbook-lab");
  const study = getJetsStudy("wilson-cleveland")!;
  await lab.getByText("All 22 assignments", { exact: true }).click();
  for (const id of ["lt", "c", "d1", "d8", "rb"]) {
    await lab.locator(`[data-study-assignment="${id}"]`).click();
    await expect(lab).toHaveAttribute("data-selected", id);
    const panel = lab.locator(`[data-selected-assignment="${id}"]`);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-assignment-custom", "false");
    const assignment = study.assignments.find((note) => note.playerId === id)!;
    await expect(panel).toContainText(assignment.action);
    await expect(panel).toContainText(assignment.detail);
    await expect(panel).toContainText(/illustrative/i);
  }
  await lab.getByLabel("Selected player", { exact: true }).selectOption("rt");
  await expect(lab.locator('[data-selected-assignment="rt"]')).toContainText(study.assignments.find((note) => note.playerId === "rt")!.detail);
  const marker = lab.locator('[data-lab-player="rt"]');
  await marker.focus();
  await marker.press("ArrowRight");
  await expect(lab).toHaveAttribute("data-study-original", "false");
  await expect(lab.locator('[data-selected-assignment="rt"]')).toHaveAttribute("data-assignment-custom", "true");
});

test("route edits become custom assignments, and undo or restoration recovers the complete study", async ({ page }) => {
  await page.goto("/film-room#jets-play:wilson-cleveland");
  const lab = page.locator("#playbook-lab");
  await lab.getByLabel("Selected player", { exact: true }).selectOption("lt");
  await lab.getByRole("button", { name: "Clear assignment", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-original", "false");
  await expect(lab).toHaveAttribute("data-archive-original", "false");
  await expect(lab.locator('[data-selected-assignment="lt"]')).toHaveAttribute("data-assignment-custom", "true");
  await expect(lab.locator("[data-jets-moment]")).toHaveCount(0);
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await expect(lab).toHaveAttribute("data-study-original", "true");
  await expect(lab.locator('[data-selected-assignment="lt"]')).toHaveAttribute("data-assignment-custom", "false");
  await expect(lab.locator("[data-jets-moment]")).toHaveCount(4);
  await lab.getByLabel("Start X", { exact: true }).fill("440");
  await lab.getByRole("button", { name: "Move to position", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-original", "false");
  await lab.getByRole("button", { name: /Restore .*diagram/ }).click();
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
  await expect(lab).toHaveAttribute("data-study-original", "true");
  await expect(lab).toHaveAttribute("data-time", "0.00");
  await endPlay(lab);
  const observed = await positions(lab);
  for (const player of getJetsStudy("wilson-cleveland")!.design.players) {
    const expected = samplePlayer(player, 6);
    expect(observed[player.id].x).toBeCloseTo(expected.x, 2);
    expect(observed[player.id].y).toBeCloseTo(expected.y, 2);
  }
  await lab.getByRole("button", { name: "Source-supported action", exact: true }).click();
  await lab.getByLabel("Selected player", { exact: true }).selectOption("h");
  await expect(lab.locator('[data-selected-assignment="h"]')).toHaveAttribute("data-assignment-custom", "false");
  await lab.getByRole("button", { name: "Clear assignment", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-mode", "source-action");
  await expect(lab).toHaveAttribute("data-archive-original", "false");
  await expect(lab.locator('[data-selected-assignment="h"]')).toHaveAttribute("data-assignment-custom", "true");
  await expect(lab.locator('[data-selected-assignment="h"]')).toContainText("Your edits replace the movement");
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await expect(lab.locator('[data-selected-assignment="h"]')).toHaveAttribute("data-assignment-custom", "false");
});

test("direct anchors preserve the fake-spike perspective and fumble defensive possession with a moving supporting cast", async ({ page }) => {
  await page.goto("/film-room?play=hall-miami#jets-play:fake-spike");
  const lab = page.locator("#playbook-lab");
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
  await expect(lab).toHaveAttribute("data-archive", "fake-spike");
  await expect(lab).toContainText("Jets defense");
  await expect(lab).toContainText("Miami Dolphins offense");
  await expect(page.locator("#film-room")).toHaveAttribute("data-film", "hall-miami");
  await page.goto("/film-room#jets-play:sanchez-thanksgiving");
  await expect(lab).toHaveAttribute("data-archive", "sanchez-thanksgiving");
  const before = await positions(lab);
  await lab.locator('[data-jets-moment="3"]').click();
  const ball = lab.locator("[data-lab-ball]");
  const gregory = lab.locator('[data-lab-player="d11"]');
  await expect(ball).toHaveAttribute("data-x", (await gregory.getAttribute("data-x"))!);
  await expect(ball).toHaveAttribute("data-y", (await gregory.getAttribute("data-y"))!);
  const recoveryY = Number(await ball.getAttribute("data-y"));
  await endPlay(lab);
  await expect(ball).toHaveAttribute("data-x", (await gregory.getAttribute("data-x"))!);
  await expect(ball).toHaveAttribute("data-y", (await gregory.getAttribute("data-y"))!);
  expect(Number(await ball.getAttribute("data-y"))).toBeGreaterThan(recoveryY);
  const after = await positions(lab);
  for (const id of ["lt", "rg", "rt", "d1", "d8", "rb"]) expect(after[id], id).not.toEqual(before[id]);
});

test("sharing, saving and JSON import retain all 22 paths, the study mode and the turnover sequence", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard unavailable"); } } }));
  await page.goto("/film-room#jets-play:sanchez-thanksgiving");
  const lab = page.locator("#playbook-lab");
  await lab.getByRole("button", { name: "Copy diagram link", exact: true }).click();
  const url = await lab.getByLabel("Diagram link", { exact: true }).inputValue();
  const fragment = new URL(url).hash.slice("#playbook-lab:".length);
  const json = Buffer.from(fragment, "base64url").toString("utf8");
  const shared = validatePlayDesign(JSON.parse(json))!;
  expect(shared).toEqual(getJetsStudy("sanchez-thanksgiving")!.design);
  expect(shared.studyMode).toBe("full-snap");
  expect(shared.players.every((player) => player.path.length > 0)).toBe(true);
  await page.goto(url);
  await expect(lab).toHaveAttribute("data-study-original", "true");
  await lab.getByRole("button", { name: "Save in browser", exact: true }).click();
  await page.reload();
  await lab.getByRole("button", { name: "Start a teaching play", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-mode", "teaching");
  await lab.getByRole("button", { name: "Load saved design", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
  await expect(lab).toHaveAttribute("data-archive", "sanchez-thanksgiving");
  await expect(lab).toHaveAttribute("data-study-original", "true");
  await lab.getByRole("button", { name: "Start a teaching play", exact: true }).click();
  await lab.getByText("Import a playbook design", { exact: true }).click();
  await lab.getByLabel("Playbook JSON", { exact: true }).fill(json);
  await lab.getByRole("button", { name: "Import JSON", exact: true }).click();
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
  await expect(lab).toHaveAttribute("data-study-original", "true");
  await endPlay(lab);
  const observed = await positions(lab);
  for (const player of shared.players) {
    const expected = samplePlayer(player, 6);
    expect(observed[player.id].x).toBeCloseTo(expected.x, 2);
    expect(observed[player.id].y).toBeCloseTo(expected.y, 2);
  }
});

test("all-position assignment controls reflow at 320 pixels and remain available by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/film-room#jets-play:wilson-cleveland");
  const lab = page.locator("#playbook-lab");
  await lab.getByText("All 22 assignments", { exact: true }).click();
  const lineman = lab.locator('[data-study-assignment="lt"]');
  await lineman.focus();
  await lineman.press("Enter");
  await expect(lab).toHaveAttribute("data-selected", "lt");
  await expect(lab.locator('[data-selected-assignment="lt"]')).toBeVisible();
  const pageWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.viewport + 1);
  const buttonWidths = await lab.locator("[data-study-assignment]").evaluateAll((buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  for (const button of buttonWidths) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  await lab.getByText("Questions to take back to the film", { exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run(document.getElementById("jets-play-stage"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});
