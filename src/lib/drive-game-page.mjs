import { validateRuntimeDrives } from './postgame-evidence.mjs';

/** A recorded final can publish its drives before model analysis is available. */
export function confirmedDriveGame(id, current, drives) {
  if (typeof id !== 'string' || !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(id)
    || !current || !Array.isArray(current.schedule) || !Number.isFinite(Date.parse(current.checkedAt))) return null;
  const fixtures = current.schedule.filter((game) => game.id === id);
  const game = fixtures.length === 1 ? fixtures[0] : null;
  if (!game || game.season !== current.season || game.status !== 'final'
    || ![game.jetsScore, game.oppScore].every((score) => Number.isInteger(score) && score >= 0 && score <= 150)
    || game.outcome !== (game.jetsScore > game.oppScore ? 'win' : game.jetsScore < game.oppScore ? 'loss' : 'tie')
    || game.date > current.checkedAt.slice(0, 10)) return null;
  try {
    const file = validateRuntimeDrives(drives, current);
    return file.games[id]?.some((row) => row[0] === 1) ? { game, file } : null;
  } catch { return null; }
}
