import type { CurrentSnapshot, ScheduledGame } from "./current";
import type { LiveFootballFeed } from "./football-live";
import type { HistoryGame } from "./league-history";
import { snapDescription } from "./snap-data";
import type { Snap, SnapGame, SnapScore } from "./snap-types";

type Fixture = Pick<ScheduledGame, "id" | "season" | "week" | "seasonType" | "date" | "kickoff" |
  "opponent" | "atHome" | "status" | "jetsScore" | "oppScore">;
export type EspnSnapFixture = Fixture & { espn: string; providerWeek?: number };

const EVENT_ID = /^\d{6,12}$/;
const easternDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", dateStyle: "short" });
const sameInstant = (a: string | null, b: string | null) => !!a && !!b && Date.parse(a) === Date.parse(b);
const sameResult = (a: Fixture, b: Pick<Fixture, "jetsScore" | "oppScore">) =>
  a.jetsScore === b.jetsScore && a.oppScore === b.oppScore;

/** Bind a schedule row to an event even after the featured game or the current season advances. */
export function espnSnapFixture(id: string, current: Pick<CurrentSnapshot, "season" | "schedule">,
  history: HistoryGame[], feed: LiveFootballFeed | null): EspnSnapFixture | null {
  const past = history.find(game => game.id === id);
  const thisSeason = id.startsWith(current.season + "_");
  const fixture = thisSeason ? current.schedule.find(game => game.id === id) : past;
  if (!fixture) return null;

  const recorded = past && past.opponent === fixture.opponent && past.atHome === fixture.atHome &&
    past.date === fixture.date && past.week === fixture.week && past.seasonType === fixture.seasonType &&
    (!past.kickoff || !fixture.kickoff || sameInstant(past.kickoff, fixture.kickoff)) &&
    past.status === fixture.status && sameResult(fixture, past) ? past : null;
  const candidate = thisSeason && feed && feed.status !== "unavailable" && feed.season === fixture.season
    ? feed.games.find(game => game.gameId === id) : null;
  const live = candidate && candidate.season === fixture.season && candidate.week === fixture.week &&
    candidate.seasonType === fixture.seasonType && candidate.atHome === fixture.atHome &&
    candidate.opponent === fixture.opponent && candidate.kickoff &&
    (!fixture.kickoff || sameInstant(candidate.kickoff, fixture.kickoff)) &&
    (fixture.status !== "final" || candidate.state === "final" && sameResult(fixture, candidate)) ? candidate : null;
  if (recorded?.espn && live && recorded.espn !== live.eventId) return null;
  const espn = live?.eventId ?? recorded?.espn;
  const kickoff = fixture.kickoff ?? live?.kickoff ?? recorded?.kickoff;
  if (!espn || !EVENT_ID.test(espn) || !kickoff || !Number.isFinite(Date.parse(kickoff)) ||
      easternDay.format(new Date(kickoff)) !== fixture.date) return null;
  if (history.some(game => game.id !== id && game.espn === espn)) return null;
  return { ...fixture, espn, kickoff, providerWeek: live?.providerWeek, ...(live?.state === "final" ?
    { status: "final", jetsScore: live.jetsScore, oppScore: live.oppScore } : {}) };
}

type Row = Record<string, unknown>;
const record = (v: unknown): Row | null => !!v && typeof v === "object" && !Array.isArray(v) ? v as Row : null;
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.filter((r): r is Row => !!record(r)) : [];
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null;
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function clock(value: unknown): number | null {
  const match = typeof value === "string" && /^(\d{1,2}):([0-5]\d)$/.exec(value);
  return match ? integer(Number(match[1]) * 60 + Number(match[2]), 0, 900) : null;
}
function score(jets: unknown, opponent: unknown): SnapScore | null {
  const j = integer(jets, 0, 999), o = integer(opponent, 0, 999);
  return j === null || o === null ? null : [j, o];
}
const sameScore = (a: SnapScore | null, b: SnapScore | null) =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1];

function normalizedTeam(code: unknown) {
  return code === "LAR" ? "LA" : code === "WSH" ? "WAS" : code;
}

function verifiedCompetition(summary: Row, game: EspnSnapFixture) {
  const header = record(summary.header);
  const season = record(header?.season);
  const week = integer(header?.week, 1, 30);
  const competitions = rows(header?.competitions);
  const comp = competitions[0];
  if (!EVENT_ID.test(game.espn) || header?.id !== game.espn || competitions.length !== 1 || comp.id !== game.espn ||
      game.id !== [game.season, String(game.week).padStart(2, "0"), game.atHome ? game.opponent : "NYJ",
        game.atHome ? "NYJ" : game.opponent].join("_") || season?.year !== game.season ||
      season.type !== (game.seasonType === "REG" ? 2 : 3) || !week ||
      (game.seasonType === "REG" ? week !== game.week : game.providerWeek ? week !== game.providerWeek : week > 4) ||
      typeof comp.date !== "string" || !sameInstant(comp.date, game.kickoff) ||
      easternDay.format(new Date(comp.date)) !== game.date) return null;

  const sides = rows(comp.competitors);
  const jets = sides.find(side => side.homeAway === (game.atHome ? "home" : "away"));
  const other = sides.find(side => side.homeAway === (game.atHome ? "away" : "home"));
  const jetsTeam = record(jets?.team), otherTeam = record(other?.team);
  if (sides.length !== 2 || jets?.id !== "20" || jetsTeam?.id !== "20" || jetsTeam.abbreviation !== "NYJ" ||
      !other || typeof other.id !== "string" || !/^\d+$/.test(other.id) || other.id === "20" ||
      otherTeam?.id !== other.id || normalizedTeam(otherTeam.abbreviation) !== normalizedTeam(game.opponent)) return null;

  const status = record(record(comp.status)?.type);
  const completed = status?.state === "post" && status.completed === true;
  if (!status || typeof status.completed !== "boolean" ||
      !(completed || !status.completed && (status.state === "pre" || status.state === "in"))) return null;
  const final = completed ? score(jets.score, other.score) : null;
  if (completed && !final || game.status === "final" && !sameScore(final, score(game.jetsScore, game.oppScore))) return null;
  return { opponentId: other.id, final, started: (completed || status.state === "in") &&
    !["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_CANCELLED"].includes(String(status.name)) };
}

/** A touchdown row can include the next kick's text, scoreboard and model estimate. */
function touchdownAccount(account: string, type: string | null): string {
  const action = account.match(/^(.{1,400}?\btouchdown)\b/i) ??
    account.match(/^([A-Za-z .'-]+ (?:pass from [A-Za-z .'-]+ for \d+ yds?|\d+ yd (?:run|rush)))\b/i);
  if (!action) return type ? type + "." : "ESPN grouped multiple actions in this record.";
  const lead = action[1].trim();
  return lead + (/\btouchdown\b/i.test(type ?? "") && !/\btouchdown\b/i.test(lead) ? ", touchdown." : ".");
}

function winChances(points: unknown, jetsHome: boolean) {
  const byPlay = new Map<string, number | null>();
  for (const point of rows(points)) {
    if (typeof point.playId !== "string") continue;
    const home = point.homeWinPercentage, tie = point.tiePercentage;
    let probability: number | null = null;
    if (typeof home === "number" && home >= 0 && home <= 1 &&
        (jetsHome && tie === undefined || typeof tie === "number" && tie >= 0 && home + tie <= 1.0000001)) {
      const jets = jetsHome ? home : Math.max(0, 1 - home - Number(tie));
      probability = Math.round(jets * 1000) / 1000;
    }
    const previous = byPlay.get(point.playId);
    byPlay.set(point.playId, previous === undefined || previous === probability ? probability : null);
  }
  return byPlay;
}

type OrderedSnap = { sequence: number; snap: Snap; rawAccount: string; reportedScore: SnapScore | null };

function orderedPlays(summary: Row, game: EspnSnapFixture, opponentId: string): Snap[] {
  const drives = record(summary.drives);
  const previous = rows(drives?.previous);
  const current = record(drives?.current);
  const chances = winChances(summary.winprobability, game.atHome);
  const byId = new Map<string, OrderedSnap | null>();
  const sequenceOwner = new Map<number, string | null>();
  for (const drive of current ? [...previous, current] : previous) {
    const driveNumber = typeof drive.id === "string" && drive.id.startsWith(game.espn) ?
      integer(drive.id.slice(game.espn.length), 1) : null;
    for (const play of rows(drive.plays)) {
      const id = play.id;
      if (typeof id !== "string" || !/^\d{1,24}$/.test(id)) continue;
      const sequence = integer(play.sequenceNumber, 0);
      const quarter = integer(record(play.period)?.number, 1, 10);
      if (sequence !== null) {
        const owner = sequenceOwner.get(sequence);
        sequenceOwner.set(sequence, owner === undefined || owner === id ? id : null);
      }
      if (sequence === null || quarter === null) { byId.set(id, null); continue; }
      const start = record(play.start);
      const team = record(start?.team)?.id;
      const type = text(record(play.type)?.text);
      const account = text(play.text) ?? "";
      const conversion = /\b(?:extra point|two[- ]point|2[- ]pt|point after)\b/i;
      const combined = play.pointAfterAttempt != null || !conversion.test(type ?? "") &&
        (conversion.test(account) || /\btouchdown\b/i.test(type ?? "") && /\([^)]*\bkick\b[^)]*\)/i.test(account));
      const reportedScore = game.atHome ? score(play.homeScore, play.awayScore) : score(play.awayScore, play.homeScore);
      const after = combined ? null : reportedScore;
      const snap: Snap = {
        key: "e-" + id, quarter, clock: clock(record(play.clock)?.displayValue),
        possession: team === "20" ? "jets" : team === opponentId ? "opponent" : null,
        down: integer(start?.down, 1, 4), distance: integer(start?.distance, 0, 100),
        yardline: integer(start?.yardsToEndzone, 0, 100), drive: driveNumber,
        // ESPN's play scoreboard is after the action. It also supplies the before pair on a known scoreless play.
        before: play.scoringPlay === false && !combined ? after : null, after, wp: null, delta: null,
        postWp: combined ? null : chances.get(id) ?? null, type,
        description: combined ? touchdownAccount(snapDescription(account), type) :
          snapDescription(account) || type || "Play description unavailable.",
      };
      const entry = { sequence, snap, rawAccount: account, reportedScore };
      const prior = byId.get(id);
      byId.set(id, prior === undefined || JSON.stringify(prior) === JSON.stringify(entry) ? entry : null);
    }
  }
  const ordered = [...byId.values()].filter((p): p is OrderedSnap =>
    !!p && sequenceOwner.get(p.sequence) === p.snap.key.slice(2)).sort((a, b) => a.sequence - b.sequence);
  // Some final summaries insert an older timeout after a score with the old scoreboard attached.
  // Such a selection would expose the later score in the preceding drive.
  let preceding: OrderedSnap | null = null;
  return ordered.flatMap(entry => {
    const { snap, reportedScore } = entry;
    if (preceding?.reportedScore && reportedScore && snap.quarter === preceding.snap.quarter &&
        snap.clock !== null && preceding.snap.clock !== null && snap.clock > preceding.snap.clock &&
        (reportedScore[0] < preceding.reportedScore[0] || reportedScore[1] < preceding.reportedScore[1])) return [];
    preceding = entry;
    return [snap];
  });
}

export function parseEspnSnapGame(value: unknown, fixture: EspnSnapFixture): SnapGame | null {
  const summary = record(value);
  if (!summary) return null;
  const verified = verifiedCompetition(summary, fixture);
  if (!verified) return null;
  return { id: fixture.id, date: fixture.date, opponent: fixture.opponent, home: fixture.atHome,
    final: verified.final, source: "espn", eventId: fixture.espn,
    plays: verified.started ? orderedPlays(summary, fixture, verified.opponentId) : [] };
}

const actionTypes: Record<string, [string, RegExp]> = {
  "Pass Reception": ["pass", /\bpass (?!incomplete)[^.!]*\bto\b/i],
  "Pass Incompletion": ["pass", /\bpass incomplete\b/i],
  "Pass Interception Return": ["pass", /\bintercepted by\b/i],
  "Passing Touchdown": ["pass", /\btouchdown\b/i],
  Sack: ["pass", /\bsacked\b/i],
  Rush: ["run", /\b(?:left|right|middle|scrambles?|up the middle)\b/i],
  "Rushing Touchdown": ["run", /\btouchdown\b/i],
  Punt: ["punt", /\bpunts?\b/i],
  Kickoff: ["kickoff", /\bkicks?\b/i],
  "Kickoff Return (Offense)": ["kickoff", /\bkicks?\b/i],
  "Field Goal Good": ["field_goal", /\bfield goal is good\b/i],
  "Field Goal Missed": ["field_goal", /\bfield goal is (?:no good|blocked)\b/i],
};

function actionAccount(description: string) {
  // NFL play descriptions include jersey numbers and often a pre-play clock. Preserve names, gains, outcomes and negations.
  return description.replace(/^\s*\(\d{0,2}:[0-5]\d\)\s*/, "").replace(/\b\d{1,2}-(?=[A-Za-z]{1,4}\.[A-Za-z])/g, "")
    .replace(/\bCLV\b/g, "CLE").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Only the same event-namespaced key and corroborated action in both recorded games may redirect a shared link. */
export function confirmedSnapForEspn(live: SnapGame, selected: Snap, archived: SnapGame): Snap | null {
  if (live.source !== "espn" || archived.source !== "nflverse" || live.id !== archived.id || live.date !== archived.date ||
      live.opponent !== archived.opponent || live.home !== archived.home || !sameScore(live.final, archived.final) ||
      !live.eventId || !EVENT_ID.test(live.eventId)) return null;
  const prefix = "e-" + live.eventId;
  if (!selected.key.startsWith(prefix)) return null;
  const suffix = selected.key.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(suffix)) return null;
  const provider = live.plays.filter(play => play.key === selected.key);
  const matches = archived.plays.filter(play => play.key === suffix);
  if (provider.length !== 1 || matches.length !== 1) return null;
  const play = provider[0], match = matches[0];
  const action = play.type ? actionTypes[play.type] : undefined;
  if (!action || action[0] !== match.type || !action[1].test(play.description) ||
      !/\b[A-Z][a-z]{0,3}\.[A-Z][a-z]/.test(play.description) ||
      actionAccount(play.description) !== actionAccount(match.description)) return null;
  if (play.quarter !== match.quarter || !play.possession || play.possession !== match.possession ||
      play.yardline === null || play.yardline !== match.yardline || !sameScore(play.after, match.after) ||
      play.down !== null && match.down !== null && play.down !== match.down ||
      play.distance !== null && match.distance !== null && play.distance !== match.distance ||
      play.before && match.before && !sameScore(play.before, match.before)) return null;
  if (play.clock === null || match.clock === null) return null;
  if (play.clock !== match.clock) {
    // An ESPN end clock may fall between this archived snap and the next snap in the same period.
    const next = archived.plays[archived.plays.indexOf(match) + 1];
    if (play.clock > match.clock || !next || next.quarter !== match.quarter || next.clock === null || play.clock < next.clock) return null;
  }
  return match;
}
