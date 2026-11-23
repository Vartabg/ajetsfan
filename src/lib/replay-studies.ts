import { converted } from "./study-outcome";
import type { Snap, SnapGame } from "./snap-types";

export type ReplayStudy = "throws" | "pass-rush";
export const firstStudySeason = { throws: 2009, "pass-rush": 2016 } as const;
export type SampleGroup = "short" | "sticks" | "four" | "five";
export type StudySample = { game: SnapGame; play: Snap; conversion: boolean };
export type StudyGroup = { id: SampleGroup; label: string; samples: StudySample[]; converted: number; sacks: number };
export type StudyLocation = { season?: number; down: number; distance: number; group?: SampleGroup; clip?: string; page?: number };

const categories = {
  throws: [["short", "Short of the sticks"], ["sticks", "At or beyond the sticks"]],
  "pass-rush": [["four", "Four rushers"], ["five", "Five rushers"]],
} as const;

export function studyHref(study: ReplayStudy, location: StudyLocation, anchor = "") {
  const query = new URLSearchParams();
  if (location.season) query.set("season", String(location.season));
  if (study === "pass-rush") {
    if (location.down !== 3) query.set("down", String(location.down));
    if (location.distance !== 8) query.set("distance", String(location.distance));
  }
  if (location.group) query.set("group", location.group);
  if (location.clip) query.set("clip", location.clip);
  else if (location.page && location.page > 1) query.set("page", String(location.page));
  const suffix = query.toString();
  return "/replay/studies/" + study + (suffix ? "?" + suffix : "") + anchor;
}

export function clipId(sample: StudySample) {
  return sample.game.id + "~" + sample.play.key;
}

export function studyGroups(games: SnapGame[], study: ReplayStudy, down: number, distance: number): StudyGroup[] {
  const groups: StudyGroup[] = categories[study].map(([id, label]) => ({ id, label, samples: [], converted: 0, sacks: 0 }));
  // Newest games first. Within each game, preserve the archive's play order, including repeated clocks.
  const ordered = [...games].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  for (const game of ordered) {
    if (game.source !== "nflverse" || Number(game.id.slice(0, 4)) < firstStudySeason[study]) continue;
    const officialThirdDowns = study === "throws" && game.plays.some(play => play.facts?.thirdDownResult !== undefined);
    for (const play of game.plays) {
      const facts = play.facts;
      const thirdDownCredit = study === "throws" ? facts?.thirdDownResult : undefined;
      if (officialThirdDowns && (!thirdDownCredit || thirdDownCredit === "no-attempt")) continue;
      const conversion = thirdDownCredit ? thirdDownCredit === "converted" : converted(facts);
      if (!facts || conversion === null || play.distance === null || play.distance <= 0) continue;
      const attempt = facts.kind === "completion" || facts.kind === "incompletion" || facts.kind === "interception";
      let group: StudyGroup;
      if (study === "throws") {
        if (play.possession !== "jets" || play.down !== 3 || !attempt || !facts.target || facts.airYards == null) continue;
        group = groups[facts.airYards < play.distance ? 0 : 1];
      } else {
        const rushers = facts.charting?.rushers;
        if (play.possession !== "opponent" || play.down !== down || play.distance !== distance ||
            (!attempt && facts.kind !== "sack") || (rushers !== 4 && rushers !== 5)) continue;
        group = groups[rushers === 4 ? 0 : 1];
      }
      group.samples.push({ game, play, conversion });
      if (conversion) group.converted++;
      if (facts.kind === "sack") group.sacks++;
    }
  }
  return groups;
}

export function percent(numerator: number, denominator: number) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) + "%" : "—";
}
