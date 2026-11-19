import { BUFFALO, CLEVELAND } from "./snap-explorer";
import type { Snap, SnapGame, SnapScore } from "./snap-types";
import { teamIdentity } from "./teams";

const downs = ["", "1st", "2nd", "3rd", "4th"];
const penalty = /\bpenalt(?:y|ies)\b/i;
const reviewed = /\b(challenged|reviewed|reversed|overturned|replay official)\b/i;
const looseBall = /\b(fumbl\w*|lateral\w*|muff\w*|aborted)\b/i;

function recordedTeam(code: string) {
  const identity = teamIdentity(code === "CLV" ? "CLE" : code);
  return identity?.nickname ?? identity?.city;
}

function teams(game: SnapGame, play: Snap) {
  const other = teamIdentity(game.opponent);
  const opponent = other?.nickname ?? other?.city ?? game.opponent;
  const offense = play.possession === "jets" ? "Jets" : play.possession === "opponent" ? opponent : null;
  return { opponent, offense, defense: offense === null ? null : play.possession === "jets" ? opponent : "Jets" };
}

export function fieldSpot(game: SnapGame, play: Snap, toGoal: number, short = false): string {
  if (toGoal === 50) return short ? "50" : "midfield";
  const { offense, defense } = teams(game, play);
  const ownHalf = toGoal > 50;
  const name = short ? (ownHalf === (play.possession === "jets") ? "NYJ" : game.opponent) : ownHalf ? offense : defense;
  const yard = ownHalf ? 100 - toGoal : toGoal;
  return (short ? "" : "the ") + name + (yard === 0 ? " goal line" : " " + yard);
}

function actionGroup(play: Snap) {
  const type = (play.type ?? "").replaceAll("_", " ").toLowerCase();
  const text = play.description;
  if (/\b(?:timeout|time out)\b/i.test(type) || /^\s*(?:\([\d:]+\)\s*)?(?:timeout|time out)\b/i.test(text)) return "timeout";
  if (/two.point|2.pt|2pt|two point/i.test(type) || /\btwo-point conversion attempt\b/i.test(text)) return "conversion";
  if (/extra point|pat (?:good|missed)|point after/.test(type) || /\bextra point\b/i.test(text)) return "try";
  if (/kickoff|kick off|onside kick/.test(type)) return "kickoff";
  if (/field goal/.test(type)) return "fieldGoal";
  if (/punt/.test(type)) return "punt";
  if (/no play|penalty|end period|end of/.test(type)) return "other";
  if (play.facts?.kind || /^(?:pass|run|rush|sack|qb kneel|qb spike|scramble)|interception|fumble|kneel|spike/i.test(type)) return "scrimmage";
  return "other";
}

export function snapSituation(game: SnapGame, play: Snap): string {
  const { offense } = teams(game, play);
  const group = actionGroup(play);
  if (group === "timeout") {
    const caller = play.description.match(/\btimeout #?\d+ by ([A-Z]{2,3})\b/i);
    const name = caller && recordedTeam(caller[1]);
    return name ? name + " timeout" : "Timeout";
  }
  if (group === "kickoff") {
    const spot = play.description.match(/\bkicks?[^.]*?\bfrom ([A-Z]{2,3}) (\d{1,2})\b/);
    const team = spot && recordedTeam(spot[1]);
    return team && spot && Number(spot[2]) <= 50 ? "Kickoff from the " + team + " " + spot[2] : "Kickoff";
  }
  const special = group === "try" ? "extra-point attempt" : group === "conversion" ? "two-point try" :
    group === "fieldGoal" ? "field-goal attempt" : group === "punt" ? "punt" : null;
  if (group === "try" || group === "conversion") return offense ? offense + " " + special : group === "try" ? "Extra-point attempt" : "Two-point try";
  const down = play.down !== null ? downs[play.down] : null;
  const distance = play.facts?.goalToGo ? "goal" : play.distance != null && play.distance > 0 ? String(play.distance) : null;
  const spot = offense && play.yardline !== null ? fieldSpot(game, play, play.yardline) : null;
  const start = special ? (offense ? offense + " " : "") + special : offense && (group === "scrimmage" || down) ? offense + " ball" : null;
  const line = [down && (distance ? down + " & " + distance : down + " down"), spot && "at " + spot].filter(Boolean).join(" ");
  return [start, line].filter(Boolean).join(" · ") || "Pre-play situation unavailable";
}

export function fieldPosition(game: SnapGame, play: Snap) {
  if (actionGroup(play) !== "scrimmage" || penalty.test(play.description) || !play.possession || !play.down ||
      play.yardline === null || play.distance === null || play.distance <= 0) return null;
  const start = play.yardline;
  const line = play.facts?.goalToGo ? 0 : Math.max(0, start - play.distance);
  const f = play.facts;
  const finish = f?.simpleAdvance && f.yards != null ? start - f.yards : null;
  return { start, line, finish: finish !== null && finish >= 0 && finish <= 100 ? finish : null,
    offense: teams(game, play).offense!, goal: line === 0 };
}

function readableName(source: string) {
  return source.replace(/^(\p{L}{1,4})\.(?=\p{L})/u, "$1. ");
}

function yardCount(n: number) {
  return Math.abs(n) + (Math.abs(n) === 1 ? " yard" : " yards");
}

function gainText(yards: number | undefined) {
  return yards == null ? "" : yards === 0 ? " for no gain" : yards < 0 ? " for a loss of " + yardCount(yards) : " for " + yardCount(yards);
}

function cleanedAccount(text: string) {
  return text.replace(/^\s*\(\s*\d{0,2}:\d{2}\s*\)\s*/, "")
    .replace(/^\s*\((?:shotgun|no huddle(?:, shotgun)?|run formation|punt formation|field goal formation)\)\s*/i, "")
    .replace(/\b\d{1,2}-(?=[A-Za-z]{1,4}\.[A-Z])/g, "").replace(/\b([A-Z][a-z]{0,3})\.(?=[A-Z])/g, "$1. ")
    .replace(/\b(?:ran|pushed) ob\b/gi, match => match.startsWith("ran") ? "went out of bounds" : "pushed out of bounds")
    .replace(/\bTOUCHDOWN\b/g, "touchdown").replace(/\bINTERCEPTED\b/g, "intercepted")
    .replace(/\bPENALTY\b/g, "Penalty").replace(/\bCLV\b/g, "CLE").trim();
}

function espnTouchdownPass(game: SnapGame, play: Snap) {
  if (game.source !== "espn" || play.type?.toLowerCase() !== "passing touchdown") return null;
  return play.description.match(/^([\p{L} .’'-]+?) pass from ([\p{L} .’'-]+?) for (\d{1,2}) yds?, touchdown\.?$/iu);
}

export function snapHeadline(game: SnapGame, play: Snap): string {
  const text = play.description;
  const f = play.facts;
  if (game.id === BUFFALO && play.key === "2511" && /J\.Allen pass.*D\.Kincaid.*54 yards/i.test(text)) return "Allen to Kincaid for 54 yards.";
  if (game.id === CLEVELAND && play.key === "4199" && /G\.Wilson for 15 yards, TOUCHDOWN/i.test(text)) return "Garrett Wilson catches the touchdown.";
  if (game.id === CLEVELAND && play.key === "4276" && /INTERCEPTED by (?:\d+-)?A\.Davis/i.test(text)) return "Ashtyn Davis intercepts Brissett.";
  const touchdown = espnTouchdownPass(game, play);
  if (touchdown) return touchdown[1] + " catches the touchdown.";
  const group = actionGroup(play);
  if (group === "timeout") return "Timeout on the field.";
  if (reviewed.test(text)) return /\b(reversed|overturned)\b/i.test(text) ? "The ruling changes on review." : "The play is reviewed.";
  if (penalty.test(text)) return /\bno play\b/i.test(text) ? "A penalty wipes out the play." : "A flag on the play.";
  if (looseBall.test(text)) return /\blateral\w*/i.test(text) && !/\bfumbl\w*/i.test(text) ? "A lateral on the play." : "The ball comes loose.";
  if (group === "kickoff") return /\btouchback\b/i.test(text) ? "The kickoff goes for a touchback." : /\bonside\b/i.test(text) ? "An onside kick." : "The kickoff.";
  if (group === "try" || group === "fieldGoal") {
    const kind = group === "try" ? "extra point" : "field goal";
    if (/\b(blocked|no good|missed|failed)\b/i.test(text)) return "The " + kind + (/\bblocked\b/i.test(text) ? " is blocked." : " is no good.");
    return "The " + kind + (/\b(?:is good|good|succeeds)\b/i.test(text) ? " is good." : " attempt.");
  }
  if (group === "conversion") return /\b(fails|failed|no good|unsuccessful)\b/i.test(text) ? "The two-point try fails." :
    /\b(succeeds|successful|is good)\b/i.test(text) ? "The two-point try is good." : "A two-point try.";
  if (group === "punt") return /\bblocked\b/i.test(text) ? "The punt is blocked." : /\btouchback\b/i.test(text) ? "The punt goes for a touchback." : "The punt.";
  const passer = f?.passer && readableName(f.passer), target = f?.target && readableName(f.target);
  if (f?.kind === "interception") return (f.interceptor ? readableName(f.interceptor) + " intercepts " + (passer ?? "the pass") : "The pass is intercepted") + ".";
  if (f?.kind === "sack") return (passer ? passer + " is sacked" : "A sack") + gainText(f.yards) + ".";
  if (f?.kind === "kneel") return "The quarterback takes a knee.";
  if (f?.kind === "spike") return "The quarterback spikes the ball.";
  if (f?.kind === "incompletion") return (passer ?? "The quarterback") + (target ? " throws incomplete to " + target : " throws incomplete") + ".";
  if (f?.kind === "completion" && target) return target + (f.touchdown ? " catches a touchdown pass." : " makes the catch" + gainText(f.yards) + ".");
  if (f?.kind === "rush") return (f.rusher ? readableName(f.rusher) : "The ball carrier") + (f.touchdown ? " runs for a touchdown." :
    (/\bscrambl/i.test(text) ? " scrambles" : " runs") + gainText(f.yards) + ".");
  // Older files and live providers may have only an action label and a gamebook account.
  if (play.type && /^[A-Za-z][A-Za-z -]+$/.test(play.type) && !["pass", "run", "rush"].includes(play.type.toLowerCase())) return play.type[0].toUpperCase() + play.type.slice(1) + ".";
  if (/\bincomplete\b/i.test(text)) return "The pass falls incomplete.";
  if (/\bintercepted\b/i.test(text)) return "The defense intercepts the pass.";
  return play.type === "run" ? "A run from scrimmage." : play.type === "pass" ? "A passing play." : "The play on the field.";
}

export function snapAccount(game: SnapGame, play: Snap): string {
  const text = play.description;
  const f = play.facts;
  const field = fieldPosition(game, play);
  const touchdown = espnTouchdownPass(game, play);
  if (touchdown) return touchdown[2] + " finds " + touchdown[1] + " for a " + touchdown[3] + "-yard touchdown.";
  if (game.id === CLEVELAND && play.key === "4276" && /J\.Brissett.*INTERCEPTED by (?:\d+-)?A\.Davis at NYJ 36\. (?:\d+-)?A\.Davis to 50 for 14 yards\./i.test(text))
    return "Ashtyn Davis picks off Jacoby Brissett at the Jets 36 and returns it 14 yards to midfield. The Jets take possession.";
  if (game.id === CLEVELAND && play.key === "4199" && /J\.Flacco pass short middle to (?:\d+-)?G\.Wilson for 15 yards, TOUCHDOWN\./i.test(text))
    return "Joe Flacco finds Garrett Wilson over the middle for a 15-yard touchdown.";
  if (game.id === BUFFALO && play.key === "2511" && /J\.Allen pass deep right to (?:\d+-)?D\.Kincaid pushed ob at NYJ 8 for 54 yards/i.test(text))
    return "Josh Allen finds Dalton Kincaid down the right side. Buffalo goes from its own 38 to " +
      (f?.firstDown && field?.finish === 8 ? "first-and-goal at " : "") + "the Jets 8.";
  if (f?.simpleAdvance && field?.finish != null && !reviewed.test(text)) {
    const end = fieldSpot(game, play, field.finish);
    const first = f.firstDown && (field.finish <= 10 ? "first-and-goal" : "a first down");
    const toGain = field.finish - field.line;
    const result = f.touchdown ? "a touchdown" : first || null;
    const remaining = f.firstDown === false && f.touchdown === false && play.down && play.down < 4 && toGain > 0
      ? " That leaves " + downs[play.down + 1] + " & " + (field.goal ? "goal" : toGain) + "." : "";
    if (f.kind === "completion" && f.passer && f.target) return readableName(f.passer) + " finds " + readableName(f.target) + gainText(f.yards) +
      (f.touchdown ? " and a touchdown." : ", finishing at " + end + (result ? " for " + result + "." : "." + remaining));
    if (f.kind === "rush" && f.rusher) return readableName(f.rusher) + (/\bscrambl/i.test(text) ? " scrambles" : " carries the ball") + " from " +
      fieldSpot(game, play, field.start) + " to " + end + (result ? " for " + result + "." : "." + remaining);
  }
  const enforced = /\bno play\b/i.test(text) && text.match(/\bPENALTY on\b[\s\S]*/i);
  const account = cleanedAccount(enforced ? enforced[0] : text);
  const flag = account.match(/^Penalty on ([A-Z]{2,3})(?:-[^,]+)?, ([^,]+), (\d+) yards?, enforced at [A-Z]{2,3} \d+ - No Play\.?$/i);
  const penalized = flag && recordedTeam(flag[1]);
  if (flag && penalized) return "A " + flag[3] + "-yard penalty on the " + penalized + " for " + flag[2].toLowerCase() + ". The play does not count.";
  if (!penalty.test(text) && !reviewed.test(text) && !looseBall.test(text)) {
    const kick = account.match(/^([\p{L} .’'-]+?) ((?:\d+[ -]yard field goal)|extra point) is (good|no good)(?:, (?:Center-|Wide |Short|Hit )[^\n]*)?\.?$/iu);
    if (kick && !/\b(?:return|touchdown|blocked|recovered)\b/i.test(account)) return kick[1] + (kick[3].toLowerCase() === "good" ? " makes " : " misses ") +
      (kick[2].toLowerCase() === "extra point" ? "the extra point" : "a " + kick[2].replace(/^(\d+) yard/i, "$1-yard")) + ".";
    const touchback = account.match(/^([\p{L} .’'-]+?) kicks (\d+) yards from [A-Z]{2,3} \d+ to end zone, Touchback\.?$/iu);
    if (touchback) return touchback[1] + " kicks " + touchback[2] + " yards for a touchback.";
  }
  if (play.down === 4 && play.distance != null && f?.firstDown === false && f.touchdown === false &&
      f.yards != null && f.yards < play.distance && f.kind !== "interception" && !penalty.test(text) && !reviewed.test(text) && !looseBall.test(text)) {
    return account + " The offense comes up " + yardCount(play.distance - f.yards) + " short on fourth down.";
  }
  return account;
}

export function scoreContext(before: SnapScore | null, after: SnapScore | null, opponent: string): string {
  if (!after) return "Score after this play unavailable.";
  const [j, o] = after;
  const team = (jets: number, opp: number) => jets > opp ? "Jets" : opponent;
  const leader = team(j, o);
  const lead = j === o ? "Tied at " + j : leader + (leader === "Washington" ? " leads by " : " lead by ") + Math.abs(j - o);
  if (!before) return lead + ".";
  const [oldJ, oldO] = before;
  if (oldJ === j && oldO === o) return lead + " before and after the play.";
  const entered = oldJ === oldO ? "Tied " + oldJ + "–" + oldO : team(oldJ, oldO) + " led " + Math.max(oldJ, oldO) + "–" + Math.min(oldJ, oldO);
  return entered + " before the play. " + (j === o ? "Now tied." : lead + ".");
}

export function swingRank(plays: Snap[]) {
  const current = plays.at(-1)?.delta;
  if (current == null || Math.abs(current) < .005) return null;
  const swings = plays.flatMap(play => play.delta === null ? [] : [Math.round(Math.abs(play.delta) * 1000)]);
  if (swings.length < 2) return null;
  const value = Math.round(Math.abs(current) * 1000);
  return { rank: 1 + swings.filter(n => n > value).length, tied: swings.filter(n => n === value).length > 1, measured: swings.length };
}
