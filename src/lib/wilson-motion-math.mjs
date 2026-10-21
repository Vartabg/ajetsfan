/** Authored animation curves, not measured athlete biomechanics. */
const unit = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** Minimum-jerk interpolation: position, velocity and acceleration meet at rest. */
export function minimumJerk(value) {
  const u = unit(value);
  return u * u * u * (10 + u * (-15 + u * 6));
}

/** Unit-height C2 bump. Both contact edges have zero first/second derivative. */
export function contactBump(value) {
  const u = unit(value), v = u * (1 - u);
  return 64 * v * v * v;
}

/**
 * One leg's absolute phase, split into loaded stance and recovered swing.
 * blend is local to the anchor pair; its 1→0 wrap selects the next pair.
 * lift/pitch/load remain C2 through lift-off, landing and phase wrapping.
 */
export function sampleContactCycle(unwrappedPhase, duty) {
  const phase = unwrappedPhase - Math.floor(unwrappedPhase);
  const stance = Math.max(0.08, Math.min(0.82, duty));
  const planted = phase < stance;
  const progress = planted ? 0 : unit((phase - stance) / (1 - stance));
  const lift = planted ? 0 : contactBump(progress);
  return {
    phase, stance, planted, progress,
    blend: planted ? 0 : minimumJerk(progress),
    lift,
    pitch: planted ? 0 : -0.3 * lift * Math.cos(Math.PI * progress),
    load: planted ? contactBump(phase / stance) : 0,
  };
}

/** Short strike, pressure and recovery, with rest between hand exchanges. */
export function contactStrike(unwrappedPhase) {
  const phase = unwrappedPhase - Math.floor(unwrappedPhase);
  if (phase < 0.2) return minimumJerk(phase / 0.2);
  if (phase < 0.34) return 1;
  if (phase < 0.76) return 1 - minimumJerk((phase - 0.34) / 0.42);
  return 0;
}
