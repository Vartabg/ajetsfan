import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { clockLabel, type Game } from "../src/lib/games";
import type { CurvePoint } from "../src/lib/load-games";
import { buildVisualStory, parseVisualStorySelection, visualStoryIds, type VisualStory } from "../src/lib/visual-story";

const data = path.join(process.cwd(), "public/data");
const games = JSON.parse(readFileSync(path.join(data, "games.json"), "utf8")) as Game[];
const fixtures = visualStoryIds.map((id) => {
  const game = games.find((item) => item.id === id)!;
  const points = JSON.parse(readFileSync(path.join(data, "curves", `${id}.json`), "utf8")) as CurvePoint[];
  return { game, points };
});
const stories = fixtures.map(({ game, points }) => buildVisualStory(game, points)!);

test("the two historical stories use checked final fixtures and bounded source sequences", () => {
  const [cleveland, miami] = stories;
  expect(stories.every(Boolean)).toBe(true);
  expect(stories.map((story) => story.id)).toEqual(["2022_02_NYJ_CLE", "2000_08_MIA_NYJ"]);
  expect(cleveland.points).toHaveLength(21);
  expect(cleveland.points[0]).toMatchObject({ q: 4, t: 115, wp: .004, type: "extra_point" });
  expect(cleveland.game).toMatchObject({ jetsScore: 31, oppScore: 30, wentToOt: false });
  expect(miami.points).toHaveLength(85);
  expect(miami.points[0]).toMatchObject({ q: 3, t: 912, wp: .004 });
  expect(miami.game).toMatchObject({ jetsScore: 40, oppScore: 37, wentToOt: true });
  for (const story of stories) {
    expect(new URL(story.source.url).hostname).toBe("www.newyorkjets.com");
    expect(story.points.every((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1)).toBe(true);
    expect(story.chapters.every((chapter) => chapter.index >= 0 && chapter.index < story.points.length)).toBe(true);
    expect(story.chapters.map((chapter) => chapter.index)).toEqual([...story.chapters.map((chapter) => chapter.index)].sort((a, b) => a - b));
    expect(JSON.stringify(story.points)).not.toMatch(/jetsScore|oppScore|afterWp/);
  }
});

test("named chapters point to the source plays rather than a neighboring estimate or a scoring-completion clock", () => {
  const [cleveland, miami] = stories;
  const find = (story: VisualStory, id: string) => story.points[story.chapters.find((chapter) => chapter.id === id)!.index];
  expect(find(cleveland, "davis-touchdown")).toMatchObject({ t: 92, wp: .007, d: .012 });
  expect(find(cleveland, "onside-recovery")).toMatchObject({ t: 82, wp: .018, d: .176 });
  expect(find(cleveland, "wilson-touchdown")).toMatchObject({ t: 25, wp: .261, d: .312 });
  expect(find(cleveland, "davis-interception")).toMatchObject({ t: 13, wp: .567, d: .326 });
  expect(find(miami, "coles-touchdown").desc).toContain("L.Coles for 30 yards, TOUCHDOWN");
  expect(find(miami, "elliott-touchdown")).toMatchObject({ q: 4, t: 80, wp: .268, d: .151 });
  expect(find(miami, "chrebet-overtime")).toMatchObject({ q: 5, wp: .482, d: .271 });
  expect(find(miami, "hall-field-goal").desc).toContain("J.Hall 40 yard field goal is GOOD");
});

test("overtime and terminal points retain the recorded pre-play semantics", () => {
  const [cleveland, miami] = stories;
  const clevelandFinal = cleveland.points.at(-1)!;
  const miamiFinal = miami.points.at(-1)!;
  expect(clevelandFinal).toMatchObject({ wp: .894, d: null, type: "qb_kneel" });
  expect(miamiFinal).toMatchObject({ wp: .786, d: .214, type: "field_goal" });
  expect(miami.points.filter((point) => point.q === 5).every((point) => clockLabel(point.q, point.t) === "OT")).toBe(true);
  expect(clevelandFinal.wp).toBeLessThan(1);
  expect(miamiFinal.wp).toBeLessThan(1);
  const nullableOt = fixtures[1].points.map((point) => point.q === 5 ? { ...point, t: null } : point);
  expect(buildVisualStory(fixtures[1].game, nullableOt)?.points.at(-1)).toMatchObject({ q: 5, t: null, wp: .786 });
});

test("corrected, suspect, conflicting or unsupported fixtures cannot inherit a historical story", () => {
  for (const { game, points } of fixtures) {
    const changes: Partial<Game>[] = [
      { id: "2022_03_CIN_NYJ" }, { dataSuspect: true }, { outcome: "loss" }, { seasonType: "POST" },
      { season: game.season + 1 }, { week: game.week + 1 }, { date: "2026-09-27" },
      { opponent: "BUF" }, { opponentDisplay: "BUF" }, { atHome: !game.atHome },
      { jetsScore: game.jetsScore + 1 }, { oppScore: game.oppScore + 1 }, { wentToOt: !game.wentToOt },
      { swing: null }, { swing: Number.NaN }, { swing: Number.POSITIVE_INFINITY }, { swing: -.01 }, { swing: 1.01 },
      { peakH2Wp: null }, { troughH2Wp: null }, { swing: .2, troughH2Wp: .3 }, { peakH2Wp: .001 },
    ];
    for (const change of changes) expect(buildVisualStory({ ...game, ...change }, points), JSON.stringify(change)).toBeNull();
    expect(buildVisualStory(game, [])).toBeNull();
  }
});

test("corrupt probability and regulation clocks are withheld without inventing replacement deltas", () => {
  const { game, points } = fixtures[0];
  const corrupt = [
    null, { ...points[154], wp: Number.NaN }, { ...points[154], wp: Number.POSITIVE_INFINITY },
    { ...points[154], wp: -0.1 }, { ...points[154], wp: 1.1 }, { ...points[154], wp: "0.5" },
    { ...points[154], q: 0 }, { ...points[154], q: 4.5 }, { ...points[154], q: 6 },
    { ...points[154], t: null }, { ...points[154], t: -1 }, { ...points[154], t: 901 }, { ...points[154], t: 1.5 },
  ] as unknown as CurvePoint[];
  const mixed = [...points.slice(0, 154), ...corrupt, ...points.slice(154)];
  const story = buildVisualStory(game, mixed)!;
  expect(story.points).toEqual(stories[0].points);
  const removedRecovery = points.map((point, index) => index === 155 ? { ...point, wp: Number.NaN } : point);
  const gap = buildVisualStory(game, removedRecovery)!;
  expect(gap.chapters.some((chapter) => chapter.id === "onside-recovery")).toBe(false);
  expect(gap.points.find((point) => point.t === 80)).toMatchObject({ wp: .194, d: -.027 });
  expect(gap.points.find((point) => point.type === "extra_point" && point.t === 82)).toMatchObject({ wp: .019, d: -.001 });
  for (const d of [Number.NaN, Number.POSITIVE_INFINITY, 1.01, -1.01, "0.2", undefined]) {
    const changed = points.map((point, index) => index === 155 ? { ...point, d } as unknown as CurvePoint : point);
    expect(buildVisualStory(game, changed)?.points.find((point) => /kicks onside/.test(point.desc ?? ""))?.d).toBeNull();
  }
});

test("missing, ambiguous and reversed named plays do not gain editorial chapters", () => {
  const { game, points } = fixtures[1];
  const edited = points.map((point) => /L\.Coles for 30 yards, TOUCHDOWN/.test(point.desc ?? "") ? { ...point, desc: `${point.desc} Play Challenged and REVERSED.` } : point);
  const story = buildVisualStory(game, edited)!;
  expect(story.chapters.some((chapter) => chapter.id === "coles-touchdown")).toBe(false);
  const elliott = points.findIndex((point) => /pass to J\.Elliott for 3 yards/.test(point.desc ?? ""));
  const duplicated = [...points.slice(0, elliott), points[elliott], ...points.slice(elliott)];
  expect(buildVisualStory(game, duplicated)?.chapters.some((chapter) => chapter.id === "elliott-touchdown")).toBe(false);
  const noElliott = points.map((point, index) => index === elliott ? { ...point, desc: null } : point);
  expect(buildVisualStory(game, noElliott)?.chapters.some((chapter) => chapter.id === "elliott-touchdown")).toBe(false);
  const unordered = [...points];
  [unordered[150], unordered[151]] = [unordered[151], unordered[150]];
  expect(buildVisualStory(game, unordered)).toBeNull();
});

test("moment URLs round-trip a valid one-based sequence and reject malformed or foreign selections", () => {
  expect(parseVisualStorySelection("", stories)).toEqual({ story: stories[0], index: stories[0].chapters[0].index });
  expect(parseVisualStorySelection("?story=2000_08_MIA_NYJ&moment=85&other=kept", stories)).toEqual({ story: stories[1], index: 84 });
  expect(parseVisualStorySelection("story=2022_02_NYJ_CLE&moment=21", stories)).toEqual({ story: stories[0], index: 20 });
  expect(parseVisualStorySelection("moment=2", stories)).toEqual({ story: stories[0], index: 1 });
  for (const moment of ["0", "-1", "22", "1.5", "1e1", "Infinity", "NaN", "01", "2x", "9007199254740992"]) {
    expect(parseVisualStorySelection(`story=2022_02_NYJ_CLE&moment=${moment}`, stories)).toEqual({ story: stories[0], index: 0 });
  }
  expect(parseVisualStorySelection("story=not-a-published-game&moment=2", stories)).toEqual({ story: stories[0], index: 0 });
  expect(parseVisualStorySelection("story=2000_08_MIA_NYJ", [stories[0]])).toEqual({ story: stories[0], index: 0 });
  expect(parseVisualStorySelection("", [])).toBeNull();
  const search = "?story=2000_08_MIA_NYJ&moment=2&game=unrelated";
  parseVisualStorySelection(search, stories);
  expect(search).toBe("?story=2000_08_MIA_NYJ&moment=2&game=unrelated");
});

test("building stories leaves the published snapshots untouched", () => {
  for (const fixture of fixtures) {
    const before = JSON.stringify(fixture);
    buildVisualStory(fixture.game, fixture.points);
    expect(JSON.stringify(fixture)).toBe(before);
  }
});
