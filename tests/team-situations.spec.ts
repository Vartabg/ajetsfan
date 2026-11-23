import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { mergeResults, type CurrentSnapshot } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import { publishedGames } from "../src/lib/published-pages";
import type { Snap, SnapGame } from "../src/lib/snap-types";
import { teamSituations, type SituationSettings } from "../src/lib/team-situations";

const edition: CurrentSnapshot = JSON.parse(readFileSync("public/data/current.json","utf8"));
const archived: Game[] = JSON.parse(readFileSync("public/data/games.json","utf8"));
const fixtures = mergeResults(publishedGames(archived,edition),edition);
const games: SnapGame[] = JSON.parse(gunzipSync(readFileSync("public/data/snaps/2026.json.gz")).toString()).games;
const settings: SituationSettings = {season:2026,side:"offense",sample:"red-zone",window:"season",page:1};
function play(key: string, fields: Partial<Snap> = {}): Snap {
  return {key,quarter:1,clock:300,possession:"jets",down:1,distance:10,yardline:12,before:[0,0],after:[0,0],
    drive:1,wp:null,delta:null,type:"run",description:"Hall rushes for two yards.",facts:{kind:"rush",yards:2,touchdown:false,firstDown:false},...fields};
}
function counts(plays: Snap[], options: Partial<SituationSettings> = {}) {
  const game = {...games[0],final:null,plays};
  const fixture = fixtures.find(f => f.id === game.id)!;
  return teamSituations([fixture],[game],{...settings,...options});
}
test.describe("Team Stats model", () => {
  test("one red-zone trip spans repeated snaps, a backed-up finish and the adjudicated outcome", () => {
    const entry = play("1"), outside = play("3",{down:4,yardline:23,type:"pass",before:[0,0],after:[6,0],facts:{},
      description:"Smith pass to Wilson at the 1. The play was REVERSED. Smith pass to Wilson for 23 yards, TOUCHDOWN. Penalty on DET-4-Reed, interference, declined."});
    const report = counts([entry,play("2"),outside]);
    expect(report.season.rows["red-zone"]).toMatchObject({positive:1,total:1,unknown:0});
    expect(report.examples.map(r => r.play.key)).toEqual(["3"]);
    const noTrip = counts([outside]);
    expect(noTrip.season.rows["red-zone"].total).toBe(0);
    expect(noTrip.redZoneGames[0]).toMatchObject({covered:true,trips:[]});
    const afterThePlay = play("gb",{down:1,yardline:5,type:"pass",facts:{},after:[6,0],
      description:"Smith pass to Wilson for 5 yards, TOUCHDOWN. PENALTY on NYJ, Unsportsmanlike Conduct, enforced between downs."});
    expect(counts([afterThePlay]).season.rows["red-zone"]).toMatchObject({positive:1,total:1});
    for (const candidate of [
      {...outside,description:"Smith pass to Wilson for 23 yards, TOUCHDOWN. Penalty enforced, No Play."},
      {...outside,description:"Smith pass to Wilson for 23 yards, TOUCHDOWN. The play was REVERSED. Incomplete."},
      {...outside,description:"Smith pass to Wilson for 23 yards, TOUCHDOWN.",after:null},
      {...outside,description:"Smith pass to Wilson for 21 yards, TOUCHDOWN."},
    ]) expect(counts([entry,candidate]).season.rows["red-zone"]).toMatchObject({positive:0,total:0,unknown:1});
  });
  test("turnovers, defensive TDs and known non-scoring drive endings stay distinct from unresolved trips", () => {
    const turnover = play("2",{down:3,type:"pass",after:[0,6],facts:{kind:"interception",turnovers:["interception"]},
      description:"Pass intercepted and returned for a TOUCHDOWN."});
    const fieldGoal = play("3",{type:"field_goal",down:4,after:[3,0],facts:{kick:{kind:"fieldGoal",outcome:"made"}}});
    for (const end of [turnover,fieldGoal]) {
      const report = counts([play("1"),end]);
      expect(report.season.rows["red-zone"]).toMatchObject({positive:0,total:1,unknown:0});
      expect(report.examples[0].play.key).toBe(end.key);
    }
    expect(counts([play("1"),play("2",{possession:"opponent",drive:2,yardline:90})]).season.rows["red-zone"].total).toBe(1);
    const unresolved = counts([play("1",{before:null,after:null}),play("2",{drive:null,after:null,before:null})]);
    expect(unresolved.season.rows["red-zone"]).toMatchObject({total:0,unknown:1});
    expect(unresolved.redZoneGames[0].trips[0]).toMatchObject({result:null,play:{key:"1"}});
    const fourth = play("1",{down:4,facts:{turnovers:["downs"],kind:"rush",firstDown:false}});
    expect(counts([fourth]).examples[0].outcome).toBe("Turnover on downs");
    expect(counts([play("1",{drive:null})]).season.rows["red-zone"]).toMatchObject({total:0,unknown:0});
  });
  test("the season and recent window select confirmed fixtures before checking replay coverage", () => {
    const confirmed = [...fixtures].filter(f => f.season===2026 && f.seasonType==="REG" && f.week <= 5);
    const later = {...confirmed.at(-1)!,id:"latest-final",date:"2027-01-02",outcome:"tie" as const,jetsScore:14,oppScore:14};
    const postseason = {...later,id:"a-postseason-game",seasonType:"POST"};
    const report = teamSituations([...confirmed,later,postseason],games.filter(g => g.id!==confirmed.at(-1)?.id),settings);
    expect(report.season).toMatchObject({selected:6,covered:4,through:"2027-01-02"});
    expect(report.recent).toMatchObject({selected:4,covered:2,through:"2027-01-02"});
    expect(report.redZoneGames.map(g => [g.game.id,g.covered])).toEqual([
      [confirmed[2].id,true],[confirmed[3].id,true],[confirmed[4].id,false],[later.id,false],
    ]);
    expect(report.redZoneGames.at(-1)!.trips).toEqual([]);
    expect(report.examples.every(r => r.game.seasonType === "REG" && games.some(g => g.id===r.game.id))).toBe(true);
    const short = teamSituations(confirmed.slice(0,2),games,settings);
    expect(short.recent).toMatchObject({selected:2,covered:2});
  });
  test("official third-down decisions take precedence, with a separate fallback for legacy rows", () => {
    const third = {down:3};
    const report = counts([
      play("1",{...third,type:"no_play",facts:{thirdDownResult:"converted"}}),
      play("2",{...third,facts:{thirdDownResult:"failed",firstDown:true,kind:"rush"}}),
      play("3",{...third,facts:{thirdDownResult:"no-attempt",firstDown:true,kind:"rush"}}),
      play("4",{...third,facts:{kind:"completion",firstDown:false}}),
      play("5",{...third,facts:{kind:"rush",firstDown:true}}),
      play("6",{...third,facts:{kind:"incompletion"}}),
    ],{sample:"third-down"});
    expect(report.season.rows["third-down"]).toMatchObject({positive:1,total:2,unknown:3});
    expect(report.examples.map(r => r.play.key)).toEqual(["1","2"]);
    const legacy = counts([play("4",{...third,facts:{kind:"completion",firstDown:false}}),
      play("5",{...third,facts:{kind:"rush",firstDown:true}}),play("6",{...third,facts:{kind:"incompletion"}})],{sample:"third-down"});
    expect(legacy.season.rows["third-down"]).toMatchObject({positive:1,total:2,unknown:1});
  });
  test("statistical credits preserve play calling, yards and confirmed offensive scores on flagged snaps", () => {
    const first = play("1",{type:null,facts:{statCall:"dropback",statYards:6},description:"Flag on the defense."});
    const finish = play("2",{yardline:6,type:"run",after:[6,0],facts:{statCall:"run",statYards:6,statTouchdown:true},
      description:"Scoring play confirmed after an official review."});
    const report = counts([first,finish]);
    expect(report.season.rows["red-zone-calls"]).toMatchObject({positive:1,total:2,yards:12,yardPlays:2});
    expect(report.season.rows["red-zone"]).toMatchObject({positive:1,total:1});
    const conflict = counts([first,{...finish,after:[0,6]}]);
    expect(conflict.season.rows["red-zone"]).toMatchObject({positive:0,total:0,unknown:1});
  });
  test("clock and score splits use the pre-play score, credited gains and dropbacks", () => {
    const p = (key:string, fields:Partial<Snap>) => play(key,{quarter:4,clock:120,down:2,...fields});
    const report = counts([
      p("1",{facts:{kind:"sack",yards:-5},type:"pass",before:[14,14],after:[14,21]}),
      p("2",{facts:{kind:"rush",yards:7},description:"Smith scrambles left.",before:[7,15]}),
      p("3",{facts:{kind:"rush"},before:[7,16],clock:121}),
      p("4",{quarter:2,clock:0,facts:{kind:"incompletion",yards:0}}),
      p("5",{clock:null,before:null}), p("6",{clock:120,before:[0,0],facts:{kind:"kneel",yards:-1}}),
      p("7",{facts:{kind:"spike",yards:0}}), p("8",{quarter:1,clock:120,down:3,facts:{kind:"completion"}}),
    ]);
    expect(report.season.rows["close-fourth"]).toMatchObject({total:2,dropbacks:2,yards:2,yardPlays:2});
    expect(report.season.rows["two-minute"]).toMatchObject({total:3,dropbacks:3,yards:2,yardPlays:3});
    expect(report.season.rows["early-downs"]).toMatchObject({total:5,dropbacks:3,yards:4,yardPlays:4});
    expect(report.season.rows["red-zone-calls"]).toMatchObject({total:6,dropbacks:4});
    expect(report.season.rows["third-down"]).toMatchObject({total:0,unknown:1});
    expect(counts([p("9",{quarter:1,down:3,facts:{kind:"rush",firstDown:false}})]).season.rows["third-down"]).toMatchObject({total:1,positive:0});
  });
  test("the first ten verified 2026 games reproduce both units’ rates and preserve the linked play order", () => {
    const selected = fixtures.filter(f => f.season===2026 && f.week<=10);
    for (const [side,seasonTrip,recentTrip,third,recentThird] of [
      ["offense",[11,29],[5,14],[43,126],[16,49]],
      ["defense",[24,35],[13,14],[49,121],[20,44]],
    ] as const) {
      const report = teamSituations(selected,games,{...settings,side,window:"recent"});
      const fraction = (row:{positive:number;total:number}) => [row.positive,row.total];
      expect(fraction(report.season.rows["red-zone"])).toEqual(seasonTrip);
      expect(fraction(report.recent.rows["red-zone"])).toEqual(recentTrip);
      expect(fraction(report.season.rows["third-down"])).toEqual(third);
      expect(fraction(report.recent.rows["third-down"])).toEqual(recentThird);
      expect(report.examples).toHaveLength(6);
      if(side==="offense") expect(report.examples.slice(0,2).map(r => r.play.key)).toEqual(["2055","2456"]);
      const page2 = teamSituations(selected,games,{...settings,side,window:"recent",page:2});
      const ids = [...report.examples,...page2.examples].map(r => r.game.id+"/"+r.play.key);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

test.describe("Team Stats page", () => {
  test.use({javaScriptEnabled:false,viewport:{width:375,height:820}});
  test("the recent trip chart opens individual plays and the clock selector changes both windows", async ({page}) => {
    await page.goto("/team/stats?season=2022&side=defense&sample=red-zone&window=recent");
    const chart = page.getByRole("region",{name:"Red-zone trips by game"});
    await expect(chart.locator(":scope > ol > li")).toHaveCount(4);
    const trip = chart.getByRole("link").first();
    await expect(trip).toHaveAttribute("href", /^\/replay\/2022_\d{2}_[A-Z]+_[A-Z]+\/read\?play=\d+&phase=action$/);
    await trip.click();
    await expect(page.locator("#drive-reader")).toBeVisible();
    await page.goBack();
    await page.getByRole("combobox",{name:"Game situation"}).selectOption("two-minute");
    await page.getByRole("button",{name:"Show split"}).click();
    const timing = page.getByRole("table",{name:"Play calling and yards by clock situation"});
    await expect(timing.getByRole("rowheader")).toHaveText("Final two minutes of either half");
    await expect(timing.getByRole("link")).toHaveCount(2);
    await expect(timing).toContainText("yd/play");
    await timing.getByRole("link").last().click();
    await expect(page.locator("#supporting-plays")).toContainText("Final two minutes of either half");
    await expect(page.locator("#supporting-plays li a").first()).toHaveAttribute("href", /phase=action/);
  });
  test("a fan can switch units, read the sample and follow exact plays on a phone with JavaScript disabled", async ({page}) => {
    await page.goto("/team/stats?season=2022");
    await expect(page.getByRole("heading",{name:"Team stats.",level:1})).toBeVisible();
    await page.getByLabel("Unit",{exact:true}).selectOption("defense");
    await page.getByRole("button",{name:"Show stats"}).click();
    await expect(page).toHaveURL(/side=defense/);
    await expect(page.getByRole("table",{name:"Situational rates"})).toContainText("Opponent red-zone play calling");
    await page.getByRole("link",{name:/View red-zone touchdowns plays, full season/i}).click();
    await expect(page).toHaveURL(/sample=red-zone&window=season#supporting-plays/);
    await expect(page.locator("#supporting-plays li")).toHaveCount(6);
    const first = page.locator("#supporting-plays li a").first();
    const href = await first.getAttribute("href");
    expect(href).toMatch(/^\/replay\/2022_[^/]+\/read\?play=\d+&phase=action$/);
    await page.getByRole("link",{name:"More plays"}).click();
    await expect(page).toHaveURL(/page=2#supporting-plays/);
    expect(await page.locator("#supporting-plays li a").first().getAttribute("href")).not.toBe(href);
    await expect(page.locator("#leaders")).toContainText(String(edition.season));
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(fits).toBe(true);
    await page.locator("#supporting-plays li a").first().click();
    await expect(page.locator("#drive-reader")).toBeVisible();
  });
  test("earlier seasons link to the covered replay studies and retain the current leader edition", async ({page}) => {
    await page.goto("/team/stats?season=2000");
    await expect(page.getByRole("link",{name:/Third-down target depth.*2009/})).toHaveAttribute("href","/replay/studies/throws");
    await expect(page.getByRole("link",{name:/Four or five pass rushers.*2016/})).toHaveAttribute("href","/replay/studies/pass-rush");
    await expect(page.locator("#leaders")).toContainText(String(edition.season));
  });
});
