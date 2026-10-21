import { useMemo, useSyncExternalStore } from "react";
import { PUZZLE_GUESSES, type Guess, type Verdict } from "@/lib/puzzle";

export type Entry = Guess & { verdict: Verdict };
export type Tally = { played: number; solved: number; lastDay: string | null };
type Saved = { guesses: Entry[] };
// v2 starts the frozen archive; earlier guesses must not be judged against a changed pool.
export const dayKey = (day: string) => `back-page-puzzle:v2:${day}`;
export const TALLY_KEY = "back-page-puzzle:v1:tally";
const EMPTY: Entry[] = [];
const memory = new Map<string, string>();
const volatileKeys = new Set<string>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === null) { memory.clear(); volatileKeys.clear(); }
    else { memory.delete(event.key); volatileKeys.delete(event.key); }
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function readRaw(key: string): string | null {
  // A successful read of null means another tab removed it. Never resurrect the memory copy.
  if (volatileKeys.has(key)) return memory.get(key) ?? null;
  try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}
export function writeStore(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try { localStorage.setItem(key, raw); volatileKeys.delete(key); } catch { volatileKeys.add(key); }
  for (const listener of listeners) listener();
}
function useStored<T>(key: string): T | null {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  return useMemo(() => { try { return raw ? JSON.parse(raw) as T : null; } catch { return null; } }, [raw]);
}
function validSaved(value: Saved | null): value is Saved {
  return !!value && Array.isArray(value.guesses) && value.guesses.length <= PUZZLE_GUESSES && value.guesses.every((entry) =>
    !!entry && typeof entry.opponent === "string" && /^[A-Z]{2,3}$/.test(entry.opponent) && Number.isInteger(entry.season) &&
    entry.season >= 1999 && !!entry.verdict && ["right", "wrong"].includes(entry.verdict.opponent) && ["right", "earlier", "later"].includes(entry.verdict.season));
}
export function usePuzzleStorage(day: string) {
  const saved = useStored<Saved>(dayKey(day));
  const tally = useStored<Tally>(TALLY_KEY);
  const restored = useSyncExternalStore(subscribe, () => true, () => false);
  return { restored, guesses: validSaved(saved) ? saved.guesses : EMPTY,
    tally: tally && Number.isInteger(tally.played) && Number.isInteger(tally.solved) && tally.played >= tally.solved && tally.solved >= 0 ? tally : null };
}
