import type { KeyPlay } from "./games";

export type PlayPoint = {
  playId?: number;
  q: number;
  t: number | null;
  desc: string | null;
};

/** Match a unique source identity. Only curves without play IDs use the legacy tuple. */
export function keyPlayIndex(points: readonly PlayPoint[], keyPlay: KeyPlay): number {
  const hasPlayIds = points.some((point) => point.playId != null);
  if (hasPlayIds ? keyPlay.playId == null : !keyPlay.desc) return -1;
  const matches = (point: PlayPoint) => hasPlayIds
    ? point.playId === keyPlay.playId
    : point.desc === keyPlay.desc && point.q === keyPlay.qtr && point.t === keyPlay.secondsLeft;
  const index = points.findIndex(matches);
  return index === points.findLastIndex(matches) ? index : -1;
}
