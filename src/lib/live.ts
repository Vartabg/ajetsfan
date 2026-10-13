/**
 * Live Jets games from ESPN's public game summary. The site's own record is postgame (nflverse);
 * this fills the hours between kickoff and the next data edition, and every number it shows is
 * labelled as ESPN's.
 */
export const LIVE_BEFORE_MS = 30 * 60_000;
export const LIVE_AFTER_MS = 6 * 3_600_000;
/** How often the page asks; the server caches ESPN's answer for about as long. */
export const LIVE_POLL_MS = 20_000;
export const espnSummaryUrl = (event: string) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(event)}`;
export const espnScoreboardUrl = (date: string) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${date.replace(/-/g, "")}`;

export type LiveGame = {
  state: "idle" | "pre" | "in" | "post" | "unavailable";
  updatedAt: string;
  us?: number;
  them?: number;
  /** ESPN's short status: "4:12 - 3rd", "Halftime", "Final". */
  detail?: string;
  period?: number;
  /** Down, distance and spot after the latest play, and which side has the ball. */
  situation?: string | null;
  ball?: "jets" | "them" | null;
  lastPlay?: string | null;
  /** ESPN's Jets win chance after each play, with its quarter. */
  line?: [wp: number, quarter: number][];
  link?: string | null;
};

/** The hours in which a game can be live: from half an hour before kickoff to six hours after. */
export function inLiveWindow(kickoff: string | null, now: number): boolean {
  if (!kickoff) return false;
  const start = Date.parse(kickoff);
  return Number.isFinite(start) && now >= start - LIVE_BEFORE_MS && now <= start + LIVE_AFTER_MS;
}

/** The current-season game that could be live right now, if any. */
export function liveCandidate<T extends { id: string; kickoff: string | null; status: string; season: number }>(schedule: T[], season: number, now: number = Date.now()): T | null {
  return schedule.find((game) => game.season === season && game.status !== "final" && inLiveWindow(game.kickoff, now)) ?? null;
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

/** The ESPN event for the Jets on a scoreboard date, when the schedule file has no event number. */
export function findJetsEvent(scoreboard: unknown): string | null {
  for (const event of list(object(scoreboard)?.events)) {
    const competitors = list(object(list(object(event)?.competitions)[0])?.competitors);
    if (competitors.some((entry) => object(object(entry)?.team)?.abbreviation === "NYJ")) return text(object(event)?.id);
  }
  return null;
}

/** Reduce ESPN's game summary to what the live moment shows. Anything missing or malformed is left out, never guessed. */
export function parseEspnSummary(summary: unknown, now: Date = new Date()): LiveGame {
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
  const link = list(object(root?.header)?.links).map(object).find((entry) => list(entry?.rel).includes("summary"));
  const href = text(link?.href);
  return {
    state, updatedAt,
    us: number(jets.score) ?? 0, them: number(them.score) ?? 0,
    detail: text(status?.shortDetail) ?? undefined,
    period: number(object(competition.status)?.period) ?? (latest ? number(object(latest.period)?.number) : null) ?? undefined,
    situation: state === "in" ? text(end?.downDistanceText) : null,
    ball: state === "in" && holder ? (holder === jetsId ? "jets" : "them") : null,
    lastPlay: latest ? text(latest.text) : null,
    line,
    link: href && /^https:\/\/www\.espn\.com\//.test(href) ? href : null,
  };
}
