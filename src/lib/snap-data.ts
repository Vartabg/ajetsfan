import type { Game } from "./games";
import type { Snap, SnapGame, SnapScore } from "./snap-types";

/** Some nflverse gamebooks append an injury update or another play to the original description. */
export function snapDescription(text: string): string {
  const withoutUpdates = text
    .replace(/(?:\s*\*\*\s*)?\binjury update\s*[:-][\s\S]*?(?=\s+(?:penalt(?:y|ies) on|the replay official|play challenged|fumbles)\b|$)/gi, "")
    .replace(/\s*\b(?:his return is (?:questionable|probable|doubtful)|he is out)\.(?=\s|$)/gi, "");
  // A replay report can recount the attempted next snap before giving this play's official ruling.
  const later = /\b(?:on (?:the )?(?:next|subsequent|following) (?:play|snap|drive|occurrence)|later in the (?:game|drive)|(?:will|would|did) not return|has returned to the game|went on to win)\b/i;
  if (!later.test(withoutUpdates)) return withoutUpdates.trim();
  return withoutUpdates.split(/(?<=[.!?])\s+/).filter((sentence) => !later.test(sentence)).join(" ").trim();
}

const integer = (value: number, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

function score(value: SnapScore | null): value is SnapScore {
  return Array.isArray(value) && value.length === 2 && value.every((n) => integer(n, 0));
}

function validPlay(play: Snap): boolean {
  return !!play && typeof play.key === "string" && /^[1-9]\d*$/.test(play.key) &&
    Number.isSafeInteger(Number(play.key)) && integer(play.quarter, 1) &&
    (play.clock === null || integer(play.clock, 0, 900)) &&
    (play.possession === null || play.possession === "jets" || play.possession === "opponent") &&
    (play.down === null || integer(play.down, 1, 4)) &&
    (play.distance === null || integer(play.distance, 0, 100)) &&
    (play.yardline === null || integer(play.yardline, 0, 100)) &&
    (play.before === null || score(play.before)) && (play.after === null || score(play.after)) &&
    (play.drive === null || integer(play.drive, 1)) &&
    (play.wp === null || Number.isFinite(play.wp) && play.wp >= 0 && play.wp <= 1) &&
    (play.delta === null || Number.isFinite(play.delta) && Math.abs(play.delta) <= 1) &&
    (play.type === null || typeof play.type === "string" && !!play.type.trim()) &&
    typeof play.description === "string" && !!play.description.trim();
}

/** Compressed season files contain complete games in source play order. IDs are identities, not order keys. */
export function parseSnapSeason(json: string, season: number): SnapGame[] {
  const file = JSON.parse(json) as { schemaVersion: number; season: number; games: SnapGame[] };
  if (file?.schemaVersion !== 1 || file.season !== season || !Array.isArray(file.games) || !file.games.length)
    throw new Error(`Invalid snap season ${season}`);
  const ids = new Set<string>();
  for (const game of file.games) {
    if (!game || typeof game.id !== "string" || !game.id.startsWith(`${season}_`) ||
      !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(game.id) || ids.has(game.id) ||
      game.source !== "nflverse" || !/^\d{4}-\d{2}-\d{2}$/.test(game.date) ||
      !/^[A-Z]{2,3}$/.test(game.opponent) || typeof game.home !== "boolean" || !score(game.final) ||
      !Array.isArray(game.plays) || !game.plays.length) throw new Error(`Invalid game in snap season ${season}`);
    ids.add(game.id);
    const keys = new Set<string>();
    for (const play of game.plays) {
      if (!validPlay(play) || keys.has(play.key)) throw new Error(`Invalid or repeated play in ${game.id}`);
      keys.add(play.key);
    }
  }
  return file.games;
}

/** Recheck compiled evidence against this request's published football edition, including historical fixtures. */
export function snapMatchesFixture(game: SnapGame, fixture: Game | undefined): boolean {
  return !!fixture && game.id === fixture.id && game.date === fixture.date && game.home === fixture.atHome &&
    game.opponent === fixture.opponent && game.final !== null &&
    game.final[0] === fixture.jetsScore && game.final[1] === fixture.oppScore;
}
