import { memo } from "react";
import { ANALYSIS, studyAt } from "@/lib/wilson-analysis.mjs";
import styles from "./WilsonAnalysis.module.css";

function Sources({ ids }: { ids: readonly string[] }) {
  return <span className={styles.references}>{ANALYSIS.sources.filter(source => ids.includes(source.id)).map(source => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.attribution}</a> : <span key={source.id}>{source.attribution}</span>)}</span>;
}

export const PlayerStudy = memo(function PlayerStudy({ actorId, time }: { actorId: string; time: number }) {
  const study = studyAt(actorId, time);
  if (!study) return null;
  return <section className={styles.playerStudy} aria-label="Film study for the selected role" data-role-study={actorId} data-study-phase={study.phase}>
    <p className={styles.eyebrow}>Illustration / {study.phaseLabel} / technique &amp; read</p>
    <h3>{study.key}</h3>
    <p>{study.read}</p>
    <p><strong>Body mechanics · </strong>{study.technique}</p>
    <details><summary>Test the assignment hypothesis</summary><p><strong>Hypothesis · </strong>{study.hypothesis}</p><p><strong>Look for · </strong>{study.test}</p><p><strong>Alternative · </strong>{study.alternative}</p><p className={styles.note}>{study.limit}</p></details>
    <Sources ids={study.sourceIds} />
  </section>;
}, (previous, next) => previous.actorId === next.actorId && studyAt(previous.actorId, previous.time)?.phase === studyAt(next.actorId, next.time)?.phase);

const bookmarks = [
  { at: 0, label: "1 · Recognize the structure", phase: "pre" },
  { at: 1.3, label: "2 · Occupy underneath", phase: "develop" },
  { at: 2.05, label: "3 · Deliver behind", phase: "flight" },
  { at: 2.85, label: "4 · Finish the catch", phase: "finish" },
];

function WindowBoard({ time }: { time: number }) {
  const phase = studyAt("qb", time)!.phase;
  const step = bookmarks.findIndex(item => item.phase === phase);
  return <figure className={styles.board}>
    <svg viewBox="0 0 600 310" role="img" aria-label="Schematic of Boord’s film interpretation: Conklin’s stop occupies Owusu-Koramoah underneath, Wilson enters behind him and Flacco throws through the window. Positions are conceptual and are not mapped to the 3D figures.">
      <defs><marker id="study-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor" /></marker></defs>
      <path d="M20 55H580M20 145H580M20 235H580" stroke="currentColor" opacity=".12" />
      <text x="25" y="39" className={styles.boardCaption}>DEEPER COVERAGE</text>
      <text x="25" y="133" className={styles.boardCaption}>UNDERNEATH LEVEL</text>
      <rect x="185" y="64" width="145" height="65" rx="8" fill="#d3efb2" opacity={step >= 1 ? ".4" : ".15"} />
      <text x="213" y="91" className={styles.windowLabel}>Throwing</text><text x="213" y="111" className={styles.windowLabel}>window</text>
      <path d="M125 52H340" stroke="currentColor" strokeWidth="14" strokeLinecap="round" opacity=".12" />
      <path d="M65 232L65 167Q65 147 89 132L191 100" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={step < 1 ? "6 6" : undefined} markerEnd="url(#study-arrow)" />
      <circle cx={step < 1 ? 65 : 185} cy={step < 1 ? 232 : 102} r="10" className={styles.receiver} />
      <text x="28" y="263">Wilson</text><text x="28" y="282" className={styles.boardCaption}>OUTSIDE → INSIDE</text>
      <path d="M250 229V178" stroke="currentColor" strokeWidth="3" strokeDasharray={step < 1 ? "6 6" : undefined} />
      <path d="M240 174H260" stroke="currentColor" strokeWidth="4" />
      <circle cx="250" cy={step < 1 ? 229 : 184} r="9" className={styles.receiver} />
      <circle cx="270" cy="148" r="10" className={styles.defender} />
      <path d="M270 157L255 174" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" opacity=".65" />
      <path d="M147 267L198 111" fill="none" stroke="currentColor" strokeWidth={step >= 2 ? "3" : "1.5"} strokeDasharray="5 6" markerEnd="url(#study-arrow)" opacity={step >= 2 ? 1 : .3} />
      <circle cx="145" cy="275" r="9" className={styles.receiver} /><text x="164" y="287">Flacco</text>
      <path d="M283 146H356M260 185H356M204 101H356" stroke="currentColor" opacity=".3" />
      <text x="369" y="100">Wilson enters behind</text><text x="369" y="146">Owusu-Koramoah</text><text x="369" y="165" className={styles.boardCaption}>ATTENTION UNDERNEATH</text><text x="369" y="190">Conklin stops</text>
    </svg>
    <figcaption>Window interaction · Boord’s interpretation. Schematic positions, separate from the 3D players. <a href="https://player.vimeo.com/video/752328113?dnt=1&app_id=122963" target="_blank" rel="noreferrer">Compare the wider sideline film ↗</a></figcaption>
  </figure>;
}

function WilsonAnalysis({ time, onSeek }: { time: number; onSeek: (time: number) => void }) {
  const phase = studyAt("qb", time)!.phase;
  const metric = (key: string) => ANALYSIS.metrics.find(item => item.key === key)!;
  const number = (key: string) => Number(metric(key).value);
  return <section id="film-study" data-focus-moment="film-study" className={styles.study} aria-labelledby="film-study-heading">
    <header className={styles.heading}><p className={styles.eyebrow}>The decision / the window / the result</p><h2 id="film-study-heading">How the window opens</h2><p>Boord’s film interpretation connects Conklin’s underneath route, Wilson’s inward break and Flacco’s timing. Study the interaction, then test what each role would have to see and do.</p></header>
    <div className={styles.chartingStrip} aria-label="Exact-play charting summary">
      <div><span>Jets personnel</span><strong>11 personnel</strong><small>1 RB · 1 TE · 3 WR</small></div>
      <div><span>Cleveland coverage</span><strong>Cover 6 · zone</strong><small>NFL NGS charting via nflverse</small></div>
      <div><span>Pass rush</span><strong>4 rushers · 0 blitzers</strong><small>FTN charting via nflverse</small></div>
      <div><span>Snap → release</span><strong>2.036 seconds</strong><small>Charted time; separate from teaching clock</small></div>
    </div>
    <div className={styles.windowStudy}>
      <div><div className={styles.bookmarks} aria-label="Tactical teaching bookmarks">{bookmarks.map(item => <button type="button" key={item.phase} aria-pressed={phase === item.phase} onClick={() => onSeek(item.at)}>{item.label}</button>)}</div><WindowBoard time={time} /></div>
      <div className={styles.conclusions}>{ANALYSIS.conclusions.slice(0, 3).map(claim => <article key={claim.title}><span className={styles.basis}>{claim.basis}</span><h3>{claim.title}</h3><p>{claim.text}</p><Sources ids={claim.sourceIds} /><small>{claim.limit}</small></article>)}</div>
    </div>
    <p className={styles.coverageKey}><strong>Cover 6, briefly · </strong>Deep quarters on one side, a deep half on the other. The charted family does not identify Cleveland’s side, variation or every matching rule. The concept board isolates the window; the 3D relationships remain illustrative. <a href="https://www.nfl.com/news/the-coverage-that-turned-the-seahawks-into-super-bowl-winners-and-is-taking-the-nfl-by-storm" target="_blank" rel="noreferrer">NFL Next Gen Stats explanation</a></p>
    <details className={styles.details}><summary>Charting, route terminology &amp; competing interpretations</summary><div className={styles.conflicts}>{[...ANALYSIS.charting.conflicts, ANALYSIS.conclusions[3]].map(conflict => <article key={conflict.title}><h3>{conflict.title}</h3><p>{conflict.text}</p><Sources ids={conflict.sourceIds} /></article>)}</div><dl className={styles.fieldList}>{ANALYSIS.charting.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd><strong>{String(field.value)}</strong><p>{field.definition}</p><small>{field.limit}</small><Sources ids={field.sourceIds} /></dd></div>)}</dl></details>
    <div className={styles.analytics}>
      <header><p className={styles.eyebrow}>Exact play / nflfastR models &amp; PBP</p><h3>What this snap changed</h3><p>Down six, no Jets timeouts, third-and-10 with :25 left. The touchdown tied the game; the following extra point supplied the lead.</p></header>
      <div className={styles.metrics}>
        <article><span>Expected points added</span><strong>+{number("epa").toFixed(2)}</strong><p>{metric("epa").definition}</p><Sources ids={metric("epa").sourceIds} /></article>
        <article><span>Jets win probability</span><strong>{(number("wp_before") * 100).toFixed(1)}% → {(number("wp_after") * 100).toFixed(1)}%</strong><p>+{(number("wpa") * 100).toFixed(1)} percentage points on this snap. Model estimate, not a guarantee or an individual grade.</p><Sources ids={metric("wpa").sourceIds} /></article>
        <article><span>Catch depth / finish</span><strong>{number("air_yards")} air + {number("yac")} YAC</strong><p>Yards downfield from the line and after the catch. This was chiefly a throw into a window near the goal.</p><Sources ids={metric("air_yards").sourceIds} /></article>
        <article><span>Completion probability</span><strong>{(number("cp") * 100).toFixed(1)}%</strong><p>nflfastR CP. The completion produced +{number("cpoe").toFixed(1)} percentage points CPOE. This is a play-level model outcome, not NGS tracking or an isolation of either player’s skill.</p><Sources ids={metric("cp").sourceIds} /></article>
      </div>
    </div>
    <details className={styles.details}><summary>The 22 charted participants</summary><p>The exact participation row identifies these players. Jersey numbers and positions join to the 2022 Week 2 roster by GSIS ID. The 20 supporting players retain illustrative roles because their reconstructed positions and matchups have not been mapped.</p><div className={styles.participants}>{(["offense", "defense"] as const).map(unit => <div key={unit}><h3>{unit === "offense" ? "Jets offense" : "Cleveland defense"}</h3><table><thead><tr><th scope="col">Player</th><th scope="col">Roster position</th></tr></thead><tbody>{ANALYSIS.participants[unit].map(player => <tr key={player.gsisId}><td><span>#{player.number}</span> {player.name}</td><td>{player.depthPosition}</td></tr>)}</tbody></table></div>)}</div></details>
    <details className={styles.details} data-analysis-provenance><summary>Inspect the claims, fields &amp; source provenance</summary><p>Exact join: <code>{ANALYSIS.canonicalPlayId}</code>. The static evidence package preserves source objects and the recorded values; the application does not query the research corpus while serving this page.</p><ul className={styles.sourceList}>{ANALYSIS.sources.map(source => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <strong>{source.title}</strong>}<p>{source.attribution} · {source.locator}</p><small>{source.limit}</small></li>)}</ul><div data-read-code-evidence><h3>Historical FTN progression field</h3><p>{ANALYSIS.provenance.readCode.status}</p><p>{ANALYSIS.provenance.readCode.detail}</p><Sources ids={ANALYSIS.provenance.readCode.sourceIds} /></div><details><summary>Audited raw fields and source hashes</summary><pre>{JSON.stringify({ canonicalPlayId: ANALYSIS.canonicalPlayId, corpusEdition: ANALYSIS.corpusEdition, fields: ANALYSIS.charting.raw, sha256: ANALYSIS.provenance.sourceHashes }, null, 2)}</pre></details><p>Participation: NFL NextGenStats via nflverse. Charting: FTN Data via nflverse. These data derivatives are shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Published film judgments stay attributed to their authors. No proprietary PFF, SIS or ESPN individual grade is supplied.</p></details>
  </section>;
}

export default memo(WilsonAnalysis, (previous, next) => previous.onSeek === next.onSeek && studyAt("qb", previous.time)!.phase === studyAt("qb", next.time)!.phase);
