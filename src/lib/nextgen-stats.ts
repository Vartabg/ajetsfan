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
  /** A retained season keeps its own successful check when other seasons refresh. */
  checkedAt?: string;
  status?: "ready" | "retained";
  attemptedAt?: string;
  retentionReason?: string;
  passing: NextGenPlayer[];
  receiving: NextGenPlayer[];
  rushing: NextGenPlayer[];
  notes: string[];
};

export type NextGenCollection = {
  schemaVersion: 1;
  checkedAt: string;
  status?: "ready" | "retained";
  attemptedAt?: string;
  sources: { passing: string; receiving: string; rushing: string };
  sourceUpdatedAt?: string;
  seasons: NextGenSeason[];
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown, min: number): value is number => finite(value) && Number.isInteger(value) && value >= min;
const team = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{2,3}$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
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
  if (value.status !== undefined && !["ready", "retained"].includes(String(value.status))) return false;
  if (value.attemptedAt !== undefined && (typeof value.attemptedAt !== "string" || !Number.isFinite(Date.parse(value.attemptedAt)) || Date.parse(value.attemptedAt) < Date.parse(value.checkedAt))) return false;
  const sources = value.sources;
  if (!["passing", "receiving", "rushing"].every((kind) => url(sources[kind]))) return false;
  const maxYear = new Date(value.checkedAt).getUTCFullYear();
  const years = new Set<number>();
  for (const season of value.seasons) {
    if (!record(season) || !integer(season.year, 2016) || season.year > maxYear || years.has(season.year) || season.phase !== "regular"
        || !Array.isArray(season.notes) || !season.notes.every(text)) return false;
    const hasCheck = ["checkedAt", "status", "attemptedAt", "retentionReason"].some((key) => season[key] !== undefined);
    if (hasCheck && (!timestamp(season.checkedAt) || Date.parse(season.checkedAt) > Date.parse(value.checkedAt)
        || season.year > new Date(season.checkedAt as string).getUTCFullYear()
        || !["ready", "retained"].includes(String(season.status)) || !timestamp(season.attemptedAt)
        || Date.parse(season.attemptedAt) < Date.parse(season.checkedAt)
        || (season.retentionReason !== undefined && (season.status !== "retained" || !text(season.retentionReason)))
        || (season.status === "retained" && value.status !== "retained"))) return false;
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

/** Page freshness follows this season, not a successful check of a different year. */
export function nextGenSeasonCheck(collection: NextGenCollection | null, year: number) {
  const season = nextGenSeason(collection, year);
  const checkedAt = season?.checkedAt ?? collection?.checkedAt ?? null;
  // Older snapshots recorded only collection-level outages.
  const nextgen = season && season.status === undefined && collection?.status === "retained"
    ? { ...season, status: "retained" as const } : season;
  return { nextgen, checkedAt };
}

/** A current-season runtime check must not hide a newer compiled historical record. */
export function mergeNextGenCollections(first: NextGenCollection | null | undefined, second: NextGenCollection | null | undefined): NextGenCollection | null {
  for (const value of [first, second]) if (value && !isNextGenCollection(value)) throw new Error("Invalid Next Gen merge source");
  if (!first || !second) return first ?? second ?? null;
  type CheckedSeason = NextGenSeason & Required<Pick<NextGenSeason, "checkedAt" | "status" | "attemptedAt">>;
  const normalized = (collection: NextGenCollection, season: NextGenSeason): CheckedSeason => ({ ...season,
    checkedAt: season.checkedAt ?? collection.checkedAt,
    attemptedAt: season.attemptedAt ?? collection.attemptedAt ?? season.checkedAt ?? collection.checkedAt,
    status: season.status ?? collection.status ?? "ready" });
  const byYear = new Map<number, CheckedSeason[]>();
  for (const collection of [first, second]) for (const season of collection.seasons) {
    byYear.set(season.year, [...(byYear.get(season.year) ?? []), normalized(collection, season)]);
  }
  const seasons = [...byYear.values()].map((candidates): CheckedSeason => {
    const selected = candidates.reduce((a, b) => Date.parse(a.checkedAt) >= Date.parse(b.checkedAt) ? a : b);
    const measurements = { ...selected };
    delete measurements.retentionReason;
    const failures = candidates.filter((candidate) => candidate.status === "retained" && Date.parse(candidate.attemptedAt) >= Date.parse(selected.checkedAt));
    const failure = failures.length ? failures.reduce((a, b) => Date.parse(a.attemptedAt) >= Date.parse(b.attemptedAt) ? a : b) : null;
    return { ...measurements, status: failure ? "retained" : "ready",
      attemptedAt: new Date(Math.max(...candidates.map((candidate) => Date.parse(candidate.attemptedAt)))).toISOString(),
      ...(failure ? { retentionReason: failure.retentionReason ?? "The latest source check failed. Showing the last verified measurements." } : {}) };
  }).sort((a, b) => b.year - a.year);
  const latest = Date.parse(first.checkedAt) >= Date.parse(second.checkedAt) ? first : second;
  if (!seasons.length) return latest;
  const merged: NextGenCollection = { ...latest, seasons,
    checkedAt: new Date(Math.max(...seasons.map((season) => Date.parse(season.checkedAt)))).toISOString(),
    attemptedAt: new Date(Math.max(...seasons.map((season) => Date.parse(season.attemptedAt)))).toISOString(),
    status: seasons.some((season) => season.status === "retained") ? "retained" : "ready" };
  if (!isNextGenCollection(merged)) throw new Error("Invalid Next Gen merge result");
  return merged;
}
