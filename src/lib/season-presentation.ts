import type { ResultGame } from "./current";
import type { NextGenMetric, NextGenSeason } from "./nextgen-stats";
import type { ArchiveSeason } from "./season-archive";
import type { RankingMetric, RankingPhase, SeasonRankings } from "./season-rankings";

export type SeasonArchivePresentation = Omit<ArchiveSeason, "cases"> & { caseIds: string[] };
type RankingDefinition = Pick<RankingMetric, "id" | "label" | "population" | "populationLabel" | "note">;
type RankingGuidePhase = Omit<RankingPhase, "team" | "individual"> & {
  team: RankingDefinition[];
  individual: RankingDefinition[];
};
export type SeasonRankingGuide = Omit<SeasonRankings, "phases"> & {
  phases: Record<keyof SeasonRankings["phases"], RankingGuidePhase>;
};
export type NextGenGuide = {
  definitions: Pick<NextGenMetric, "id" | "label" | "note">[];
  notes: string[];
};

/** The archive needs scores and tape availability, not every game's play-by-play metadata. */
export function seasonArchivePresentation(season: ArchiveSeason): SeasonArchivePresentation {
  return {
    year: season.year,
    results: season.results.map(({ id, season, week, seasonType, date, opponent, opponentDisplay, atHome, jetsScore, oppScore, outcome }): ResultGame => ({
      id, season, week, seasonType, date, opponent, opponentDisplay, atHome, jetsScore, oppScore, outcome,
    })),
    caseIds: season.cases.map((game) => game.id),
    facts: season.facts,
    media: season.media,
    heldAnalysis: season.heldAnalysis,
    current: season.current,
  };
}

/** Send definitions and coverage to the guide; player totals stay on the season page. */
export function seasonRankingGuide(rankings: SeasonRankings | null): SeasonRankingGuide | null {
  if (!rankings) return null;
  const definition = ({ id, label, population, populationLabel, note }: RankingMetric): RankingDefinition => ({ id, label, population, populationLabel, note });
  const phase = ({ team, individual, ...coverage }: RankingPhase): RankingGuidePhase => ({
    ...coverage, team: team.map(definition), individual: individual.map(definition),
  });
  return {
    year: rankings.year,
    checkedAt: rankings.checkedAt,
    sources: rankings.sources,
    phases: { all: phase(rankings.phases.all), regular: phase(rankings.phases.regular), playoffs: phase(rankings.phases.playoffs) },
  };
}

export function nextGenGuide(nextgen: NextGenSeason | null): NextGenGuide | null {
  if (!nextgen) return null;
  // Match the guide's existing last-definition-wins behavior and first-seen order.
  const definitions = [...new Map([...nextgen.passing, ...nextgen.receiving, ...nextgen.rushing]
    .flatMap((player) => player.metrics).map(({ id, label, note }) => [id, { id, label, note }])).values()];
  return { definitions, notes: nextgen.notes };
}
