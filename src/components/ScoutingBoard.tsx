"use client";

import { useId } from "react";
import { coverageCounts, coverageLessons, pressureLabels, pressureOptions, type CoverageId, type FilmSelection, type PressureId } from "@/lib/film-room";
import styles from "./ScoutingBoard.module.css";

type Role = "rusher" | "deep" | "underneath" | "man";
type Defender = { role: Role; x: number; y: number; number: number };
const STEPS = ["Before snap", "Assignments", "Throwing window"] as const;
const ELIGIBLE = [{ x: 82, y: 282 }, { x: 160, y: 300 }, { x: 560, y: 300 }, { x: 638, y: 282 }, { x: 310, y: 324 }];
const OFFENSE = [...ELIGIBLE, ...[304, 332, 360, 388, 416].map((x) => ({ x, y: 282 })), { x: 360, y: 324 }];
const ROLE_LABELS = { rusher: "R", deep: "D", underneath: "U", man: "M" };

export default function ScoutingBoard({ coverage, pressure, step, onSelection }: {
  coverage: CoverageId;
  pressure: PressureId;
  step: 0 | 1 | 2;
  onSelection: (next: Partial<Pick<FilmSelection, "coverage" | "pressure" | "step">>) => void;
}) {
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const lesson = coverageLessons.find((item) => item.id === coverage)!;
  const counts = coverageCounts(coverage, pressure);
  if (!counts) return <p>The selected teaching package is unavailable.</p>;
  const defenders: Defender[] = [
    ...Array.from({ length: counts.rushers }, (_, at): Defender => ({ role: "rusher", number: at + 1, x: pressure === "simulated" ? [300, 360, 420, 474][at] : 190 + (at + .5) / counts.rushers * 340, y: pressure === "simulated" && at === 3 ? 220 : 246 })),
    ...Array.from({ length: counts.deep }, (_, at): Defender => ({ role: "deep", number: at + 1, x: 50 + (at + .5) / counts.deep * 620, y: 92 })),
    ...Array.from({ length: counts.underneath }, (_, at): Defender => ({ role: "underneath", number: at + 1, x: pressure === "simulated" && at === 0 && step === 0 ? 230 : 50 + (at + .5) / counts.underneath * 620, y: pressure === "simulated" && at === 0 && step === 0 ? 246 : 198 })),
    ...Array.from({ length: counts.man }, (_, at): Defender => ({ role: "man", number: at + 1, x: ELIGIBLE[at].x, y: at === 4 ? 205 : 224 })),
  ];
  const description = `${lesson.label}, ${pressureLabels[pressure]}. Teaching example: ${counts.rushers} rushers, ${counts.deep} deep defenders, ${counts.underneath} underneath ${coverage === "cover-1" ? "help defenders" : "zone defenders"}, ${counts.man} man assignments. Total 11 defenders. Step ${step + 1}: ${STEPS[step]}. These are illustrative positions and responsibilities, not the selected play’s alignment.`;
  const stepDescription = step === 0
    ? "Start with the defensive shell and count the eleven defenders. A pre-snap alignment alone cannot establish the actual coverage call."
    : step === 1
      ? `Reveal this teaching package’s responsibilities: ${counts.rushers} rushers, ${counts.deep} deep defenders, ${counts.underneath} underneath ${coverage === "cover-1" ? "help defenders" : "zone defenders"} and ${counts.man} man assignments.`
      : "Illustrative routes now show spaces to inspect against the chosen responsibilities. They are not a reconstruction, a quarterback progression or a guaranteed open receiver.";

  return <section id="scouting-board" className={styles.lab} aria-labelledby="scouting-board-heading" data-coverage={coverage} data-pressure={pressure} data-step={step}>
    <header className={styles.heading}><div><span>The independent teaching board</span><h3 id="scouting-board-heading">Read the defense.</h3></div><p>Explore a coverage family and a compatible pressure package. Then test your eye against the source film.</p></header>
    <div className={styles.workspace}>
      <div className={styles.lessonControls}>
        <div className={styles.coverageChoices} role="group" aria-label="Coverage lesson">{coverageLessons.map((item) => <button type="button" key={item.id} aria-pressed={coverage === item.id} onClick={() => onSelection({ coverage: item.id })}>{item.label}</button>)}</div>
        <div className={styles.lessonIntro}><h4>{lesson.label}</h4><p>{lesson.summary}</p></div>
        <div className={styles.pressureChoices} role="group" aria-label="Pressure package">{pressureOptions(coverage).map((option) => <button type="button" key={option} aria-pressed={pressure === option} onClick={() => onSelection({ pressure: option })}>{pressureLabels[option]}</button>)}</div>
        <dl className={styles.counts} aria-label="Teaching package defender counts">{([
          ["rushers", "Rushers", counts.rushers], ["deep", "Deep", counts.deep], ["underneath", coverage === "cover-1" ? "Underneath help" : "Underneath zones", counts.underneath], ["man", "Man assignments", counts.man], ["total", "Total defenders", counts.total],
        ] as const).map(([name, label, value]) => <div key={name}><dt>{label}</dt><dd data-role-count={name}>{value}</dd></div>)}</dl>
        {pressure === "simulated" ? <p className={styles.simulatedNote}>Four defenders actually rush. A linebacker or defensive back replaces a traditional rusher who drops into coverage. Apparent threats are not additional rushers.</p> : null}
        <a className={styles.lessonSource} href={lesson.source.url} target="_blank" rel="noreferrer">{lesson.source.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
      </div>
      <div className={styles.diagramPanel}>
        <div className={styles.steps} role="group" aria-label="Teaching steps">{STEPS.map((label, at) => <button type="button" key={label} aria-pressed={step === at} onClick={() => onSelection({ step: at as 0 | 1 | 2 })}><span>{String(at + 1).padStart(2, "0")}</span>{label}</button>)}</div>
        <figure className={styles.diagram}>
          <svg viewBox="0 0 720 380" role="img" aria-label={description} className={styles.field}>
            <defs><marker id={`${instance}-rush`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z" className={styles.rushArrow} /></marker><marker id={`${instance}-route`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L8 4 L0 8 Z" className={styles.routeArrow} /></marker><marker id={`${instance}-drop`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L8 4 L0 8 Z" className={styles.dropArrow} /></marker></defs>
            <rect x="38" y="22" width="644" height="334" className={styles.fieldBoundary} />
            {[56, 106, 156, 206, 256, 306].map((y) => <g key={y}><line x1="38" x2="682" y1={y} y2={y} className={styles.yardLine} />{[250, 470].map((x) => <line key={x} x1={x - 5} x2={x + 5} y1={y + 25} y2={y + 25} className={styles.hashMark} />)}</g>)}
            <text x="51" y="43" className={styles.fieldLabel}>DEFENSE</text><text x="51" y="343" className={styles.fieldLabel}>OFFENSE</text>
            <line x1="38" x2="682" y1="266" y2="266" className={styles.scrimmage} /><text x="668" y="260" className={styles.fieldLabel} textAnchor="end">LINE OF SCRIMMAGE</text>
            {step > 0 ? <g data-coverage-overlay>
              {Array.from({ length: counts.deep }, (_, at) => <rect key={`deep-${at}`} x={50 + at / counts.deep * 620} y="55" width={620 / counts.deep} height="93" rx="10" className={styles.deepZone} />)}
              {coverage === "cover-1" && counts.underneath ? <ellipse cx="360" cy="198" rx="78" ry="34" className={styles.underZone} /> : Array.from({ length: counts.underneath }, (_, at) => <rect key={`under-${at}`} x={50 + at / counts.underneath * 620} y="163" width={620 / counts.underneath} height="69" rx="10" className={styles.underZone} />)}
              {defenders.filter((defender) => defender.role === "man").map((defender, at) => <line key={`man-${at}`} x1={defender.x} y1={defender.y} x2={ELIGIBLE[at].x} y2={ELIGIBLE[at].y} className={styles.manLine} />)}
              {defenders.filter((defender) => defender.role === "rusher").map((defender) => <path key={`rush-${defender.number}`} d={`M${defender.x} ${defender.y + 13} L${360 + (defender.x - 360) * .45} 307`} className={styles.rushLine} markerEnd={`url(#${instance}-rush)`} />)}
              {pressure === "simulated" ? <g><path d="M230 246 Q210 218 127.5 198" className={styles.dropLine} markerEnd={`url(#${instance}-drop)`} /><text x="194" y="223" className={styles.dropLabel}>DROP</text></g> : null}
            </g> : null}
            {step === 2 ? <g data-route-overlay>{[
              "M82 282 L82 209 L212 114", "M160 300 L160 224 L305 183", "M560 300 L560 136 L498 102", "M638 282 L638 233 L545 233", "M310 324 Q280 305 268 298 L198 298",
            ].map((route, at) => <path key={at} d={route} className={styles.routeLine} markerEnd={`url(#${instance}-route)`} />)}</g> : null}
            {OFFENSE.map((player, at) => <g key={`offense-${at}`} data-offense-player><circle cx={player.x} cy={player.y} r="8" className={styles.offensePlayer} />{at === OFFENSE.length - 1 ? <text x={player.x} y={player.y + 22} className={styles.fieldLabel} textAnchor="middle">QB</text> : null}</g>)}
            {defenders.map((defender) => <g key={`${defender.role}-${defender.number}`} data-defender-role={defender.role}><circle cx={defender.x} cy={defender.y} r="13" className={`${styles.defender} ${step > 0 ? styles[defender.role] : ""}`} /><text x={defender.x} y={defender.y + 4} className={styles.playerLabel} textAnchor="middle">{step > 0 ? `${ROLE_LABELS[defender.role]}${defender.number}` : "D"}</text></g>)}
          </svg>
          <figcaption>Teaching schematic — not this play’s alignment.</figcaption>
        </figure>
        <div className={styles.legend}><span><i className={styles.legendRush} />R · Rush</span><span><i className={styles.legendZone} />D / U · Deep / underneath</span><span><i className={styles.legendMan} />M · Man assignment</span><span><i className={styles.legendRoute} />Illustrative route</span></div>
        <div className={styles.stepReadout} aria-label="Teaching step explanation"><strong>{STEPS[step]}</strong><p>{stepDescription}</p></div>
      </div>
    </div>
    <div className={styles.textEquivalent}><div><h4>Read it without the diagram.</h4><p>{description}</p></div><div><h4>Take these questions to the film.</h4><ol>{lesson.watchFor.map((question) => <li key={question}>{question}</li>)}</ol></div></div>
  </section>;
}
