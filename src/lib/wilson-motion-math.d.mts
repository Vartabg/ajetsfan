export function minimumJerk(value: number): number;
export function contactBump(value: number): number;
export function sampleContactCycle(unwrappedPhase: number, duty: number): {
  phase: number; stance: number; planted: boolean; progress: number;
  blend: number; lift: number; pitch: number; load: number;
};
export function contactStrike(unwrappedPhase: number): number;
