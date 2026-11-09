/** Formatting shared by the focus pages. Fixed locale and time zone, so server and browser agree. */
export const ET = "America/New_York";
export const on = (time: string | number, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: ET, ...options }).format(new Date(time));
/** The New York calendar day of a moment, as YYYY-MM-DD. */
export const etDay = (time: number | string) => new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
export const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);
export const dayOf = (iso: string) => on(iso.length === 10 ? `${iso}T16:00:00Z` : iso, { month: "short", day: "numeric" });
export const record = (wins: number, losses: number, ties = 0) => `${wins}–${losses}${ties ? `–${ties}` : ""}`;
export const halfGames = (games: number) => `${Math.floor(games) || (games % 1 ? "" : "0")}${games % 1 ? "½" : ""} game${games > 1 ? "s" : ""}`;
export const ORDINAL = ["First", "Second", "Third", "Fourth"];
/** 1 → "1st", 22 → "22nd": a rank a stranger reads at a glance. */
export function ordinal(rank: number): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
  return `${rank}${suffix}`;
}
