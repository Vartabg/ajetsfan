import type { CoverageSnapshot, PlayerStats, RosterPlayer } from "./coverage";

export type RosterFilters = {
  query: string;
  unit: RosterPlayer["group"] | "all";
  position: string;
  status: string;
};

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
}

export function rosterFilters(params: URLSearchParams): RosterFilters {
  const unit = params.get("unit");
  return {
    query: params.get("q") || "",
    unit: unit === "offense" || unit === "defense" || unit === "special" || unit === "other" ? unit : "all",
    position: params.get("position") || "all",
    status: params.get("status") || "all",
  };
}

export function filterRoster(players: RosterPlayer[], filters: RosterFilters): RosterPlayer[] {
  const terms = normalized(filters.query).split(/\s+/).filter(Boolean);
  return players.filter((player) => {
    if (filters.unit !== "all" && player.group !== filters.unit) return false;
    if (filters.position !== "all" && player.position !== filters.position) return false;
    if (filters.status !== "all" && player.status !== filters.status) return false;
    const text = normalized(`${player.name} ${player.position}`);
    return terms.every((term) => /^\d+$/.test(term)
      ? player.jersey !== null && Number(player.jersey) === Number(term)
      : text.includes(term));
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function playerHref(id: string): string {
  return `/team?${new URLSearchParams({ player: id }).toString()}#roster`;
}

export function playerInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? words.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

export function statsForPlayer(stats: CoverageSnapshot["stats"], id: string, editionSeason: number): PlayerStats | undefined {
  if (stats.status === "unavailable" || stats.season !== editionSeason) return undefined;
  return stats.players.find((player) => player.id === id);
}

/** Coverage gaps describe the published source, never an inferred zero for a player. */
export function playerStatsMessage(stats: CoverageSnapshot["stats"], player: RosterPlayer, editionSeason: number): { scope: string; empty: string } {
  const scope = "Games recorded plus passing, rushing and receiving totals. Defensive and kicking production isn’t included in this edition.";
  if (stats.status === "unavailable") return { scope, empty: `${editionSeason} player statistics are unavailable in this edition. Missing totals are not treated as zero.` };
  if (stats.season !== editionSeason) return { scope, empty: `${editionSeason} player statistics aren’t available in this edition. The available source covers ${stats.season}.` };
  if (player.group === "defense" || player.group === "special") return { scope, empty: "Defensive and kicking production isn’t included in this edition. No games-recorded total is available for this player in the source snapshot." };
  return { scope, empty: `No passing, rushing or receiving totals are recorded for this player in the available ${editionSeason} regular-season snapshot.` };
}

/** Games recorded and offensive production only; no defensive totals are inferred. */
export function playerStatLines(player: PlayerStats | undefined): { label: string; value: string }[] {
  if (!player) return [];
  const lines: { label: string; value: string }[] = [];
  const n = (value: number) => value.toLocaleString("en-US");
  if (player.games > 0) lines.push({ label: "Games recorded", value: n(player.games) });
  if (player.passing.attempts > 0) lines.push({ label: "Passing", value: `${n(player.passing.completions)}/${n(player.passing.attempts)} · ${n(player.passing.yards)} yards · ${n(player.passing.touchdowns)} TD · ${n(player.passing.interceptions)} INT` });
  if (player.rushing.carries > 0) lines.push({ label: "Rushing", value: `${n(player.rushing.carries)} ${player.rushing.carries === 1 ? "carry" : "carries"} · ${n(player.rushing.yards)} yards · ${n(player.rushing.touchdowns)} TD` });
  if (player.receiving.targets > 0 || player.receiving.receptions > 0) lines.push({ label: "Receiving", value: `${n(player.receiving.receptions)} ${player.receiving.receptions === 1 ? "reception" : "receptions"} · ${n(player.receiving.targets)} ${player.receiving.targets === 1 ? "target" : "targets"} · ${n(player.receiving.yards)} yards · ${n(player.receiving.touchdowns)} TD` });
  return lines;
}
