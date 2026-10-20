import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dailyPuzzleGame, hashString, judge, puzzleClues, puzzleDay } from "../src/lib/puzzle";
import { teamName } from "../src/lib/teams";

async function answerForDay(day: string) {
  const archive = JSON.parse(await readFile("src/lib/puzzle-archive-v1.json", "utf8")) as { rows: [string, string, string, string, ...unknown[]][] };
  const pool = archive.rows.map(([id, , , opponentDisplay]) => ({ id, season: Number(id.slice(0, 4)), week: Number(id.slice(5, 7)), opponentDisplay }));
  return dailyPuzzleGame(pool, day)!;
}

test("the puzzle day turns at midnight New York time and the pick is stable for that day", () => {
  expect(puzzleDay(new Date("2026-10-03T03:59:00Z"))).toBe("2026-10-02");
  expect(puzzleDay(new Date("2026-10-03T04:01:00Z"))).toBe("2026-10-03");
  expect(puzzleDay(new Date("2027-01-10T04:30:00Z"))).toBe("2027-01-09"); // winter: UTC−5
  expect(puzzleDay(new Date("2027-01-10T05:30:00Z"))).toBe("2027-01-10");
  const pool = Array.from({ length: 50 }, (_, index) => ({ id: `game-${String(index).padStart(2, "0")}` }));
  const picks = new Set(Array.from({ length: 60 }, (_, offset) => dailyPuzzleGame(pool, `2026-11-${String((offset % 28) + 1).padStart(2, "0")}`)!.id));
  expect(picks.size).toBeGreaterThan(10);
  expect(dailyPuzzleGame([...pool].reverse(), "2026-10-03")).toEqual(dailyPuzzleGame(pool, "2026-10-03"));
  expect(dailyPuzzleGame([], "2026-10-03")).toBeNull();
  expect(hashString("a")).not.toBe(hashString("b"));
});

test("clues and verdicts come straight from the record", () => {
  const game = { id: "2026_02_GB_NYJ", season: 2026, week: 2, seasonType: "REG", date: "2026-09-20", opponentDisplay: "GB", atHome: true, jetsScore: 17, oppScore: 20, outcome: "loss" as const, wentToOt: true, stadium: "MetLife Stadium", roof: "outdoors", temp: 69, wind: 7 };
  expect(puzzleClues(game).map((clue) => clue.text)).toEqual(["Week 2 · Regular season · Home game", "Outdoors · 69°F · Wind 7 mph · Went to overtime", "Jets lost by 3 points", "Jets 17, opponent 20", "The opponent’s colours", "2026"]);
  expect(judge(game, { opponent: "GB", season: 2026 })).toEqual({ opponent: "right", season: "right" });
  expect(judge(game, { opponent: "NE", season: 2010 })).toEqual({ opponent: "wrong", season: "later" });
  expect(judge(game, { opponent: "GB", season: 2030 })).toEqual({ opponent: "right", season: "earlier" });
  expect(puzzleClues({ ...game, atHome: false, stadium: "Lambeau Field" })[1].text).not.toContain("Lambeau");
  expect(puzzleClues({ ...game, roof: null, temp: null, wind: null, wentToOt: false })[1].text).toBe("Roof and weather not recorded");
});

test("the page never carries the answer, and the server refuses a future day", async ({ request }) => {
  const answer = await answerForDay(puzzleDay(new Date()));
  const html = await (await request.get("/puzzle")).text();
  expect(html).not.toContain(answer.id);
  expect(html).not.toContain("jetsScore");
  expect(html).not.toMatch(/\\?"desc\\?":/);
  const future = await request.post("/api/puzzle", { data: { day: "2999-01-01", guesses: [] } });
  expect(future.status()).toBe(400);
  const early = await (await request.post("/api/puzzle", { data: { day: puzzleDay(new Date()), guesses: [] } })).json();
  expect(early).toEqual({ verdicts: [], clues: [], answer: null });
});

test("a wrong guess opens the next clue, a right one reveals the game, and the state survives a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const answer = await answerForDay(puzzleDay(new Date()));
  await page.goto("/puzzle");
  await expect(page.locator("[data-puzzle-state]")).toHaveAttribute("data-puzzle-state", "open");
  await expect(page.locator("figure svg")).toBeVisible();
  const clues = page.locator('ol[aria-label="Clues from the record"] > li');
  await expect(clues).toHaveCount(6);
  await expect(clues.nth(0)).toContainText("Opens after guess 1");
  const wrongOpponent = answer.opponentDisplay === "MIA" ? "BUF" : "MIA";
  await page.locator("[data-puzzle-opponent]").selectOption(wrongOpponent);
  await page.locator("[data-puzzle-season]").selectOption(String(answer.season === 1999 ? 2000 : 1999));
  await page.getByRole("button", { name: /^Guess 1 of 6/ }).click();
  await expect(page.locator("[data-puzzle-guess]")).toHaveCount(1);
  await expect(page.locator("[data-puzzle-guess]").first()).toContainText(`Opponent wrong`);
  await expect(clues.nth(0)).toContainText(`Week ${answer.week}`);
  await expect(clues.nth(1)).toContainText("Opens after guess 2");
  await page.locator("[data-puzzle-opponent]").selectOption(answer.opponentDisplay);
  await page.locator("[data-puzzle-season]").selectOption(String(answer.season));
  await page.getByRole("button", { name: /^Guess 2 of 6/ }).click();
  const reveal = page.locator("[data-puzzle-reveal]");
  await expect(reveal).toContainText("Solved in 2 guesses.");
  await expect(reveal).toContainText(teamName(answer.opponentDisplay));
  await expect(reveal.getByRole("link", { name: /Read the game report/ })).toHaveAttribute("href", `/games/${answer.id}`);
  await expect(reveal).toContainText("Solved 1 of 1 played in this browser.");
  await page.reload();
  await expect(page.locator("[data-puzzle-state]")).toHaveAttribute("data-puzzle-state", "won");
  await expect(page.locator("[data-puzzle-guess]")).toHaveCount(2);
  await expect(page.locator("[data-puzzle-opponent]")).toBeDisabled();
});

test("invalid puzzle requests fail clearly while a valid empty request keeps the answer private", async ({ request }) => {
  for (const data of [null, false, [], { day: "2026-02-30", guesses: [] }]) {
    const response = await request.post("/api/puzzle", { data: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String), action: expect.any(String) });
  }
  const oversized = await request.post("/api/puzzle", { data: { day: puzzleDay(new Date()), guesses: [], extra: "x".repeat(5000) } });
  expect(oversized.status()).toBe(413);
});

test("another tab refreshes clues and the final answer; clearing progress does not restore stale guesses", async ({ page, context }) => {
  const day = puzzleDay(new Date()), answer = await answerForDay(day);
  await page.goto("/puzzle");
  await expect(page.locator("[data-puzzle-state]")).toHaveAttribute("data-puzzle-state", "open");
  await page.getByText("Read the chart as text", { exact: true }).click();
  await expect(page.locator("details li").first()).toContainText(/Quarter 1: starts at/);
  const other = await context.newPage();
  await other.goto("/puzzle");
  await expect(other.locator("[data-puzzle-state]")).toHaveAttribute("data-puzzle-state", "open");
  await page.locator("[data-puzzle-opponent]").selectOption(answer.opponentDisplay === "MIA" ? "BUF" : "MIA");
  await page.locator("[data-puzzle-season]").selectOption(String(answer.season === 1999 ? 2000 : 1999));
  await page.getByRole("button", { name: /^Guess 1 of 6/ }).click();
  await expect(other.locator("[data-puzzle-guess]")).toHaveCount(1);
  await expect(other.locator('ol[aria-label="Clues from the record"] > li').first()).toContainText(`Week ${answer.week}`);
  await other.locator("[data-puzzle-opponent]").selectOption(answer.opponentDisplay);
  await other.locator("[data-puzzle-season]").selectOption(String(answer.season));
  await other.getByRole("button", { name: /^Guess 2 of 6/ }).click();
  await expect(page.locator("[data-puzzle-state]")).toHaveAttribute("data-puzzle-state", "won");
  await expect(page.locator("[data-puzzle-reveal]")).toContainText(teamName(answer.opponentDisplay));
  await other.evaluate((key) => localStorage.removeItem(key), `back-page-puzzle:v2:${day}`);
  await expect(page.locator("[data-puzzle-state]")).toHaveAttribute("data-puzzle-state", "open");
  await expect(page.locator("[data-puzzle-guess]")).toHaveCount(0);
  await expect(page.locator("[data-puzzle-reveal]")).toHaveCount(0);
  await expect(page.locator('ol[aria-label="Clues from the record"] > li').first()).toContainText("Opens after guess 1");
  await other.close();
});
