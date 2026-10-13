import { createHash } from 'node:crypto';
import { validateAnalysisCurve } from './analysis-envelope.mjs';

/** A corrected or unconfirmed current game cannot inherit an older analysis copy. */
export function gameAgreesWithFootball(game, current) {
  if (game.season !== current.season) return true;
  const fixture = current.schedule.find((entry) => entry.id === game.id);
  return fixture?.status === 'final' && fixture.jetsScore === game.jetsScore && fixture.oppScore === game.oppScore
    && fixture.date === game.date && fixture.opponent === game.opponent && fixture.atHome === game.atHome;
}

export function checkedRuntimeCurve(points, pathname, game) {
  validateAnalysisCurve(points, game);
  const digest = createHash('sha256').update(JSON.stringify(points)).digest('hex');
  if (pathname !== `analysis/v1/curves/${digest}.json`) throw new Error('Invalid immutable curve content');
  return points;
}
