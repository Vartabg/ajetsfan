import type { RateMetrics, SeasonAnalytics } from "./analytics";
import type { Game } from "./games";

export type EvidenceMetric = "epaPerPlay" | "successRate" | "passEpaPerPlay" | "rushEpaPerPlay";
export type EvidenceDatum = { value: number | null; plays: number | null };
export type EvidenceAxis = { kind: "epa" | "rate"; minimum: number; maximum: number; zero: number };
export type EvidenceRow = {
  metric: EvidenceMetric;
  label: string;
  unit: string;
  kind: "epa" | "rate";
  jets: EvidenceDatum;
  opponent: EvidenceDatum;
  axis: EvidenceAxis;
};
export type GameEvidenceModel = { rows: EvidenceRow[]; hasEpa: boolean };

const MEASURES: { metric: EvidenceMetric; label: string; unit: string; kind: "epa" | "rate" }[] = [
  { metric: "epaPerPlay", label: "EPA / play", unit: "plays", kind: "epa" },
  { metric: "successRate", label: "Positive-EPA play rate", unit: "plays", kind: "rate" },
  { metric: "passEpaPerPlay", label: "Passing EPA / dropback", unit: "dropbacks", kind: "epa" },
  { metric: "rushEpaPerPlay", label: "Designed-rush EPA / rush", unit: "rush plays", kind: "epa" },
];

function datum(metrics: RateMetrics, metric: EvidenceMetric): EvidenceDatum {
  const total = Number.isSafeInteger(metrics?.plays) && metrics.plays >= 0 ? metrics.plays : null;
  const split = metric === "passEpaPerPlay" || metric === "rushEpaPerPlay";
  const validSplits = total !== null && Number.isSafeInteger(metrics.passPlays) && metrics.passPlays >= 0 &&
    Number.isSafeInteger(metrics.rushPlays) && metrics.rushPlays >= 0 && metrics.passPlays + metrics.rushPlays === total;
  const plays = split ? validSplits ? metrics[metric === "passEpaPerPlay" ? "passPlays" : "rushPlays"] : null : total;
  const value = metrics?.[metric];
  return { plays, value: plays !== null && plays > 0 && value != null && Number.isFinite(value) &&
    (metric !== "successRate" || value >= 0 && value <= 1) ? value : null };
}

/** Both offenses use the same model orientation; Jets EPA allowed is opponent EPA produced. */
export function gameEvidence(game: Game, statistics: SeasonAnalytics["games"][number] | null): GameEvidenceModel | null {
  if (game.dataSuspect || game.seasonType !== "REG" || !statistics || statistics.id !== game.id ||
    statistics.date !== game.date || statistics.week !== game.week || statistics.opponent !== game.opponent ||
    statistics.opponentDisplay !== game.opponentDisplay || statistics.atHome !== game.atHome || !statistics.offense || !statistics.defense) return null;
  const rows = MEASURES.map((measure) => ({ ...measure, jets: datum(statistics.offense, measure.metric), opponent: datum(statistics.defense, measure.metric) }))
    .filter((row) => row.jets.value !== null || row.opponent.value !== null);
  if (!rows.length) return null;
  const epaValues = rows.filter((row) => row.kind === "epa").flatMap((row) => [row.jets.value, row.opponent.value])
    .filter((value): value is number => value !== null);
  const largest = Math.max(.1, ...epaValues.map(Math.abs));
  const rounded = Math.ceil(largest * 10) / 10;
  const extent = Number.isFinite(rounded) ? rounded : largest;
  const epaAxis: EvidenceAxis = { kind: "epa", minimum: -extent, maximum: extent, zero: 50 };
  const rateAxis: EvidenceAxis = { kind: "rate", minimum: 0, maximum: 1, zero: 0 };
  return { rows: rows.map((row) => ({ ...row, axis: row.kind === "epa" ? epaAxis : rateAxis })), hasEpa: epaValues.length > 0 };
}

/** Percent geometry measures distance from zero, never the length of a shifted numeric range. */
export function evidenceBar(value: number | null, axis: EvidenceAxis): { left: number; width: number; zeroValue: boolean } | null {
  if (value === null || !Number.isFinite(value) || value < axis.minimum || value > axis.maximum || axis.maximum <= 0) return null;
  const position = axis.kind === "epa" ? 50 + value / axis.maximum * 50 : value * 100;
  return { left: Math.min(axis.zero, position), width: Math.abs(position - axis.zero), zeroValue: value === 0 };
}
