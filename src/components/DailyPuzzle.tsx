"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import PressChart from "./PressChart";
import type { CurvePoint } from "@/lib/load-games";
import { formatDate } from "@/lib/current";
import { PUZZLE_GUESSES, puzzleChartSummary, solved, type Guess, type PuzzleProgress } from "@/lib/puzzle";
import { teamName } from "@/lib/teams";
import styles from "./DailyPuzzle.module.css";
import { dayKey, readRaw, TALLY_KEY, usePuzzleStorage, writeStore } from "./puzzle-storage";

// The server judges every guess, so the answer is never part of the page.
async function check(day: string, guesses: Guess[], signal?: AbortSignal): Promise<PuzzleProgress> {
  const response = await fetch("/api/puzzle", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses: guesses.map(({ opponent, season }) => ({ opponent, season })) }) });
  if (!response.ok) throw new Error(`puzzle check failed: ${response.status}`);
  return response.json() as Promise<PuzzleProgress>;
}

const CLUE_LABELS = ["When", "Conditions", "Margin", "Final score", "Colours", "Season"];

export default function DailyPuzzle({ day, board, points, opponents, seasons }: {
  day: string; board: "heartbreak" | "miracle"; points: Pick<CurvePoint, "q" | "wp">[]; opponents: { code: string; name: string }[]; seasons: number[];
}) {
  const { restored, guesses, tally } = usePuzzleStorage(day);
  const guessKey = JSON.stringify(guesses.map(({ opponent, season }) => ({ opponent, season })));
  const [opponent, setOpponent] = useState("");
  const [season, setSeason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<{ key: string; value: PuzzleProgress } | null>(null);
  const progress = checked?.key === guessKey ? checked.value : null;

  const won = progress?.verdicts.some(solved) ?? false;
  const over = won || guesses.length >= PUZZLE_GUESSES;
  const ready = restored && (!guesses.length || progress !== null);
  const opened = progress?.clues ?? [];
  const answer = progress?.answer ?? null;

  // Rejudge every storage snapshot, including changes or clears from another tab.
  useEffect(() => {
    if (!restored || guessKey === "[]" || checked?.key === guessKey) return;
    const controller = new AbortController();
    check(day, JSON.parse(guessKey) as Guess[], controller.signal).then((result) => {
      if (!controller.signal.aborted) setChecked({ key: guessKey, value: result });
    }, () => {
      if (!controller.signal.aborted) setError("Could not load your clues. Reload to try again.");
    });
    return () => controller.abort();
  }, [restored, guessKey, day, checked?.key]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (over || pending) return;
    if (!opponent || !season) { setError("Choose an opponent and a season."); return; }
    setError(null);
    setPending(true);
    const storedAtStart = readRaw(dayKey(day));
    const asked = [...guesses, { opponent, season: Number(season) }];
    try {
      const result = await check(day, asked);
      if (readRaw(dayKey(day)) !== storedAtStart) {
        setError("Your puzzle changed in another tab. Check the updated guesses and try again.");
        return;
      }
      const next = asked.slice(0, result.verdicts.length).map((guess, index) => ({ opponent: guess.opponent, season: guess.season, verdict: result.verdicts[index] }));
      const last = next.at(-1)!.verdict;
      const finished = solved(last) || next.length >= PUZZLE_GUESSES;
      if (finished && tally?.lastDay !== day) {
        writeStore(TALLY_KEY, { played: (tally?.played ?? 0) + 1, solved: (tally?.solved ?? 0) + (solved(last) ? 1 : 0), lastDay: day });
      }
      setChecked({ key: JSON.stringify(asked.slice(0, result.verdicts.length).map(({ opponent, season }) => ({ opponent, season }))), value: result });
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
      {points.length >= 2 ? <>
        <PressChart points={points} board={board} size="wide" />
        <details className={styles.chartText}><summary>Read the chart as text</summary><ul>{puzzleChartSummary(points, board).map((text) => <li key={text}>{text}</li>)}</ul></details>
      </> : <p>The chart for this game is unavailable.</p>}
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
    <p className={styles.status} role="status" aria-live="polite">{!ready ? "Loading your saved guesses…" : won ? `Solved in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}.` : over ? "The puzzle is finished. The answer is below." : `${guesses.length} of ${PUZZLE_GUESSES} guesses used. ${opened.length} extra ${opened.length === 1 ? "clue is" : "clues are"} open.`}</p>
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
