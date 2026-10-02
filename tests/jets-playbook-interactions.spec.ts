import { test, expect } from "@playwright/test";
import { jetsPlays } from "../src/lib/jets-playbook";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("the board opens on a sourced Jets touchdown without auto-playing or calling its template verified", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  const lab = page.locator("#playbook-lab");
  await expect(lab).toHaveAttribute("data-archive", "wilson-cleveland");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await expect(lab).toHaveAttribute("data-running", "false");
  await expect(lab).toHaveAttribute("data-selected", "h");
  await expect(lab.locator('[data-lab-player="h"]')).toHaveAccessibleName(/G\. Wilson/);
  await expect(lab).toContainText("not verified historical formations");
  await expect(lab).toHaveAttribute("data-study-mode", "full-snap");
  await expect(lab.locator("[data-study-limit]")).toContainText("Supporting assignments are illustrative");
  await expect(lab.getByRole("group", { name: "Step through Jets play" })).toBeVisible();
  await lab.getByText("What the sources establish", { exact: true }).click();
  await expect(lab).toContainText("15-yard touchdown");
  await expect(lab).toContainText("not measured player tracking");
});

test("all six Jets moments load their named actors and remain editable twenty-two-player diagrams", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  const lab = page.locator("#playbook-lab");
  for (const play of jetsPlays) {
    await lab.locator(`[data-jets-play="${play.id}"]`).click();
    await expect(lab).toHaveAttribute("data-archive", play.id);
    await expect(lab).toHaveAttribute("data-archive-original", "true");
    await expect(lab).toHaveAttribute("data-time", "0.00");
    await expect(lab).toHaveAttribute("data-selected", play.focusPlayerIds[0]);
    await expect(lab.locator("[data-lab-player]")).toHaveCount(22);
    await expect(lab.locator("#jets-play-heading")).toHaveText(play.title);
    for (const id of play.focusPlayerIds) {
      await expect(lab.locator(`[data-lab-player="${id}"]`)).toHaveAccessibleName(new RegExp(play.design.players.find((actor) => actor.id === id)!.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    await expect(lab.locator("[data-jets-moment]")).toHaveCount(4);
  }
  await lab.getByRole("button", { name: "Start a teaching play", exact: true }).click();
  await expect(lab).toHaveAttribute("data-archive", "");
  await expect(lab.locator("[data-lab-player]")).toHaveCount(22);
  await expect(lab.getByRole("group", { name: "Step through Jets play" })).toHaveCount(0);
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await expect(lab).toHaveAttribute("data-archive", "fake-spike");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
});

test("the agony filter and fumble moments depict defensive possession and a return instead of a pass", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  const lab = page.locator("#playbook-lab");
  await lab.getByRole("button", { name: "The agony", exact: true }).click();
  await expect(lab.locator("[data-jets-play]")).toHaveCount(2);
  await lab.locator('[data-jets-play="sanchez-thanksgiving"]').click();
  await expect(lab.getByLabel("Ball carrier", { exact: true })).toBeDisabled();
  await lab.locator('[data-jets-moment="3"]').click();
  await expect(lab).toHaveAttribute("data-time", "3.00");
  await expect(lab.locator("[data-jets-moment-detail]")).toContainText("Possession changes to New England");
  const ball = lab.locator("[data-lab-ball]");
  const gregory = lab.locator('[data-lab-player="d11"]');
  await expect(ball).toHaveAttribute("data-x", (await gregory.getAttribute("data-x"))!);
  await expect(ball).toHaveAttribute("data-y", (await gregory.getAttribute("data-y"))!);
  const recoveryY = Number(await ball.getAttribute("data-y"));
  await lab.locator('[data-jets-moment="6"]').click();
  await expect(ball).toHaveAttribute("data-y", (await gregory.getAttribute("data-y"))!);
  expect(Number(await ball.getAttribute("data-y"))).toBeGreaterThan(recoveryY);
  await lab.getByRole("button", { name: "Use a custom pass or handoff", exact: true }).click();
  await expect(lab.getByLabel("Ball carrier", { exact: true })).toBeEnabled();
  await expect(lab).toHaveAttribute("data-archive-original", "false");
  await expect(lab).toHaveAttribute("data-time", "0.00");
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await expect(lab.getByLabel("Ball carrier", { exact: true })).toBeDisabled();
});

test("a direct fake-spike anchor uses Miami offense and retains the separate film notebook", async ({ page }) => {
  await page.goto("/film-room?play=hall-miami#jets-play:fake-spike");
  const lab = page.locator("#playbook-lab");
  await expect(lab).toHaveAttribute("data-archive", "fake-spike");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await expect(lab).toContainText("Jets on defense");
  await expect(lab).toContainText("Miami Dolphins offense");
  await expect(lab).toContainText("Jets defense");
  await expect(page.locator("#film-room")).toHaveAttribute("data-film", "hall-miami");
  await lab.locator('[data-jets-moment="2.6"]').click();
  const ingram = lab.locator('[data-lab-player="z"]');
  await expect(lab.locator("[data-lab-ball]")).toHaveAttribute("data-x", (await ingram.getAttribute("data-x"))!);
  await expect(lab.locator("[data-lab-ball]")).toHaveAttribute("data-y", (await ingram.getAttribute("data-y"))!);
});

test("editing an archive route and its motion window marks a study copy, while undo and restore recover the source", async ({ page }) => {
  await page.goto("/film-room#jets-play:walker-miami");
  const lab = page.locator("#playbook-lab");
  await lab.getByLabel("Route pattern", { exact: true }).selectOption("post");
  await lab.getByRole("button", { name: "Apply route pattern", exact: true }).click();
  await expect(lab).toHaveAttribute("data-archive-original", "false");
  await expect(lab).toContainText("Edited study copy / source play below");
  await expect(lab.getByRole("group", { name: "Step through Jets play" })).toHaveCount(0);
  await lab.getByRole("button", { name: /^Undo edit/ }).click();
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await lab.getByText("Movement timing", { exact: true }).click();
  await lab.getByLabel("Movement starts", { exact: true }).fill("4");
  await lab.getByLabel("Movement ends", { exact: true }).fill("3");
  await lab.getByRole("button", { name: "Apply movement timing", exact: true }).click();
  await expect(lab.locator("[data-lab-status]")).toContainText("must start before it ends");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await lab.getByLabel("Movement ends", { exact: true }).fill("6");
  await lab.getByRole("button", { name: "Apply movement timing", exact: true }).click();
  await expect(lab).toHaveAttribute("data-archive-original", "false");
  const start = await lab.locator('[data-lab-player="z"]').getAttribute("transform");
  await lab.getByLabel("Play timeline", { exact: true }).focus();
  await lab.getByLabel("Play timeline", { exact: true }).press("ArrowRight");
  await expect(lab.locator('[data-lab-player="z"]')).toHaveAttribute("transform", start!);
  await lab.getByRole("button", { name: "Restore source diagram", exact: true }).click();
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await expect(lab).toHaveAttribute("data-time", "0.00");
});

test("a shared turnover keeps its source association, events and recovery after reload", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard unavailable"); } } }));
  await page.goto("/film-room#jets-play:sanchez-thanksgiving");
  const lab = page.locator("#playbook-lab");
  await lab.getByRole("button", { name: "Copy diagram link", exact: true }).click();
  const url = await lab.getByLabel("Diagram link", { exact: true }).inputValue();
  expect(new URL(url).hash).toMatch(/^#playbook-lab:/);
  await page.goto(url);
  await expect(lab).toHaveAttribute("data-archive", "sanchez-thanksgiving");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
  await lab.locator('[data-jets-moment="6"]').click();
  await expect(lab.locator("[data-lab-ball]")).toHaveAttribute("data-x", (await lab.locator('[data-lab-player="d11"]').getAttribute("data-x"))!);
  await lab.getByRole("button", { name: "Save in browser", exact: true }).click();
  await page.goto("/film-room#playbook-lab");
  await lab.getByRole("button", { name: "Load saved design", exact: true }).click();
  await expect(lab).toHaveAttribute("data-archive", "sanchez-thanksgiving");
  await expect(lab).toHaveAttribute("data-archive-original", "true");
});

test("the historical notebook's draw link opens the matching Jets board", async ({ page }) => {
  await page.goto("/film-room?play=elliott-miami#film-room");
  await page.locator("#film-room").getByRole("link", { name: /Draw this Jets play/ }).click();
  await expect(page.locator("#playbook-lab")).toHaveAttribute("data-archive", "elliott-miami");
  await expect(page.locator("#playbook-lab")).toHaveAttribute("data-archive-original", "true");
  await expect(page.locator("#film-room")).toHaveAttribute("data-film", "elliott-miami");
});
