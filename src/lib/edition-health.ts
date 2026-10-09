import type { CurrentSnapshot } from "./current";
import type { CoverageSnapshot, FeedState } from "./coverage";
import type { SeasonAnalytics } from "./analytics";

export type HealthFeed = { status: "ready" | "retained" | "unavailable" | "overdue" | "unknown"; checkedAt: string | null; ageMinutes: number | null };
type SourceCheck = Pick<FeedState, "status" | "checkedAt">;
export type AutomationHealthSources = {
  media?: (SourceCheck & { id: string })[];
  rankings?: SourceCheck; nextgen?: SourceCheck; trades?: SourceCheck;
};
const DAY = 24 * 60 * 60_000;

function sourceHealth(feed: Pick<FeedState, "status" | "checkedAt"> | undefined, now: number): HealthFeed {
  if (!feed) return { status: "unavailable", checkedAt: null, ageMinutes: null };
  const checked = feed.checkedAt ? Date.parse(feed.checkedAt) : NaN;
  const age = now - checked;
  if (!Number.isFinite(checked) || age < -5 * 60_000) return { status: feed.status === "unavailable" ? "unavailable" : "unknown", checkedAt: feed.checkedAt, ageMinutes: null };
  return { status: age >= DAY ? "overdue" : feed.status, checkedAt: feed.checkedAt, ageMinutes: Math.max(0, Math.floor(age / 60_000)) };
}

/** Operational age is based on successful checks, not source content timestamps. */
export function editionHealth(current: CurrentSnapshot | null, coverage: CoverageSnapshot | null, analytics: SeasonAnalytics | null, now: number, automation: AutomationHealthSources = {}) {
  const sameSeason = !!current && coverage?.season === current.season;
  const results = sourceHealth(current ? { checkedAt: current.checkedAt, status: "ready" } : undefined, now);
  const mediaSources = Object.fromEntries((automation.media ?? []).map((source) => [source.id, sourceHealth(source, now)]));
  const mediaChecks = Object.values(mediaSources);
  const media: HealthFeed = !mediaChecks.length ? sourceHealth(undefined, now) : {
    status: (["unavailable", "unknown", "overdue", "retained", "ready"] as const).find((status) => mediaChecks.some((feed) => feed.status === status))!,
    checkedAt: mediaChecks.some((feed) => !feed.checkedAt) ? null : mediaChecks.map((feed) => feed.checkedAt!).sort()[0],
    ageMinutes: mediaChecks.some((feed) => feed.ageMinutes === null) ? null : Math.max(...mediaChecks.map((feed) => feed.ageMinutes!)),
  };
  const feeds = {
    results,
    news: sourceHealth(coverage?.news, now),
    roster: sourceHealth(sameSeason && coverage?.roster.season === current?.season ? coverage.roster : undefined, now),
    stats: sourceHealth(sameSeason && coverage?.stats.season === current?.season ? coverage.stats : undefined, now),
    analysis: current?.analysisCheck ? sourceHealth(current.analysisCheck, now) : { status: "unknown" as const, checkedAt: null, ageMinutes: null },
    media,
    rankings: sourceHealth(automation.rankings, now),
    nextgen: sourceHealth(automation.nextgen, now),
    trades: sourceHealth(automation.trades, now),
  };
  const status = results.status === "unavailable" || results.status === "unknown" ? "unavailable" :
    Object.values(feeds).every((feed) => feed.status === "ready") ? "healthy" : "degraded";
  return {
    status, season: current?.season ?? null, checkedAt: current?.checkedAt ?? null, feeds, mediaSources,
    analysis: { archiveUpdatedAt: current?.analysisUpdatedAt ?? null, metricsUpdatedAt: analytics?.season === current?.season ? analytics?.analysisUpdatedAt ?? null : null, throughDate: analytics?.season === current?.season ? analytics?.throughDate ?? null : null, pendingGames: analytics?.season === current?.season ? analytics?.pendingGameIds.length ?? 0 : null },
  };
}
