import { loadPuzzle } from "@/lib/load-puzzle";
import { PUZZLE_GUESSES, puzzleDay, puzzleProgress, type Guess } from "@/lib/puzzle";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function readGuesses(value: unknown): Guess[] | null {
  if (!Array.isArray(value) || value.length > PUZZLE_GUESSES) return null;
  const guesses: Guess[] = [];
  for (const item of value) {
    const { opponent, season } = (item ?? {}) as Record<string, unknown>;
    if (typeof opponent !== "string" || opponent.length > 8 || !Number.isInteger(season)) return null;
    guesses.push({ opponent, season: season as number });
  }
  return guesses;
}

/** Judges a day's guesses on the server so the answer never ships with the page. A future day is refused. */
export async function POST(request: Request) {
  let body: { day?: unknown; guesses?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "bad request" }, { status: 400, headers }); }
  const guesses = readGuesses(body.guesses);
  const day = typeof body.day === "string" && DAY.test(body.day) && body.day <= puzzleDay(new Date()) ? body.day : null;
  if (!day || !guesses) return Response.json({ error: "bad request" }, { status: 400, headers });
  const { game } = await loadPuzzle(day);
  if (!game) return Response.json({ error: "no puzzle" }, { status: 404, headers });
  return Response.json(puzzleProgress(game, guesses), { headers });
}
