import type { ScheduledGame } from "./current";

export type MatchdayReport = {
  gameId: string;
  reviewedAt: string;
  expiresAt: string;
  watch: { network: string; radio: string; venue: string; url: string };
  availability: { title: string; body: string; url: string; publishedAt: string }[];
};

// Manually reviewed reporting; provenance and the update procedure live in
// docs/matchday-editorial.md. This is separate from the automated roster feed.
const bearsReport: MatchdayReport = {
  gameId: "2026_04_NYJ_CHI",
  reviewedAt: "2026-09-30T22:34:42.000Z",
  expiresAt: "2026-10-04T17:00:00.000Z",
  watch: {
    network: "FOX",
    radio: "Q104.3 · New York area",
    venue: "Soldier Field",
    url: "https://www.newyorkjets.com/news/jets-at-bears-ways-to-watch-stream-week-4-10-04-2026",
  },
  availability: [
    {
      title: "Hall and Parham: Wednesday update",
      body: "The Jets reported that Aaron Glenn said Breece Hall (thigh) and Dylan Parham (knee) would not practice Wednesday and were week-to-week. Their game-day availability was not confirmed by that report.",
      url: "https://www.newyorkjets.com/news/minkah-fitzpatrick-really-good-chance-to-play-vs-bears-jets-injury-update-09-30-2026",
      publishedAt: "2026-09-30T17:48:00.000Z",
    },
    {
      title: "Fitzpatrick: a possible return",
      body: "The Jets reported that Glenn expected Minkah Fitzpatrick to be limited at Wednesday practice and was optimistic about a return against Chicago. That update did not establish final game-day clearance.",
      url: "https://www.newyorkjets.com/news/minkah-fitzpatrick-really-good-chance-to-play-vs-bears-jets-injury-update-09-30-2026",
      publishedAt: "2026-09-30T17:48:00.000Z",
    },
  ],
};

/** Return reviewed pregame reporting only for the fixture it was checked against. */
export function selectMatchdayReport(game: ScheduledGame, now: number = Date.now()): MatchdayReport | null {
  if (game.id !== bearsReport.gameId || game.season !== 2026 || game.week !== 4 ||
      game.seasonType !== "REG" || game.date !== "2026-10-04" ||
      game.opponent !== "CHI" || game.atHome || game.status !== "scheduled") return null;

  const reviewedAt = Date.parse(bearsReport.reviewedAt);
  const expiresAt = Date.parse(bearsReport.expiresAt);
  const kickoff = game.kickoff ? Date.parse(game.kickoff) : NaN;
  // A revised or missing kickoff requires an editorial recheck, even if the
  // schedule keeps the same game ID. Never carry Wednesday notes past kickoff.
  if (!Number.isFinite(now) || now < reviewedAt || now >= expiresAt || kickoff !== expiresAt) return null;
  return bearsReport;
}
