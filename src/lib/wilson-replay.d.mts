export type EvidenceBasis = "recorded" | "reported" | "observed" | "inferred" | "unreviewed";
export type ReplayRoleFamily = "quarterback" | "receiver" | "back" | "blocker" | "rusher" | "coverage";
export type ReplayActor = {
  readonly id: string;
  readonly name: string;
  readonly team: "NYJ" | "CLE";
  readonly number: string | null;
  readonly gsisId: string | null;
  readonly role: string;
  readonly identityBasis: "recorded" | "inferred";
  readonly motionBasis: "inferred";
  readonly facingYaw?: number;
  readonly roleFamily: ReplayRoleFamily;
  readonly engagementTarget: string | null;
  readonly cadence: number;
  readonly strideSeed: number;
  readonly note: string;
  readonly path: readonly { readonly t: number; readonly x: number; readonly z: number }[];
};
export type ReplayEvent = {
  readonly id: string;
  readonly at: number;
  readonly time: number;
  readonly label: string;
  readonly detail: string;
  readonly basis: EvidenceBasis;
  readonly evidenceIds: readonly string[];
  readonly sourceFrameId?: string;
};
export type ReplayEvidence = {
  readonly id: string;
  readonly label: string;
  readonly basis: EvidenceBasis;
  readonly title: string;
  readonly url: string | null;
  readonly summary: string;
  readonly locator: string;
  readonly note?: string;
  readonly publishedAt?: string;
  readonly reviewedAt?: string;
  readonly videoReviewed?: boolean;
  readonly limitedStillReview?: boolean;
  readonly reviewMode?: "limited-paused-stills";
};
export type ReplaySourceFrame = {
  readonly id: string;
  readonly seconds: number;
  readonly label: string;
  readonly observation: string;
  readonly url: string;
};
export type ReplayRecord = {
  readonly canonicalPlayId: string;
  readonly game_id: string;
  readonly play_id: number;
  readonly season: number;
  readonly season_type: string;
  readonly week: number;
  readonly game_date: string;
  readonly home_team: string;
  readonly away_team: string;
  readonly posteam: string;
  readonly defteam: string;
  readonly qtr: number;
  readonly time: string;
  readonly quarter_seconds_remaining: number;
  readonly down: number;
  readonly ydstogo: number;
  readonly yardline_100: number;
  readonly yards_gained: number;
  readonly play_type: string;
  readonly touchdown: number;
  readonly pass_touchdown: number;
  readonly desc: string;
  readonly passer_player_id: string;
  readonly passer_player_name: string;
  readonly receiver_player_id: string;
  readonly receiver_player_name: string;
  readonly total_home_score: number;
  readonly total_away_score: number;
  readonly home_score: number;
  readonly away_score: number;
  readonly scoreNote: string;
  readonly corpusEdition: string;
  readonly source: { readonly url: string; readonly name: string; readonly fetchedAt: string; readonly sha256: string; readonly bytes: number; readonly originalColumnCount: number };
};
export const REPLAY: {
  readonly id: string;
  readonly title: string;
  readonly duration: number;
  readonly timeBasis: string;
  readonly sourceFrameContext: string;
  readonly sourceFrames: readonly ReplaySourceFrame[];
  readonly coordinates: { readonly units: string; readonly x: string; readonly y: string; readonly z: string; readonly forward: string };
  readonly tracking: { readonly available: false; readonly label: string; readonly detail: string };
  readonly record: ReplayRecord;
  readonly evidence: readonly ReplayEvidence[];
  readonly events: readonly ReplayEvent[];
  readonly actors: readonly ReplayActor[];
};
export function clampReplayTime(time: unknown): number;
export function sampleActor(actor: ReplayActor | string, time: unknown): { x: number; z: number; vx: number; vz: number; ax: number; az: number; jx: number; jz: number; yaw: number; speed: number };
/** Inverse of samplePose.stridePhase, in teaching seconds; outside phases clamp to the snap bounds. */
export function strideTime(actor: ReplayActor | string, phase: unknown): number;
export type ReplayPose = {
  readonly basis: "inferred";
  readonly phase: "snap" | "develop" | "flight" | "finish" | "pursuit" | "settle";
  readonly action: "drop" | "set" | "throw" | "follow-through" | "watch" | "release" | "settle" | "stem" | "break" | "route" | "catch" | "carry" | "finish" | "pass-set" | "engage" | "brace" | "disengage" | "pursuit" | "first-step" | "counter" | "backpedal" | "turn" | "read" | "cover" | "check" | "dive" | "recover";
  readonly actionLabel: string;
  readonly actionDetail: string;
  readonly roleFamily: ReplayRoleFamily;
  readonly footMode: "run" | "shuffle" | "backpedal" | "plant" | "dive";
  readonly gait: number;
  /** Continuous movement-only weight, zero at rest even when the upper body stays active. */
  readonly locomotion: number;
  /** Instantaneous full left/right cycles per second; zero during a true hold. */
  readonly cadence: number;
  /** Integrated speed-coupled cycle count, including strideSeed; invert with strideTime. */
  readonly stridePhase: number;
  readonly lean: number;
  readonly facingYaw: number;
  /** Absolute world heading in radians; directed body mechanics, without cyclic gait twist. */
  readonly pelvisYaw: number;
  readonly torsoYaw: number;
  /** Signed lateral body lean in radians, bounded to ±0.16. */
  readonly bodyRoll: number;
  /** Continuous authored knee/hip lowering, acceleration, braking and cutting weights (0..1). */
  readonly compression: number;
  readonly drive: number;
  readonly brake: number;
  readonly cut: number;
  /** Signed defensive hip opening (-1..1); positive turns toward increasing world yaw. */
  readonly hipOpen: number;
  /** Continuous but asymmetric engagement pulse and hand counter weights (0..1). */
  readonly contactPulse: number;
  readonly handFight: number;
  readonly engagementTarget: string | null;
  readonly engagement: number;
  readonly reach: number;
  readonly dive: number;
  readonly catch: number;
  readonly throw: number;
  readonly carry: number;
};
export function samplePose(actor: ReplayActor | string, time: unknown): ReplayPose;
export function sampleBall(time: unknown): { x: number; y: number; z: number };
export function eventAt(time: unknown): ReplayEvent;
