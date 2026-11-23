import "server-only";
import { defenseCriteria, earlierDefenseMatches, selectDefenseMatch, type DefensePhase, type DefenseSnapId } from "./defense-match";
import { defenseMatchField } from "./defense-match-field";
import { loadPublishedGames } from "./load-published-pages";
import { loadChartedSnapGame, loadStudySeason } from "./load-snaps";

export async function loadDefenseMatch(id: DefenseSnapId, phase: DefensePhase, requested?: DefenseSnapId) {
  const game = await loadChartedSnapGame(id.game);
  const play = game?.plays.find(row => row.key === id.play);
  if (!game || !play) return null;
  const anchor = { game, play };
  const criteria = defenseCriteria(play);
  if (!criteria || game.source !== "nflverse") {
    const chart = play.facts?.charting;
    const missing = play.type === "pass" ? [!chart?.coverage && "coverage", chart?.rushers == null && "the rusher count"].filter(Boolean) : [];
    return requested ? null : { state: "unavailable" as const, missing: missing.join(" and ") };
  }
  const fixtures = await loadPublishedGames();
  const seasons = [...new Set(fixtures.filter(fixture => fixture.season >= 2016 && fixture.date < game.date)
    .map(fixture => fixture.season))];
  const archive = await Promise.all(seasons.map(year => loadStudySeason(year, true)));
  const matches = earlierDefenseMatches(anchor, archive.flat());
  const selection = selectDefenseMatch(anchor, matches, requested);
  if (!selection) return requested ? null : { state: "empty" as const, criteria };
  const { selected, ...navigation } = selection;
  const current = defenseMatchField(anchor, phase);
  const earlier = defenseMatchField(selected, phase);
  if (!current || !earlier) return requested ? null : { state: "unavailable" as const, missing: "" };
  return { state: "ready" as const, criteria, current, earlier, navigation };
}
