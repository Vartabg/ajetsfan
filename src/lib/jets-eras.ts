// The green the Jets wore in a given season. The Jets publish no color codes, so
// these follow common Pantone references; the Kelly green is darkened from the
// usual #0C8A4A so text in it reaches 4.5:1 on the page paper.
export type JetsEra = { from: number; name: string; green: string };

export const JETS_ERAS: JetsEra[] = [
  { from: 1963, name: "Kelly green", green: "#007A3D" },
  { from: 1978, name: "Sack Exchange green", green: "#046A38" },
  { from: 1998, name: "Hunter green", green: "#003F2D" },
  { from: 2019, name: "Gotham green", green: "#125740" },
  { from: 2024, name: "Legacy green", green: "#125740" },
];

export function eraOf(year: number) {
  return JETS_ERAS.findLast((era) => year >= era.from) ?? JETS_ERAS[0];
}
