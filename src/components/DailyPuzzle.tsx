"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import PressChart from "./PressChart";
import type { CurvePoint } from "@/lib/load-games";
import { formatDate } from "@/lib/current";
import { PUZZLE_GUESSES, solved, type Guess, type PuzzleProgress, type Verdict } from "@/lib/puzzle";
import { teamName } from "@/lib/teams";
import styles from "./DailyPuzzle.module.css";

type Entry = Guess & { verdict: Verdict };
type Saved = { guesses: Entry[] };
type Tally = { played: number; solved: number; lastDay: string | null };

const dayKey = (day: string) => `back-page-puzzle:v1:${day}`;
const TALLY_KEY = "back-page-puzzle:v1:tally";

// Browser storage keeps the day's progress; when it is unavailable the puzzle still plays from memory.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
function readRaw(key: string): string | null {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
}
function writeStore(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try { localStorage.setItem(key, raw); } catch { /* private mode or full storage */ }
  for (const listener of listeners) listener();
}
function useStored<T>(key: string): T | null {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  return useMemo(() => { try { return raw ? JSON.parse(raw) as T : null; } catch { return null; } }, [raw]);
}
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

// The server judges every guess, so the answer is never part of the page.
async function check(day: string, guesses: Guess[]): Promise<PuzzleProgress> {
  const response = await fetch("/api/puzzle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses: guesses.map(({ opponent, season }) => ({ opponent, season })) }) });
  if (!response.ok) throw new Error(`puzzle check failed: ${response.status}`);
  return response.json() as Promise<PuzzleProgress>;
}

const CLUE_LABELS = ["When", "Conditions", "Margin", "Final score", "Colours", "Season"];

export default function DailyPuzzle({ day, board, points, opponents, seasons }: {
  day: string; board: "heartbreak" | "miracle"; points: Pick<CurvePoint, "q" | "wp">[]; opponents: { code: string; name: string }[]; seasons: number[];
}) {
  const restored = useHydrated();
  const guesses = useStored<Saved>(dayKey(day))?.guesses ?? [];
  const tally = useStored<Tally>(TALLY_KEY);
  const [opponent, setOpponent] = useState("");
  const [season, setSeason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);

  const won = guesses.some((entry) => solved(entry.verdict));
  const over = won || guesses.length >= PUZZLE_GUESSES;
  const ready = restored && (!guesses.length || progress !== null);
  const opened = progress?.clues ?? [];
  const answer = progress?.answer ?? null;

  // A returning visitor's saved guesses are sent back once to reopen their clues.
  const hasSaved = guesses.length > 0;
  useEffect(() => {
    if (!restored || !hasSaved || progress) return;
    let live = true;
    check(day, guesses).then((result) => { if (live) setProgress(result); }, () => { if (live) setError("Could not load your clues. Reload to try again."); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per restored day
  }, [restored, hasSaved, day]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (over || pending) return;
    if (!opponent || !season) { setError("Choose an opponent and a season."); return; }
    setError(null);
    setPending(true);
    const asked = [...guesses, { opponent, season: Number(season) }];
    try {
      const result = await check(day, asked);
      const next = asked.slice(0, result.verdicts.length).map((guess, index) => ({ opponent: guess.opponent, season: guess.season, verdict: result.verdicts[index] }));
      const last = next.at(-1)!.verdict;
      const finished = solved(last) || next.length >= PUZZLE_GUESSES;
      if (finished && tally?.lastDay !== day) {
        writeStore(TALLY_KEY, { played: (tally?.played ?? 0) + 1, solved: (tally?.solved ?? 0) + (solved(last) ? 1 : 0), lastDay: day });
      }
      setProgress(result);
      writeStore(dayKey(day), { guesses: next });
    } catch {
      setError("Could not check that guess. Try again.");
    } finally {
      setPending(false);
    }
  }

  const rival = answer ? { "--rival": answer.colours[0], "--rival-2": answer.colours[1] } as CSSProperties : undefined;

  return <div className={styles.puzzle} data-puzzle={day} data-puzzle-state={!ready ? "loading" : won ? "won" : over ? "lost" : "open"}>
    <figure className={styles.chart}>
      <figcaption><strong>Clue 1 · The Jets&rsquo; chance of winning.</strong><span>Higher means the Jets were more likely to win. The circle marks their {board === "miracle" ? "lowest" : "highest"} point after halftime. Quarters are spaced by number of plays, not by time.</span></figcaption>
      {points.length >= 2 ? <PressChart points={points} board={board} size="wide" /> : <p>The chart for this game is unavailable.</p>}
    </figure>
    <ol className={styles.clues} aria-label="Clues from the record">
      {CLUE_LABELS.map((label, index) => {
        const clue = opened[index];
        return <li key={label} className={clue ? styles.open : styles.locked} aria-hidden={clue ? undefined : true}>
          <span className={styles.clueLabel}>Clue {index + 2} · {label}</span>
          {clue ? clue.colours ? <span className={styles.colours} style={{ "--rival": clue.colours[0], "--rival-2": clue.colours[1] } as CSSProperties}><i aria-hidden="true" /><i aria-hidden="true" />{clue.text}</span> : <span>{clue.text}</span> : <span>Opens after guess {index + 1}</span>}
        </li>;
      })}
    </ol>
    <form className={styles.form} onSubmit={submit} aria-label="Your guess">
      <label>Opponent<select value={opponent} onChange={(event) => setOpponent(event.target.value)} disabled={over || !ready || pending} data-puzzle-opponent><option value="">Choose a team</option>{opponents.map((team) => <option key={team.code} value={team.code}>{team.name}</option>)}</select></label>
      <label>Season<select value={season} onChange={(event) => setSeason(event.target.value)} disabled={over || !ready || pending} data-puzzle-season><option value="">Choose a year</option>{seasons.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <button type="submit" disabled={over || !ready || pending}>Guess {Math.min(guesses.length + 1, PUZZLE_GUESSES)} of {PUZZLE_GUESSES}</button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </form>
    {guesses.length ? <ol className={styles.guesses} aria-label="Your guesses">
      {guesses.map((entry, index) => <li key={index} data-puzzle-guess>
        <span className={styles.guessNumber}>{index + 1}</span>
        <span><strong>{teamName(entry.opponent)}</strong> · {entry.season}</span>
        <span className={styles.verdict}><em className={entry.verdict.opponent === "right" ? styles.right : styles.wrong}>Opponent {entry.verdict.opponent}</em><em className={entry.verdict.season === "right" ? styles.right : styles.wrong}>Season {entry.verdict.season === "right" ? "right" : entry.verdict.season}</em></span>
      </li>)}
    </ol> : null}
    {over && answer ? <div className={styles.reveal} data-puzzle-reveal style={rival}>
      <p className={styles.kicker}>{won ? `Solved in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}.` : "Not this time."}</p>
      <p className={styles.answer}>Jets {answer.jetsScore}–{answer.oppScore} {answer.atHome ? "vs" : "at"} {answer.opponent}</p>
      <p>{answer.seasonType === "POST" ? "Postseason" : "Regular season"} · Week {answer.week} · <time dateTime={answer.date}>{formatDate(answer.date)}</time>{answer.wentToOt ? " · Overtime" : ""}</p>
      <Link href={answer.caseHref}>Read the game report <span aria-hidden="true">→</span></Link>
      {tally ? <p className={styles.tally}>Solved {tally.solved} of {tally.played} played in this browser.</p> : null}
      <p className={styles.next}>The next puzzle opens at midnight New York time.</p>
    </div> : null}
  </div>;
}
