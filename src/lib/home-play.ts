import type { RosterPlayer } from "./coverage";
import { driveReadHref } from "./drive-read-links";
import { snapChalkboard } from "./snap-chalkboard";
import { fieldPosition, fieldSpot, snapAccount, snapHeadline, snapSituation } from "./snap-context";
import { clockText, periodName } from "./snap-explorer";
import type { Snap, SnapGame } from "./snap-types";
import { teamIdentity } from "./teams";

export type HomeField = {
  start: number; finish: number; startLabel: string; finishLabel: string;
  offense: string; defense: string;
};
export type HomePlay = {
  account: string; time: string; score: string | null; situation: string;
  replay: string; hasDiagram: boolean; field: HomeField | null;
};

/** A small projection of the one published snap. All numbers on the field are ball spots. */
export function homePlay(game: SnapGame, play: Snap, jetsRoster: readonly Pick<RosterPlayer, "id" | "name">[] = []): HomePlay {
  const facts = { ...play.facts };
  if (play.possession === "jets") {
    for (const [role, id] of [["rusher", facts.rusherId], ["passer", facts.passerId], ["target", facts.targetId]] as const) {
      const player = id && jetsRoster.find(person => person.id === id);
      if (player && facts[role]) facts[role] = player.name;
    }
  }
  const hasDiagram = snapChalkboard(game, play).kind !== "other";
  const field = hasDiagram ? fieldPosition(game, play) : null;
  const measured = field?.finish != null && field.finish !== field.start ? {
    start: field.start, finish: field.finish,
    startLabel: fieldSpot(game, play, field.start, true),
    finishLabel: fieldSpot(game, play, field.finish, true),
    offense: play.possession === "jets" ? "NYJ" : game.opponent,
    defense: play.possession === "jets" ? game.opponent : "NYJ",
  } : null;

  const credited = { ...play, facts };
  let account = snapAccount(game, credited);
  if (account.length > 240) account = snapHeadline(game, credited);
  if (measured && facts.kind === "rush" && facts.rusher && facts.yards !== undefined && facts.yards > 0) {
    const name = facts.rusher.replace(/\.(?=\p{L})/u, ". ");
    const verb = /\bscrambl/i.test(play.description) ? "scrambled" : "ran";
    let ending = facts.touchdown ? " for a touchdown" : " to " + fieldSpot(game, play, measured.finish) +
      (facts.firstDown ? " for a first down" : "");
    if (facts.firstDown && !facts.touchdown && measured.start > 20 && measured.finish > 0 && measured.finish <= 20) {
      ending = " for a first down with " + measured.finish + (measured.finish === 1 ? " yard" : " yards") + " to the end zone";
    }
    account = name + " " + verb + " " + facts.yards + (facts.yards === 1 ? " yard" : " yards") + ending + ".";
  }
  const opponent = teamIdentity(game.opponent)?.nickname ?? game.opponent;
  let score = null;
  if (play.before) {
    const [us, them] = play.before;
    score = us === them ? `Tied ${us}–${them}` : us > them ? `Jets led ${us}–${them}` : `${opponent} led ${them}–${us}`;
  }
  const quarter = ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"][play.quarter - 1] ?? periodName(play.quarter);
  return {
    account, time: quarter + (play.clock === null ? "" : " · " + clockText(play.clock) + " left"), score,
    situation: snapSituation(game, play), replay: driveReadHref(game.id, { play: play.key, phase: "action" }), hasDiagram, field: measured,
  };
}
