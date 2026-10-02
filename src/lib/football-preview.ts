import { epaLabel } from "./analytics";
import type { RateMetrics, SeasonAnalytics, TeamAnalytics } from "./analytics";
import type { ScheduledGame } from "./current";

export type PreviewQuestion = {
  id: "passing" | "rushing" | "pass-defense";
  title: string;
  unit: "dropback" | "rush (no scrambles)";
  offense: { team: string; epa: number; plays: number; games: number };
  defense: { team: string; epa: number; plays: number; games: number };
  evidence: string;
};

type Split = "pass" | "rush";

const footballNames: Record<string, string> = {
  ARI: "Arizona", ATL: "Atlanta", BAL: "Baltimore", BUF: "Buffalo",
  CAR: "Carolina", CHI: "Chicago", CIN: "Cincinnati", CLE: "Cleveland",
  DAL: "Dallas", DEN: "Denver", DET: "Detroit", GB: "Green Bay",
  HOU: "Houston", IND: "Indianapolis", JAX: "Jacksonville", KC: "Kansas City",
  LA: "Los Angeles", LAR: "Los Angeles", LAC: "Los Angeles", LV: "Las Vegas",
  MIA: "Miami", MIN: "Minnesota", NE: "New England", NO: "New Orleans",
  NYG: "New York", PHI: "Philadelphia", PIT: "Pittsburgh", SEA: "Seattle",
  SF: "San Francisco", TB: "Tampa Bay", TEN: "Tennessee", WAS: "Washington", WSH: "Washington",
};

function hasTeamSample(team: TeamAnalytics | undefined): team is TeamAnalytics {
  return !!team && Number.isInteger(team.completedGames) && team.completedGames > 0 &&
    Number.isInteger(team.offense?.plays) && team.offense.plays > 0 &&
    Number.isInteger(team.defense?.plays) && team.defense.plays > 0;
}

function splitSample(metrics: RateMetrics, split: Split) {
  const plays = split === "pass" ? metrics.passPlays : metrics.rushPlays;
  const epa = split === "pass" ? metrics.passEpaPerPlay : metrics.rushEpaPerPlay;
  if (!Number.isInteger(plays) || plays <= 0 || epa == null || !Number.isFinite(epa)) return null;
  return { plays, epa };
}

/** Pair an offense with the other team's defense; never turn the samples into a forecast. */
export function previewQuestions(game: ScheduledGame, analytics: SeasonAnalytics | null): PreviewQuestion[] {
  if (!analytics || analytics.season !== game.season || game.status !== "scheduled") return [];
  const jets = analytics.teams.find((team) => team.team === "NYJ");
  const opponent = analytics.teams.find((team) => team.team === game.opponent);
  if (!hasTeamSample(jets) || !hasTeamSample(opponent)) return [];
  const opponentName = footballNames[game.opponent] ?? game.opponentDisplay;

  const questions: PreviewQuestion[] = [];
  const addQuestion = (
    question: Pick<PreviewQuestion, "id" | "title">,
    offense: TeamAnalytics,
    defense: TeamAnalytics,
    split: Split,
  ) => {
    const attack = splitSample(offense.offense, split);
    const resistance = splitSample(defense.defense, split);
    if (!attack || !resistance) return;
    const unit = split === "pass" ? "dropback" : "rush (no scrambles)";
    questions.push({
      ...question,
      unit,
      offense: { team: offense.team, epa: attack.epa, plays: attack.plays, games: offense.completedGames },
      defense: { team: defense.team, epa: resistance.epa, plays: resistance.plays, games: defense.completedGames },
      evidence: `${offense.team} offense: ${epaLabel(attack.epa, 3)} EPA per ${unit} (${attack.plays} plays). ${defense.team} defense: ${epaLabel(resistance.epa, 3)} EPA allowed per ${unit} (${resistance.plays} plays).`,
    });
  };

  addQuestion({
    id: "passing",
    title: "Jets passing offense",
  }, jets, opponent, "pass");
  addQuestion({
    id: "rushing",
    title: "Jets rushing offense",
  }, jets, opponent, "rush");
  addQuestion({
    id: "pass-defense",
    title: `${opponentName} passing offense`,
  }, opponent, jets, "pass");
  return questions;
}
