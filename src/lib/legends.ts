import people from "./legends-data.json";

export type Legend = {
  slug: string; name: string; role: string; jetsYears: string; start: number; end: number;
  ringYear?: number; hallYear?: number; retiredNumber?: string;
  tagline: string; intro: string; why: string;
  moments: { title: string; text: string }[];
  sources: { label: string; url: string }[];
  photo: { src: string; alt: string; credit: string; sourceUrl: string } | null;
  related: string[]; archive: { label: string; href: string }[];
};
export const legends = people as Legend[];
export const legendsCheckedAt = "2026-10-20";
export const legendBySlug = (slug: string) => legends.find((person) => person.slug === slug);
export const legendHonors = (person: Legend) => [
  person.ringYear ? `Jets Ring of Honor · ${person.ringYear}` : null,
  person.hallYear ? `Pro Football Hall of Fame · ${person.hallYear}` : null,
  person.retiredNumber ? `Jets retired number · ${person.retiredNumber}` : null,
].filter((label): label is string => !!label);
export const LEGEND_ERAS = [
  { value: "1960s", label: "The AFL & championship years", from: 1960, to: 1969 },
  { value: "1970s-80s", label: "The 1970s & Sack Exchange era", from: 1970, to: 1989 },
  { value: "1990s-2000s", label: "The 1990s & early 2000s", from: 1990, to: 2005 },
  { value: "2006-now", label: "2006 onward", from: 2006, to: 2026 },
];
export function filterLegends({ q = "", honor = "all", era = "all" }: { q?: string; honor?: string; era?: string }) {
  const query = q.trim().slice(0, 80).toLocaleLowerCase("en-US");
  const period = LEGEND_ERAS.find((entry) => entry.value === era);
  return legends.filter((person) => (!query || `${person.name} ${person.role}`.toLocaleLowerCase("en-US").includes(query))
    && (honor === "ring" ? !!person.ringYear : honor === "hall" ? !!person.hallYear : honor === "retired" ? !!person.retiredNumber : true)
    && (!period || person.start <= period.to && person.end >= period.from))
    .sort((a, b) => a.name.localeCompare(b.name));
}
