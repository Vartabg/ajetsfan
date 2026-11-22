import type { Snap, SnapCharting, SnapGame } from "./snap-types";

const formations = new Set(["EMPTY", "I_FORM", "JUMBO", "PISTOL", "SHOTGUN", "SINGLEBACK", "UNDER CENTER", "WILDCAT"]);
const routes = new Set(["ANGLE", "CORNER", "CROSS", "DEEP OUT", "FLAT", "GO", "HITCH", "HITCH/CURL", "IN", "IN/DIG",
  "OUT", "POST", "QUICK OUT", "SCREEN", "SHALLOW CROSS/DRAG", "SLANT", "SWING", "TEXAS/ANGLE", "WHEEL"]);
const coverages = new Set(["2_MAN", "BLOWN", "COMBO", "COVER_0", "COVER_1", "COVER_2", "COVER_3", "COVER_4", "COVER_6", "COVER_9", "PREVENT"]);
const coverageFamilies = new Set(["MAN_COVERAGE", "ZONE_COVERAGE"]);
const positions = new Set(["QB", "RB", "FB", "WR", "TE", "OL", "C", "G", "T", "DL", "DE", "DT", "NT", "LB", "ILB", "MLB", "OLB", "DB", "CB", "S", "FS", "SS", "LS", "P", "K"]);
const fields = ["formation", "offensePersonnel", "defensePersonnel", "box", "rushers", "primaryRoute", "coverage", "manZone"] as const;
const chartFieldNames = new Set<string>(fields);

export function chartLabel(value?: string) {
  if (!value) return null;
  if (value === "I_FORM") return "I formation";
  if (value === "2_MAN") return "2-Man";
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function participationProvenance(season: number) {
  return {
    provider: season < 2023 ? "NFL Next Gen Stats via nflverse" : "FTN Data via nflverse",
    sourceUrl: `https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_${season}.parquet`,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes: "Selected Jets game and play records, omitted unverified fields, and renamed charting fields for display.",
  };
}

function personnel(value: string): boolean {
  const seen = new Set<string>();
  let total = 0;
  for (const group of value.split(/,\s*/)) {
    const match = /^(0|[1-9]|1[01]) ([A-Z]{1,4})$/.exec(group);
    if (!match || !positions.has(match[2]) || seen.has(match[2])) return false;
    seen.add(match[2]);
    total += Number(match[1]);
  }
  // Older NGS packages frequently list only backs, tight ends and wide receivers.
  return total > 0 && total <= 11;
}

function validField(key: keyof SnapCharting, value: unknown): boolean {
  if (key === "box" || key === "rushers") return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 11;
  if (typeof value !== "string" || !value || value.length > 100) return false;
  switch (key) {
    case "formation": return formations.has(value);
    case "primaryRoute": return routes.has(value);
    case "coverage": return coverages.has(value);
    case "manZone": return coverageFamilies.has(value);
    default: return personnel(value);
  }
}

/** Work with independent provider fields; an absent or unfamiliar label leaves other evidence usable. */
export function chartedFields(values: Record<string, unknown>, play: Snap): SnapCharting | null {
  const { kind } = play.facts ?? {};
  if (!kind || !play.possession) return null;
  const pass = kind === "completion" || kind === "incompletion" || kind === "interception" || kind === "sack";
  const charting = Object.fromEntries(fields.filter((key) => (
    pass || !["rushers", "primaryRoute", "coverage", "manZone"].includes(key)
  ) && validField(key, values[key])).map((key) => [key, values[key]]));
  return Object.keys(charting).length ? charting : null;
}

type ChartRow = { key: string; team: string; charting: SnapCharting };
export type ParticipationSeason = Map<string, Map<string, ChartRow>>;

export function matchingParticipationTeam(game: SnapGame, play: Snap, team: string): boolean {
  if (game.source !== "nflverse" || !play.possession) return false;
  if (play.possession === "jets") return team === "NYJ";
  // The verified fixture's game ID keeps the team's name that season (e.g. OAK); PBP uses its current lineage (LV).
  return team === game.opponent || team === game.id.split("_")[game.home ? 2 : 3];
}

export function parseParticipationSeason(json: string, year: number): ParticipationSeason {
  const file = JSON.parse(json);
  const source = participationProvenance(year);
  if (!file || year < 2016 || file.schemaVersion !== 1 || file.season !== year || !file.provenance ||
    Object.entries(source).some(([key, value]) => file.provenance[key] !== value) ||
    !Array.isArray(file.games) || !file.games.length) throw new Error(`Invalid participation season ${year}`);
  const games: ParticipationSeason = new Map();
  for (const game of file.games) {
    if (!game || typeof game.id !== "string" || !game.id.startsWith(`${year}_`) || !/^\d{4}_\d{2}_(?:NYJ_[A-Z]{2,3}|[A-Z]{2,3}_NYJ)$/.test(game.id) ||
      games.has(game.id) || !Array.isArray(game.plays) || !game.plays.length) throw new Error(`Invalid participation game in ${year}`);
    const plays = new Map<string, ChartRow>();
    for (const row of game.plays) {
      if (!row || typeof row.key !== "string" || !/^[1-9]\d*$/.test(row.key) || !Number.isSafeInteger(Number(row.key)) ||
        plays.has(row.key) || typeof row.team !== "string" || !/^[A-Z]{2,3}$/.test(row.team) ||
        !row.charting || typeof row.charting !== "object" || Array.isArray(row.charting) || !Object.keys(row.charting).length ||
        Object.entries(row.charting).some(([key, value]) => !chartFieldNames.has(key) || !validField(key as keyof SnapCharting, value))) {
        throw new Error(`Invalid or repeated participation play in ${game.id}`);
      }
      plays.set(row.key, row);
    }
    games.set(game.id, plays);
  }
  return games;
}

/** Join a single verified nflverse game; never mutate the common snapshot used by archive and directory readers. */
export function withParticipation(game: SnapGame, season: ParticipationSeason): SnapGame {
  const records = season.get(game.id);
  if (game.source !== "nflverse" || !records) return game;
  return { ...game, plays: game.plays.map((play) => {
    const row = records.get(play.key);
    if (!row || !matchingParticipationTeam(game, play, row.team)) return play;
    const charting = chartedFields(row.charting, play);
    return charting ? { ...play, facts: { ...play.facts, charting } } : play;
  }) };
}
