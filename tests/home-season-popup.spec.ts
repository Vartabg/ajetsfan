import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { completedGames, type CurrentSnapshot, type ScheduledGame } from "../src/lib/current";
import { confirmedByeWeek } from "../src/lib/focus";
import { teamIdentity } from "../src/lib/teams";

const snapshot: CurrentSnapshot = JSON.parse(readFileSync("public/data/current.json", "utf8"));
const regular = snapshot.schedule.filter(game => game.season === snapshot.season && game.seasonType === "REG");
const finals = completedGames(snapshot).filter(game => game.season === snapshot.season && game.seasonType === "REG");
const final = finals.at(-1);
const future = regular.filter(game => game.status === "scheduled" &&
  (game.kickoff ? game.kickoff > snapshot.checkedAt : game.date >= snapshot.checkedAt.slice(0, 10)));
const publishedRecords = snapshot.standings?.teams.filter(row => row.games > 0) ?? [];
const upcoming = future.find(game => !publishedRecords.some(row => row.team === game.opponent)) ?? future[0];
const byeWeek = Array.from({ length: Math.max(18, ...regular.map(game => game.week)) }, (_, i) => i + 1)
  .find(week => !regular.some(game => game.week === week));

const weekHref = (week: number) => `/?week=${week}#season`;
const weekLink = (page: Page, week: number) => page.locator(`#season a[href="${weekHref(week)}"]`);
const weekDialog = (page: Page, week: number) => page.getByRole("dialog", { name: `Week ${week} game details`, exact: true });
const opponentText = (game: ScheduledGame) => new RegExp(
  [teamIdentity(game.opponent)?.nickname, game.opponentDisplay].filter(Boolean).join("|"), "i",
);
const scorePair = /\b\d+\s*[-–—]\s*\d+\b/;
const resultsLinks = /report|replay/i;

test("a missing fixture or duplicate week does not establish a bye", () => {
  expect(confirmedByeWeek({ ...snapshot, schedule: regular.slice(0, 10) })).toBeNull();
  if (regular.length === 17 && byeWeek) {
    expect(confirmedByeWeek(snapshot)).toBe(byeWeek);
    expect(confirmedByeWeek({ ...snapshot, schedule: [...regular.slice(0, 16), regular[0]] })).toBeNull();
  }
});

test("the season grid labels Home and Away and shows week numbers and outcomes on its links", async ({ page }) => {
  test.skip(regular.length === 0, "The snapshot has no regular-season games");
  await page.goto("/");
  for (const game of regular) {
    const tile = weekLink(page, game.week);
    await expect(tile).toBeVisible();
    await expect(tile).toContainText(game.atHome ? "Home" : "Away");
    await expect(tile).toHaveAccessibleName(new RegExp(`\\bWeek ${game.week}\\b`, "i"));
    expect(await tile.evaluate(link => link.closest("[data-week-state]") !== null)).toBe(true);
  }

  const outcome = { win: /\bwin\b|\bwon\b|\bW\b/i, loss: /\bloss\b|\blost\b|\bL\b/i, tie: /\btie(?:d)?\b|\bT\b/i };
  for (const game of finals) {
    await expect(weekLink(page, game.week)).toHaveAccessibleName(outcome[game.outcome]);
  }
});

test("a final opens a native modal with its score and returns focus when closed", async ({ page }) => {
  if (!final) return test.skip(true, "The snapshot has no confirmed regular-season final");
  await page.goto("/");
  const opener = weekLink(page, final.week);
  await opener.click();
  const dialog = weekDialog(page, final.week);
  await expect(dialog).toBeVisible();
  await expect(dialog.and(page.locator("dialog:modal"))).toBeVisible();
  await expect(dialog).toContainText(opponentText(final));
  await expect(dialog.getByRole("heading", { level: 3 }).locator("strong")).toHaveText([String(final.jetsScore), String(final.oppScore)]);
  await dialog.getByRole("button", { name: "Close", exact: true })
    .or(dialog.getByRole("link", { name: "Close", exact: true })).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Escape and browser Back dismiss the season popup", async ({ page }) => {
  if (!final) return test.skip(true, "The snapshot has no confirmed regular-season final");
  await page.goto("/");
  const opener = weekLink(page, final.week);
  const dialog = weekDialog(page, final.week);
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(page).toHaveURL(url => url.searchParams.get("week") === String(final.week));
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(url => !url.searchParams.has("week"));
});

test("an upcoming week shows its opponent and kickoff status without result links or invented records", async ({ page }) => {
  if (!upcoming) return test.skip(true, "The snapshot has no future regular-season game");
  await page.goto("/");
  await weekLink(page, upcoming.week).click();
  const dialog = weekDialog(page, upcoming.week);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(opponentText(upcoming));
  await expect(dialog).toContainText(upcoming.atHome ? /\bHome\b/i : /\bAway\b/i);
  await expect(dialog).toContainText(upcoming.kickoff ? /\b(?:\d{1,2}:\d{2}|\d{1,2}\s*[ap]\.?m\.?)\b/i : /TBD|to be (?:announced|determined)/i);
  await expect(dialog.getByRole("link", { name: resultsLinks })).toHaveCount(0);
  const availableRecords = publishedRecords.filter(row => ["NYJ", upcoming.opponent].includes(row.team))
    .map(row => [row.wins, row.losses, ...(row.ties ? [row.ties] : [])].join("-"));
  for (const [value] of (await dialog.innerText()).matchAll(/\b\d+\s*[-–—]\s*\d+(?:\s*[-–—]\s*\d+)?\b/g)) {
    expect(availableRecords).toContain(value.replace(/\s/g, "").replace(/[–—]/g, "-"));
  }
});

test("a bye opens its own detail without a score or game actions", async ({ page }) => {
  if (byeWeek === undefined || regular.length === 0) return test.skip(true, "The snapshot does not identify a bye week");
  await page.goto("/");
  const opener = weekLink(page, byeWeek);
  await expect(opener).toHaveAccessibleName(/\bbye\b/i);
  await opener.click();
  const dialog = weekDialog(page, byeWeek);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /bye week/i })).toBeVisible();
  await expect(dialog).not.toContainText(scorePair);
  await expect(dialog.getByRole("link", { name: resultsLinks })).toHaveCount(0);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });

  test("a direct week link opens game details and Close returns to that week's tile", async ({ page }) => {
    if (!final) return test.skip(true, "The snapshot has no confirmed regular-season final");
    await page.goto(weekHref(final.week));
    const dialog = weekDialog(page, final.week);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(opponentText(final));
    const close = dialog.getByRole("link", { name: "Close", exact: true });
    await expect(close).toHaveAttribute("href", `/#season-week-${final.week}`);
    await close.click();
    await expect(page).toHaveURL(url => !url.search && url.hash === `#season-week-${final.week}`);
    await expect(dialog).toBeHidden();
    await expect(weekLink(page, final.week)).toBeInViewport();
  });
});
