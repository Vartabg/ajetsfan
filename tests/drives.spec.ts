import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readDrives, scoringSummary, spot, type DrivesFile } from "../src/lib/drives";

const file = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "drives", "2026.json"), "utf8")) as DrivesFile;
const id = "2026_05_CLE_NYJ";

test("field positions read from the side with the ball", () => {
  expect(spot(20, true)).toBe("own 20");
  expect(spot(68, true)).toBe("opp 32");
  expect(spot(50, false)).toBe("midfield");
  expect(spot(66, false)).toBe("own 34");
  expect(spot(0, false)).toBe("the end zone");
  expect(scoringSummary([])).toBe("no points");
});

test("a game page draws the Jets' drives and can add the opponent's", async ({ page }) => {
  const drives = readDrives(file, id)!;
  const jets = drives.filter((drive) => drive.jets);
  await page.goto(`/games/${id}`);
  const moment = page.locator("#drives");
  await expect(moment.getByRole("heading")).toHaveText(`${jets.length} Jets drives: ${scoringSummary(jets)}.`);
  const rows = moment.locator("[data-drive-chart] > [data-kind]");
  await expect(rows).toHaveCount(jets.length);
  await expect(moment.locator("ol.sr-only li").first()).toContainText(/^Jets, Q1 \d+:\d\d: from (own|opp) \d+|midfield/);
  await moment.getByRole("button", { name: "Show the Browns’ drives too" }).click();
  await expect(rows).toHaveCount(drives.length);
  await expect(moment.getByRole("button", { name: "Hide the Browns’ drives" })).toHaveAttribute("aria-pressed", "true");
});
