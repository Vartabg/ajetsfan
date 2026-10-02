import type { KeyPlay } from "./games";

export type PlayPoint = {
  playId?: number;
  q: number;
  t: number | null;
  desc: string | null;
};

/** The chart marker must identify the same play as the published analysis. */
export function keyPlayIndex(points: PlayPoint[], keyPlay: KeyPlay): number {
  if (keyPlay.playId != null && points.some((point) => point.playId != null)) {
    return points.findIndex((point) => point.playId === keyPlay.playId);
  }
  if (!keyPlay.desc) return -1;
  return points.findIndex(
    (point) =>
      point.desc === keyPlay.desc &&
      point.q === keyPlay.qtr &&
      point.t === keyPlay.secondsLeft,
  );
}
