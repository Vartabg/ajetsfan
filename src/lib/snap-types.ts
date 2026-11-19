/** Score pairs use Jets, opponent order, irrespective of who is at home. */
export type SnapScore = [number, number];
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
  /** ESPN supplies an after-play model instead. */
  postWp?: number | null;
  type: string | null;
  description: string;
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
