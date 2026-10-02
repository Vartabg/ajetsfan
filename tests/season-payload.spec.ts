import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import type { NextGenCollection } from "../src/lib/nextgen-stats";
import type { RankingsCollection } from "../src/lib/season-rankings";
import { mediaCollection } from "../src/lib/media-catalog";
import { buildSeasonArchive, phaseResults, seasonNumbers } from "../src/lib/season-archive";
import { nextGenGuide, seasonArchivePresentation, seasonRankingGuide } from "../src/lib/season-presentation";

const data = (name: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public/data", name), "utf8"));
const games = data("games.json") as Game[];
const current = data("current.json") as CurrentSnapshot;
const rankings = data("season-rankings.json") as RankingsCollection;
const tracking = data("nextgen-stats.json") as NextGenCollection;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

test("compact archive props retain every phase's score totals and only eligible tape links", () => {
  const archives = buildSeasonArchive(games, current, mediaCollection.items, mediaCollection.checkedAt);
  for (const season of archives) {
    const compact = seasonArchivePresentation(season);
    expect(compact.caseIds).toEqual(season.cases.map((game) => game.id));
    expect(compact.heldAnalysis).toBe(season.heldAnalysis);
    expect(compact.facts).toEqual(season.facts);
    expect(compact.media).toEqual(season.media);
    for (const phase of ["all", "regular", "playoffs"] as const) {
      const { biggestWin: originalWin, ...original } = seasonNumbers(phaseResults(season, phase));
      const { biggestWin: projectedWin, ...projected } = seasonNumbers(phaseResults(compact, phase));
      expect(projected, `${season.year} ${phase}`).toEqual(original);
      expect(projectedWin?.id).toBe(originalWin?.id);
    }
    expect(compact.results.every((game) => !("keyPlay" in game) && !("stadium" in game))).toBe(true);
  }
  const historical = archives.find((season) => season.year === 2010)!;
  expect(bytes(seasonArchivePresentation(historical))).toBeLessThan(bytes(historical) * .5);

  const held = buildSeasonArchive([{ ...games.find((game) => game.id === "2022_02_NYJ_CLE")!, dataSuspect: true }], null, [], mediaCollection.checkedAt)[0];
  const compact = seasonArchivePresentation(held);
  expect(compact.results).toHaveLength(1);
  expect(compact.caseIds).toEqual([]);
  expect(compact.heldAnalysis).toBe(1);
});

test("ranking guides retain publication gaps, qualifications and sources without transferring player totals", () => {
  for (const season of rankings.seasons) {
    const compact = seasonRankingGuide(season)!;
    expect(compact.sources).toEqual(season.sources);
    expect(compact.checkedAt).toBe(season.checkedAt);
    for (const phase of ["all", "regular", "playoffs"] as const) {
      const { team, individual, ...coverage } = season.phases[phase];
      const { team: compactTeam, individual: compactIndividual, ...compactCoverage } = compact.phases[phase];
      expect(compactCoverage, `${season.year} ${phase}`).toEqual(coverage);
      for (const [originalMetrics, compactMetrics] of [[team, compactTeam], [individual, compactIndividual]] as const) {
        expect(compactMetrics.map((metric) => [metric.id, metric.label, metric.population, metric.populationLabel, metric.note]))
          .toEqual(originalMetrics.map((metric) => [metric.id, metric.label, metric.population, metric.populationLabel, metric.note]));
        expect(compactMetrics.every((metric) => !("players" in metric) && !("leaders" in metric) && !("jets" in metric))).toBe(true);
      }
    }
    expect(bytes(compact), String(season.year)).toBeLessThan(bytes(season));
    if (season.year === 2010 || season.year === current.season) expect(bytes(compact)).toBeLessThan(bytes(season) * .5);
  }
  expect(seasonRankingGuide(null)).toBeNull();
});

test("tracking guides retain all distinct measurement definitions and source notes without player aggregates", () => {
  for (const season of tracking.seasons) {
    const compact = nextGenGuide(season)!;
    const original = [...new Map([...season.passing, ...season.receiving, ...season.rushing]
      .flatMap((player) => player.metrics).map((metric) => [metric.id, metric])).values()];
    expect(compact.definitions.map((metric) => [metric.id, metric.label, metric.note]))
      .toEqual(original.map((metric) => [metric.id, metric.label, metric.note]));
    expect(compact.notes).toEqual(season.notes);
    expect(compact.definitions.every((metric) => !("value" in metric))).toBe(true);
    expect(bytes(compact), String(season.year)).toBeLessThan(bytes(season));
  }
  expect(nextGenGuide(null)).toBeNull();
});
