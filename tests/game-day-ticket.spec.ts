import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot, FinalGame, ScheduledGame } from "../src/lib/current";
import { completedGames, nextScheduledGame } from "../src/lib/current";
import {
  addTicketCall, emptyTicketBook, fixtureFingerprint, MAX_TICKET_CALLS, readTicketBook,
  storedTicketSeason, ticketDate, ticketFixture, ticketReceipt, ticketScore, ticketShareText, TICKET_STORAGE_KEY, ticketWindow,
} from "../src/lib/game-day-ticket";
import type { TicketCall } from "../src/lib/game-day-ticket";

const fixture = (overrides: Partial<ScheduledGame> = {}): ScheduledGame => ({
  id: "2026_04_NYJ_CHI", season: 2026, week: 4, seasonType: "REG", date: "2026-10-04",
  kickoff: "2026-10-04T17:00:00Z", opponent: "CHI", opponentDisplay: "CHI", atHome: false,
  jetsScore: null, oppScore: null, outcome: null, status: "scheduled", ...overrides,
});
const call = (game = fixture(), overrides: Partial<TicketCall> = {}): TicketCall => ({
  fixture: ticketFixture(game), jetsScore: 24, oppScore: 20, conviction: "again", ritual: "jersey",
  savedAt: "2026-09-30T18:00:00Z", ...overrides,
});
const final = (overrides: Partial<FinalGame> = {}): FinalGame => ({
  ...fixture(), jetsScore: 24, oppScore: 20, outcome: "win", status: "final", ...overrides,
});

test("blank, decimal, signed and out-of-range scores never become a default call", () => {
  for (const value of ["", " ", "-1", "+1", "1.5", "100", "1e1", "0x10", "NaN"]) expect(ticketScore(value)).toBeNull();
  expect(ticketScore("0")).toBe(0);
  expect(ticketScore("99")).toBe(99);
});

test("the ticket deadline follows exact kickoff, publication overdue status and Central game-day dates", () => {
  const game = fixture();
  const kickoff = Date.parse(game.kickoff!);
  expect(ticketWindow(game, false, 2026, kickoff - 1).open).toBe(true);
  expect(ticketWindow(game, false, 2026, kickoff).open).toBe(false);
  expect(ticketWindow(game, true, 2026, kickoff - 60_000).open).toBe(false);
  expect(ticketWindow(game, false, 2027, kickoff - 60_000).open).toBe(false);
  expect(ticketWindow(null, false, 2026, kickoff).reason).toBe("missing");
  expect(ticketWindow(game, false, 2026, 0).reason).toBe("loading");
  const unknown = fixture({ kickoff: null });
  expect(ticketDate(Date.parse("2026-10-04T04:59:00Z"))).toBe("2026-10-03");
  expect(ticketWindow(unknown, false, 2026, Date.parse("2026-10-04T04:59:00Z")).open).toBe(true);
  expect(ticketWindow(unknown, false, 2026, Date.parse("2026-10-04T05:00:00Z")).reason).toBe("unconfirmed");
});

test("season books expire, reject damaged records, retain zeroes and stay bounded", () => {
  let book = emptyTicketBook(2026);
  for (let index = 1; index <= 30; index++) book = addTicketCall(book, call(fixture({ id: `2026_${index}_NYJ_CHI`, week: index })));
  expect(book.calls).toHaveLength(MAX_TICKET_CALLS);
  expect(book.calls[0].fixture.id).toBe("2026_7_NYJ_CHI");
  const zero = call(fixture(), { jetsScore: 0, oppScore: 0 });
  book = addTicketCall(book, zero);
  const restored = readTicketBook(JSON.stringify(book), 2026);
  expect(restored.calls.at(-1)?.jetsScore).toBe(0);
  expect(restored.calls.at(-1)?.oppScore).toBe(0);
  expect(readTicketBook(JSON.stringify(book), 2027).calls).toEqual([]);
  expect(storedTicketSeason(JSON.stringify(book))).toBe(2026);
  expect(storedTicketSeason("bad json")).toBeNull();
  expect(readTicketBook("bad json", 2026).calls).toEqual([]);
  expect(readTicketBook(JSON.stringify({ ...book, calls: [{ ...zero, conviction: "invented" }] }), 2026).calls).toEqual([]);
  expect(readTicketBook(JSON.stringify({ ...book, calls: [{ ...zero, jetsScore: null }] }), 2026).calls).toEqual([]);
});

test("changed fixture details cannot reuse a call and each fixture gets its own record", () => {
  const original = fixture();
  for (const change of [
    { date: "2026-10-05" }, { kickoff: "2026-10-04T20:25:00Z" }, { opponent: "NE" }, { atHome: true }, { week: 5 },
  ]) expect(fixtureFingerprint(fixture(change))).not.toBe(fixtureFingerprint(original));
  const second = fixture({ id: "2026_05_CLE_NYJ", week: 5, opponent: "CLE", opponentDisplay: "CLE", atHome: true });
  const book = addTicketCall(addTicketCall(emptyTicketBook(2026), call(original)), call(second));
  expect(book.calls).toHaveLength(2);
  expect(book.calls.find((entry) => entry.fixture.id === second.id)?.fixture.opponent).toBe("CLE");
  expect(addTicketCall(book, call(second, { jetsScore: 0 })).calls).toHaveLength(2);
});

test("receipts select the latest saved confirmed regular-season result, including ties and zeroes", () => {
  const older = final({ id: "2026_03_NYJ_DET", week: 3, date: "2026-09-27", kickoff: "2026-09-27T17:00:00Z", opponent: "DET", opponentDisplay: "DET" });
  const tied = final({ jetsScore: 0, oppScore: 0, outcome: "tie" });
  const future = final({ id: "2026_05_CLE_NYJ", week: 5, date: "2026-10-11", kickoff: "2026-10-11T17:00:00Z" });
  const post = final({ id: "2026_19_NYJ_CHI", seasonType: "POST", week: 19 });
  let book = addTicketCall(emptyTicketBook(2026), call(older));
  book = addTicketCall(book, call(tied, { jetsScore: 0, oppScore: 0 }));
  book = addTicketCall(book, call(future));
  book = addTicketCall(book, call(post));
  const now = Date.parse("2026-10-05T18:00:00Z");
  const receipt = ticketReceipt(book, [post, future, tied, older], 2026, now);
  expect(receipt?.game.id).toBe(tied.id);
  expect(receipt?.exact).toBe(true);
  expect(receipt?.winner).toBe(true);
  expect(ticketReceipt(book, [future], 2026, now)).toBeNull();
  expect(ticketReceipt(book, [final({ kickoff: "2026-10-05T20:00:00Z", date: "2026-10-05" })], 2026, now)).toBeNull();
  expect(ticketReceipt(book, [final({ kickoff: "2026-10-04T20:25:00Z" })], 2026, now)).toBeNull();
  const wrong = addTicketCall(emptyTicketBook(2026), call(tied, { jetsScore: 0, oppScore: 7 }));
  expect(ticketReceipt(wrong, [tied], 2026, now)?.winner).toBe(false);
  const draw = addTicketCall(emptyTicketBook(2026), call(tied, { jetsScore: 7, oppScore: 7 }));
  expect(ticketReceipt(draw, [tied], 2026, now)?.verdict).toContain("Correct tie");
});

test("share text contains the fan’s explicit call without imagined crowd sentiment", () => {
  const text = ticketShareText(call(fixture(), { jetsScore: 0, oppScore: 0, ritual: "" }));
  expect(text).toContain("My call: NYJ 0–CHI 0");
  expect(text).toContain("Conviction: High confidence");
  expect(text).not.toContain("Ritual:");
  expect(text).not.toContain("% of fans");
});

const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const upcoming = nextScheduledGame(current);
const currentFixture = upcoming?.game ?? null;
const browserNow = new Date(current.checkedAt);

test.describe("personal ticket in the current edition", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!currentFixture || upcoming!.overdue, "This edition has no upcoming fixture.");
    await page.clock.install({ time: browserNow });
  });

  test("a blank ticket requires explicit scores and conviction, then persists without filling a new draft", async ({ page }) => {
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    const summary = ticket.locator("summary");
    await expect(ticket.locator("details")).not.toHaveAttribute("open", "");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(summary).toContainText("Close your game-day ticket");
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("");
    await expect(ticket.getByRole("radio", { checked: true })).toHaveCount(0);
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    await expect(ticket.getByRole("status", { name: "Ticket form status" })).toContainText("Enter both whole-number scores");
    expect(await page.evaluate((key) => localStorage.getItem(key), TICKET_STORAGE_KEY)).toBeNull();
    await ticket.getByLabel("Jets score", { exact: true }).fill("0");
    await ticket.getByLabel(`${currentFixture!.opponentDisplay} score`, { exact: true }).fill("0");
    await ticket.getByRole("radio", { name: "High confidence", exact: true }).check();
    await ticket.getByLabel("Sunday ritual", { exact: false }).selectOption("jersey");
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    await expect(ticket.getByRole("status", { name: "Ticket status", exact: true })).toContainText("Ticket saved in this browser");
    await expect(summary).toBeFocused();
    await expect(ticket.locator("details")).not.toHaveAttribute("open", "");
    await summary.click();
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("");
    await expect(ticket.getByRole("radio", { checked: true })).toHaveCount(0);
    await page.reload();
    await expect(ticket).toContainText("Your saved call");
    await expect(ticket).toContainText("Same jersey");
    await summary.click();
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("");
    await ticket.getByRole("button", { name: "Edit saved ticket", exact: false }).click();
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("0");
    await expect(ticket.getByLabel("Jets score", { exact: true })).toBeFocused();
    await ticket.getByRole("button", { name: "Clear my tickets", exact: false }).click();
    await expect(ticket.getByRole("status", { name: "Ticket status", exact: true })).toContainText("cleared from this browser");
    await expect(ticket.getByRole("button", { name: "Copy saved ticket", exact: false })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), TICKET_STORAGE_KEY)).toBeNull();
    await summary.click();
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("");
  });

  test("a stale edition preserves a newer season on hydration and refuses to overwrite it", async ({ page }) => {
    const futureFixture = { ...currentFixture!, season: current.season + 1, id: `${current.season + 1}_04_NYJ_CHI` };
    const futureBook = JSON.stringify(addTicketCall(emptyTicketBook(futureFixture.season), call(futureFixture)));
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: TICKET_STORAGE_KEY, value: futureBook });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await expect(ticket.locator("summary")).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), TICKET_STORAGE_KEY)).toBe(futureBook);
    await ticket.locator("summary").click();
    await ticket.getByLabel("Jets score", { exact: true }).fill("24");
    await ticket.getByLabel(`${currentFixture!.opponentDisplay} score`, { exact: true }).fill("20");
    await ticket.getByRole("radio", { name: "Medium confidence", exact: true }).check();
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    await expect(ticket.getByRole("status", { name: "Ticket status", exact: true })).toContainText("older edition can’t replace them");
    await expect(ticket.locator("details")).toHaveAttribute("open", "");
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("24");
    await expect(ticket.getByText("Your saved call", { exact: true })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), TICKET_STORAGE_KEY)).toBe(futureBook);
  });

  test("a missing conviction focuses the required choice and its error without saving a ticket", async ({ page }) => {
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await ticket.locator("summary").click();
    await ticket.getByLabel("Jets score", { exact: true }).fill("0");
    await ticket.getByLabel(`${currentFixture!.opponentDisplay} score`, { exact: true }).fill("24");
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    const conviction = ticket.getByRole("group", { name: "Your confidence" });
    const firstChoice = ticket.getByRole("radio", { name: "Low confidence", exact: true });
    await expect(firstChoice).toBeFocused();
    await expect(conviction).toHaveAttribute("aria-invalid", "true");
    await expect(conviction).toHaveAccessibleDescription(/choose your conviction/);
    expect(await page.evaluate((key) => localStorage.getItem(key), TICKET_STORAGE_KEY)).toBeNull();
    await page.keyboard.press("Space");
    await expect(firstChoice).toBeChecked();
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    await expect(ticket.getByRole("status", { name: "Ticket status", exact: true })).toContainText("Ticket saved in this browser");
    await expect(ticket.locator("details")).not.toHaveAttribute("open", "");
  });

  test("invalid scores are rejected and an old fixture never preselects the next game", async ({ page }) => {
    const old = completedGames(current).filter((game) => game.season === current.season && game.seasonType === "REG").at(-1)!;
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: TICKET_STORAGE_KEY, value: JSON.stringify(addTicketCall(emptyTicketBook(current.season), call(old))) });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await expect(ticket).toContainText("Your last receipt");
    await expect(ticket.getByText("Your saved call", { exact: true })).toHaveCount(0);
    await ticket.locator("summary").click();
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("");
    await ticket.getByLabel("Jets score", { exact: true }).fill("100");
    await ticket.getByLabel(`${currentFixture!.opponentDisplay} score`, { exact: true }).fill("20");
    await ticket.getByRole("radio", { name: "Low confidence", exact: true }).check();
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    await expect(ticket.getByRole("status", { name: "Ticket form status" })).toContainText("0 to 99");
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).calls.length, TICKET_STORAGE_KEY)).toBe(1);
  });

  test("a revised fixture keeps the earlier call visible and requires a fresh explicit save", async ({ page }) => {
    const changed = { ...currentFixture!, kickoff: "2026-10-04T20:25:00Z" };
    if (changed.kickoff === currentFixture!.kickoff) changed.kickoff = "2026-10-04T21:00:00Z";
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: TICKET_STORAGE_KEY, value: JSON.stringify(addTicketCall(emptyTicketBook(current.season), call(changed))) });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await expect(ticket).toContainText("Fixture details changed");
    await expect(ticket.getByRole("button", { name: "Copy saved ticket", exact: false })).toHaveCount(0);
    await expect(ticket.getByRole("button", { name: "Edit saved ticket", exact: false })).toHaveCount(0);
    await ticket.locator("summary").click();
    await expect(ticket.getByLabel("Jets score", { exact: true })).toHaveValue("");
    await ticket.getByLabel("Jets score", { exact: true }).fill("17");
    await ticket.getByLabel(`${currentFixture!.opponentDisplay} score`, { exact: true }).fill("14");
    await ticket.getByRole("radio", { name: "Medium confidence", exact: true }).check();
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    await expect(ticket).not.toContainText("Fixture details changed");
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).calls[0], TICKET_STORAGE_KEY);
    expect(saved.fixture.kickoff).toBe(currentFixture!.kickoff);
    expect(saved.jetsScore).toBe(17);
  });

  test("copy success uses saved choices; clipboard failure exposes selectable ticket text", async ({ page }) => {
    const savedCall = call(currentFixture!);
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => {
        (window as unknown as { copiedTicket: string }).copiedTicket = text;
      } } });
    }, { key: TICKET_STORAGE_KEY, value: JSON.stringify(addTicketCall(emptyTicketBook(current.season), savedCall)) });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await ticket.getByRole("button", { name: "Copy saved ticket", exact: false }).click();
    await expect(ticket.getByRole("status", { name: "Ticket copy status", exact: true })).toContainText("Saved ticket copied");
    expect(await page.evaluate(() => (window as unknown as { copiedTicket: string }).copiedTicket)).toBe(ticketShareText(savedCall));
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Unavailable"); } } }); });
    await ticket.getByRole("button", { name: "Ticket copied", exact: false }).click();
    await expect(ticket.getByRole("status", { name: "Ticket copy status", exact: true })).toContainText("Copy failed");
    await expect(ticket.getByLabel("Saved ticket text", { exact: true })).toHaveValue(ticketShareText(savedCall));
    await ticket.getByLabel("Saved ticket text", { exact: true }).focus();
    expect(await ticket.getByLabel("Saved ticket text", { exact: true }).evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe(ticketShareText(savedCall).length);
  });

  test("failed browser storage keeps a ticket for this visit and reports failure honestly", async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(Storage.prototype, "setItem", { configurable: true, value: () => { throw new Error("Quota"); } }); });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await ticket.locator("summary").click();
    await ticket.getByLabel("Jets score", { exact: true }).fill("24");
    await ticket.getByLabel(`${currentFixture!.opponentDisplay} score`, { exact: true }).fill("20");
    await ticket.getByRole("radio", { name: "Medium confidence", exact: true }).check();
    await ticket.getByRole("button", { name: "Save my ticket" }).click();
    await expect(ticket.getByRole("status", { name: "Ticket status", exact: true })).toContainText("couldn’t save it");
    await expect(ticket).toContainText("this visit only");
    await expect(ticket).toContainText("Your saved call");
    expect(await page.evaluate((key) => localStorage.getItem(key), TICKET_STORAGE_KEY)).toBeNull();
    await page.reload();
    await expect(ticket.getByText("Your saved call", { exact: true })).toHaveCount(0);
  });

  test("failed clearing cannot claim that the browser’s persisted ticket was removed", async ({ page }) => {
    const savedBook = addTicketCall(emptyTicketBook(current.season), call(currentFixture!));
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
      Object.defineProperty(Storage.prototype, "removeItem", { configurable: true, value: () => { throw new Error("Blocked"); } });
    }, { key: TICKET_STORAGE_KEY, value: JSON.stringify(savedBook) });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await ticket.getByRole("button", { name: "Clear my tickets", exact: false }).click();
    await expect(ticket.getByRole("status", { name: "Ticket status", exact: true })).toContainText("couldn’t remove saved tickets");
    await expect(ticket.getByText("Your saved call", { exact: true })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), TICKET_STORAGE_KEY)).toBe(JSON.stringify(savedBook));
  });

  test("a static edition closes ticket writing at real kickoff and retains the saved call", async ({ page }) => {
    test.skip(!currentFixture!.kickoff, "This fixture has no published kickoff time.");
    const savedBook = addTicketCall(emptyTicketBook(current.season), call(currentFixture!));
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: TICKET_STORAGE_KEY, value: JSON.stringify(savedBook) });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await expect(ticket.locator("summary")).toBeVisible();
    await page.clock.setSystemTime(new Date(Date.parse(currentFixture!.kickoff!) + 60_000));
    await page.clock.runFor(60_000);
    await expect(ticket.getByRole("status", { name: "Ticket window status", exact: true })).toContainText("Ticket writing has closed");
    await expect(ticket.locator("summary")).toHaveCount(0);
    await expect(ticket).toContainText("Your saved call");
    await expect(ticket.getByRole("button", { name: "Copy saved ticket", exact: false })).toBeVisible();
  });

  test("the open ticket has usable touch targets and reflows at 320px with doubled text", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/game-day#game-day-ticket");
    const ticket = page.getByRole("region", { name: "Record your prediction." });
    await ticket.locator("summary").click();
    for (const control of [ticket.locator("summary"), ticket.getByLabel("Jets score", { exact: true }), ticket.getByLabel(`${currentFixture!.opponentDisplay} score`, { exact: true }), ticket.getByLabel("Sunday ritual", { exact: false }), ticket.getByRole("button", { name: "Save my ticket" })]) {
      const size = await control.boundingBox();
      expect(size!.height).toBeGreaterThanOrEqual(44);
      expect(size!.width).toBeGreaterThanOrEqual(44);
    }
    for (const label of await ticket.locator("label:has(input[type='radio'])").all()) expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    expect(await ticket.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: string, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run("#game-day-ticket", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
  });
});
