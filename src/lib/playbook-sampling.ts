import { FIELD } from "./playbook-field";
import type { PlayDesign, PlaybookPlayer, Point } from "./playbook";

// Playback needs only geometry; formation catalogs and editor validation stay
// in playbook.ts instead of traveling with a small animated focus moment.
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const playbackTime = (seconds: number) => Number.isNaN(seconds) ? 0 : clamp(seconds, 0, FIELD.duration);
const lerp = (from: Point, to: Point, proportion: number): Point => ({ x: from.x + (to.x - from.x) * proportion, y: from.y + (to.y - from.y) * proportion });
/** Constant progress by total path distance within its window, not player speed. */
export function samplePlayer(player: PlaybookPlayer, seconds: number): Point {
  const start = { x: player.x, y: player.y };
  const points = [start, ...player.path];
  const lengths = player.path.map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return start;
  const time = playbackTime(seconds);
  const final = points[points.length - 1];
  const window = player.motionWindow ?? { from: 0, to: FIELD.duration };
  if (time <= window.from) return start;
  if (time >= window.to) return { x: final.x, y: final.y };
  let remaining = total * (time - window.from) / (window.to - window.from);
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (!length) continue;
    if (remaining <= length) return lerp(points[index], points[index + 1], remaining / length);
    remaining -= length;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

/**
 * A 0.6-second illustrative throw or handoff joins the carrier's release point
 * to the target's future position. Explicit events can instead draw a throw,
 * loose ball, recovery or return, without simulating contact or predicting it.
 */
export function sampleBall(design: PlayDesign, seconds: number): Point {
  const time = playbackTime(seconds);
  if (design.ballEvents?.length) {
    let position: Point = { x: 0, y: 0 };
    for (let index = 0; index < design.ballEvents.length; index += 1) {
      const event = design.ballEvents[index];
      const next = design.ballEvents[index + 1];
      const endTime = next ? Math.min(time, next.at) : time;
      if (event.kind === "carry") {
        position = samplePlayer(design.players.find((player) => player.id === event.carrierId)!, endTime);
      } else if (event.kind === "flight") {
        const target = design.players.find((player) => player.id === event.targetId)!;
        position = endTime >= event.until ? samplePlayer(target, endTime)
          : lerp(position, samplePlayer(target, event.until), (endTime - event.at) / (event.until - event.at));
      } else {
        position = endTime >= event.until ? { ...event.to }
          : lerp(position, event.to, (endTime - event.at) / (event.until - event.at));
      }
      if (!next || time < next.at) return position;
    }
    return position;
  }
  const carrier = design.players.find((player) => player.id === design.ball.carrierId)!;
  const target = design.players.find((player) => player.id === design.ball.targetId)!;
  if (time <= design.ball.releaseAt) return samplePlayer(carrier, time);
  const arrival = design.ball.releaseAt + .6;
  if (time >= arrival) return samplePlayer(target, time);
  return lerp(samplePlayer(carrier, design.ball.releaseAt), samplePlayer(target, arrival), (time - design.ball.releaseAt) / .6);
}
