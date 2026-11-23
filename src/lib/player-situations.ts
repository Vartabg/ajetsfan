import type { PlayerSeasonFile } from "./player-history";
import type { Snap, SnapGame } from "./snap-types";

export const roles = { carry: "Carries", pass: "Pass attempts", target: "Targets" } as const;
export const situations = { "third-short": "Third-and-short", "third-down": "All third downs", "red-zone": "Red zone" } as const;
export type PlayerRole = keyof typeof roles;
export type PlayerSituation = keyof typeof situations;
export type PlayerChoice = { id: string; name: string; position: string | null };
const ids = { carry: "rusherId", pass: "passerId", target: "targetId" } as const;
const names = { carry: "rusher", pass: "passer", target: "target" } as const;
const gsis = /^00-\d{7}$/;

export function playerStudyHref(id: string, season: number, role: PlayerRole, situation: PlayerSituation = "third-short", page = 1) {
  const query = new URLSearchParams({ player: id, season: String(season), role, situation });
  if (page > 1) query.set("page", String(page));
  return "/replay/studies/player?" + query;
}

export function defaultPlayerRole(position: string | null): PlayerRole {
  if (position === "QB") return "pass";
  return position && ["WR", "TE"].includes(position) ? "target" : "carry";
}

/** Names are search labels. A play belongs to a person only by its credited GSIS role. */
export function playerChoices(games: SnapGame[], roster: PlayerSeasonFile | null): PlayerChoice[] {
  const choices = new Map<string, PlayerChoice>();
  for (const [id, person] of Object.entries(roster?.players ?? {})) {
    if (gsis.test(id) && person.games.some(line => !line.post && (line.rush || line.rec || line.pass))) {
      choices.set(id, { id, name: person.name, position: person.position });
    }
  }
  for (const game of games) for (const play of game.plays) {
    if (play.possession !== "jets" || !play.facts) continue;
    for (const role of ["carry", "pass", "target"] as const) {
      const id = play.facts[ids[role]], name = play.facts[names[role]];
      if (!id || !name || choices.has(id)) continue;
      const person = roster?.players[id];
      choices.set(id, { id, name: person?.name ?? name, position: person?.position ?? null });
    }
  }
  return [...choices.values()].sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

const normalize = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");

export function findPlayerChoices(choices: PlayerChoice[], query: string): PlayerChoice[] {
  const term = normalize(query);
  if (!term) return [];
  const exact = choices.filter(player => {
    const [given, ...family] = player.name.trim().split(/\s+/);
    const abbreviated = given.charAt(0) + family.join("");
    return normalize(player.name) === term || normalize(abbreviated) === term;
  });
  return exact.length ? exact : choices.filter(player => normalize(player.name).includes(term));
}

export type PlayerClip = { game: SnapGame; play: Snap; result: boolean | null };

export function playerSituations(games: SnapGame[], player: string, role: PlayerRole, situation: PlayerSituation) {
  const clips: PlayerClip[] = [];
  let eligible = 0, identified = 0, converted = 0, stopped = 0;
  const ordered = [...games].sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  for (const game of ordered) for (const play of game.plays) {
    const facts = play.facts;
    if (game.source !== "nflverse" || play.possession !== "jets" || !facts?.kind || !play.down) continue;
    const pass = ["completion", "incompletion", "interception"].includes(facts.kind);
    if (role === "carry" ? facts.kind !== "rush" : !pass) continue;
    let outcome: boolean | null;
    if (situation === "red-zone") {
      if (play.yardline == null || play.yardline < 1 || play.yardline > 20) continue;
      outcome = facts.statTouchdown ?? facts.touchdown ?? null;
    } else {
      if (play.down !== 3 || facts.thirdDownResult === "no-attempt") continue;
      if (situation === "third-short" && play.distance !== 1 && play.distance !== 2) continue;
      outcome = facts.thirdDownResult === "converted" ? true : facts.thirdDownResult === "failed" ? false : null;
    }
    eligible++;
    const id = facts[ids[role]];
    if (!id) continue;
    identified++;
    if (id !== player) continue;
    clips.push({game, play, result: outcome});
    if (outcome === true) converted++;
    if (outcome === false) stopped++;
  }
  return { clips, eligible, identified, converted, stopped, known: converted + stopped };
}
