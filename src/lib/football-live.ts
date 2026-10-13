export type LiveFootballPlayer = {
  espnId: string; name: string; position: string;
  passing: { completions: number | null; attempts: number | null; yards: number | null; touchdowns: number | null; interceptions: number | null } | null;
  rushing: { carries: number | null; yards: number | null; touchdowns: number | null } | null;
  receiving: { targets: number | null; receptions: number | null; yards: number | null; touchdowns: number | null } | null;
};
export type LiveFootballGame = {
  eventId: string; gameId: string; season: number; week: number; seasonType: "REG" | "POST";
  /** ESPN playoff rounds restart at one; week remains the matched nflverse week. */
  providerWeek?: number; source?: string;
  kickoff: string | null; opponent: string; opponentDisplay: string; atHome: boolean;
  state: "scheduled" | "live" | "final" | "postponed" | "suspended" | "cancelled";
  jetsScore: number | null; oppScore: number | null; period: number; clock: string | null;
  detail: string; provisional: boolean; players: LiveFootballPlayer[];
  teamStats?: { name: string; label: string; displayValue: string }[];
};
export type LiveFootballFeed = {
  schemaVersion: 1; season: number; source: string; checkedAt: string | null; attemptedAt: string;
  sources?: string[];
  status: "ready" | "retained" | "unavailable"; games: LiveFootballGame[]; featured: LiveFootballGame | null;
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 160) => typeof value === "string" && !!value.trim() && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value);
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const score = (value: unknown) => integer(value, 0, 999);
const states = new Set(["scheduled", "live", "final", "postponed", "suspended", "cancelled"]);
const fields = { passing: ["completions", "attempts", "yards", "touchdowns", "interceptions"], rushing: ["carries", "yards", "touchdowns"], receiving: ["targets", "receptions", "yards", "touchdowns"] };

export function isLiveFootballFeed(value: unknown): value is LiveFootballFeed {
  if (!object(value) || value.schemaVersion !== 1 || !integer(value.season, 1999, 2200)
    || value.source !== `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/20/schedule?season=${value.season}&seasontype=2`
    || !date(value.attemptedAt) || !["ready", "retained", "unavailable"].includes(value.status as string)
    || value.checkedAt !== null && (!date(value.checkedAt) || Date.parse(value.checkedAt as string) > Date.parse(value.attemptedAt as string))
    || value.status === "unavailable" && value.checkedAt !== null || value.status !== "unavailable" && !date(value.checkedAt)
    || !Array.isArray(value.games) || value.games.length > 30 || value.status === "ready" && (!value.games.length || value.checkedAt !== value.attemptedAt)
    || value.status === "unavailable" && (value.games.length !== 0 || value.featured !== null)) return false;
  const regularSource = value.source as string, playoffSource = regularSource.replace("seasontype=2", "seasontype=3");
  if (value.sources !== undefined && (!Array.isArray(value.sources) || !value.sources.length || value.sources.length > 2
    || new Set(value.sources).size !== value.sources.length || value.sources.some((source) => ![regularSource, playoffSource].includes(source as string)))) return false;
  const ids = new Set<string>(), events = new Set<string>();
  for (const game of value.games) {
    if (!object(game) || !/^\d{4}_\d{2}_[A-Z]{2,4}_[A-Z]{2,4}$/.test(game.gameId as string)
      || !/^\d{1,12}$/.test(game.eventId as string) || ids.has(game.gameId as string) || events.has(game.eventId as string)
      || game.season !== value.season || !integer(game.week, 1, 30) || !["REG", "POST"].includes(game.seasonType as string)
      || typeof game.atHome !== "boolean" || !/^[A-Z]{2,4}$/.test(game.opponent as string) || game.opponent === "NYJ"
      || !text(game.opponentDisplay, 80) || !states.has(game.state as string) || !integer(game.period, 0, 10)
      || game.clock !== null && (typeof game.clock !== "string" || !/^\d{1,2}:[0-5]\d$/.test(game.clock))
      || !text(game.detail, 160) || game.provisional !== (game.state === "live" || game.state === "suspended")
      || game.kickoff !== null && !date(game.kickoff) || !Array.isArray(game.players) || game.players.length > 100) return false;
    if (game.source !== undefined && game.source !== (game.seasonType === "POST" ? playoffSource : regularSource)
      || Array.isArray(value.sources) && !value.sources.includes(game.source ?? regularSource)
      || game.providerWeek !== undefined && (!integer(game.providerWeek, 1, game.seasonType === "POST" ? 4 : 30)
        || game.seasonType === "REG" && game.providerWeek !== game.week)
      || game.seasonType === "POST" && (game.source !== playoffSource || !integer(game.providerWeek, 1, 4)
        || !Array.isArray(value.sources) || !value.sources.includes(playoffSource))) return false;
    const expectedId = `${game.season}_${String(game.week).padStart(2, "0")}_${game.atHome ? game.opponent : "NYJ"}_${game.atHome ? "NYJ" : game.opponent}`;
    if (game.gameId !== expectedId || ["live", "final"].includes(game.state as string) && (!score(game.jetsScore) || !score(game.oppScore))
      || !["live", "final", "suspended"].includes(game.state as string) && (game.jetsScore !== null || game.oppScore !== null)
      || game.state === "suspended" && ((game.jetsScore !== null && !score(game.jetsScore)) || (game.oppScore !== null && !score(game.oppScore)))
      || ["live", "final"].includes(game.state as string) && (!game.kickoff || !value.checkedAt || Date.parse(game.kickoff as string) > Date.parse(value.checkedAt as string))) return false;
    ids.add(game.gameId as string); events.add(game.eventId as string);
    const playerIds = new Set<string>();
    for (const player of game.players) {
      if (!object(player) || !/^\d{1,12}$/.test(player.espnId as string) || playerIds.has(player.espnId as string)
        || !text(player.name) || !text(player.position, 12)) return false;
      playerIds.add(player.espnId as string);
      for (const [category, names] of Object.entries(fields)) {
        const counters = player[category];
        if (counters === null) continue;
        if (!object(counters) || names.some((name) => counters[name] !== null && !integer(counters[name], name === "yards" ? -2000 : 0, 10000))) return false;
        if (category === "passing" && counters.completions !== null && counters.attempts !== null && (counters.completions as number) > (counters.attempts as number)) return false;
      }
    }
    if (game.teamStats !== undefined && (!Array.isArray(game.teamStats) || game.teamStats.length > 100 || game.teamStats.some((row) =>
      !object(row) || !text(row.name, 80) || !text(row.label, 100) || !text(row.displayValue, 80)))) return false;
  }
  return value.featured === null || object(value.featured) && value.games.some((game) => JSON.stringify(game) === JSON.stringify(value.featured));
}

export function validateLiveFootball(value: unknown): LiveFootballFeed {
  if (!isLiveFootballFeed(value)) throw new Error("Invalid live football edition");
  return value;
}
