import type { ResultGame } from "./current";
import type { Game } from "./games";
import { gameSearchMatcher } from "./explorer";
import { fanMemoryForGame } from "./fan-memories";
import { buildFilmCases } from "./film-room";
import type { CurvePoint } from "./load-games";
import { buildVisualStory } from "./visual-story";
import { REPLAY } from "./wilson-replay.mjs";

export type GameDiscoveryResult = {
  game: ResultGame;
  material: { href: string; label: string }[];
};

/** Published reports are already checked against the current and archive sources. */
export function searchGameReports(
  analyzed: Game[], drivesOnly: ResultGame[], curves: Record<string, readonly CurvePoint[]>, query: string,
): GameDiscoveryResult[] {
  const matches = gameSearchMatcher(query);
  const film = buildFilmCases(analyzed, curves);
  const withAnalysis = analyzed.flatMap((game) => {
    const story = buildVisualStory(game, curves[game.id] ?? []);
    const studies = film.filter((study) => study.game.id === game.id);
    const memory = fanMemoryForGame(game);
    const related = [memory?.title, memory?.fact, story?.title, story?.dek, story?.source.label,
      ...(story?.chapters.map((chapter) => chapter.headline) ?? []),
      ...studies.flatMap((study) => [study.title, ...study.replays.map((replay) => replay.label),
        study.id === "sanchez-thanksgiving" ? "Butt Fumble" : ""]),
    ].join(" ");
    if (!matches(game, related)) return [];

    const material: GameDiscoveryResult["material"] = [];
    if (story) material.push({ href: `/stories?story=${game.id}#visual-story`, label: "Visual story" });
    for (const study of studies) {
      material.push({ href: `/film-room?play=${study.id}#film-room`, label: `Film Room · ${study.title}` });
      if (study.id === "wilson-cleveland" && game.id === REPLAY.record.game_id &&
        (!("playId" in study.play) || study.play.playId === REPLAY.record.play_id)) {
        material.push({ href: "/film-room/replay/wilson-cleveland", label: "Wilson’s touchdown in 3D" });
      }
    }
    return [{ game, material }];
  });
  const withDrives = drivesOnly.filter((game) => matches(game)).map((game) => ({ game, material: [] }));
  return [...withAnalysis, ...withDrives].sort((a, b) => b.game.date.localeCompare(a.game.date) || b.game.id.localeCompare(a.game.id));
}
