"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type { FinalGame, ScheduledGame } from "@/lib/current";
import { formatCheckedAt, formatDate } from "@/lib/current";
import { useMinuteClock } from "@/lib/use-minute-clock";
import {
  addTicketCall, CONVICTIONS, emptyTicketBook, fixtureFingerprint, readTicketBook, RITUALS,
  storedTicketSeason, ticketFixture, ticketReceipt, ticketScore, ticketShareText, TICKET_STORAGE_KEY, ticketWindow,
} from "@/lib/game-day-ticket";
import type { Conviction, Ritual, TicketBook, TicketCall } from "@/lib/game-day-ticket";
import styles from "./GameDayTicket.module.css";

const UNAVAILABLE = "storage-unavailable";
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
function storedSnapshot() {
  try { return localStorage.getItem(TICKET_STORAGE_KEY) ?? ""; } catch { return UNAVAILABLE; }
}
const serverSnapshot = () => "";

function subscribe(listener: () => void, season: number) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => { if (event.key === TICKET_STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener("storage", changed);
  try {
    const raw = localStorage.getItem(TICKET_STORAGE_KEY);
    const storedSeason = storedTicketSeason(raw);
    if (storedSeason !== null && storedSeason < season) {
      localStorage.removeItem(TICKET_STORAGE_KEY);
      notify();
    }
  } catch { /* An unavailable browser store still permits a ticket for this visit. */ }
  return () => { listeners.delete(listener); window.removeEventListener("storage", changed); };
}

type Props = { game: ScheduledGame | null; overdue: boolean; finals: FinalGame[]; season: number };
type ShareState = { identity: string; message: string; text: string; failed: boolean };

function TicketForm({ game, saved, save }: { game: ScheduledGame; saved: TicketCall | null; save: (call: TicketCall) => boolean }) {
  const [jets, setJets] = useState("");
  const [opponent, setOpponent] = useState("");
  const [conviction, setConviction] = useState<Conviction | "">("");
  const [ritual, setRitual] = useState<Ritual>("");
  const [error, setError] = useState("");
  const panel = useRef<HTMLDetailsElement>(null);
  const scoreInput = useRef<HTMLInputElement>(null);
  const opponentInput = useRef<HTMLInputElement>(null);
  const convictionInput = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const jetsScore = ticketScore(jets);
    const oppScore = ticketScore(opponent);
    if (jetsScore === null || oppScore === null || !conviction) {
      setError("Enter both whole-number scores from 0 to 99 and choose your conviction.");
      if (jetsScore === null) scoreInput.current?.focus();
      else if (oppScore === null) opponentInput.current?.focus();
      else convictionInput.current?.focus();
      return;
    }
    // Recheck the exact current time: a minute clock must not grant a late save.
    if (!ticketWindow(game, false, game.season, Date.now()).open) {
      setError("Ticket writing has closed for this fixture. Your call was not saved.");
      return;
    }
    if (!save({ fixture: ticketFixture(game), jetsScore, oppScore, conviction, ritual, savedAt: new Date().toISOString() })) return;
    setJets(""); setOpponent(""); setConviction(""); setRitual(""); setError("");
    if (panel.current) panel.current.open = false;
    panel.current?.querySelector("summary")?.focus();
  }

  function edit() {
    if (!saved) return;
    setJets(String(saved.jetsScore)); setOpponent(String(saved.oppScore));
    setConviction(saved.conviction); setRitual(saved.ritual); setError("");
    if (panel.current) panel.current.open = true;
    scoreInput.current?.focus();
  }

  return <div>
    {saved ? <button type="button" className={styles.edit} onClick={edit}>Edit saved ticket <span aria-hidden="true">↗</span></button> : null}
    <details ref={panel} className={styles.formPanel}>
      <summary className="disclosure"><span><span className="when-closed">Write your game-day ticket</span><span className="when-open">Close your game-day ticket</span><small>Score, conviction, optional superstition</small></span></summary>
      <form onSubmit={submit} noValidate aria-label="Your game-day call">
        <fieldset className={styles.scores}><legend>Your final score call <span>Whole numbers · 0–99</span></legend>
          <div><label htmlFor="ticket-jets-score">Jets score</label><input ref={scoreInput} id="ticket-jets-score" name="jets-score" type="number" min="0" max="99" step="1" inputMode="numeric" required aria-describedby="ticket-form-feedback" aria-invalid={!!error && ticketScore(jets) === null} value={jets} onChange={(event) => setJets(event.target.value)} /></div>
          <div><label htmlFor="ticket-opponent-score">{game.opponentDisplay} score</label><input ref={opponentInput} id="ticket-opponent-score" name="opponent-score" type="number" min="0" max="99" step="1" inputMode="numeric" required aria-describedby="ticket-form-feedback" aria-invalid={!!error && ticketScore(opponent) === null} value={opponent} onChange={(event) => setOpponent(event.target.value)} /></div>
        </fieldset>
        <fieldset className={styles.conviction} aria-describedby="ticket-form-feedback" aria-invalid={!!error && !conviction}><legend>Your confidence</legend>{CONVICTIONS.map((entry, index) => <label key={entry.value}><input ref={index === 0 ? convictionInput : undefined} type="radio" name="ticket-conviction" value={entry.value} required checked={conviction === entry.value} onChange={() => setConviction(entry.value)} /><span>{entry.label}</span></label>)}</fieldset>
        <div className={styles.ritual}><label htmlFor="ticket-ritual">Sunday ritual <span>Optional viewing preference.</span></label><select id="ticket-ritual" value={ritual} onChange={(event) => setRitual(event.target.value as Ritual)}>{RITUALS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></div>
        <p className={styles.formNote}>Your prediction is separate from the published results. Confidence is self-reported, not a calibrated probability. Save changes before copying your ticket.</p>
        <button type="submit" className={styles.save}>Save my ticket <span aria-hidden="true">↗</span></button>
        <p role="status" aria-label="Ticket form status" className={styles.error}><span id="ticket-form-feedback">{error}</span></p>
      </form>
    </details>
  </div>;
}

function CallScore({ call }: { call: TicketCall }) {
  return <><p className={styles.callScore}><span>NYJ <strong>{call.jetsScore}</strong></span><span aria-hidden="true">—</span><span>{call.fixture.opponentDisplay} <strong>{call.oppScore}</strong></span></p><p className={styles.callDetails}>{CONVICTIONS.find((entry) => entry.value === call.conviction)!.label}{call.ritual ? <> · {RITUALS.find((entry) => entry.value === call.ritual)!.label}</> : null}</p></>;
}

export default function GameDayTicket({ game, overdue, finals, season }: Props) {
  const subscription = useCallback((listener: () => void) => subscribe(listener, season), [season]);
  const raw = useSyncExternalStore(subscription, storedSnapshot, serverSnapshot);
  const [visitBook, setVisitBook] = useState<TicketBook | null>(null);
  const [status, setStatus] = useState("");
  const [sharing, setSharing] = useState<ShareState | null>(null);
  const [draftReset, setDraftReset] = useState(0);
  const now = useMinuteClock();
  const book = visitBook?.season === season ? visitBook : readTicketBook(raw === UNAVAILABLE ? null : raw, season);
  const window = ticketWindow(game, overdue, season, now);
  const saved = game ? book.calls.find((call) => call.fixture.id === game.id) ?? null : null;
  const sameFixture = !!saved && !!game && fixtureFingerprint(saved.fixture) === fixtureFingerprint(game);
  const receipt = ticketReceipt(book, finals, season, now);
  const shareCall = sameFixture ? saved : !game ? receipt?.call ?? null : null;
  const identity = shareCall ? `${fixtureFingerprint(shareCall.fixture)}:${shareCall.savedAt}` : "";
  const copyState = sharing?.identity === identity ? sharing : null;

  function save(call: TicketCall) {
    let next = addTicketCall(book, call);
    try {
      const latest = localStorage.getItem(TICKET_STORAGE_KEY);
      const storedSeason = storedTicketSeason(latest);
      if (storedSeason !== null && storedSeason > season) {
        setStatus("A newer season’s tickets are saved in this browser. This older edition can’t replace them. Refresh for the current edition.");
        return false;
      }
      next = addTicketCall(visitBook?.season === season ? visitBook : readTicketBook(latest, season), call);
      localStorage.setItem(TICKET_STORAGE_KEY, JSON.stringify(next));
      setVisitBook(null); notify();
      setStatus("Ticket saved in this browser.");
    } catch {
      setVisitBook(next);
      setStatus("Ticket kept for this visit. This browser couldn’t save it; reloading may lose it.");
    }
    setSharing(null);
    return true;
  }

  function clear() {
    try {
      const storedSeason = storedTicketSeason(localStorage.getItem(TICKET_STORAGE_KEY));
      if (storedSeason !== null && storedSeason > season) {
        setStatus("A newer season’s tickets are saved in this browser. This older edition can’t clear them. Refresh for the current edition.");
        return;
      }
      localStorage.removeItem(TICKET_STORAGE_KEY);
      setVisitBook(null); notify();
      setStatus("Your saved tickets are cleared from this browser.");
    } catch {
      setVisitBook(emptyTicketBook(season));
      setStatus("Cleared for this visit. This browser couldn’t remove saved tickets; they may return after a reload.");
    }
    setDraftReset((value) => value + 1);
    setSharing(null);
  }

  async function copy() {
    if (!shareCall) return;
    const text = ticketShareText(shareCall);
    try {
      await navigator.clipboard.writeText(text);
      setSharing({ identity, text, message: "Saved ticket copied.", failed: false });
    } catch {
      setSharing({ identity, text, message: "Copy failed. Select the ticket text below to copy it yourself.", failed: true });
    }
  }

  const closed = window.reason === "unconfirmed"
    ? "Kickoff time is unconfirmed. Ticket writing closes on the listed game date, using Central Time."
    : window.reason === "overdue" ? "Ticket writing has closed for this fixture. Awaiting a confirmed final in the next edition."
    : "No next fixture is listed in this edition.";

  return <section id="game-day-ticket" className={styles.ticket} aria-labelledby="ticket-heading">
    <div className={styles.header}><div><p className={styles.kicker}>Your game-day record</p><h2 id="ticket-heading">Record your prediction.</h2><p>Save a score prediction before kickoff, then compare it with the confirmed final.</p></div><span className={styles.seal} aria-hidden="true">Season {season}<strong>Your call</strong>Saved locally</span></div>
    {game ? <p className={styles.fixture}>Week {game.week} · Jets {game.atHome ? "vs" : "at"} {game.opponentDisplay} · <time dateTime={game.date}>{formatDate(game.date)}</time></p> : null}
    {saved ? <div className={styles.saved}><p className={styles.label}>{sameFixture ? "Your saved call" : "Your earlier call · fixture changed"}</p>{!sameFixture ? <p className={styles.callDetails}>Week {saved.fixture.week} · Jets {saved.fixture.atHome ? "vs" : "at"} {saved.fixture.opponentDisplay} · {formatDate(saved.fixture.date)} · {saved.fixture.kickoff ? formatCheckedAt(saved.fixture.kickoff) : "Kickoff TBD"}</p> : null}<CallScore call={saved} /><p className={styles.savedAt}>Saved <time dateTime={saved.savedAt}>{formatCheckedAt(saved.savedAt)}</time>{visitBook ? " · this visit only" : " · in this browser"}</p>{!sameFixture ? <p className={styles.notice}>Fixture details changed. Your earlier call stays here until you write and save a new ticket. It won’t be reused for this fixture.</p> : null}</div> : null}
    {window.open && game ? <TicketForm key={`${fixtureFingerprint(game)}:${draftReset}`} game={game} saved={sameFixture ? saved : null} save={save} /> : <p role="status" aria-label="Ticket window status" className={styles.closed}>{window.reason === "loading" ? "Checking this fixture’s ticket window…" : closed}</p>}
    {receipt ? <div className={styles.receipt}><div><p className={styles.label}>Your last receipt · Week {receipt.game.week}</p><h3>{receipt.verdict}</h3><p><time dateTime={receipt.game.date}>{formatDate(receipt.game.date)}</time> · confirmed final</p></div><dl><div><dt>Your call</dt><dd>NYJ {receipt.call.jetsScore} — {receipt.game.opponentDisplay} {receipt.call.oppScore}</dd></div><div><dt>Confirmed final</dt><dd>NYJ {receipt.game.jetsScore} — {receipt.game.opponentDisplay} {receipt.game.oppScore}</dd></div></dl><small>A comparison with your saved call. Browser tickets can be edited; this is no prediction contest.</small></div> : null}
    <div className={styles.actions}>{shareCall ? <button type="button" onClick={copy}>{copyState && !copyState.failed ? "Ticket copied" : "Copy saved ticket"} <span aria-hidden="true">↗</span></button> : null}{book.calls.length ? <button type="button" onClick={clear}>Clear my tickets <span aria-hidden="true">×</span></button> : null}</div>
    <p role="status" aria-label="Ticket status" className={styles.status}>{status || (raw === UNAVAILABLE ? "Browser storage is unavailable. You can keep a ticket for this visit." : "")}</p>
    <p role="status" aria-label="Ticket copy status" className={styles.status}>{copyState?.message ?? ""}</p>
    {copyState?.failed ? <div className={styles.copyFallback}><label htmlFor="ticket-share-text">Saved ticket text</label><textarea id="ticket-share-text" readOnly value={copyState.text} onFocus={(event) => event.target.select()} rows={7} /></div> : null}
    <p className={styles.privacy}>Ticket choices stay in this browser and aren’t sent to a server. Copying puts text on your clipboard; you decide where it goes. No account. Up to 24 tickets for this season; a new season clears the book.</p>
  </section>;
}
