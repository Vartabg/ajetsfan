import type { ResultGame } from "./current";
import { converted } from "./study-outcome";
import type { Snap, SnapGame, SnapScore } from "./snap-types";

export const situationNames = {
  "third-down": "Third-down conversions", "red-zone": "Red-zone touchdowns", "red-zone-calls": "Red-zone play calling", "early-downs": "Early-down play calling",
  "two-minute": "Final two minutes of either half", "close-fourth": "Fourth quarter within one score",
  q1: "First quarter", q2: "Second quarter", q3: "Third quarter", q4: "Fourth quarter",
} as const;
export type Situation = keyof typeof situationNames;
export type TeamWindow = "season" | "recent";
export type TeamSide = "offense" | "defense";
export type SituationSettings = { season: number; side: TeamSide; sample: Situation; window: TeamWindow; page: number };
export type SituationCounts = { total: number; positive: number; dropbacks: number; yards: number; yardPlays: number; unknown: number };
export type SituationSummary = { selected: number; covered: number; through: string | null; rows: Record<Situation,SituationCounts> };
export type SituationExample = { game: ResultGame; play: Snap; outcome: string };
export type RedZoneTrip = { play: Snap; result: boolean | null; label: string };
export type RedZoneGame = { game: ResultGame; covered: boolean; trips: RedZoneTrip[] };
const pageSize = 6;
const emptyCounts = (): SituationCounts => ({ total:0, positive:0, dropbacks:0, yards:0, yardPlays:0, unknown:0 });

function windowSummary(fixtures: ResultGame[], games: Map<string,SnapGame>): SituationSummary {
  const rows = Object.fromEntries(Object.keys(situationNames).map(key => [key,emptyCounts()])) as Record<Situation,SituationCounts>;
  return { selected:fixtures.length, covered:fixtures.filter(f => games.has(f.id)).length, through:fixtures[0]?.date ?? null, rows };
}

function callType(play: Snap) {
  if (play.facts?.kind === "kneel" || play.facts?.kind === "spike") return null;
  if (play.facts?.statCall) return play.facts.statCall;
  switch (play.facts?.kind) {
    case "rush": return /\bscrambl(?:e|es|ed|ing)\b/i.test(play.description) ? "dropback" : "run";
    case "completion": case "incompletion": case "interception": case "sack": return "dropback";
    default: return null;
  }
}

/** A declined flag or an overturned spot can leave the archive without a structured touchdown field. */
function offensiveTouchdown(play: Snap, side: number): boolean {
  if (play.down == null || (play.type !== "run" && play.type !== "pass") || play.facts?.turnovers?.length) return false;
  const { before,after } = play;
  const six = !!before && !!after && after[side] - before[side] === 6 && before[1-side] === after[1-side];
  if (play.facts?.touchdown === true || play.facts?.statTouchdown === true) return !before || !after || six;
  if (!six || play.facts?.touchdown === false || play.yardline == null) return false;
  // A reversed ruling restates the adjudicated action after the reversal. Read only that final account.
  const ruling = play.description.split(/\b(?:the play|the ruling) was (?:reversed|overturned)[.!]\s*/i).at(-1)!;
  if (/\b(?:intercept\w*|fumbl\w*|muff\w*|return\w*|lateral\w*|backwards? pass|no play|offsetting|revers\w*|overturn\w*|challeng\w*|review\w*|two.point)\b/i.test(ruling)) return false;
  const upheldPenalties = ruling.match(/\bdeclined\b|\b(?:enforced|assessed) (?:between downs|on the (?:ensuing )?kickoff)\b/gi);
  if ((ruling.match(/\bpenalt(?:y|ies)\b/gi) ?? []).length !== (upheldPenalties ?? []).length) return false;
  const finish = ruling.match(/\bfor (\d{1,2}) yards?, touchdown\b/i);
  return !!finish && Number(finish[1]) === play.yardline;
}

function creditedScrimmage(play: Snap) {
  if (play.facts?.kind || play.facts?.statCall) return true;
  // Penalty enforcement can suppress individual statistics on a scrimmage snap that was actually played.
  if (/\b(?:no play|nullified|offsetting|two.point|aborted|no snap)\b/i.test(play.description)) return false;
  return play.type === "pass" ? /\b(?:pass|sacked|intercepted)\b/i.test(play.description) :
    play.type === "run" && /\b(?:for (?:-?\d+ yards?|no gain)|scrambles?|kneels?)\b/i.test(play.description);
}

function redZoneTrips(game: SnapGame, possession: Snap["possession"]): RedZoneTrip[] {
  const trips: RedZoneTrip[] = [], entered = new Set<number>();
  const side = possession === "jets" ? 0 : 1;
  const plays = game.plays;
  for (let i = 0; i < plays.length; i++) {
    const entry = plays[i];
    if (entry.possession !== possession || entry.drive == null || entered.has(entry.drive) ||
        !entry.down || entry.yardline == null || entry.yardline < 1 || entry.yardline > 20 ||
        !creditedScrimmage(entry)) continue;
    entered.add(entry.drive);
    let j = i, touchdown: Snap | undefined, terminal: RedZoneTrip | undefined, conflictingScore = false;
    let last = entry;
    for (; j < plays.length; j++) {
      const p = plays[j], facts = p.facts;
      if (p.drive !== entry.drive || (p.possession && p.possession !== possession)) break;
      if (p.possession !== possession) continue; // Timeouts and other administrative records within the drive.
      if (p.down) last = p;
      if (p.down && (facts?.kind || p.type === "pass" || p.type === "run")) terminal = undefined;
      if (offensiveTouchdown(p,side)) { touchdown = p; continue; }
      if (p.down && (facts?.touchdown === true || facts?.statTouchdown || (p.before && p.after && p.after[side] - p.before[side] >= 6))) conflictingScore = true;
      const kick = facts?.kick;
      if (kick?.kind === "fieldGoal" && kick.outcome)
        terminal = {play:p,result:false,label:kick.outcome === "made" ? "Field goal" : "Missed field goal"};
      else if (kick?.kind === "punt") terminal = {play:p,result:false,label:"Punt"};
      else if (facts?.turnovers?.length === 1)
        terminal = {play:p,result:false,label:facts.turnovers[0] === "downs" ? "Turnover on downs" : "Turnover"};
    }
    if (touchdown && !conflictingScore) {
      trips.push({play:touchdown,result:true,label:"Offensive touchdown"});
      continue;
    }
    // The next possession's starting score (or a verified final) can rule out a TD without identifying the exact last play.
    const next = plays[j];
    const boundary: SnapScore | null = next?.drive != null && next.drive !== entry.drive ? next.before :
      !next && last.quarter >= 4 ? game.final : null;
    const gain = boundary && entry.before ? boundary[side]-entry.before[side] : null;
    const stableScore = gain != null && gain >= 0 && gain < 6 && boundary![1-side] >= entry.before![1-side];
    if (!conflictingScore && terminal && (gain == null || stableScore)) trips.push(terminal);
    else if (!conflictingScore && stableScore) {
      trips.push({play:last,result:false,label:last.facts?.kind === "kneel" ? "Drive ended on a kneel" : "Drive ended without a touchdown"});
    } else trips.push({play:entry,result:null,label:"Trip outcome unavailable"});
  }
  return trips;
}

export function teamSituations(fixtures: ResultGame[], games: SnapGame[], settings: SituationSettings) {
  const selected = fixtures.filter(f => f.season === settings.season && f.seasonType === "REG")
    .sort((a,b) => b.date.localeCompare(a.date) || b.week-a.week || a.id.localeCompare(b.id));
  const recent = selected.slice(0,4);
  const records = new Map(games.filter(g => g.source === "nflverse").map(g => [g.id,g]));
  const season = windowSummary(selected,records), lastFour = windowSummary(recent,records);
  const redZoneGames: RedZoneGame[] = [];
  const examples: SituationExample[] = [];
  const subject = settings.side === "offense" ? "jets" : "opponent";
  for (const [index,fixture] of selected.entries()) {
    const game = records.get(fixture.id);
    const trips = game ? redZoneTrips(game,subject) : [];
    if (index < recent.length) redZoneGames.unshift({game:fixture,covered:!!game,trips});
    if (!game) continue;
    const officialThirdDowns = game.plays.some(play => play.facts?.thirdDownResult !== undefined);
    const windows = index < recent.length ? [season,lastFour] : [season];
    function add(key: Situation, p: Snap, positive: boolean | null, label: string, dropback = false) {
      for (const period of windows) {
        const row = period.rows[key];
        if (positive == null) { row.unknown++; continue; }
        row.total++;
        if (positive) row.positive++;
        if (dropback) row.dropbacks++;
        const yards = p.facts?.yards ?? p.facts?.statYards;
        if (yards != null) { row.yards += yards; row.yardPlays++; }
      }
      if (key === settings.sample && positive != null && (settings.window === "season" || index < recent.length))
        examples.push({game:fixture,play:p,outcome:label});
    }
    for (const trip of trips) add("red-zone",trip.play,trip.result,trip.label);
    for (const play of game.plays) {
      if (play.possession !== subject || !play.down) continue;
      const call = callType(play);
      const credited = play.facts?.thirdDownResult;
      if (play.down === 3 && (credited === "converted" || credited === "failed" ||
          (credited === undefined && call && play.distance != null && play.distance > 0))) {
        const success = credited === undefined ? officialThirdDowns ? null : converted(play.facts) : credited === "converted";
        add("third-down",play,success,success ? "Converted" : "Didn’t convert",call === "dropback");
      }
      if (!call) continue;
      const dropback = call === "dropback";
      const yards = play.facts?.yards ?? play.facts?.statYards;
      const label = (dropback ? "Dropback" : "Run") + (yards == null ? "" : " · " + yards + (Math.abs(yards) === 1 ? " yard" : " yards"));
      if (play.down <= 2) add("early-downs",play,dropback,label,dropback);
      if (play.yardline != null && play.yardline >= 1 && play.yardline <= 20) add("red-zone-calls",play,dropback,label,dropback);
      if (play.quarter <= 4) add((["q1","q2","q3","q4"] as const)[play.quarter-1],play,dropback,label,dropback);
      if ((play.quarter === 2 || play.quarter === 4) && play.clock != null && play.clock <= 120)
        add("two-minute",play,dropback,label,dropback);
      if (play.quarter === 4 && play.before && Math.abs(play.before[0]-play.before[1]) <= 8)
        add("close-fourth",play,dropback,label,dropback);
    }
  }
  const pages = Math.ceil(examples.length/pageSize);
  const start = (settings.page-1)*pageSize;
  return { season, recent:lastFour, redZoneGames, examples:examples.slice(start,start+pageSize), total:examples.length, pages, start };
}

export function situationHref(settings: SituationSettings, changes: Partial<SituationSettings> = {}, anchor = "supporting-plays") {
  const { season,side,sample,window,page } = {...settings,...changes};
  const query = new URLSearchParams({season:String(season),side,sample,window});
  if (page > 1) query.set("page",String(page));
  return "/team/stats?" + query.toString() + (anchor ? "#" + anchor : "");
}
