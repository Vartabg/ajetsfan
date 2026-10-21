import "server-only";
import { puzzleSeries } from "./puzzle-series";

/** Frozen series are independent of the changing archive; only the server sees the answer. */
export async function loadPuzzle(day: string) {
  return puzzleSeries(day);
}
