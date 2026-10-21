// Test support. Several specs build fixtures from the baked public/data files at fixed
// October 2026 times, but every data refresh replaces those files with later finals,
// check times and news. These helpers rewind a snapshot to the moment a spec is pinned
// to, so the specs pass on whatever the latest refresh wrote.

const unplayed = { status: 'scheduled', jetsScore: null, oppScore: null, outcome: null };

/** `value`, or `at` when `value` is a later time. */
export const notAfter = (value, at) => value && Date.parse(value) > Date.parse(at) ? at : value;

/**
 * The parts of a snapshot that are given ({ current, coverage, games, history, drives }) as they
 * stood before `gameId` was played: that game and every later game of its season are unplayed.
 */
export function beforeGame(snapshot, gameId) {
  const { season, date } = snapshot.current.schedule.find((game) => game.id === gameId);
  const later = (game) => game.season === season && game.date >= date;
  const played = (id) => !later(snapshot.current.schedule.find((game) => game.id === id) ?? { season: null });
  const result = { ...snapshot };
  const schedule = snapshot.current.schedule.map((game) => {
    if (!later(game)) return structuredClone(game);
    const rest = { ...structuredClone(game), ...unplayed };
    delete rest.scoreSource; delete rest.scoreCheckedAt;
    return rest;
  });
  if (snapshot.games) result.games = structuredClone(snapshot.games.filter((game) => !later(game)));
  const analyzed = (result.games?.filter((game) => game.season === season) ?? schedule.filter((game) => game.status === 'final'))
    .toSorted((a, b) => a.date.localeCompare(b.date)).at(-1)?.id ?? null;
  result.current = { ...structuredClone(snapshot.current), schedule,
    latestAnalyzedGameId: snapshot.current.latestAnalyzedGameId && played(snapshot.current.latestAnalyzedGameId) ? snapshot.current.latestAnalyzedGameId : analyzed };
  if (snapshot.coverage) {
    // Player totals keep the removed games' yards; the validators check game coverage, not sums.
    const stats = structuredClone(snapshot.coverage.stats);
    stats.analyzedGameIds = stats.analyzedGameIds.filter(played); stats.pendingGameIds = stats.pendingGameIds.filter(played);
    if (stats.playerGameIds) {
      for (const player of stats.players) player.games = (stats.playerGameIds[player.id] = stats.playerGameIds[player.id].filter(played)).length;
      stats.players = stats.players.filter((player) => player.games > 0);
      stats.playerGameIds = Object.fromEntries(stats.players.map((player) => [player.id, stats.playerGameIds[player.id]]));
    }
    const last = schedule.filter((game) => stats.analyzedGameIds.includes(game.id)).toSorted((a, b) => a.date.localeCompare(b.date)).at(-1);
    Object.assign(stats, { throughWeek: last?.week ?? null, throughDate: last?.date ?? null });
    result.coverage = { ...structuredClone(snapshot.coverage), stats };
  }
  if (snapshot.history) result.history = { ...structuredClone(snapshot.history),
    games: snapshot.history.games.map((game) => later(game) ? { ...structuredClone(game), ...unplayed, qb: null } : structuredClone(game)) };
  if (snapshot.drives) {
    const drives = structuredClone(snapshot.drives);
    for (const key of ['games', 'finals']) if (drives[key]) drives[key] = Object.fromEntries(Object.entries(drives[key]).filter(([id]) => played(id)));
    if (drives.pendingGameIds) drives.pendingGameIds = drives.pendingGameIds.filter(played);
    result.drives = drives;
  }
  return result;
}

/** Football `current` and `coverage` with no time later than `at`; callers set their own check times. */
export function footballAt({ current, coverage }, at) {
  const value = { current: structuredClone(current), coverage: structuredClone(coverage) };
  value.current.analysisUpdatedAt = notAfter(value.current.analysisUpdatedAt, at);
  const check = value.current.analysisCheck;
  if (check) Object.assign(check, { attemptedAt: notAfter(check.attemptedAt, at), checkedAt: notAfter(check.checkedAt, at) });
  for (const game of value.current.schedule) if (game.scoreCheckedAt !== undefined) game.scoreCheckedAt = notAfter(game.scoreCheckedAt, at);
  if (value.coverage) {
    for (const name of ['news', 'roster', 'stats']) value.coverage[name].sourceUpdatedAt = notAfter(value.coverage[name].sourceUpdatedAt, at);
    for (const item of value.coverage.news.items) item.publishedAt = notAfter(item.publishedAt, at);
  }
  return value;
}
