import type { CoverageSnapshot } from "./coverage";

/** A player's Jets games, season by season, as scripts/player-pages.mjs writes them. Pure helpers; the loader reads the files. */
export type PlayerLine = {
  /** completions, attempts, yards, touchdowns, interceptions */ pass?: number[];
  /** carries, yards, touchdowns */ rush?: number[];
  /** receptions, targets, yards, touchdowns */ rec?: number[];
  /** tackles, sacks, interceptions, passes defended, forced fumbles */ def?: number[];
};
export type PlayerGame = PlayerLine & { week: number; gameId: string; post: boolean; opponent: string };
export type PlayerPlay = { gameId: string; playId: number; q: number; d: number; desc: string };
export type PlayerSeasonFile = {
  schemaVersion: 1; season: number; source: string; checkedAt: string;
  players: Record<string, { name: string; short: string; position: string | null; games: PlayerGame[]; plays: PlayerPlay[] }>;
};
export type PlayerHistory = {
  seasons: ({ season: number; games: number; totals: PlayerLine; source: string } & ArchiveCoverage)[];
  /** The latest season's games, when the player has any. */
  latest: ({ season: number; games: PlayerGame[] } & ArchiveCoverage) | null;
  plays: (PlayerPlay & { season: number; week: number; post: boolean; opponent: string })[];
};
type ArchiveCoverage = { checkedAt: string; throughWeek: number | null; playoffs: boolean };

const KINDS = ["pass", "rush", "rec", "def"] as const;
type Kind = typeof KINDS[number];

export function sumLines(lines: PlayerLine[]): PlayerLine {
  const total: PlayerLine = {};
  for (const line of lines) for (const kind of KINDS) {
    const values = line[kind];
    if (!values) continue;
    total[kind] = values.map((value, index) => Math.round(((total[kind]?.[index] ?? 0) + value) * 2) / 2);
  }
  return total;
}

export function historyFor(id: string, files: PlayerSeasonFile[]): PlayerHistory | null {
  const mine = files.filter((file) => file.players[id]).sort((a, b) => a.season - b.season);
  if (!mine.length) return null;
  const last = mine.at(-1)!;
  // The file's cutoff is independent of a player's bye, injury or last recorded appearance.
  const coverage = (file: PlayerSeasonFile): ArchiveCoverage => {
    const games = Object.values(file.players).flatMap((player) => player.games);
    const weeks = games.filter((game) => !game.post).map((game) => game.week);
    return { checkedAt: file.checkedAt, throughWeek: weeks.length ? Math.max(...weeks) : null, playoffs: games.some((game) => game.post) };
  };
  return {
    seasons: mine.map((file) => ({ season: file.season, games: file.players[id].games.length, totals: sumLines(file.players[id].games), source: file.source, ...coverage(file) })),
    latest: { season: last.season, games: last.players[id].games, ...coverage(last) },
    plays: mine.flatMap((file) => file.players[id].plays.map((play) => {
      const game = file.players[id].games.find((entry) => entry.gameId === play.gameId)!;
      return { ...play, season: file.season, week: game.week, post: game.post, opponent: game.opponent };
    })).sort((a, b) => b.d - a.d).slice(0, 3),
  };
}

/** Archive rows and live aggregate totals refresh separately. Compare only their common regular-season scope. */
export function archiveDiffersFromStats(history: PlayerHistory, id: string, stats: CoverageSnapshot["stats"]): boolean {
  if (stats.status === "unavailable" || history.latest?.season !== stats.season) return false;
  const player = stats.players.find((entry) => entry.id === id);
  if (!player) return false;
  const games = history.latest.games.filter((game) => !game.post);
  const ids = stats.playerGameIds?.[id];
  if (games.length !== player.games || ids && (ids.length !== games.length || games.some((game) => !ids.includes(game.gameId)))) return true;
  const total = sumLines(games);
  const same = (actual: number[] | undefined, expected: number[]) => expected.every((value, index) => value === (actual?.[index] ?? 0));
  return !same(total.pass, [player.passing.completions, player.passing.attempts, player.passing.yards, player.passing.touchdowns, player.passing.interceptions])
    || !same(total.rush, [player.rushing.carries, player.rushing.yards, player.rushing.touchdowns])
    || !same(total.rec, [player.receiving.receptions, player.receiving.targets, player.receiving.yards, player.receiving.touchdowns]);
}

export type Focus = { kind: Kind; unit: string; value: (line: PlayerLine) => number };
const FOCUS: Record<Kind, Focus> = {
  pass: { kind: "pass", unit: "passing yards", value: (line) => line.pass?.[2] ?? 0 },
  rush: { kind: "rush", unit: "rushing yards", value: (line) => line.rush?.[1] ?? 0 },
  rec: { kind: "rec", unit: "receiving yards", value: (line) => line.rec?.[2] ?? 0 },
  def: { kind: "def", unit: "tackles", value: (line) => line.def?.[0] ?? 0 },
};

/** The one number a player's bars measure: passing for a passer, tackles for a defender, else whichever yards are larger. */
export function focusOf(total: PlayerLine): Focus | null {
  const touches = (total.rush?.[0] ?? 0) + (total.rec?.[1] ?? 0);
  if ((total.pass?.[1] ?? 0) >= 20) return FOCUS.pass;
  if (total.def && touches < 5) return FOCUS.def;
  if (total.rush || total.rec) return (total.rush?.[1] ?? 0) >= (total.rec?.[2] ?? 0) ? FOCUS.rush : FOCUS.rec;
  return total.def ? FOCUS.def : null;
}

const n = (value: number) => value.toLocaleString("en-US");
const td = (value: number) => value ? `, ${value} TD` : "";
/** One line in words: "19 of 24 passing, 215 yards, 1 TD · 3 carries, 12 yards". */
export function lineText(line: PlayerLine) {
  return [
    line.pass && line.pass[1] ? `${line.pass[0]} of ${line.pass[1]} passing, ${n(line.pass[2])} yards${td(line.pass[3])}${line.pass[4] ? `, ${line.pass[4]} INT` : ""}` : null,
    line.rush && line.rush[0] ? `${line.rush[0]} ${line.rush[0] === 1 ? "carry" : "carries"}, ${n(line.rush[1])} yards${td(line.rush[2])}` : null,
    line.rec && line.rec[1] ? `${line.rec[0]} ${line.rec[0] === 1 ? "catch" : "catches"} on ${line.rec[1]} ${line.rec[1] === 1 ? "target" : "targets"}, ${n(line.rec[2])} yards${td(line.rec[3])}` : null,
    line.def ? [line.def[0] ? `${line.def[0]} ${line.def[0] === 1 ? "tackle" : "tackles"}` : null, line.def[1] ? `${line.def[1]} ${line.def[1] === 1 ? "sack" : "sacks"}` : null,
      line.def[2] ? `${line.def[2]} INT` : null, line.def[3] ? `${line.def[3]} ${line.def[3] === 1 ? "pass" : "passes"} defended` : null, line.def[4] ? `${line.def[4]} forced ${line.def[4] === 1 ? "fumble" : "fumbles"}` : null]
      .filter(Boolean).join(", ") || null : null,
  ].filter(Boolean).join(" · ");
}

/** A play as a sentence: prefer the final replay ruling, remove clock and formation tags, and stop at a word. */
export function playText(desc: string) {
  // nflverse repeats the corrected play after its replay note. Shortening the original
  // first would hide the final result, including touchdowns awarded on review.
  const final = desc.split(/\b(?:play|ruling)\s+was\s+REVERSED\.\s*/i).at(-1)?.trim() || desc;
  const plain = final.replace(/^\(\s*[\d:]*\s*\)\s*/, "").replace(/\((?:Shotgun|No Huddle|No Huddle, Shotgun|Run formation|Punt formation|Field Goal formation)\)\s*/gi, "").trim();
  return plain.length <= 180 ? plain : `${plain.slice(0, plain.lastIndexOf(" ", 176))}…`;
}
