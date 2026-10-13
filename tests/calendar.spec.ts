import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eventTitle, jetsCalendar } from "../src/lib/calendar";
import type { CurrentSnapshot, ScheduledGame } from "../src/lib/current";
import type { LeagueHistory } from "../src/lib/league-history";

const data = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", file), "utf8"));
const snapshot = data("current.json") as CurrentSnapshot;
const history = data("league-history.json") as LeagueHistory;
const season = snapshot.schedule.filter((game) => game.season === snapshot.season);

test("the calendar has one event per game this season, in RFC 5545 lines", () => {
  const ics = jetsCalendar({ snapshot, history: history.games, origin: "https://ajetsfan.com", reports: new Set() });
  expect(ics.endsWith("\r\n")).toBe(true);
  expect(ics.split("\r\n").filter(Boolean).every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  const unfolded = ics.replace(/\r\n /g, "");
  expect(unfolded.match(/^BEGIN:VEVENT$/gm)).toHaveLength(season.length);
  for (const game of season) {
    expect(unfolded).toContain(`UID:${game.id}@ajetsfan.com`);
    expect(unfolded).toContain(`SUMMARY:${eventTitle(game).replace(/,/g, "\\,")}`);
  }
});

test("a final names the score and result; a scheduled game names the matchup; an unset kickoff is all day", () => {
  const base: ScheduledGame = { id: "2026_06_NYJ_NE", season: 2026, week: 6, seasonType: "REG", date: "2026-10-18", kickoff: "2026-10-18T17:00:00.000Z", opponent: "NE", opponentDisplay: "NE", atHome: false, jetsScore: null, oppScore: null, outcome: null, status: "scheduled" };
  expect(eventTitle(base)).toBe("Jets at Patriots");
  expect(eventTitle({ ...base, atHome: true })).toBe("Patriots at Jets");
  expect(eventTitle({ ...base, status: "final", jetsScore: 20, oppScore: 17, outcome: "win" })).toBe("Jets 20, Patriots 17 (W)");
  const ics = jetsCalendar({ snapshot: { ...snapshot, schedule: [{ ...base, kickoff: null }] }, history: [], origin: null, reports: new Set() }).replace(/\r\n /g, "");
  expect(ics).toContain("DTSTART;VALUE=DATE:20261018\r\nDTEND;VALUE=DATE:20261019");
  expect(ics).toContain("The NFL has not set a kickoff time yet.");
  expect(ics).not.toContain("URL:");
});

test("the feed is served as a calendar and Game Day offers the four ways to add it", async ({ page, request }) => {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), ".next", "prerender-manifest.json"), "utf8"));
  expect(Object.hasOwn(manifest.routes, "/jets.ics")).toBe(false);
  const response = await request.get("/jets.ics");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/calendar");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).toContain(`X-WR-CALNAME:Jets ${snapshot.season}`);
  await page.goto("/game-day#season");
  const calendar = page.locator("#season details[data-calendar]");
  await calendar.locator("summary").click();
  await expect(calendar.getByRole("link", { name: "Apple Calendar" })).toHaveAttribute("href", /^webcal:\/\/.+\/jets\.ics$/);
  await expect(calendar.getByRole("link", { name: /Google Calendar/ })).toHaveAttribute("href", /calendar\.google\.com\/calendar\/render\?cid=webcal/);
  await expect(calendar.getByRole("link", { name: /Outlook/ })).toHaveAttribute("href", /outlook\.live\.com\/calendar\/0\/addfromweb\?url=http/);
  await expect(calendar.getByRole("button", { name: "Copy the address" })).toBeVisible();
});
