import { loadCurrent } from "@/lib/load-games";
import { currentSeasonSummary, formatDate, nextScheduledGame, recordLabel } from "@/lib/current";
import { teamIdentity } from "@/lib/teams";
import { ShareImage } from "@/lib/share-image";

export const alt = "Jets game day: the next matchup and the season so far, from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const snapshot = await loadCurrent();
  const next = nextScheduledGame(snapshot);
  const summary = currentSeasonSummary(snapshot);
  const opponent = next ? teamIdentity(next.game.opponentDisplay)?.nickname ?? next.game.opponentDisplay : null;
  return ShareImage({
    eyebrow: snapshot ? `Game day · ${snapshot.season} season` : "Game day",
    title: next ? `Jets ${next.game.atHome ? "vs" : "at"} ${opponent}.` : "Game day.",
    detail: next ? `Week ${next.game.week} · ${formatDate(next.game.date)} · The matchup, your score call, and the season so far.` : "The next Jets matchup, a score prediction you can save, and the current season’s schedule and results.",
    score: snapshot && summary.finals.length ? recordLabel(summary) : undefined,
  });
}
