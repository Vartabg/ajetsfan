import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { davisCasePlay, davisGame, davisPlay } from "../src/app/film-room/replay/davis-cleveland/record";
import { parseSnapSeason } from "../src/lib/snap-data";
import { participationProvenance } from "../src/lib/snap-participation";
import type { Snap } from "../src/lib/snap-types";

const study = "/film-room/replay/davis-cleveland";
const reveal = study + "?phase=action";
const record = "/plays/" + davisGame + "/" + davisPlay;
const laterEvidence = /Cooper|intercept(?:ed|ion)|the pick|Jets 36|NYJ 36|14 yards|14-yard|Flacco|0:06|kneel|data-davis-path|victory-over-browns|win-against-cleveland/i;

test("the Davis case needs the recorded return and the immediately following Jets kneel", () => {
  const archive = parseSnapSeason(gunzipSync(readFileSync("public/data/snaps/2022.json.gz")).toString(), 2022);
  const game = archive.find(entry => entry.id === davisGame)!;
  const play = davisCasePlay(game)!;
  expect(play.key).toBe(davisPlay);
  const next = game.plays[game.plays.indexOf(play) + 1];
  expect(next.key).toBe("4307");
  const withPlays = (...plays: Snap[]) => davisCasePlay({ ...game, plays });
  expect(withPlays(play, next)).toBe(play);
  expect(davisCasePlay({ ...game, id: "2022_02_NYJ_BUF" })).toBeNull();
  expect(withPlays({ ...play, description: play.description.replace("at NYJ 36", "at NYJ 35") }, next)).toBeNull();
  expect(withPlays({ ...play, facts: { ...play.facts, target: undefined } }, next)).toBeNull();
  expect(withPlays(play)).toBeNull();
  expect(withPlays(play, { ...next, key: "4300", possession: "opponent" }, next)).toBeNull();
  const wrongKneels: Array<Partial<Snap>> = [
    { key: "4306" }, { possession: "opponent" }, { quarter: 3 }, { clock: 5 }, { yardline: 49 },
    { type: "pass" }, { facts: { ...next.facts, kind: "rush" } },
  ];
  for (const change of wrongKneels) expect(withPlays(play, { ...next, ...change })).toBeNull();
});

test("opening and rewinding omit the result from HTML and Flight", async ({ request, page }) => {
  for (const [headers, type] of [[{}, "text/html"], [{ RSC: "1" }, "text/x-component"]] as const) {
    const response = await request.get(study, { headers });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(type);
    const body = await response.text();
    expect(body).toContain("Ashtyn Davis");
    expect(body).toContain("data-davis-phase");
    expect(body).not.toMatch(laterEvidence);
  }
  const requests: string[] = [];
  page.on("request", resource => {
    const url = new URL(resource.url());
    if (url.pathname === study && url.searchParams.get("phase") === "action") requests.push(url.href);
  });
  await page.goto(study);
  const control = page.getByRole("link", { name: "Reveal the play" });
  await control.hover();
  await expect(page.getByRole("img", { name: /Davis, number 21/ })).toBeVisible();
  expect(requests).toEqual([]);
  await control.click();
  await expect(page.locator("#case")).toContainText("Amari Cooper");
  await page.getByRole("link", { name: "Back to the snap" }).click();
  await expect(page.locator("#case")).not.toContainText(laterEvidence);
  await expect(page.locator('[data-davis-phase="snap"]')).toBeVisible();
});

test("both entry points lead to the setup and the revealed record names its sources", async ({ page }) => {
  for (const entry of ["/film-room", record]) {
    await page.goto(entry);
    await page.locator('a[href="' + study + '"]').click();
    await expect(page.locator('[data-davis-phase="snap"]')).toBeVisible();
  }
  await page.goto(reveal);
  const sources = page.locator("#sources");
  await expect(sources.getByRole("link", { name: /Jets at Browns gamebook, page 14/ }))
    .toHaveAttribute("href", /static\.www\.nfl\.com\/.+\.pdf#page=14$/);
  await expect(sources.getByRole("link", { name: /Jack Bell/ })).toHaveAttribute("href", /newyorkjets\.com\/news\/5-plays-that-made-a-difference-in-jets-victory-over-browns$/);
  await expect(sources.getByRole("link", { name: /snap-count report/ })).toHaveAttribute("href", /newyorkjets\.com\/news\/snap-count-analysis-.+-against-cleveland$/);
  const provenance = participationProvenance(2022);
  await expect(sources.getByRole("link", { name: provenance.provider })).toHaveAttribute("href", provenance.sourceUrl);
  await expect(sources.getByRole("link", { name: provenance.license })).toHaveAttribute("href", provenance.licenseUrl);
  await expect(sources.getByRole("link", { name: "Play-by-play record" })).toHaveAttribute("href", record);
  await expect(page.getByRole("link", { name: "Open the full replay" })).toHaveAttribute("href", "/replay/" + davisGame + "?play=" + davisPlay + "&pace=all");
});

test.describe("Davis without JavaScript", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 780 } });

  test("a phone reader can reveal the throw and return by keyboard, then rewind", async ({ page }) => {
    await page.goto(study);
    const moment = page.locator("#case");
    await expect(moment).toContainText("Jeff Ulbrich");
    await expect(moment).toContainText("Cleveland’s own 46");
    await expect(moment).toContainText("0:13");
    await expect(moment).not.toContainText(laterEvidence);
    const board = moment.getByRole("img");
    for (const unit of ["O", "X"]) await expect(board.locator('[data-davis-unit="' + unit + '"]')).toHaveCount(11);
    await expect(board.locator("[data-davis-path]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const control = moment.getByRole("link", { name: "Reveal the play" });
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(url => url.pathname === study && url.searchParams.get("phase") === "action");
    await expect(moment).toContainText("deep to his left for Amari Cooper");
    await expect(moment).toContainText("at the Jets 36");
    await expect(moment).toContainText("14 yards to midfield");
    await expect(moment).toContainText("six seconds left");
    await expect(board.locator("[data-davis-path]")).toHaveCount(2);
    for (const unit of ["O", "X"]) await expect(board.locator('[data-davis-unit="' + unit + '"]')).toHaveCount(11);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await moment.getByRole("link", { name: "Back to the snap" }).press("Enter");
    await expect(page).toHaveURL(url => url.pathname === study && url.search === "");
    await expect(moment).not.toContainText(laterEvidence);
    await expect(board.locator("[data-davis-path]")).toHaveCount(0);
  });
});
