/**
 * Franchise identity for readable opponent names and a small colour cue.
 *
 * Names are public facts and are keyed by the historical code the archive
 * records for each game (OAK, SD and STL stay with the city that played the
 * game). Washington is kept to its city because the nickname changed across
 * the archive. Colours approximate each club's published primary and
 * secondary uniform colours; they are decorative identity cues, not official
 * marks, and no logo is reproduced.
 */
export type TeamIdentity = { city: string; nickname: string | null; colors: readonly [string, string] };

const TEAMS: Record<string, TeamIdentity> = {
  ARI: { city: "Arizona", nickname: "Cardinals", colors: ["#97233f", "#ffb612"] },
  ATL: { city: "Atlanta", nickname: "Falcons", colors: ["#a71930", "#101820"] },
  BAL: { city: "Baltimore", nickname: "Ravens", colors: ["#241773", "#9e7c0c"] },
  BUF: { city: "Buffalo", nickname: "Bills", colors: ["#00338d", "#c60c30"] },
  CAR: { city: "Carolina", nickname: "Panthers", colors: ["#0085ca", "#101820"] },
  CHI: { city: "Chicago", nickname: "Bears", colors: ["#0b162a", "#c83803"] },
  CIN: { city: "Cincinnati", nickname: "Bengals", colors: ["#fb4f14", "#101820"] },
  CLE: { city: "Cleveland", nickname: "Browns", colors: ["#311d00", "#ff3c00"] },
  DAL: { city: "Dallas", nickname: "Cowboys", colors: ["#003594", "#869397"] },
  DEN: { city: "Denver", nickname: "Broncos", colors: ["#fb4f14", "#002244"] },
  DET: { city: "Detroit", nickname: "Lions", colors: ["#0076b6", "#b0b7bc"] },
  GB: { city: "Green Bay", nickname: "Packers", colors: ["#203731", "#ffb612"] },
  HOU: { city: "Houston", nickname: "Texans", colors: ["#03202f", "#a71930"] },
  IND: { city: "Indianapolis", nickname: "Colts", colors: ["#002c5f", "#a2aaad"] },
  JAX: { city: "Jacksonville", nickname: "Jaguars", colors: ["#006778", "#d7a22a"] },
  KC: { city: "Kansas City", nickname: "Chiefs", colors: ["#e31837", "#ffb81c"] },
  LA: { city: "Los Angeles", nickname: "Rams", colors: ["#003594", "#ffa300"] },
  LAC: { city: "Los Angeles", nickname: "Chargers", colors: ["#0080c6", "#ffc20e"] },
  LV: { city: "Las Vegas", nickname: "Raiders", colors: ["#101820", "#a5acaf"] },
  MIA: { city: "Miami", nickname: "Dolphins", colors: ["#008e97", "#fc4c02"] },
  MIN: { city: "Minnesota", nickname: "Vikings", colors: ["#4f2683", "#ffc62f"] },
  NE: { city: "New England", nickname: "Patriots", colors: ["#002244", "#c60c30"] },
  NO: { city: "New Orleans", nickname: "Saints", colors: ["#d3bc8d", "#101820"] },
  NYG: { city: "New York", nickname: "Giants", colors: ["#0b2265", "#a71930"] },
  NYJ: { city: "New York", nickname: "Jets", colors: ["#125740", "#101820"] },
  OAK: { city: "Oakland", nickname: "Raiders", colors: ["#101820", "#a5acaf"] },
  PHI: { city: "Philadelphia", nickname: "Eagles", colors: ["#004c54", "#a5acaf"] },
  PIT: { city: "Pittsburgh", nickname: "Steelers", colors: ["#ffb612", "#101820"] },
  SD: { city: "San Diego", nickname: "Chargers", colors: ["#0080c6", "#ffc20e"] },
  SEA: { city: "Seattle", nickname: "Seahawks", colors: ["#002244", "#69be28"] },
  SF: { city: "San Francisco", nickname: "49ers", colors: ["#aa0000", "#b3995d"] },
  STL: { city: "St. Louis", nickname: "Rams", colors: ["#002244", "#866d4b"] },
  TB: { city: "Tampa Bay", nickname: "Buccaneers", colors: ["#d50a0a", "#ff7900"] },
  TEN: { city: "Tennessee", nickname: "Titans", colors: ["#0c2340", "#4b92db"] },
  WAS: { city: "Washington", nickname: null, colors: ["#5a1414", "#ffb612"] },
};

export function teamIdentity(code: string): TeamIdentity | null {
  return TEAMS[code] ?? null;
}

/** "Chicago Bears"; an unknown code falls back to the code itself. */
export function teamName(code: string): string {
  const team = TEAMS[code];
  return team ? (team.nickname ? `${team.city} ${team.nickname}` : team.city) : code;
}

/** Primary colour for a decorative swatch; the accent paper tone when unknown. */
export function teamColor(code: string, which: 0 | 1 = 0): string {
  return TEAMS[code]?.colors[which] ?? "#d2f66b";
}

const ROOF_LABELS: Record<string, string> = { dome: "Dome", outdoors: "Outdoors", closed: "Roof closed", open: "Roof open" };

/** "Ford Field · Dome" or "Giants Stadium · Outdoors · 41°F · Wind 12 mph", built only from recorded fields. */
export function venueLine(game: { stadium?: string | null; roof: string | null; temp: number | null; wind: number | null }): string | null {
  const parts: string[] = [];
  if (game.stadium) parts.push(game.stadium);
  if (game.roof && ROOF_LABELS[game.roof]) parts.push(ROOF_LABELS[game.roof]);
  if (game.roof !== "dome" && game.roof !== "closed") {
    if (Number.isFinite(game.temp)) parts.push(`${Math.round(game.temp!)}°F`);
    if (Number.isFinite(game.wind)) parts.push(`Wind ${Math.round(game.wind!)} mph`);
  }
  return parts.length ? parts.join(" · ") : null;
}
