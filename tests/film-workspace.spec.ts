import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#064c32"/></svg>' }));
});

test("the Film Room starts with one board and hides detailed evidence and editing until requested", async ({ page }) => {
  await page.goto("/film-room");
  const workspace = page.locator("[data-film-workspace]");
  const lab = page.locator("#playbook-lab");
  await expect(workspace).toHaveAttribute("data-film-workspace", "playbook");
  await expect(lab).toBeVisible();
  await expect(page.locator("#film-room")).toHaveCount(0);
  await expect(lab.getByRole("button", { name: "Run play", exact: true })).toBeVisible();
  await expect(lab.getByLabel("Selected player", { exact: true })).toBeVisible();
  await expect(lab.locator("[data-study-limit]")).toBeVisible();
  await expect(lab.locator("[data-selected-assignment]")).toBeHidden();
  await expect(lab.getByLabel("Offensive formation", { exact: true })).toBeHidden();
  await expect(lab.getByRole("button", { name: "Save in browser", exact: true })).toBeHidden();
  await expect(lab.locator("[aria-labelledby=jets-play-heading]")).toBeHidden();
  await lab.locator("summary").filter({ hasText: "Player assignments" }).click();
  await expect(lab.locator("[data-selected-assignment]")).toBeVisible();
});

test("workspace navigation preserves a custom diagram and game selection through back and forward", async ({ page }) => {
  await page.goto("/film-room?keep=focus#jets-play:fake-spike");
  const lab = page.locator("#playbook-lab");
  const nav = page.getByRole("navigation", { name: "Film Room workspaces" });
  await expect(lab).toHaveAttribute("data-archive", "fake-spike");
  await lab.locator("summary").filter({ hasText: "Edit players & ball" }).click();
  await lab.getByLabel("Design name", { exact: true }).fill("My Miami study");
  await lab.getByLabel("Design name", { exact: true }).press("Tab");
  await lab.getByRole("button", { name: "Run play", exact: true }).click();
  await nav.getByRole("button", { name: "Game studies", exact: true }).click();
  const room = page.locator("#film-room");
  await expect(room).toBeVisible();
  await expect(lab).toHaveAttribute("data-running", "false");
  await expect(room.locator("[data-film-description]")).toBeHidden();
  await expect(room.locator("#scouting-board")).toBeHidden();
  await room.locator("summary").filter({ hasText: "Choose a game study" }).click();
  await room.locator('[data-film-case="sanchez-thanksgiving"]').click();
  await nav.getByRole("button", { name: "Playbook", exact: true }).click();
  await expect(lab.getByLabel("Design name", { exact: true })).toHaveValue("My Miami study");
  await expect(lab).toHaveAttribute("data-archive", "fake-spike");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("focus");
  await page.goBack();
  await expect(room).toBeVisible();
  await expect(room).toHaveAttribute("data-film", "sanchez-thanksgiving");
  await page.goForward();
  await expect(lab).toBeVisible();
  await expect(lab.getByLabel("Design name", { exact: true })).toHaveValue("My Miami study");
});

test("existing film and coverage links enter the matching workspace without exposing unrelated detail", async ({ page }) => {
  await page.goto("/film-room?play=hall-miami&coverage=cover-3&pressure=simulated&step=2#scouting-board");
  await expect(page.locator("[data-film-workspace]")).toHaveAttribute("data-film-workspace", "studies");
  await expect(page.locator("#scouting-board")).toBeVisible();
  await expect(page.locator("#scouting-board")).toHaveAttribute("data-pressure", "simulated");
  await expect(page.locator("#film-room [data-film-description]")).toBeHidden();
  await expect(page.locator("#film-room [aria-labelledby=film-notebook-heading]")).not.toHaveAttribute("open");
  await page.goto("/film-room?workspace=studies&play=hall-miami#jets-play:elliott-miami");
  await expect(page.locator("[data-film-workspace]")).toHaveAttribute("data-film-workspace", "playbook");
  await expect(page.locator("#playbook-lab")).toHaveAttribute("data-archive", "elliott-miami");
  await expect(page.locator("#film-room")).toBeHidden();
});

test("closing the player editor exits drawing mode before the user returns to the field", async ({ page }) => {
  await page.goto("/film-room#playbook-lab");
  const lab = page.locator("#playbook-lab");
  const edit = lab.locator("summary").filter({ hasText: "Edit players & ball" });
  await edit.click();
  await lab.getByRole("button", { name: "Draw assignment", exact: true }).click();
  await expect(lab).toHaveAttribute("data-tool", "draw");
  await edit.click();
  await expect(lab).toHaveAttribute("data-tool", "move");
  await expect(lab.getByRole("button", { name: "Draw assignment", exact: true })).toBeHidden();
  const pointCount = await lab.locator("[data-route-point]").count();
  const field = lab.getByRole("group", { name: "Interactive football playbook" });
  const bounds = (await field.boundingBox())!;
  await field.click({ position: { x: bounds.width * .03, y: bounds.height * .05 } });
  await expect(lab.locator("[data-route-point]")).toHaveCount(pointCount);
});

test("a game-study draw link transfers keyboard focus to the loaded board's playback control", async ({ page }) => {
  await page.goto("/film-room?play=elliott-miami#film-room");
  const room = page.locator("#film-room");
  const draw = room.getByRole("link", { name: /Draw this Jets play/ });
  await draw.focus();
  await draw.press("Enter");
  const lab = page.locator("#playbook-lab");
  await expect(lab).toBeVisible();
  await expect(lab).toHaveAttribute("data-archive", "elliott-miami");
  await expect(room).toBeHidden();
  const run = lab.getByRole("button", { name: "Run play", exact: true });
  await expect(run).toBeFocused();
  await run.press("Enter");
  await expect(lab).toHaveAttribute("data-running", "true");
  await lab.getByRole("button", { name: "Pause play", exact: true }).press("Enter");
  await expect(lab).toHaveAttribute("data-running", "false");
});
