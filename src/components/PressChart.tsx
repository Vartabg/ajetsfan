import type { CurvePoint } from "@/lib/load-games";

/**
 * A win-probability chart drawn the way a press would print one: black line,
 * hatched fill, one spot-ink marker at the extreme. No gradients, no glow.
 */
export default function PressChart({
  points,
  board,
}: {
  points: CurvePoint[];
  board: "heartbreak" | "miracle";
}) {
  if (points.length < 2) return null;

  const W = 300;
  const H = 132;
  const L = 22;
  const T = 8;
  const B = 18;

  // Downsample: a printed chart does not need one node per snap.
  const step = Math.max(1, Math.floor(points.length / 90));
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - 4);
  const y = (wp: number) => T + (1 - wp) * (H - T - B);

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.wp).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;

  let ext = -1;
  pts.forEach((p, i) => {
    if (p.q < 3) return;
    if (ext === -1) { ext = i; return; }
    const better = board === "heartbreak" ? p.wp > pts[ext].wp : p.wp < pts[ext].wp;
    if (better) ext = i;
  });

  const marks: { at: number; label: string }[] = [];
  let last = -1;
  pts.forEach((p, i) => {
    if (p.q !== last) { marks.push({ at: x(i), label: p.q > 4 ? "OT" : `Q${p.q}` }); last = p.q; }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
         aria-label="Jets win probability across the game">
      <defs>
        <pattern id="pc-hatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink)" strokeWidth="1.1" opacity="0.26" />
        </pattern>
      </defs>

      <line x1={L} x2={W - 4} y1={y(1)} y2={y(1)} stroke="var(--rule-soft)" strokeWidth="0.5" />
      <line x1={L} x2={W - 4} y1={y(0.5)} y2={y(0.5)} stroke="var(--rule-soft)" strokeWidth="0.5" strokeDasharray="2 3" />
      <line x1={L} x2={W - 4} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth="1" />

      <text x={0} y={y(1) + 3} className="agate" fontSize="7.5" fill="var(--ink-2)">100</text>
      <text x={4} y={y(0.5) + 3} className="agate" fontSize="7.5" fill="var(--ink-2)">50</text>
      <text x={9} y={y(0) + 3} className="agate" fontSize="7.5" fill="var(--ink-2)">0</text>

      {marks.map((m) => (
        <text key={`${m.label}-${m.at}`} x={m.at + 2} y={H - 6} className="agate" fontSize="7.5" fill="var(--ink-2)">
          {m.label}
        </text>
      ))}

      <path d={area} fill="url(#pc-hatch)" />
      <path d={line} fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinejoin="round" />

      {ext >= 0 ? (
        <circle cx={x(ext)} cy={y(pts[ext].wp)} r="4" fill="var(--paper)" stroke="var(--spot)" strokeWidth="2.4" />
      ) : null}
    </svg>
  );
}
