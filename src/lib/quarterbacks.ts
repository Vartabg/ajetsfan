import type { HistoryGame } from "./league-history";
import { teamIdentity } from "./teams";

/** Enough colours that no quarterback shares one with a starter he alternated with or a teammate in the same season. */
export const QB_COLORS = 8;

export type Quarterback = { id: string; name: string; starts: number; wins: number; losses: number; ties: number; first: string; last: string; color: number };
/** One game, compact: quarterback index, outcome letter, week, opponent city, home, Jets score, their score, playoff. */
export type CarouselGame = [qb: number, outcome: "W" | "L" | "T", week: number, opponent: string, home: boolean, us: number, them: number, playoff: boolean];
export type Stint = { qb: number; games: number; from: number; to: number; playoff: boolean };

export type Carousel = {
  from: number;
  to: number;
  games: number;
  changes: number;
  quarterbacks: Quarterback[];
  seasons: { season: number; games: CarouselGame[] }[];
  /** The season with the most different starters; the latest one when several tie. */
  busiest: { season: number; stints: Stint[] };
  /** The most consecutive starts by one quarterback, and who started next. */
  run: { qb: number; games: number; first: string; last: string; next: number | null };
};

const city = (code: string) => teamIdentity(code)?.city ?? code;

/**
 * The Jets' starting quarterbacks as the NFL schedule record lists them, playoffs included.
 * Two quarterbacks who followed each other or shared a season never share a colour.
 */
export function buildCarousel(history: HistoryGame[]): Carousel | null {
  const played = history.filter((game) => game.status === "final" && game.qb && game.outcome && game.jetsScore !== null && game.oppScore !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!played.length) return null;
  const byId = new Map<string, Omit<Quarterback, "color">>();
  for (const game of played) {
    const qb = game.qb!;
    const entry = byId.get(qb.id) ?? { id: qb.id, name: qb.name, starts: 0, wins: 0, losses: 0, ties: 0, first: game.date, last: game.date };
    entry.starts += 1;
    entry[game.outcome === "win" ? "wins" : game.outcome === "loss" ? "losses" : "ties"] += 1;
    entry.last = game.date;
    entry.name = qb.name;
    byId.set(qb.id, entry);
  }
  const ordered = [...byId.values()].sort((a, b) => b.starts - a.starts || a.first.localeCompare(b.first));
  const index = new Map(ordered.map((qb, position) => [qb.id, position]));

  const neighbours = new Map(ordered.map((qb) => [qb.id, new Set<string>()]));
  const link = (a: string, b: string) => { if (a !== b) { neighbours.get(a)!.add(b); neighbours.get(b)!.add(a); } };
  played.forEach((game, position) => { if (position) link(game.qb!.id, played[position - 1].qb!.id); });
  const seasonGroups = new Map<number, HistoryGame[]>();
  for (const game of played) seasonGroups.set(game.season, [...(seasonGroups.get(game.season) ?? []), game]);
  for (const games of seasonGroups.values()) for (const a of games) for (const b of games) link(a.qb!.id, b.qb!.id);
  // The eight longest-serving starters each get their own colour; everyone else takes the least-used colour
  // that none of his neighbours has, so eras do not blur into one.
  const colors = new Map<string, number>();
  const used = Array<number>(QB_COLORS).fill(0);
  for (const qb of ordered) {
    const taken = new Set([...neighbours.get(qb.id)!].map((id) => colors.get(id)).filter((color) => color !== undefined));
    const free = Array.from({ length: QB_COLORS }, (_, value) => value).filter((value) => !taken.has(value));
    const color = colors.size < QB_COLORS ? colors.size : free.sort((a, b) => used[a] - used[b] || a - b)[0];
    if (color === undefined || taken.has(color)) throw new Error(`No free quarterback colour for ${qb.name}`);
    colors.set(qb.id, color);
    used[color] += 1;
  }

  const seasons = [...seasonGroups].sort(([a], [b]) => a - b).map(([season, games]) => ({
    season,
    games: games.map((game): CarouselGame => [index.get(game.qb!.id)!, game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T", game.week, city(game.opponent), game.atHome, game.jetsScore!, game.oppScore!, game.seasonType === "POST"]),
  }));

  const stints = (games: HistoryGame[]) => games.reduce<Stint[]>((list, game) => {
    const qb = index.get(game.qb!.id)!, last = list.at(-1);
    if (last && last.qb === qb) { last.games += 1; last.to = game.week; last.playoff ||= game.seasonType === "POST"; }
    else list.push({ qb, games: 1, from: game.week, to: game.week, playoff: game.seasonType === "POST" });
    return list;
  }, []);
  const busiest = [...seasonGroups].map(([season, games]) => ({ season, count: new Set(games.map((game) => game.qb!.id)).size, games }))
    .sort((a, b) => b.count - a.count || b.season - a.season)[0];

  let run = { qb: index.get(played[0].qb!.id)!, games: 0, first: played[0].date, last: played[0].date, next: null as number | null };
  let current = { ...run };
  played.forEach((game, position) => {
    const qb = index.get(game.qb!.id)!;
    current = current.qb === qb && position ? { ...current, games: current.games + 1, last: game.date } : { qb, games: 1, first: game.date, last: game.date, next: null };
    if (current.games > run.games) run = { ...current, next: played[position + 1] ? index.get(played[position + 1].qb!.id)! : null };
  });

  return {
    from: played[0].season, to: played.at(-1)!.season, games: played.length,
    changes: played.filter((game, position) => position && game.qb!.id !== played[position - 1].qb!.id).length,
    quarterbacks: ordered.map((qb) => ({ ...qb, color: colors.get(qb.id)! })),
    seasons, busiest: { season: busiest.season, stints: stints(busiest.games) }, run,
  };
}
