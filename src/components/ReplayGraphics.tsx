import { fieldPosition, fieldSpot } from "@/lib/snap-context";
import type { ReplayView } from "@/lib/game-replay";
import type { Snap } from "@/lib/snap-types";
import styles from "./GameReplay.module.css";

type Game = ReplayView["game"];
type Marker = { id: "snap" | "gain" | "catch" | "finish" | "kick" | "landing" | "return"; label: string; yard: number; spot: string };
type Field = { markers: Marker[]; endZone?: "left" | "right"; legs: [number, number][] };
const yardTicks = Array.from({ length: 11 }, (_, i) => i * 10);
const hashes = Array.from({ length: 99 }, (_, i) => i + 1).filter(yard => yard % 5 !== 0);
// End zones each occupy ten yards. Every snap uses the same Jets-left coordinate system.
const axis = (yard: number) => 4 * (yard + 10);
const sourceTeam = (code: string) => code === "CLV" ? "CLE" : code;

function kickField(game: Game, play: Snap, opponent: string): Field | null {
  if (play.type !== "kickoff" || /penalt|no play|fumble|lateral|muff|review|onside/i.test(play.description)) return null;
  const kick = play.description.match(/\bkicks? \d+ yards? from ([A-Z]{2,3}) (\d{1,2}) to (?:([A-Z]{2,3}) (-?\d{1,2})|(end zone))\b/i);
  if (!kick) return null;
  const marker = (id: Marker["id"], label: string, code: string, raw: string): Marker | null => {
    const recorded = sourceTeam(code.toUpperCase()), n = Number(raw);
    if ((recorded !== "NYJ" && recorded !== game.opponent && recorded !== opponent) || n < -10 || n > 50) return null;
    const team = recorded === "NYJ" ? "NYJ" : opponent;
    return { id, label, yard: team === "NYJ" ? n : 100 - n,
      spot: n < 0 ? Math.abs(n) + " yd into " + team + " end zone" : n === 50 ? "50" : team + " " + n };
  };
  const start = marker("kick", "Kick", kick[1], kick[2]);
  if (!start) return null;
  const markers = [start];
  const legs: Field["legs"] = [];
  if (kick[5]) return { markers, legs, endZone: sourceTeam(kick[1]) === "NYJ" ? "right" : "left" };
  const land = marker("landing", "Landed", kick[3], kick[4]);
  if (!land) return null;
  markers.push(land);
  legs.push([start.yard, land.yard]);
  const rest = play.description.slice((kick.index ?? 0) + kick[0].length);
  const returned = rest.match(/^\.\s+[^.]*?(?:\.\s*)?[\p{L}’'-]+ to ([A-Z]{2,3}) (\d{1,2}) for (-?\d+) yards?\b/u);
  const end = returned && marker("return", "Returned to", returned[1], returned[2]);
  if (end && land.yard + (sourceTeam(kick[1]) === "NYJ" ? -1 : 1) * Number(returned[3]) === end.yard) {
    markers.push(end);
    legs.push([land.yard, end.yard]);
  }
  return { markers, legs };
}

function measuredField(game: Game, play: Snap, opponent: string): Field | null {
  const f = fieldPosition(game, play);
  if (!f) return kickField(game, play, opponent);
  const marker = (id: Marker["id"], label: string, toGoal: number): Marker => ({
    id, label, yard: play.possession === "jets" ? 100 - toGoal : toGoal, spot: fieldSpot({ ...game, opponent }, play, toGoal, true),
  });
  const snap = marker("snap", "Snap", f.start);
  const markers = [snap, marker("gain", f.goal ? "Goal line" : "To gain", f.line)];
  const legs: Field["legs"] = [];
  if (f.finish !== null) {
    const end = marker("finish", "Finish", f.finish);
    const facts = play.facts;
    const caughtAt = facts?.airYards != null ? f.start - facts.airYards : null;
    if (facts?.kind === "completion" && caughtAt !== null && caughtAt >= 0 && caughtAt <= 100 &&
        facts.airYards != null && facts.afterCatch != null && facts.airYards + facts.afterCatch === facts.yards) {
      const caught = marker("catch", "Catch", caughtAt);
      markers.push(caught);
      legs.push([snap.yard, caught.yard], [caught.yard, end.yard]);
    } else {
      legs.push([snap.yard, end.yard]);
    }
    markers.push(end);
  }
  return { markers, legs };
}

export function ReplayField({ view }: { view: ReplayView }) {
  const { game, play } = view;
  // The verified fixture ID retains the team code used in that season, such as OAK or SD.
  const opponent = game.id.split("_")[game.home ? 2 : 3] ?? game.opponent;
  const field = measuredField(game, play, opponent);
  if (!field) return null;
  const kick = play.type === "kickoff";
  const direction = kick ? undefined : play.possession === "jets" ? "Jets attacking right →" : "← " + opponent + " attacking left";
  return <figure className={styles.field} aria-label="Field position">
    <figcaption><strong>{kick ? "The kickoff" : "Field position"}</strong>{direction && <span>{direction}</span>}</figcaption>
    <svg className={styles.pitch} viewBox="0 0 480 90" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" width="480" height="90" rx="7" fill="#184431" />
      <path d="M40 0V90M440 0V90" stroke="#e0ece3" strokeWidth="1.3" />
      {field.endZone && <rect x={field.endZone === "left" ? 0 : 440} width="40" height="90" rx="3" fill="#b9e38c" fillOpacity=".55" />}
      {yardTicks.slice(1,-1).map(n => <g key={n}><path d={`M${axis(n)} 0v90`} stroke="#a6c9b3" strokeWidth=".8"/>
        <text x={axis(n)} y="15" textAnchor="middle" className={styles.yardNumber} data-major={n === 20 || n === 50 || n === 80}>{Math.min(n, 100 - n)}</text></g>)}
      <path d={hashes.map(n => `M${axis(n)} 28v3m0 30v3`).join(" ")} stroke="#bacdbf" strokeWidth=".8" />
      <text transform="translate(24,46) rotate(-90)" className={styles.endZone} textAnchor="middle">NYJ</text>
      <text transform="translate(463,46) rotate(90)" className={styles.endZone} textAnchor="middle">{opponent}</text>
      {field.markers.filter(m => m.id === "gain").map(m => <path key={m.id} data-marker={m.id} data-yard={m.yard}
        d={`M${axis(m.yard)} 20v61`} stroke="#ffce66" strokeWidth="2.6" strokeDasharray="5 3" />)}
      {field.legs.map(([from, to], i) => {
        const y = kick && i === 1 ? 56 : 45;
        return <path key={i} d={`M${axis(from)} 45V${y}H${axis(to)}`} fill="none"
          stroke={i === 1 ? "#b9e38c" : "#fafcf8"} strokeWidth="4" strokeLinecap="round" />;
      })}
      {field.markers.filter(m => m.id !== "gain").map(m => <g key={m.id} data-marker={m.id} data-yard={m.yard}
        transform={`translate(${axis(m.yard)},${m.id === "return" ? 56 : 45})`}>
        {m.id === "catch" || m.id === "landing"
          ? <path d="M0 -5l5 5-5 5-5-5Z" stroke="#152a1d" strokeWidth="1.4" fill="#b9e38c" />
          : <circle r={m.id === "snap" || m.id === "kick" ? 5.5 : 4} stroke="#f6faf6" strokeWidth="2" fill={m.id === "finish" || m.id === "return" ? "#b9e38c" : "#184431"}/>}
      </g>)}
    </svg>
    <div className={styles.spots}>{field.markers.map(m => <span key={m.id}><i aria-hidden="true" data-symbol={m.id} />{m.label} <b>{m.spot}</b></span>)}
      {field.endZone && <span>Landed <b>{field.endZone === "left" ? "NYJ" : opponent} end zone</b></span>}</div>
    {field.markers.some(m => m.id === "catch") && play.facts && <p className={styles.yardSplit}><b>{play.facts.airYards}</b> air yards · <b>{play.facts.afterCatch}</b> after the catch</p>}
  </figure>;
}

export function ReplayMargin({ view, opponent }: { view: ReplayView; opponent: string }) {
  const points = view.scoreTrail;
  if (!points.length) return <p className={styles.emptyChart}>Score history is unavailable at this play.</p>;
  const last = points[points.length - 1];
  const end = view.play.after ? view.index : view.index - 1;
  const start = points[0].index;
  const extent = Math.max(7, ...points.map(p => Math.abs(p.score[0] - p.score[1])));
  const x = (i: number) => 8 + 464 * (i - start) / Math.max(1, end - start);
  const y = (s: [number, number]) => 42 - (s[0] - s[1]) * 33 / extent;
  const path = points.map((p, i) => i === 0 ? `M${x(p.index)} ${y(p.score)}` : `H${x(p.index)}V${y(p.score)}`).join(" ") + `H${x(end)}`;
  const margin = last.score[0] - last.score[1];
  return <figure className={styles.margin} aria-label="Scoring margin">
    <figcaption><strong>Scoring margin</strong><span>{margin === 0 ? "Tied" : (margin > 0 ? "Jets" : opponent) + " +" + Math.abs(margin)}</span></figcaption>
    <svg className={styles.marginPlot} viewBox="0 0 480 84" preserveAspectRatio="none" aria-hidden="true">
      <line x1="8" x2="472" y1="42" y2="42" stroke="currentColor" strokeOpacity=".42" strokeDasharray="3 4"/>
      <path d={path} fill="none" stroke="var(--green)" strokeWidth="2.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      <circle cx={x(end)} cy={y(last.score)} r="4" fill="var(--green)" />
    </svg>
    <p className={styles.plotCaption}><span>{start <= 0 ? "Opening play" : "Play " + (start + 1)}</span><span>Through {end < 0 ? "the opening snap" : "play " + (end + 1)}</span></p>
    <p className={styles.plotKey}>Above the dotted line, the Jets lead. Below it, {opponent === "Washington" ? "Washington leads" : "the " + opponent + " lead"}.</p>
  </figure>;
}
