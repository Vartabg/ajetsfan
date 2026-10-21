import { loadPuzzle } from "@/lib/load-puzzle";
import { PUZZLE_GUESSES, puzzleDay, puzzleProgress, type Guess } from "@/lib/puzzle";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const MAX_BYTES = 2048;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const invalid = (status = 400) => Response.json({ error: status === 413 ? "That puzzle request is too large." : "That puzzle request is not valid.", action: "Reload the puzzle and choose an opponent and season." }, { status, headers });

/** Bound streamed bodies too; content-length is neither required nor trusted. */
async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new RangeError("large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function readDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1999-01-01" || value > puzzleDay(new Date())) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function readGuesses(value: unknown): Guess[] | null {
  if (!Array.isArray(value) || value.length > PUZZLE_GUESSES) return null;
  const guesses: Guess[] = [];
  for (const item of value) {
    if (!object(item)) return null;
    const { opponent, season } = item;
    if (typeof opponent !== "string" || !/^[A-Z]{2,3}$/.test(opponent) || typeof season !== "number" || !Number.isInteger(season) || season < 1999 || season > new Date().getFullYear()) return null;
    guesses.push({ opponent, season });
  }
  return guesses;
}

/** Judges guesses on the server; the answer is revealed only when play ends. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await readBody(request); } catch (error) { return invalid(error instanceof RangeError ? 413 : 400); }
  if (!object(body)) return invalid();
  const guesses = readGuesses(body.guesses), day = readDay(body.day);
  if (!day || !guesses) return invalid();
  const { game } = await loadPuzzle(day);
  if (!game) return Response.json({ error: "That puzzle is unavailable.", action: "Open today's puzzle to play." }, { status: 404, headers });
  return Response.json(puzzleProgress(game, guesses), { headers });
}
