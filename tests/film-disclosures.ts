import { expect, type Page } from "@playwright/test";

export async function openPlaybookTools(page: Page) {
  const lab = page.locator("#playbook-lab");
  await expect(lab).toBeVisible();
  for (const name of ["Choose a Jets play", "Formations & concepts", "Diagram options", "Player assignments", "Sources & what’s illustrative", "Edit players & ball", "Save, share & exchange"]) {
    const summary = lab.locator("summary").filter({ hasText: name }).first();
    if (await summary.count() && !(await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open))) await summary.click();
  }
}

export async function openGameStudyDetails(page: Page) {
  const room = page.locator("#film-room");
  await expect(room).toBeVisible();
  for (const name of ["Choose a game study", "Recorded play & probability", "Play facts & sources", "Coverage & pressure lab", "Replay options", "About this image"]) {
    const summary = room.locator("summary").filter({ hasText: name }).first();
    if (await summary.count() && !(await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open))) await summary.click();
  }
}
