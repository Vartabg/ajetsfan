import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseSnapSeason } from "../src/lib/snap-data";
import { clockCandidates, lateGameMatches, situationMatches, situationRules } from "../src/lib/snap-explorer";
import type { Snap, SnapGame } from "../src/lib/snap-types";

const clevelandId = "2022_02_NYJ_CLE";
const clevelandPath = "/plays/" + clevelandId;
const wilsonPath = clevelandPath + "/4199";
const davisPath = clevelandPath + "/4276";
const buffaloPath = "/plays/2026_10_BUF_NYJ/2511";
const cutoffs = [
  { below: 1, wins: 1, losses: 134 },
  { below: 5, wins: 2, losses: 179 },
  { below: 10, wins: 5, losses: 194 },
];

function readSeason(year: number) {
  const json = gunzipSync(readFileSync(`public/data/snaps/${year}.json.gz`)).toString("utf8");
  return parseSnapSeason(json, year);
}

const cleveland = readSeason(2022).find(game => game.id === clevelandId)!;
const wilson = cleveland.plays.find(play => play.key === "4199")!;

test("the archived two-minute cutoffs count distinct games and link the exact lowest estimate", () => {
  const games = Array.from({ length: 28 }, (_, i) => readSeason(1999 + i)).flat();
  for (const { below, wins, losses } of cutoffs) {
    const { eligible, matches } = lateGameMatches(games, below);
    expect(eligible).toBe(428);
    expect(matches.filter(match => match.won)).toHaveLength(wins);
    expect(matches.filter(match => !match.won)).toHaveLength(losses);
    expect(new Set(matches.map(match => match.game.id)).size).toBe(wins + losses);
    expect(matches.every(({ game, play }) => game.id.slice(0, 4) <= "2025" && play.wp! < below / 100)).toBe(true);
    const witness = matches.find(match => match.game.id === clevelandId);
    expect(witness?.play).toMatchObject({ key: "3866", quarter: 4, clock: 115, wp: 0.007 });
  }
});

test("strict cutoffs admit a qualifying snap at 2:00 and exclude 0:00, overtime and missing estimates", () => {
  for (const { below } of cutoffs) {
    const cutoff = below / 100;
    const boundary = { ...wilson, key: "1", clock: 120, wp: cutoff };
    const excluded: Snap[] = [
      { ...boundary, key: "2", clock: 121, wp: 0 },
      { ...boundary, key: "3", clock: 0, wp: 0 },
      { ...boundary, key: "4", quarter: 5, wp: 0 },
      { ...boundary, key: "5", type: "no_play", wp: 0 },
      { ...boundary, key: "6", wp: null },
      { ...boundary, key: "7", clock: null, wp: 0 },
    ];
    const cohort = (plays: Snap[]) => lateGameMatches([{ ...cleveland, plays }], below);
    expect(cohort(excluded)).toEqual({ eligible: 0, matches: [] });
    expect(cohort([...excluded, boundary])).toEqual({ eligible: 1, matches: [] });
    const justBelow = { ...boundary, key: "8", wp: (below * 10 - 1) / 1000 };
    const tiedLow = { ...justBelow, key: "9", clock: 1 };
    expect(cohort([...excluded, boundary, justBelow, tiedLow]).matches.map(match => match.play.key)).toEqual(["8"]);
  }
});

test("similar situations require the selected pre-play fields and a strictly earlier game day", () => {
  const rules = situationRules({ window: "60", margin: "0", possession: "same", down: "same", distance: "0" }, wilson);
  const earlier: SnapGame = { ...cleveland, id: "2016_14_NYJ_SF", date: "2016-12-11", plays: [
    { ...wilson, key: "1", clock: wilson.clock! + 10 },
    { ...wilson, key: "2", clock: wilson.clock! + 1 },
    { ...wilson, key: "3", clock: wilson.clock! - 1 },
  ] };
  const missingFields: Partial<Snap>[] = [
    { before: null }, { possession: null }, { distance: null }, { down: null }, { clock: null }, { quarter: 3 },
  ];
  const candidates = [
    { ...earlier, id: cleveland.id },
    { ...earlier, id: "2022_02_NYJ_BUF", date: cleveland.date },
    { ...earlier, id: "2022_03_NYJ_BUF", date: "2022-09-19" },
    { ...earlier, id: "2015_13_NYJ_NYG", plays: missingFields.map((field, i) => ({ ...wilson, ...field, key: String(i + 1) })) },
    { ...earlier, id: "2010_09_NYJ_DET", plays: [{ ...wilson, before: wilson.after }] }, earlier,
  ];
  const { eligible, matches } = situationMatches(candidates, cleveland, wilson, rules);
  expect(eligible).toBe(2);
  expect(matches.map(({ game, play }) => [game.id, play.key])).toEqual([[earlier.id, "2"]]);
});

test("a stopped broadcast clock has distinct source plays and never suggests a later clock", () => {
  for (const seconds of [22, 21]) {
    expect(clockCandidates(cleveland.plays, 4, seconds).map(play => play.key)).toEqual(["4224", "4240", "4255"]);
  }
  expect(clockCandidates(cleveland.plays, 4, 13).map(play => play.key)).toEqual(["4276"]);
  expect(clockCandidates(cleveland.plays, 5, 13)).toEqual([]);
});

test("the shared touchdown HTML, navigation payload and preview stop before the extra point", async ({ page, request }) => {
  const response = await page.goto(wilsonPath);
  expect(response?.status()).toBe(200);
  const flight = await request.get(wilsonPath, { headers: { RSC: "1" } });
  expect(flight.headers()["content-type"]).toContain("text/x-component");
  for (const payload of [await response!.text(), await flight.text()]) {
    expect(payload).toContain("G.Wilson for 15 yards, TOUCHDOWN");
    expect(payload).not.toMatch(/Zuerlein extra point is GOOD|INTERCEPTED by 21-A\.Davis|Flacco kneels to NYJ 49|31[–-]30|data-wear=/);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Garrett Wilson catches the touchdown.");
  await expect(page.getByLabel("Score after this play", { exact: true }).locator("strong")).toHaveText(["30", "30"]);
  const chart = page.getByRole("img", { name: "Estimated Jets win probability before each recorded play through Q4 0:25." });
  const trace = await chart.locator("path").getAttribute("d");
  const prefix = cleveland.plays.slice(0, cleveland.plays.indexOf(wilson) + 1);
  expect(trace?.match(/[ML]/g)).toHaveLength(prefix.filter(play => play.wp !== null).length);
  await expect(page.getByRole("link", { name: /Study Wilson’s catch/ })).toHaveAttribute("href", "/film-room/replay/wilson-cleveland");
  await expect(page).toHaveTitle("Follow a Jets play · ajetsfan");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Follow a Jets play · ajetsfan");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /through your selected play/);
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", "A recorded Jets play on ajetsfan");
  const preview = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  const localImage = new URL(preview!, page.url());
  expect(localImage.pathname).toMatch(/^\/plays\/opengraph-image/);
  const image = await request.get(localImage.pathname + localImage.search);
  expect(image.headers()["content-type"]).toContain("image/png");
  expect((await image.body()).readUInt32BE(16)).toBe(1200);
  await page.goto(buffaloPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Allen to Kincaid for 54 yards.");
  await expect(page.getByLabel("Score after this play", { exact: true }).locator("strong")).toHaveText(["9", "10"]);
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", preview!);
  await expect(page.getByRole("link", { name: /Study Wilson’s catch/ })).toHaveCount(0);
});

test("unknown source IDs return a neutral 404 without selecting an adjacent recorded play", async ({ request }) => {
  for (const key of ["4200", "4199x"]) {
    const response = await request.get(clevelandPath + "/" + key);
    expect(response.status()).toBe(404);
    expect(new URL(response.url()).pathname).toBe(clevelandPath + "/" + key);
    expect(await response.text()).not.toMatch(/G.Wilson for 15 yards, TOUCHDOWN|INTERCEPTED by 21-A\.Davis|31[–-]30/);
  }
});

for (const [device, width] of [["phone", 360], ["desktop", 1280]] as const) {
  test.describe(device, () => {
    test.use({ viewport: { width, height: 820 }, hasTouch: device === "phone", isMobile: device === "phone" });
    test("a fan can follow a stopped TV clock, advance to Davis and reopen a shared link", async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: async (url: string) => sessionStorage.setItem("copied-play", url) },
      }));
      const follow = await page.goto("/game-day/follow");
      expect(await follow!.text()).not.toMatch(/G.Wilson for 15 yards, TOUCHDOWN|INTERCEPTED by 21-A\.Davis|31[–-]30|data-wear=/);
      const pilot = page.getByRole("link", { name: "Cleveland · 2022", exact: true });
      await expect(pilot).toHaveAttribute("href", clevelandPath + "/start");
      await pilot.press("Enter");
      await expect(page).toHaveURL(new RegExp(clevelandPath + "/41$"));
      await expect(page.getByRole("link", { name: "Previous play" })).toHaveCount(0);
      await page.locator("summary").filter({ hasText: "Match my TV clock" }).press("Enter");
      await page.getByLabel("Period", { exact: true }).selectOption("4");
      await page.getByLabel("Time remaining").fill("0:22");
      await page.getByRole("button", { name: "Find this clock" }).press("Enter");
      const choices = page.getByRole("link", { name: /^Q4 0:22 · Play/ });
      await expect(choices).toHaveCount(3);
      expect(await choices.evaluateAll(links => links.map(link => link.getAttribute("href")))).toEqual(
        ["4224", "4240", "4255"].map(key => clevelandPath + "/" + key));
      await choices.nth(2).press("Enter");
      await expect(page).toHaveURL(new RegExp(clevelandPath + "/4255$"));
      const next = page.getByRole("link", { name: "Next play", exact: true });
      await expect(next).toHaveAttribute("href", davisPath);
      await next.press("Enter");
      await expect(page).toHaveURL(new RegExp(davisPath + "$"));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ashtyn Davis intercepts Brissett.");
      await expect(page.getByRole("link", { name: /Study Wilson’s catch/ })).toHaveCount(0);
      const copy = page.getByRole("button", { name: "Copy play link" });
      if (device === "phone") await copy.tap();
      else await copy.press("Enter");
      await expect(page.getByText("Link copied.", { exact: true })).toBeVisible();
      const copied = await page.evaluate(() => sessionStorage.getItem("copied-play"));
      expect(copied).toBe(new URL(davisPath, page.url()).href);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(clevelandPath + "/4255$"));
      await page.goto(copied!);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ashtyn Davis intercepts Brissett.");
      const previous = page.getByRole("link", { name: "Previous play" });
      await expect(previous).toHaveAttribute("href", clevelandPath + "/4255");
      await previous.press("Enter");
      await expect(page).toHaveURL(new RegExp(clevelandPath + "/4255$"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  });
}

test("retrospective controls keep distinct-game denominators, outcome filters and bounded evidence pages", async ({ page }) => {
  await page.goto("/plays");
  const controls = page.getByRole("navigation", { name: "Jets win probability cutoff" });
  const list = page.getByRole("list", { name: "Matching game evidence" });
  for (const { below, wins, losses } of cutoffs) {
    await controls.getByRole("link", { name: "Below " + below + "%", exact: true }).click();
    await expect(page.getByRole("heading", { level: 3 })).toHaveText(`${wins} ${wins === 1 ? "win" : "wins"} and ${losses} losses.`);
    await expect(page.locator("#matches")).toContainText(`${wins + losses} matching games among 428`);
    await expect(list.getByRole("listitem")).toHaveCount(8);
  }
  await page.getByRole("link", { name: "Wins", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(list.getByRole("link", { name: /Browns/ })).toHaveAttribute("href", clevelandPath + "/3866");
  await page.getByRole("link", { name: "Losses", exact: true }).click();
  const hrefs = () => list.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")));
  const first = await hrefs();
  await page.getByRole("link", { name: "Next results" }).click();
  await expect(page.getByRole("navigation", { name: "Matching game pages" })).toContainText("Page 2 of");
  expect(new Set([...first, ...await hrefs()]).size).toBe(16);
});

test("the selected snap can compare and adjust earlier situations with JavaScript disabled", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 360, height: 820 } });
  try {
    const page = await context.newPage();
    await page.goto(wilsonPath);
    await page.getByRole("link", { name: "Find games like this" }).click();
    const matches = page.locator("#matches");
    await expect(matches.getByRole("heading")).toHaveText("6 wins and 27 losses.");
    await expect(matches).toContainText("33 matching games among 375");
    const cases = page.getByRole("list", { name: "Matching game evidence" }).getByRole("link");
    await expect(cases.first()).toHaveAttribute("href", "/plays/2016_14_NYJ_SF/3817");
    await page.getByLabel("Clock in the same period").selectOption("quarter");
    await page.getByLabel("Jets score margin").selectOption("any");
    await page.getByLabel("Possession").selectOption("any");
    await page.getByLabel("Down", { exact: true }).selectOption("any");
    await page.getByLabel("Yards to go").selectOption("any");
    await page.getByRole("button", { name: "Compare games" }).press("Enter");
    await expect(matches.getByRole("heading")).toHaveText("168 wins and 213 losses.");
    await expect(matches).toContainText("381 matching games among 381");
    await expect(cases).toHaveCount(8);
    await expect(cases.first()).toHaveAttribute("href", "/plays/2021_16_JAX_NYJ/4026");
    await cases.first().click();
    await expect(page).toHaveURL(/\/plays\/2021_16_JAX_NYJ\/4026$/);
    await expect(page.getByRole("link", { name: "Previous play" })).toBeVisible();
  } finally {
    await context.close();
  }
});
