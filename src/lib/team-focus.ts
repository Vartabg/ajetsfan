import { leaders, type CoverageSnapshot, type NewsItem, type RosterPlayer } from "./coverage";
import { publishedPlayers } from "./published-pages";
import { playerHref } from "./roster";

export type YardKind = "passing" | "rushing" | "receiving";
export type TeamLeader = { kind: YardKind; id: string; name: string; yards: number; team: number; href: string | null };
export type PositionRow = { position: string; label: string; group: RosterPlayer["group"]; count: number };
export type RosterUnit = { group: RosterPlayer["group"]; label: string; count: number; rows: PositionRow[] };

export type TeamFocus = {
  season: number | null;
  stats: { ready: boolean; unavailable: boolean; retained: boolean; throughWeek: number | null; leaders: TeamLeader[]; say: string | null; names: string };
  roster: { week: number | null; retained: boolean; count: number; units: RosterUnit[]; lists: string } | null;
  news: { retained: boolean; unavailable: boolean; lead: NewsItem | null; more: NewsItem[] };
};

const VERB: Record<YardKind, string> = { passing: "throws it", rushing: "runs it", receiving: "catches it" };

const POSITIONS: Record<string, string> = {
  QB: "Quarterbacks", RB: "Running backs", FB: "Fullbacks", WR: "Wide receivers", TE: "Tight ends", OL: "Offensive line",
  DL: "Defensive line", LB: "Linebackers", DB: "Defensive backs", K: "Kickers", P: "Punters", LS: "Long snappers",
};
const POSITION_ORDER = Object.keys(POSITIONS);
const UNITS: { group: RosterPlayer["group"]; label: string }[] = [
  { group: "offense", label: "Offense" }, { group: "defense", label: "Defense" }, { group: "special", label: "Special teams" }, { group: "other", label: "Other" },
];

const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;
const PARTICLE = /^(st\.?|de|del|della|la|le|van|von|da|di|du)$/i;
/** The name a sentence uses for a player: "Smith", "Harrison" for Marvin Harrison Jr., "St. Brown". */
export function surname(name: string): string {
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && SUFFIX.test(words.at(-1)!)) words.pop();
  return words.length > 2 && PARTICLE.test(words.at(-2)!) ? words.slice(-2).join(" ") : words.at(-1) ?? name;
}

/** "48 on the active roster, 14 on the practice squad, 11 on reserve and 8 with other roster designations." */
function rosterLists(players: RosterPlayer[]): string {
  const count = (codes: string[]) => players.filter((player) => codes.includes(player.status)).length;
  const active = count(["ACT"]), practice = count(["DEV", "PS"]), reserve = count(["RES"]);
  const other = players.length - active - practice - reserve;
  const parts = [
    active ? `${active} on the active roster` : "", practice ? `${practice} on the practice squad` : "", reserve ? `${reserve} on reserve` : "",
    other ? `${other} with other roster designation${other === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
}

/** What the Team focus page shows: who leads the yards, the roster by position and the newest official headlines. */
export function buildTeamFocus(coverage: CoverageSnapshot | null, season: number | null): TeamFocus {
  if (!coverage) return {
    season, roster: null,
    stats: { ready: false, unavailable: true, retained: false, throughWeek: null, leaders: [], say: null, names: "" },
    news: { retained: false, unavailable: true, lead: null, more: [] },
  };
  const onRoster = coverage.roster.status !== "unavailable" && coverage.roster.season === season;
  const profiles = new Set(publishedPlayers(coverage, season).map((player) => player.id));
  const rostered = new Set(onRoster ? coverage.roster.players.map((player) => player.id) : []);

  const statsReady = coverage.stats.season === season && coverage.stats.status !== "unavailable";
  const top: TeamLeader[] = statsReady ? (["passing", "rushing", "receiving"] as const).flatMap((kind) => {
    const leader = leaders(coverage.stats, kind, 1)[0];
    if (!leader) return [];
    const team = coverage.stats.players.reduce((sum, player) => sum + player[kind].yards, 0);
    const href = profiles.has(leader.id) ? `/players/${encodeURIComponent(leader.id)}` : rostered.has(leader.id) ? playerHref(leader.id) : null;
    return [{ kind, id: leader.id, name: leader.name, yards: leader[kind].yards, team, href }];
  }) : [];
  // One clause per player, in passing, rushing, receiving order: "Smith throws it, Hall runs it, Wilson catches it."
  // Two leaders who share a surname go by full name.
  const short = new Map(top.map((leader) => [leader.id, surname(leader.name)]));
  const called = (id: string) => top.some((other) => other.id !== id && short.get(other.id) === short.get(id)) ? top.find((leader) => leader.id === id)!.name : short.get(id)!;
  const players = [...new Set(top.map((leader) => leader.id))];
  const say = players.length ? `${players.map((id) => `${called(id)} ${top.filter((leader) => leader.id === id).map((leader) => VERB[leader.kind]).join(" and ")}`).join(", ")}.` : null;

  const counts = new Map<string, PositionRow>();
  if (onRoster) for (const player of coverage.roster.players) {
    const row = counts.get(player.position) ?? { position: player.position, label: POSITIONS[player.position] ?? player.position, group: player.group, count: 0 };
    row.count += 1;
    counts.set(player.position, row);
  }
  const rank = (position: string) => POSITION_ORDER.includes(position) ? POSITION_ORDER.indexOf(position) : POSITION_ORDER.length;
  const rows = [...counts.values()].sort((a, b) => rank(a.position) - rank(b.position) || a.position.localeCompare(b.position));
  const units = UNITS.map(({ group, label }) => {
    const own = rows.filter((row) => row.group === group);
    return { group, label, count: own.reduce((sum, row) => sum + row.count, 0), rows: own };
  }).filter((unit) => unit.rows.length);

  const items = coverage.news.items.toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  return {
    season,
    stats: {
      ready: statsReady, unavailable: coverage.stats.status === "unavailable", retained: statsReady && coverage.stats.status === "retained",
      throughWeek: statsReady ? coverage.stats.throughWeek : null, leaders: top, say, names: players.map(called).join(", "),
    },
    roster: units.length ? { week: coverage.roster.week, retained: coverage.roster.status === "retained", count: coverage.roster.players.length, units, lists: rosterLists(coverage.roster.players) } : null,
    news: { retained: coverage.news.status === "retained", unavailable: coverage.news.status === "unavailable", lead: items[0] ?? null, more: items.slice(1, 4) },
  };
}
