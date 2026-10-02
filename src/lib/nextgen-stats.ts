export type NextGenMetric = {
  id: string;
  label: string;
  value: number;
  unit: "seconds" | "yards" | "percent" | "ratio" | "count";
  note: string;
};

export type NextGenPlayer = {
  id: string;
  name: string;
  team: "NYJ";
  position: string;
  games?: number;
  sample: number;
  sampleLabel: string;
  metrics: NextGenMetric[];
  teams?: string[];
};

export type NextGenSeason = {
  year: number;
  phase: "regular";
  passing: NextGenPlayer[];
  receiving: NextGenPlayer[];
  rushing: NextGenPlayer[];
  notes: string[];
};

export type NextGenCollection = {
  schemaVersion: 1;
  checkedAt: string;
  sources: { passing: string; receiving: string; rushing: string };
  sourceUpdatedAt?: string;
  seasons: NextGenSeason[];
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown, min: number): value is number => finite(value) && Number.isInteger(value) && value >= min;
const team = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{2,3}$/.test(value);
const url = (value: unknown): value is string => {
  if (!text(value)) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

function validMetric(value: unknown): value is NextGenMetric {
  return record(value) && text(value.id) && text(value.label) && finite(value.value) && text(value.note)
    && ["seconds", "yards", "percent", "ratio", "count"].includes(String(value.unit));
}

function validPlayer(value: unknown): value is NextGenPlayer {
  if (!record(value) || typeof value.id !== "string" || !/^\d{2}-\d{7}$/.test(value.id) || !text(value.name) || value.team !== "NYJ"
      || !text(value.position) || !integer(value.sample, 1) || !text(value.sampleLabel) || !Array.isArray(value.metrics)
      || !value.metrics.every(validMetric) || (value.games !== undefined && !integer(value.games, 1))) return false;
  if (new Set(value.metrics.map((metric) => metric.id)).size !== value.metrics.length) return false;
  return value.teams === undefined || (Array.isArray(value.teams) && value.teams.length > 1 && value.teams.every(team)
    && value.teams.includes("NYJ") && new Set(value.teams).size === value.teams.length);
}

/** Guard a cached snapshot before it reaches the archive UI. */
export function isNextGenCollection(value: unknown): value is NextGenCollection {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value.checkedAt)
      || !Number.isFinite(Date.parse(value.checkedAt)) || !record(value.sources)
      || (value.sourceUpdatedAt !== undefined && !text(value.sourceUpdatedAt)) || !Array.isArray(value.seasons)) return false;
  const sources = value.sources;
  if (!["passing", "receiving", "rushing"].every((kind) => url(sources[kind]))) return false;
  const maxYear = new Date(value.checkedAt).getUTCFullYear();
  const years = new Set<number>();
  for (const season of value.seasons) {
    if (!record(season) || !integer(season.year, 2016) || season.year > maxYear || years.has(season.year) || season.phase !== "regular"
        || !Array.isArray(season.notes) || !season.notes.every(text)) return false;
    years.add(season.year);
    for (const kind of ["passing", "receiving", "rushing"] as const) {
      const players = season[kind];
      if (!Array.isArray(players) || !players.every(validPlayer) || new Set(players.map((player) => player.id)).size !== players.length) return false;
    }
  }
  return true;
}

/** NGS data in this snapshot cover regular-season aggregates only. */
export function nextGenSeason(collection: NextGenCollection | null, year: number): NextGenSeason | null {
  return collection?.seasons.find((season) => season.year === year && season.phase === "regular") ?? null;
}
