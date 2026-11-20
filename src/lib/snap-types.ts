/** Score pairs use Jets, opponent order, irrespective of who is at home. */
export type SnapScore = [number, number];

export type SnapKind = "completion" | "incompletion" | "interception" | "rush" | "sack" | "kneel" | "spike";
export type SnapTurnover = "interception" | "lostFumble" | "downs";
export type SnapDefender = {
  name: string;
  role: "soloTackle" | "tackleWithAssist" | "assistTackle" | "sack" | "halfSack" | "passDefended";
};
export type SnapKick = {
  kind: "kickoff" | "punt" | "fieldGoal" | "extraPoint";
  kicker?: string;
  returner?: string;
  kickYards?: number;
  returnYards?: number;
  touchback?: true;
  outcome?: "made" | "missed";
};
/** Original participation labels. The primary receiver need not be the credited pass target. */
export type SnapCharting = {
  formation?: string;
  offensePersonnel?: string;
  defensePersonnel?: string;
  box?: number;
  rushers?: number;
  primaryRoute?: string;
  coverage?: string;
  manZone?: string;
};
export type SnapFacts = {
  /** Timeouts remaining as recorded on this row, in Jets/opponent order. */
  timeouts?: [number, number];
  goalToGo?: boolean;
  kind?: SnapKind;
  /** Official possession changes on this row; an intercepted return can itself end in a lost fumble. */
  turnovers?: SnapTurnover[];
  yards?: number;
  firstDown?: boolean;
  /** Offensive touchdown, with the scoring side verified. */
  touchdown?: boolean;
  /** The start spot and recorded gain establish the offense's finish on an uncomplicated play. */
  simpleAdvance?: boolean;
  passer?: string;
  target?: string;
  rusher?: string;
  interceptor?: string;
  interceptionReturnYards?: number;
  direction?: "left" | "middle" | "right";
  passLength?: "short" | "deep";
  runGap?: "end" | "guard" | "tackle";
  shotgun?: true;
  defenders?: SnapDefender[];
  kick?: SnapKick;
  /** Added on a single-game read from the separately licensed participation pack. */
  charting?: SnapCharting;
  /** Expected points added from the source possession team's perspective (the receiving side on a kickoff). */
  epa?: number;
  dropbackProbability?: number;
  completionProbability?: number;
  airYards?: number;
  afterCatch?: number;
};

export type Snap = {
  key: string;
  quarter: number;
  clock: number | null;
  possession: "jets" | "opponent" | null;
  down: number | null;
  distance: number | null;
  /** Yards from the team in possession to its opponent's goal line. */
  yardline: number | null;
  before: SnapScore | null;
  after: SnapScore | null;
  drive: number | null;
  /** Pre-play model estimate and the source-reported change, both from the Jets' perspective. */
  wp: number | null;
  delta: number | null;
  /** Provider-reported Jets win probability after this play. ESPN supplies this timing only. */
  postWp?: number | null;
  type: string | null;
  description: string;
  facts?: SnapFacts;
};

export type SnapGame = {
  id: string;
  date: string;
  opponent: string;
  home: boolean;
  final: SnapScore | null;
  source: "nflverse" | "espn";
  plays: Snap[];
  eventId?: string;
};
