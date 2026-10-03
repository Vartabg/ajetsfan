"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import PressChart from "./PressChart";
import type { CurvePoint } from "@/lib/load-games";
import { formatDate } from "@/lib/current";
import { PUZZLE_GUESSES, judge, puzzleClues, solved, type Guess, type PuzzleGame, type Verdict } from "@/lib/puzzle";
import { teamColor, teamName } from "@/lib/teams";
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

export default function DailyPuzzle({ day, game, points, opponents, seasons, caseHref }: {
  day: string; game: PuzzleGame; points: CurvePoint[]; opponents: { code: string; name: string }[]; seasons: number[]; caseHref: string | null;
}) {
  const restored = useHydrated();
  const guesses = useStored<Saved>(dayKey(day))?.guesses ?? [];
  const tally = useStored<Tally>(TALLY_KEY);
  const [opponent, setOpponent] = useState("");
  const [season, setSeason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const won = guesses.some((entry) => solved(entry.verdict));
  const over = won || guesses.length >= PUZZLE_GUESSES;
  const clues = puzzleClues(game);
  const revealed = over ? clues.length : Math.min(guesses.length, clues.length);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (over) return;
    if (!opponent || !season) { setError("Choose an opponent and a season."); return; }
    setError(null);
    const guess = { opponent, season: Number(season) };
    const entry = { ...guess, verdict: judge(game, guess) };
    const next = [...guesses, entry];
    const finished = solved(entry.verdict) || next.length >= PUZZLE_GUESSES;
    if (finished && tally?.lastDay !== day) {
      writeStore(TALLY_KEY, { played: (tally?.played ?? 0) + 1, solved: (tally?.solved ?? 0) + (solved(entry.verdict) ? 1 : 0), lastDay: day });
    }
    writeStore(dayKey(day), { guesses: next });
  }

  const rival = { "--rival": teamColor(game.opponentDisplay), "--rival-2": teamColor(game.opponentDisplay, 1) } as CSSProperties;

  return <div className={styles.puzzle} data-puzzle={day} data-puzzle-state={!restored ? "loading" : won ? "won" : over ? "lost" : "open"}>
    <figure className={styles.chart}>
      <figcaption><strong>Clue 1 · The probability line.</strong><span>Jets win probability, play by play · a model estimate from the play-by-play, not a record of the score</span></figcaption>
      {points.length >= 2 ? <PressChart points={points} board={game.outcome === "win" ? "miracle" : "heartbreak"} size="wide" /> : <p>The chart for this game is unavailable.</p>}
    </figure>
    <ol className={styles.clues} aria-label="Clues from the record">
      {clues.map((clue, index) => <li key={clue.label} className={index < revealed ? styles.open : styles.locked} aria-hidden={index < revealed ? undefined : true}>
        <span className={styles.clueLabel}>Clue {index + 2} · {clue.label}</span>
        {index < revealed ? clue.kind === "colours" ? <span className={styles.colours} style={rival}><i aria-hidden="true" /><i aria-hidden="true" />{clue.text}</span> : <span>{clue.text}</span> : <span>Opens after guess {index + 1}</span>}
      </li>)}
    </ol>
    <form className={styles.form} onSubmit={submit} aria-label="Your guess">
      <label>Opponent<select value={opponent} onChange={(event) => setOpponent(event.target.value)} disabled={over || !restored} data-puzzle-opponent><option value="">Choose a team</option>{opponents.map((team) => <option key={team.code} value={team.code}>{team.name}</option>)}</select></label>
      <label>Season<select value={season} onChange={(event) => setSeason(event.target.value)} disabled={over || !restored} data-puzzle-season><option value="">Choose a year</option>{seasons.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <button type="submit" disabled={over || !restored}>Guess {Math.min(guesses.length + 1, PUZZLE_GUESSES)} of {PUZZLE_GUESSES}</button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </form>
    {guesses.length ? <ol className={styles.guesses} aria-label="Your guesses">
      {guesses.map((entry, index) => <li key={index} data-puzzle-guess>
        <span className={styles.guessNumber}>{index + 1}</span>
        <span><strong>{teamName(entry.opponent)}</strong> · {entry.season}</span>
        <span className={styles.verdict}><em className={entry.verdict.opponent === "right" ? styles.right : styles.wrong}>Opponent {entry.verdict.opponent}</em><em className={entry.verdict.season === "right" ? styles.right : styles.wrong}>Season {entry.verdict.season === "right" ? "right" : entry.verdict.season}</em></span>
      </li>)}
    </ol> : null}
    {over ? <div className={styles.reveal} data-puzzle-reveal style={rival}>
      <p className={styles.kicker}>{won ? `Solved in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}.` : "Not this time."}</p>
      <p className={styles.answer}>Jets {game.jetsScore}–{game.oppScore} {game.atHome ? "vs" : "at"} {teamName(game.opponentDisplay)}</p>
      <p>{game.seasonType === "POST" ? "Postseason" : "Regular season"} · Week {game.week} · <time dateTime={game.date}>{formatDate(game.date)}</time>{game.wentToOt ? " · Overtime" : ""}</p>
      {caseHref ? <Link href={caseHref}>Read the game report <span aria-hidden="true">→</span></Link> : null}
      {tally ? <p className={styles.tally}>Solved {tally.solved} of {tally.played} played in this browser.</p> : null}
      <p className={styles.next}>The next puzzle opens at midnight New York time.</p>
    </div> : null}
  </div>;
}
