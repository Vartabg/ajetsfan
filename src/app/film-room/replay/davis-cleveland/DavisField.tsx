import type { FullSnapBoard, FullSnapPlayer } from "@/lib/full-snap";
import styles from "./case.module.css";

// Cleveland attacks toward the top. The vertical scale is six drawing units per yard.
const yardY = (yardsFromJetsGoal: number) => 170 + (yardsFromJetsGoal - 54) * 6;
const fieldX = (position: number) => 64 + 2.8 * position;
const interception = { x: 112, y: yardY(36) };
const returnEnd = { x: 242, y: yardY(50) };

export default function DavisField({ board, revealed }: { board: FullSnapBoard; revealed: boolean }) {
  const quarterback = board.players.find(player => player.unit === "O" && player.group === "QB");
  // The report identifies the safety. His precise starting spot is unknown.
  const safety = board.players.filter(player => player.unit === "X" && player.group === "DB")
    .sort((a, b) => a.start[1] - b.start[1])[0];
  const playerY = (player: FullSnapPlayer) => yardY(54) + 1.9 * (player.start[1] - board.lineY);

  return <figure className={styles.field}>
    <div className={styles.legend}><span><i className={styles.offenseKey} />Cleveland</span>
      <span><b aria-hidden="true">×</b> Jets</span><span>Cleveland attacks ↑</span></div>
    <svg className={styles.board} viewBox="0 0 360 238" role="img" data-davis-phase={revealed ? "action" : "snap"}
      aria-label={revealed
        ? "Cleveland attacks upfield. Brissett throws left for Cooper. Davis intercepts at the Jets 36 and returns to midfield."
        : "Illustrated alignment of eleven players on each team. Brissett is in shotgun at Cleveland’s 46. Safety Ashtyn Davis, number 21, is marked deep."}>
      {revealed && <defs>
        <marker id="davis-return-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="currentColor" strokeWidth="2"/>
        </marker>
      </defs>}
      <g className={styles.grid} aria-hidden="true">
        {[30, 35, 40, 45, 50, 55, 60].map(yards => <g key={yards}>
          <line x1="67" x2="350" y1={yardY(yards)} y2={yardY(yards)} />
          {[146, 262].map(x => <line key={x} x1={x} x2={x} y1={yardY(yards) - 3} y2={yardY(yards) + 3} />)}
        </g>)}
      </g>
      <g className={styles.fieldLabels}>
        <text x="58" y={yardY(50) + 5}>50</text>
        <line x1="67" x2="350" y1={yardY(54)} y2={yardY(54)} className={styles.scrimmage} />
        <text x="58" y={yardY(54) + 5}>CLE 46</text>
        <line x1="67" x2="350" y1={yardY(44)} y2={yardY(44)} className={styles.sticks} />
        <text x="58" y={yardY(44) + 5}>NYJ 44</text>
        {revealed && <text x="58" y={interception.y + 5}>NYJ 36</text>}
      </g>
      {revealed && quarterback && <g className={styles.paths}>
        <line data-davis-path="throw" x1={fieldX(quarterback.start[0])} y1={playerY(quarterback)}
          x2={interception.x} y2={interception.y} strokeDasharray="6 4" />
        <line data-davis-path="return" x1={interception.x} y1={interception.y} x2={returnEnd.x} y2={returnEnd.y}
          markerEnd="url(#davis-return-arrow)" />
      </g>}
      {board.players.map(player => {
        const davis = player === safety;
        const x = revealed && davis ? interception.x : fieldX(player.start[0]);
        const y = revealed && davis ? interception.y : playerY(player);
        return <g key={player.id} data-davis-unit={player.unit} transform={"translate(" + x + " " + y + ")"}>
          {davis ? <>
            <circle r="12" className={styles.safety} />
            <text className={styles.jersey} textAnchor="middle" y="4.5">21</text>
            <text className={styles.name} x="17" y="5">Davis</text>
          </> : player.unit === "O" ? <circle r="4.9" className={styles.brown} /> :
            <path d="M-4 -4l8 8m0 -8l-8 8" className={styles.jet} />}
          {player === quarterback && <text x="12" y="12" className={styles.name}>Brissett</text>}
        </g>;
      })}
    </svg>
    <figcaption>{revealed
      ? "The dashed line is the throw for Cooper. The solid arrow follows Davis back to midfield. The yard lines are recorded. Player spacing and paths are schematic."
      : "The solid line marks the ball at Cleveland’s 46. The dashed line marks the first down at the Jets 44. Player positions are schematic."}</figcaption>
  </figure>;
}
