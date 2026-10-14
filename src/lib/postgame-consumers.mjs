import { makeBakedDrivesEvidence, validateRuntimeDrives, validateRuntimeHistory } from './postgame-evidence.mjs';

const stamp = (value) => Date.parse(value ?? '') || 0;
function valid(value, validate) {
  if (!value) return null;
  try { return validate(value); } catch { return null; }
}

/** Successful source checks select content; a newer failed attempt remains visible. */
export function newestPostgameSource(baked, runtime) {
  if (!baked) return runtime;
  if (!runtime) return baked;
  const good = stamp(runtime.checkedAt) >= stamp(baked.checkedAt) ? runtime : baked;
  const attempted = stamp(runtime.attemptedAt ?? runtime.checkedAt) >= stamp(baked.attemptedAt ?? baked.checkedAt) ? runtime : baked;
  return attempted.status === 'retained' && stamp(attempted.attemptedAt ?? attempted.checkedAt) >= stamp(good.attemptedAt ?? good.checkedAt)
    ? { ...good, status: 'retained', attemptedAt: attempted.attemptedAt ?? attempted.checkedAt } : good;
}

/** @param {{baked?:any,runtime?:any,compiledCurrent:any,compiledGames?:any[],current:any}} options */
export function selectDriveSeason({ baked = null, runtime = null, compiledCurrent, compiledGames = [], current }) {
  const compiled = baked?.season === current.season ? valid(baked, (file) => makeBakedDrivesEvidence(file, compiledCurrent, compiledGames)) : null;
  const published = runtime?.season === current.season ? valid(runtime, validateRuntimeDrives) : null;
  // A compiled score witness does not prove its chart was extracted from a
  // complete PBP asset. Published rows survive until a fresh extraction or a
  // corrected final invalidates their witness, regardless of a build's clock.
  const selected = published ?? compiled;
  if (!selected) return null;
  const candidates = [published, compiled].filter(Boolean);
  const finals = new Map(current.schedule.filter((game) => game.status === 'final').map((game) => [game.id, game]));
  const games = {}, witnesses = {};
  let mixed = false;
  for (const candidate of candidates) {
    for (const [id, rows] of Object.entries(candidate.games)) {
      if (Object.hasOwn(games, id)) continue;
      const witness = candidate.finals[id], final = finals.get(id);
      if (final?.date === witness.date && final.jetsScore === witness.jetsScore && final.oppScore === witness.oppScore) {
        games[id] = rows; witnesses[id] = witness;
        if (published && candidate === compiled) mixed = true;
      }
    }
  }
  const failure = candidates.filter((value) => value.status === 'retained').sort((left, right) => stamp(right.attemptedAt ?? right.checkedAt) - stamp(left.attemptedAt ?? left.checkedAt))[0];
  const attempt = candidates.reduce((latest, value) => stamp(value.attemptedAt ?? value.checkedAt) > stamp(latest) ? value.attemptedAt ?? value.checkedAt : latest, selected.attemptedAt ?? selected.checkedAt);
  const metadata = mixed ? { status: 'retained', asset: null, attemptedAt: attempt }
    : failure && stamp(failure.attemptedAt ?? failure.checkedAt) >= stamp(selected.attemptedAt ?? selected.checkedAt)
      ? { status: 'retained', attemptedAt: failure.attemptedAt ?? failure.checkedAt } : {};
  return validateRuntimeDrives({ ...selected, ...metadata, games, finals: witnesses,
    pendingGameIds: [...finals.keys()].filter((id) => !Object.hasOwn(games, id)).sort() }, current);
}

/** New source editions may correct a starter, but cannot erase known finals or starters. */
export function retainsKnownHistoryFinals(candidate, previous) {
  const games = new Map(candidate.games.map((game) => [game.id, game]));
  return previous.games.every((game) => game.status !== 'final'
    || games.get(game.id)?.status === 'final' && (!game.qb || !!games.get(game.id)?.qb));
}

/** A current result correction cannot inherit an older starting-quarterback claim. */
/** @param {{baked?:any,runtime?:any,current:any}} options */
export function selectLeagueHistory({ baked = null, runtime = null, current }) {
  const compiled = valid(baked, validateRuntimeHistory), published = valid(runtime, validateRuntimeHistory);
  const protect = published && compiled && stamp(compiled.checkedAt) > stamp(published.checkedAt) && !retainsKnownHistoryFinals(compiled, published);
  const selected = protect ? { ...published, status: 'retained', attemptedAt: [compiled, published].reduce((latest, value) =>
    stamp(value.attemptedAt ?? value.checkedAt) > stamp(latest) ? value.attemptedAt ?? value.checkedAt : latest, published.attemptedAt ?? published.checkedAt) }
    : newestPostgameSource(compiled, published);
  if (!selected) return null;
  const fixtures = new Map(current.schedule.map((game) => [game.id, game]));
  return { ...selected, games: selected.games.map((game) => {
    if (game.season !== current.season || game.qb === null) return game;
    const fixture = fixtures.get(game.id);
    return fixture?.status === 'final' && fixture.date === game.date && fixture.jetsScore === game.jetsScore && fixture.oppScore === game.oppScore
      ? game : { ...game, qb: null };
  }) };
}
