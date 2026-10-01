import type { FinalGame, ScheduledGame } from "./current";

export const TICKET_STORAGE_KEY = "ajetsfan:game-day-tickets:v1";
export const MAX_TICKET_CALLS = 24;
export const CONVICTIONS = [
  { value: "nervous", label: "Nervous hope" },
  { value: "believe", label: "I believe" },
  { value: "again", label: "I have learned nothing" },
] as const;
export const RITUALS = [
  { value: "", label: "No ritual to declare" },
  { value: "jersey", label: "Same jersey" },
  { value: "seat", label: "Lucky seat" },
  { value: "chat", label: "Group chat on standby" },
  { value: "radio", label: "Radio on" },
] as const;

export type Conviction = (typeof CONVICTIONS)[number]["value"];
export type Ritual = (typeof RITUALS)[number]["value"];
export type TicketFixture = Pick<ScheduledGame, "id" | "season" | "week" | "seasonType" | "date" | "kickoff" | "opponent" | "opponentDisplay" | "atHome">;
export type TicketCall = {
  fixture: TicketFixture;
  jetsScore: number;
  oppScore: number;
  conviction: Conviction;
  ritual: Ritual;
  savedAt: string;
};
export type TicketBook = { schemaVersion: 1; season: number; calls: TicketCall[] };

export function emptyTicketBook(season: number): TicketBook {
  return { schemaVersion: 1, season, calls: [] };
}

export function ticketFixture(game: TicketFixture): TicketFixture {
  return { id: game.id, season: game.season, week: game.week, seasonType: game.seasonType, date: game.date,
    kickoff: game.kickoff, opponent: game.opponent, opponentDisplay: game.opponentDisplay, atHome: game.atHome };
}

/** Identity excludes result fields, so a scheduled call can meet its confirmed final. */
export function fixtureFingerprint(game: TicketFixture): string {
  return JSON.stringify(ticketFixture(game));
}

export function ticketScore(value: string): number | null {
  return /^\d{1,2}$/.test(value) ? Number(value) : null;
}

export function ticketDate(now: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Chicago",
  }).formatToParts(new Date(now));
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function ticketWindow(game: ScheduledGame | null, overdue: boolean, season: number, now: number) {
  if (!game || game.season !== season) return { open: false, reason: "missing" as const };
  if (overdue || game.status !== "scheduled") return { open: false, reason: "overdue" as const };
  if (!Number.isFinite(now) || now <= 0) return { open: false, reason: "loading" as const };
  const kickoff = game.kickoff ? Date.parse(game.kickoff) : NaN;
  if (Number.isFinite(kickoff)) return now < kickoff
    ? { open: true, reason: "open" as const }
    : { open: false, reason: "overdue" as const };
  return ticketDate(now) < game.date
    ? { open: true, reason: "open" as const }
    : { open: false, reason: "unconfirmed" as const };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 99;
}

function validCall(value: unknown, season: number): value is TicketCall {
  if (!record(value) || !record(value.fixture)) return false;
  const fixture = value.fixture;
  return fixture.season === season && typeof fixture.id === "string" && /^[A-Z0-9_]{1,96}$/.test(fixture.id) &&
    typeof fixture.week === "number" && Number.isInteger(fixture.week) && fixture.week >= 1 && fixture.week <= 30 &&
    (fixture.seasonType === "REG" || fixture.seasonType === "POST") && validDate(fixture.date) &&
    (fixture.kickoff === null || (typeof fixture.kickoff === "string" && fixture.kickoff.length <= 40 && Number.isFinite(Date.parse(fixture.kickoff)))) &&
    typeof fixture.opponent === "string" && /^[A-Z]{2,4}$/.test(fixture.opponent) &&
    typeof fixture.opponentDisplay === "string" && fixture.opponentDisplay.length >= 1 && fixture.opponentDisplay.length <= 40 &&
    typeof fixture.atHome === "boolean" && validScore(value.jetsScore) && validScore(value.oppScore) &&
    CONVICTIONS.some((entry) => entry.value === value.conviction) && RITUALS.some((entry) => entry.value === value.ritual) &&
    typeof value.savedAt === "string" && value.savedAt.length <= 40 && Number.isFinite(Date.parse(value.savedAt));
}

/** Ignore other seasons and malformed records; no saved value becomes a default guess. */
export function readTicketBook(raw: string | null, season: number): TicketBook {
  if (!raw || raw.length > 64_000) return emptyTicketBook(season);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!record(parsed) || parsed.schemaVersion !== 1 || parsed.season !== season || !Array.isArray(parsed.calls)) return emptyTicketBook(season);
    const unique = new Map<string, TicketCall>();
    for (const call of parsed.calls.filter((value): value is TicketCall => validCall(value, season))
      .sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt))) {
      unique.set(call.fixture.id, { ...call, fixture: ticketFixture(call.fixture) });
    }
    return { schemaVersion: 1, season, calls: [...unique.values()].slice(-MAX_TICKET_CALLS) };
  } catch {
    return emptyTicketBook(season);
  }
}

/** A stale edition must preserve a newer season already saved by another tab. */
export function storedTicketSeason(raw: string | null): number | null {
  if (!raw || raw.length > 64_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return record(parsed) && parsed.schemaVersion === 1 && Array.isArray(parsed.calls) &&
      typeof parsed.season === "number" && Number.isInteger(parsed.season) && parsed.season >= 1900 && parsed.season <= 9999
      ? parsed.season : null;
  } catch {
    return null;
  }
}

export function addTicketCall(book: TicketBook, call: TicketCall): TicketBook {
  const calls = book.season === call.fixture.season ? book.calls.filter((entry) => entry.fixture.id !== call.fixture.id) : [];
  return { schemaVersion: 1, season: call.fixture.season, calls: [...calls, call].slice(-MAX_TICKET_CALLS) };
}

export function ticketReceipt(book: TicketBook, finals: FinalGame[], season: number, now: number) {
  if (!Number.isFinite(now) || now <= 0 || book.season !== season) return null;
  const today = ticketDate(now);
  const ordered = finals.filter((game) => game.season === season && game.seasonType === "REG" && game.status === "final" &&
    validScore(game.jetsScore) && validScore(game.oppScore) && game.outcome !== null && game.date <= today &&
    (!game.kickoff || !Number.isFinite(Date.parse(game.kickoff)) || Date.parse(game.kickoff) <= now))
    .sort((a, b) => b.date.localeCompare(a.date) || b.week - a.week || b.id.localeCompare(a.id));
  for (const game of ordered) {
    const call = book.calls.find((entry) => entry.fixture.id === game.id && fixtureFingerprint(entry.fixture) === fixtureFingerprint(game));
    if (!call) continue;
    const exact = call.jetsScore === game.jetsScore && call.oppScore === game.oppScore;
    const winner = Math.sign(call.jetsScore - call.oppScore) === Math.sign(game.jetsScore - game.oppScore);
    const verdict = exact ? "Exact score. Frame the receipt." : winner
      ? call.jetsScore === call.oppScore ? "You called the draw. Even the closure got canceled." : "Right winner. The score had other plans."
      : "The football disagreed. The jersey stays on.";
    return { game, call, exact, winner, verdict };
  }
  return null;
}

export function ticketShareText(call: TicketCall): string {
  const conviction = CONVICTIONS.find((entry) => entry.value === call.conviction)!.label;
  const ritual = RITUALS.find((entry) => entry.value === call.ritual)!.label;
  return `My Jets game-day ticket · ${call.fixture.season} Week ${call.fixture.week}\n` +
    `Jets ${call.fixture.atHome ? "vs" : "at"} ${call.fixture.opponentDisplay} · ${call.fixture.date}\n` +
    `My call: NYJ ${call.jetsScore}–${call.fixture.opponentDisplay} ${call.oppScore}\n` +
    `Conviction: ${conviction}${call.ritual ? `\nRitual: ${ritual}` : ""}\n` +
    "Same team. Same questionable optimism.\na Jets fan";
}
