import type { CurvePoint } from "@/lib/load-games";

/**
 * A win-probability chart drawn the way a press would print one: black line,
 * hatched fill, one spot-ink marker at the extreme. No gradients, no glow.
 *
 * The compact size suits a column. The wide size spans a page: its rules and
 * marker hold screen weight (non-scaling), while CSS thickens the line and
 * scales the agate type back up on narrow screens, so one print serves every
 * viewport. The animated line keeps a scaling stroke on purpose: Chrome drops
 * pathLength normalisation when a dashed stroke is non-scaling. The line draws
 * itself in once and stays put under reduced motion.
 */
const SIZES = {
  compact: { W: 300, H: 132, L: 35, T: 8, B: 18, font: 9, stroke: 1.9, mark: 4, pad: 4, hatch: 4, digits: 1 },
  wide: { W: 640, H: 210, L: 66, T: 12, B: 24, font: 10, stroke: 2.5, mark: 5, pad: 6, hatch: 6, digits: 0 },
} as const;

export default function PressChart({
  points,
  board,
  size = "compact",
}: {
  points: CurvePoint[];
  board: "heartbreak" | "miracle";
  size?: keyof typeof SIZES;
}) {
  if (points.length < 2) return null;

  const { W, H, L, T, B, font, stroke, mark, pad, hatch: hatchStep, digits } = SIZES[size];
  const wide = size === "wide";
  const screenStroke = wide ? { vectorEffect: "non-scaling-stroke" as const } : {};

  // A game has only a few hundred snaps. Keep them all so the line and marker
  // cannot skip the second-half extreme used in the headline.
  const pts = points;

  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - pad);
  const y = (wp: number) => T + (1 - wp) * (H - T - B);

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(digits)} ${y(p.wp).toFixed(digits)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(digits)} ${y(0)} L${x(0).toFixed(digits)} ${y(0)} Z`;

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

  const hatch = `pc-hatch-${size}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={wide ? "press-wide" : undefined} style={{ width: "100%", height: "auto", display: "block" }} role="img"
         aria-label="Jets win probability across the game, from zero to 100 percent before each recorded play">
      <defs>
        <pattern id={hatch} width={hatchStep} height={hatchStep} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2={hatchStep} stroke="var(--ink)" strokeWidth="1.1" opacity="0.26" {...screenStroke} />
        </pattern>
      </defs>

      <line x1={L} x2={W - pad} y1={y(1)} y2={y(1)} stroke="var(--rule-soft)" strokeWidth="0.5" {...screenStroke} />
      <line x1={L} x2={W - pad} y1={y(0.5)} y2={y(0.5)} stroke="var(--rule-soft)" strokeWidth="0.5" strokeDasharray="2 3" />
      <line x1={L} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth="1" {...screenStroke} />

      <text x={L - 6} y={y(1) + 3} textAnchor="end" className="agate press-text-end" fontSize={font} fill="var(--ink-2)">100%</text>
      <text x={L - 6} y={y(0.5) + 3} textAnchor="end" className="agate press-text-end" fontSize={font} fill="var(--ink-2)">50%</text>
      <text x={L - 6} y={y(0) + 3} textAnchor="end" className="agate press-text-end" fontSize={font} fill="var(--ink-2)">0%</text>

      {marks.map((m) => (
        <text key={`${m.label}-${m.at}`} x={Math.min(W - pad, m.at + 2)} y={H - 4} textAnchor={m.at > W - 28 ? "end" : "start"} className={`agate ${m.at > W - 28 ? "press-text-end" : "press-text-start"}`} fontSize={font} fill="var(--ink-2)">
          {m.label}
        </text>
      ))}

      <path d={area} fill={`url(#${hatch})`} className="press-area" />
      <path d={line} fill="none" stroke="var(--ink)" strokeWidth={stroke} strokeLinejoin="round" pathLength={1} className="press-line" />

      {ext >= 0 ? (
        <circle cx={x(ext)} cy={y(pts[ext].wp)} r={mark} fill="var(--paper)" stroke="var(--spot)" strokeWidth="2.4" className="press-mark" {...screenStroke} />
      ) : null}
    </svg>
  );
}
