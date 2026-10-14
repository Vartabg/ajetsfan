/** Each drive: [jets 1/0, quarter, seconds left in the quarter at its first snap, start, end, plays, result index]. */
export type DriveRow = [jets: 0 | 1, quarter: number, clock: number, start: number, end: number, plays: number, result: number];
export type DrivesFile = { schemaVersion: 1; season: number; source: string; checkedAt: string; results: string[]; games: Record<string, DriveRow[]> };
/** A published current-season file records which confirmed final each chart describes. */
export type RuntimeDrives = DrivesFile & { status: "ready" | "retained"; attemptedAt: string;
  finals: Record<string, { date: string; jetsScore: number; oppScore: number }>; pendingGameIds: string[];
  asset?: { url: string; etag: string | null; lastModified: string | null; contentLength: number | null } | null };

export type Drive = { jets: boolean; quarter: number; clock: number; start: number; end: number; plays: number; result: string; kind: "score" | "giveaway" | "empty" };

const SCORES = new Set(["Touchdown", "Field goal"]);
const GIVEAWAYS = new Set(["Turnover", "Opp touchdown", "Safety"]);

export function readDrives(file: DrivesFile, gameId: string): Drive[] | null {
  const rows = file.games[gameId];
  if (!rows?.length) return null;
  return rows.map(([jets, quarter, clock, start, end, plays, result]) => {
    const name = file.results[result];
    return { jets: jets === 1, quarter, clock, start, end, plays, result: name, kind: SCORES.has(name) ? "score" : GIVEAWAYS.has(name) ? "giveaway" : "empty" };
  });
}

/** "own 20", "50", "opp 32", from the point of view of the team with the ball. Positions run 0–100 from the Jets' goal line. */
export function spot(x: number, jets: boolean): string {
  const own = jets ? x : 100 - x;
  if (own === 100) return "the end zone";
  return own === 50 ? "midfield" : own < 50 ? `own ${Math.round(own)}` : `opp ${Math.round(100 - own)}`;
}

/** A sentence-sized count: "2 touchdowns, 1 field goal" or "no points". */
export function scoringSummary(drives: Drive[]): string {
  const count = (name: string) => drives.filter((drive) => drive.result === name).length;
  const parts = [[count("Touchdown"), "touchdown"], [count("Field goal"), "field goal"]].filter(([n]) => n).map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "no points";
}
