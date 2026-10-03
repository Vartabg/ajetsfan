export type TradePlayer = { id: string | null; name: string; position?: string | null; college?: string | null };

/** What a traded pick turned into, as far as the trade and draft records say. */
export type PickOutcome =
  | { type: "selected"; team: string; round: number; pick: number; player: TradePlayer | null; agreed: boolean }
  /** `packagedWith` counts the other assets the holder sent in that later deal; `repeated` marks a deal already printed above. */
  | { type: "traded"; tradeId: string; date: string; to: string; packagedWith: number; repeated: boolean; received: TradeAsset[] }
  | { type: "named"; player: string }
  | { type: "unnumbered" }
  | { type: "pending" };

export type TradeAsset =
  | { kind: "pick"; season: number; round: number | null; number: number | null; conditional: boolean; became: PickOutcome }
  | { kind: "player"; id: string | null; name: string };

export type Trade = { id: string; season: number; date: string; partners: string[]; gave: TradeAsset[]; received: TradeAsset[] };

export type TradeLedger = {
  schemaVersion: 1;
  team: string;
  checkedAt: string;
  sources: { trades: string; draft: string };
  firstSeason: number;
  lastSeason: number;
  counts: { trades: number; picksGiven: number; picksReceived: number };
  trades: Trade[];
};

const ordinal = (round: number) => `${round}${round === 1 ? "st" : round === 2 ? "nd" : round === 3 ? "rd" : "th"}`;

export function pickLabel(asset: Extract<TradeAsset, { kind: "pick" }>): string {
  const round = asset.round === null ? "pick, round unrecorded" : `${ordinal(asset.round)}-round pick`;
  return `${asset.season} ${round}${asset.number !== null ? ` · No. ${asset.number}` : ""}${asset.conditional ? " · conditional" : ""}`;
}

export function playerLine(player: TradePlayer | null): string {
  if (!player) return "selection unrecorded";
  return [player.name, player.position, player.college].filter(Boolean).join(" · ");
}

/** Count every pick an asset list holds, including picks that came back through later trades. */
export function countPicks(assets: TradeAsset[]): number {
  return assets.reduce((total, asset) => total + (asset.kind === "pick" ? 1 + (asset.became.type === "traded" ? countPicks(asset.became.received) : 0) : 0), 0);
}

export function tradesBySeason(trades: Trade[]): { season: number; trades: Trade[] }[] {
  const seasons = new Map<number, Trade[]>();
  for (const trade of trades) seasons.set(trade.season, [...(seasons.get(trade.season) ?? []), trade]);
  return [...seasons].sort((a, b) => b[0] - a[0]).map(([season, list]) => ({ season, trades: list }));
}
