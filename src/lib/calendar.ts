import type { CurrentSnapshot, ScheduledGame } from "./current";
import type { HistoryGame } from "./league-history";
import { teamIdentity } from "./teams";

/** Calendars refetch a subscription on their own schedule; this asks for about four times a day. */
export const CALENDAR_REFRESH = "PT6H";
/** The schedule gives kickoff only. Events run three hours, about the length of a game; the description says so. */
const GAME_HOURS = 3;

const nickname = (code: string) => teamIdentity(code)?.nickname ?? teamIdentity(code)?.city ?? code;
const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (date: string) => date.replace(/-/g, "");
const nextDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** RFC 5545 text: escape backslashes, separators and newlines. */
const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line after a space, without splitting a character. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const char of line) {
    if (bytes.encode(current + char).length > (out.length ? 74 : 75)) { out.push(current); current = ""; }
    current += char;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** "Jets at Patriots" before the game; "Jets 17, Browns 12 (W)" once it is final. */
export function eventTitle(game: ScheduledGame): string {
  const them = nickname(game.opponent);
  if (game.status === "final" && game.jetsScore !== null && game.oppScore !== null && game.outcome) {
    return `Jets ${game.jetsScore}, ${them} ${game.oppScore} (${game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"})`;
  }
  return game.atHome ? `${them} at Jets` : `Jets at ${them}`;
}

/**
 * The current season's Jets games as a subscribable calendar. Times are UTC, so no time-zone table is needed;
 * a game without a kickoff time is an all-day event. Each game keeps one UID, so a calendar updates it in place
 * when the kickoff moves or the final score arrives.
 */
export function jetsCalendar({ snapshot, history, origin, reports }: { snapshot: CurrentSnapshot; history: HistoryGame[]; origin: string | null; reports: Set<string> }): string {
  const venues = new Map(history.map((game) => [game.id, game.stadium]));
  const link = (path: string) => origin ? `${origin}${path}` : null;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ajetsfan//Jets schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(`Jets ${snapshot.season}`)}`,
    `X-WR-CALDESC:${escape("Every Jets game this season, from the NFL schedule. Final scores replace the matchup after each game.")}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${CALENDAR_REFRESH}`, `X-PUBLISHED-TTL:${CALENDAR_REFRESH}`,
  ];
  const games = snapshot.schedule.filter((game) => game.season === snapshot.season).sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
  for (const game of games) {
    const url = link(game.status === "final" && reports.has(game.id) ? `/games/${encodeURIComponent(game.id)}` : "/game-day");
    const round = game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`;
    const timing = game.kickoff ? "Kickoff time from the NFL schedule. The three-hour length is an estimate." : "The NFL has not set a kickoff time yet.";
    const venue = venues.get(game.id);
    lines.push("BEGIN:VEVENT", `UID:${game.id}@ajetsfan.com`, `DTSTAMP:${stamp(snapshot.checkedAt)}`);
    if (game.kickoff) {
      lines.push(`DTSTART:${stamp(game.kickoff)}`, `DTEND:${stamp(new Date(Date.parse(game.kickoff) + GAME_HOURS * 3_600_000).toISOString())}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day(game.date)}`, `DTEND;VALUE=DATE:${day(nextDay(game.date))}`);
    }
    lines.push(`SUMMARY:${escape(eventTitle(game))}`);
    if (venue) lines.push(`LOCATION:${escape(venue)}`);
    lines.push(`DESCRIPTION:${escape([`${round}. ${timing}`, url].filter(Boolean).join("\n"))}`);
    if (url) lines.push(`URL:${url}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
