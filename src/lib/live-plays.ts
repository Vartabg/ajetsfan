/**
 * Play by play during a Jets game, from ESPN's public game summary. The football edition refreshes the
 * score every minute or two; this fills the seconds between, and every number it carries is ESPN's.
 */
import type { LiveFootballFeed, LiveFootballGame } from "./football-live";

/** How often an open page asks; the server shares ESPN's answer for about as long. */
export const LIVE_POLL_MS = 20_000;
export const espnSummaryUrl = (event: string) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(event)}`;

export type LivePlays = {
  state: "idle" | "pre" | "in" | "post" | "unavailable";
  updatedAt: string;
  us?: number;
  them?: number;
  /** ESPN's short status: "4:12 - 3rd", "Halftime", "Final". */
  detail?: string;
  /** Down, distance and spot after the latest play, and which side has the ball. */
  situation?: string | null;
  ball?: "jets" | "them" | null;
  lastPlay?: string | null;
  /** ESPN's Jets win chance after each play, with its quarter. */
  line?: [wp: number, quarter: number][];
};

/** Only the game the football edition is showing as live may be asked about, so the route is no open ESPN proxy. */
export function playsEvent(feed: LiveFootballFeed | null, event: string | null): string | null {
  const game = feed && feed.status !== "unavailable" ? feed.featured : null;
  return game && game.state === "live" && event && /^\d{1,12}$/.test(event) && game.eventId === event ? event : null;
}

/** The football edition's clock, until the first check answers: "Q3 · 8:24", "Overtime". */
export function editionClock(game: LiveFootballGame) {
  const period = game.period > 4 ? "Overtime" : game.period > 0 ? `Q${game.period}` : null;
  return [period, period && game.clock ? game.clock.replace(/^0(?=\d:)/, "") : null].filter(Boolean).join(" · ") || game.detail;
}

const QUARTER: Record<string, string> = { "1st": "1st quarter", "2nd": "2nd quarter", "3rd": "3rd quarter", "4th": "4th quarter", OT: "overtime" };
/** How much of regulation ESPN's clock says is gone: "4:12 - 3rd" is about 0.68. Unknown or overtime is the whole game. */
export function gamePlayed(detail: string | undefined) {
  const clock = detail?.match(/^(\d+):(\d\d) - (1st|2nd|3rd|4th)$/);
  if (!clock) return detail === "Halftime" ? .5 : 1;
  const quarter = ["1st", "2nd", "3rd", "4th"].indexOf(clock[3]);
  return Math.min(1, (quarter * 15 + 15 - Number(clock[1]) - Number(clock[2]) / 60) / 60);
}

/** ESPN's "4:12 - 3rd" reads as "4:12 left in the 3rd quarter"; "Halftime" and "End of 3rd" stay as they are. */
export function clockLine(detail: string | undefined) {
  const clock = detail?.match(/^(\d+:\d\d) - (1st|2nd|3rd|4th|OT)$/);
  return clock ? `${clock[1]} left in the ${QUARTER[clock[2]]}` : detail ?? "";
}

type Json = Record<string, unknown>;
const object = (value: unknown): Json | null => value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, 280) : null;
const number = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};
const ADMIN = /^(end (of )?(quarter|half|game|period|regulation)|timeout|two-minute warning|end game)/i;

/** Reduce ESPN's game summary to what the live screen shows. Anything missing or malformed is left out, never guessed. */
export function parseEspnSummary(summary: unknown, now: Date = new Date()): LivePlays {
  const updatedAt = now.toISOString();
  const root = object(summary);
  const competition = object(list(object(root?.header)?.competitions)[0]);
  const competitors = list(competition?.competitors).map(object).filter((entry): entry is Json => entry !== null);
  const jets = competitors.find((entry) => object(entry.team)?.abbreviation === "NYJ");
  const them = competitors.find((entry) => entry !== jets);
  if (!competition || !jets || !them) return { state: "unavailable", updatedAt };
  const status = object(object(competition.status)?.type);
  const state = status?.state === "in" || status?.state === "post" || status?.state === "pre" ? status.state : "unavailable";
  const home = jets.homeAway === "home";
  const jetsId = text(jets.id);

  const plays = [...list(object(root?.drives)?.previous), object(root?.drives)?.current]
    .flatMap((drive) => list(object(drive)?.plays)).map(object).filter((play): play is Json => play !== null);
  const period = new Map(plays.map((play) => [text(play.id), number(object(play.period)?.number)]));
  let quarter = 1;
  const line = list(root?.winprobability).map(object).flatMap((point) => {
    const homeWp = number(point?.homeWinPercentage), tie = number(point?.tiePercentage) ?? 0;
    if (homeWp === null || homeWp < 0 || homeWp > 1) return [];
    quarter = period.get(text(point?.playId)) ?? quarter;
    const wp = home ? homeWp : Math.max(0, 1 - homeWp - tie);
    return [[Math.round(wp * 1000) / 1000, quarter] as [number, number]];
  });

  const latest = [...plays].reverse().find((play) => text(play.text) && !ADMIN.test(text(play.text)!));
  const end = object(latest?.end);
  const holder = text(object(end?.team)?.id);
  return {
    state, updatedAt,
    us: number(jets.score) ?? 0, them: number(them.score) ?? 0,
    detail: text(status?.shortDetail) ?? undefined,
    situation: state === "in" ? text(end?.downDistanceText) : null,
    ball: state === "in" && holder ? (holder === jetsId ? "jets" : "them") : null,
    lastPlay: latest ? text(latest.text) : null,
    line,
  };
}
