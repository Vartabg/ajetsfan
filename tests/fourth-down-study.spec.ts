import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import catalog from "../src/lib/fourth-down-model.json";
import { actualFourthDownCall, decisionPercent, decisionSignature, fourthDownPath, probabilityPrecision, validDecisionOdds } from "../src/lib/fourth-down-study";
import { parseSnapSeason } from "../src/lib/snap-data";

const cleveland = "2022_02_NYJ_CLE";
const buffalo = "2026_10_BUF_NYJ";
const base = fourthDownPath;
const playUrl = (game: string, play: string) => base + "?game=" + game + "&play=" + play;
const c = playUrl(cleveland, "2938");
const snapGame = (game: string) => {
  const year = Number(game.slice(0, 4));
  const file = readFileSync("public/data/snaps/" + year + ".json.gz");
  return parseSnapSeason(gunzipSync(file).toString("utf8"), year).find(g => g.id === game)!;
};
const leakedResult = /Zuerlein|57[- ]yard field goal|Jets tried a field goal|0\.240172963501649|0\.257611477652016|0\.26901018833671|\b(?:24\.0|25\.8|26\.9)%|Highest estimate/i;

test("model rows preserve upstream odds, source identity and archive eligibility", () => {
  const jets = snapGame(cleveland);
  const play = jets.plays.find(p => p.key === "2938")!;
  const row = catalog.rows.find(r => r.game === jets.id && r.play === play.key)!;
  expect(catalog.source.sha256).toBe("455ce01ad3328dae9052025bbd3387ea5ef99341d23b41005d2c0522a836e618");
  expect(catalog.rows.every(validDecisionOdds)).toBe(true);
  expect(new Set(catalog.rows.map(r => r.game + "/" + r.play)).size).toBe(catalog.rows.length);
  expect([row.go, row.punt, row["field-goal"]]).toEqual([0.2401729635016494, 0.2576114776520169, 0.26901018833671003]);
  expect(actualFourthDownCall(jets, play)).toBe("field-goal");
  expect(decisionSignature(jets, play, "field-goal")).toBe(row.signature);
  expect(decisionSignature(jets, { ...play, distance: 12 }, "field-goal")).not.toBe(row.signature);
  expect(decisionSignature({ ...jets, home: !jets.home }, play, "field-goal")).not.toBe(row.signature);
  expect(actualFourthDownCall({ ...jets, source: "espn" }, play)).toBeNull();
  expect(actualFourthDownCall(jets, { ...play, clock: null })).toBeNull();
  expect(actualFourthDownCall(jets, { ...play, possession: "opponent" })).toBeNull();
  expect(validDecisionOdds({ ...row, punt: Number.NaN })).toBe(false);
  expect(validDecisionOdds({ ...row, go: 1.01 })).toBe(false);
  expect(probabilityPrecision({ ...row, go: 0.1912, punt: 0.1913 })).toBe(2);
  expect(decisionPercent(0.999999, 1)).toBe(">99.9%");
  expect(decisionPercent(0.000001, 2)).toBe("<0.01%");
  const bills = snapGame(buffalo);
  const run = bills.plays.find(p => p.key === "949")!;
  expect(actualFourthDownCall(bills, run)).toBe("go");
  expect(catalog.rows.find(r => r.game === buffalo && r.play === "949")).toMatchObject({
    go: 0.15584766237502548, punt: 0.11753560551547357, "field-goal": 0.12889162479292338,
  });
  expect(actualFourthDownCall(jets, jets.plays.find(p => p.key === "731")!)).toBeNull(); // Fake punt formation.
  expect(actualFourthDownCall(bills, bills.plays.find(p => p.key === "925")!)).toBeNull(); // No play.
  expect(catalog.rows.some(r => r.game === buffalo && r.play === "1114")).toBe(false); // Missing punt estimate.
});

test("setup keeps the coach's call and model values out of HTML, Flight, and prefetches", async ({ page, request }) => {
  const [html, flight] = await Promise.all([request.get(base), request.get(c, { headers: { RSC: "1" } })]);
  expect(html.status()).toBe(200);
  expect(html.headers()["content-type"]).toContain("text/html");
  expect(flight.headers()["content-type"]).toContain("text/x-component");
  for (const response of [html, flight]) {
    const payload = await response.text();
    expect(payload).not.toMatch(leakedResult);
    expect(payload).not.toContain("deaf720a68c390f67b91baea");
    expect(payload).not.toMatch(/fourth-down-model\.json|go_boost|0\.165106161471056/);
  }
  const fetched: string[] = [];
  page.on("request", req => {
    const url = new URL(req.url());
    if (url.pathname === base && url.searchParams.has("call") || /\/data\/(?:snaps|participation)\/|fourth-down-model\.json|\/frames$/.test(url.pathname)) fetched.push(req.url());
  });
  await page.goto(base);
  const study = page.locator("#fourth-down");
  await expect(study).toContainText("Fourth and 15 at the Cleveland 39");
  await expect(study).toContainText("Jets 14");
  await expect(study).toContainText("Browns 17");
  await expect(study).toContainText("Q4 · 14:24");
  await expect(study.getByRole("table")).toHaveCount(0);
  await study.getByRole("button", { name: "Field goal" }).hover();
  await page.waitForLoadState("networkidle");
  expect(fetched).toEqual([]);
});

test.describe("native fourth-down decisions", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });

  test("each call reveals the same evidence and the next decision opens blind", async ({ page }) => {
    const study = page.locator("#fourth-down");
    for (const [name, call] of [["Go for it", "go"], ["Punt", "punt"], ["Field goal", "field-goal"]]) {
      await page.goto(c);
      await study.getByRole("button", { name, exact: true }).press("Enter");
      await expect(page).toHaveURL(url => url.searchParams.get("call") === call && url.searchParams.get("play") === "2938");
      const odds = study.getByRole("table");
      await expect(odds.getByRole("row", { name: /Go for it/ })).toContainText("24.0%");
      await expect(odds.getByRole("row", { name: /Punt/ })).toContainText("25.8%");
      await expect(odds.getByRole("row", { name: /Field goal/ })).toContainText("26.9%");
      await expect(study).toContainText("G. Zuerlein makes a 57-yard field goal");
      await expect(study.getByRole("link", { name: "See the play in Xs & Os" })).toHaveAttribute("href", "/replay/" + cleveland + "/read?play=2938&phase=action");
    }
    await page.reload();
    await expect(study.getByRole("table")).toBeVisible();
    await study.getByRole("link", { name: "Next decision" }).click();
    await expect(page).toHaveURL(url => url.searchParams.get("game") !== cleveland && !url.searchParams.has("call"));
    await expect(study.getByRole("table")).toHaveCount(0);
    await study.getByRole("link", { name: "Previous decision" }).click();
    await expect(page).toHaveURL(url => url.searchParams.get("game") === cleveland && url.searchParams.get("play") === "2938" && !url.searchParams.has("call"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("the full pool accepts direct out-of-range links and abstains on missing or unverified calls", async ({ page }) => {
  const study = page.locator("#fourth-down");
  await page.goto(c);
  await study.getByRole("link", { name: "All modeled decisions" }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("pool") === "all");
  await page.goto(playUrl(cleveland, "199"));
  await expect(study).toContainText("Fourth and 1 at the Jets’ 40");
  await study.getByRole("button", { name: "Punt", exact: true }).click();
  await expect(study).toContainText("The Jets punted.");
  await expect(study.getByRole("table")).toContainText("28.9%");
  await page.goto(playUrl(buffalo, "1114") + "&call=go");
  await expect(study).toContainText("does not publish a punt estimate");
  await expect(study.getByRole("table")).toHaveCount(0);
  await page.goto(playUrl(buffalo, "925") + "&call=punt");
  await expect(study).toContainText("No three-choice comparison");
  await expect(study.getByRole("table")).toHaveCount(0);
  const invalid = await page.request.get(c + "&call=go&call=punt");
  expect(invalid.status()).toBe(404);
});
