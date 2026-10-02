"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clockLabel, pct } from "@/lib/games";
import { wpaLabel } from "@/lib/analytics-context";
import { formatDate } from "@/lib/current";
import { parseFilmSelection, pressureOptions, type FilmCase, type FilmScene, type FilmSelection } from "@/lib/film-room";
import { jetsPlays } from "@/lib/jets-playbook";
import ScoutingBoard from "./ScoutingBoard";
import styles from "./FilmRoom.module.css";

const SELECTION_EVENT = "ajetsfan:film-selection";

function subscribeLocation(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener(SELECTION_EVENT, notify);
  window.addEventListener("hashchange", notify);
  window.addEventListener("ajetsfan:film-workspace", notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener(SELECTION_EVENT, notify);
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("ajetsfan:film-workspace", notify);
  };
}

const locationSnapshot = () => window.location.search + window.location.hash;
const serverLocationSnapshot = () => "";

function writeSelection(values: Record<string, string>, mode: "push" | "replace" = "push") {
  const url = new URL(window.location.href);
  Object.entries(values).forEach(([name, value]) => url.searchParams.set(name, value));
  if (url.href === window.location.href) return;
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
  window.dispatchEvent(new Event(SELECTION_EVENT));
}

function Scene({ scene }: { scene: FilmScene }) {
  const [failed, setFailed] = useState(false);
  const original = scene.kind === "reference";
  return <figure className={styles.scene} data-scene-kind={original ? "reference" : "recreation"}>
    <div className={styles.sceneFrame} style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
      {failed ? <div className={styles.sceneUnavailable}><strong>{original ? "Archival photograph unavailable." : "Scene recreation unavailable."}</strong><span>The source video and recorded play remain available below.</span></div> : <Image src={scene.src} alt={scene.alt} width={scene.width} height={scene.height} sizes="(max-width: 720px) calc(100vw - 4rem), (max-width: 1200px) 65vw, 850px" className={styles.sceneImage} loading="lazy" onError={() => setFailed(true)} />}
    </div>
    <figcaption><strong>{original ? "Original archival photograph" : "AI-generated scene recreation"}</strong><details><summary>About this image</summary><p>{scene.caption}</p><a href={scene.reference.url} target="_blank" rel="noreferrer">{original ? "Photo source" : "Historical reference"}: {scene.reference.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><small>{original ? "A still image does not establish the complete play’s alignment, assignments or movement." : "Editorial illustration. It does not establish the play’s alignment, assignments or player movement."}</small></details></figcaption>
  </figure>;
}

function SourceViewer({ film }: { film: FilmCase }) {
  const replay = film.replays[0];
  const youtubeUrl = /^[A-Za-z0-9_-]{11}$/.test(film.video.youtubeId) ? `https://www.youtube.com/watch?v=${film.video.youtubeId}` : null;
  return <div className={styles.sourceViewer} data-source-viewer={film.id}>
    {film.scene ? <Scene key={film.scene.src} scene={film.scene} /> : <div className={styles.replayCover}><span className={styles.replayKicker}>From the source archive</span><strong>{film.title}</strong><p>Watch the original replay.</p><span className={styles.filmStrip} aria-hidden="true">01 — 02 — 03 — 04</span></div>}
    <div className={styles.videoControls}><div><span className={styles.videoLabel}>Official replay</span><p>{replay.label}</p></div><a className={styles.replayButton} href={replay.url} target="_blank" rel="noreferrer">Open official replay <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>{youtubeUrl ? <details className={styles.replayOptions}><summary>Replay options</summary><a href={youtubeUrl} target="_blank" rel="noreferrer">Watch on YouTube <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><p className={styles.videoNote}>These NFL clips restrict embedded playback. The replay opens at its source in a new tab; keep this notebook open while you watch. {film.video.label} is also available on YouTube.</p></details> : null}</div>
    {jetsPlays.some((play) => play.id === film.id) ? <a className={styles.replayButton} href={`#jets-play:${film.id}`}>Draw this Jets play <span aria-hidden="true">↑</span></a> : null}
  </div>;
}

export default function FilmRoom({ cases }: { cases: FilmCase[] }) {
  useEffect(() => {
    const anchor = window.location.hash;
    if (anchor !== "#film-room" && anchor !== "#scouting-board") return;
    // Direct links must wait for the deferred notebook to have real geometry.
    const frame = requestAnimationFrame(() => document.getElementById(anchor.slice(1))?.scrollIntoView({ behavior: "instant", block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, []);
  return cases.length ? <FilmExperience cases={cases} /> : <section className={styles.empty}><h2>Roll the tape.</h2><p>No verified film cases are available in this edition.</p></section>;
}

function FilmExperience({ cases }: { cases: FilmCase[] }) {
  const search = useSyncExternalStore(subscribeLocation, locationSnapshot, serverLocationSnapshot);
  const selection = parseFilmSelection(search.split("#")[0], cases)!;
  const { film, coverage, pressure, step } = selection;
  const [filterPreference, setFilterPreference] = useState<"all" | "great" | "painful">("all");
  const filter = filterPreference !== "all" && film.category !== filterPreference ? "all" : filterPreference;
  const filtered = filter === "all" ? cases : cases.filter((item) => item.category === filter);
  const copyRequest = useRef(0);
  const [copied, setCopied] = useState<{ search: string; message: string; url?: string } | null>(null);
  const clock = film.clockNote ? (film.play.q > 4 ? "OT" : `Q${film.play.q}`) : clockLabel(film.play.q, film.play.t);

  useEffect(() => {
    const invalidate = () => { copyRequest.current += 1; };
    window.addEventListener("popstate", invalidate);
    window.addEventListener(SELECTION_EVENT, invalidate);
    return () => {
      copyRequest.current += 1;
      window.removeEventListener("popstate", invalidate);
      window.removeEventListener(SELECTION_EVENT, invalidate);
    };
  }, []);

  function selectCase(nextFilm: FilmCase) {
    writeSelection({ play: nextFilm.id });
  }

  function changeFilter(nextFilter: "all" | "great" | "painful") {
    setFilterPreference(nextFilter);
    if (nextFilter !== "all" && film.category !== nextFilter) {
      const first = cases.find((item) => item.category === nextFilter);
      if (first) selectCase(first);
    }
  }

  function chooseLesson(next: Partial<Pick<FilmSelection, "coverage" | "pressure" | "step">>) {
    const nextCoverage = next.coverage ?? coverage;
    const validPackages = pressureOptions(nextCoverage);
    const nextPressure = next.pressure ?? (validPackages.includes(pressure) ? pressure : validPackages[0]);
    writeSelection({ play: film.id, coverage: nextCoverage, pressure: nextPressure, step: String((next.step ?? step) + 1) });
  }

  async function copyCase() {
    const request = ++copyRequest.current;
    const requestedLocation = window.location.href;
    const url = new URL(requestedLocation);
    url.searchParams.set("play", film.id);
    url.searchParams.set("coverage", coverage);
    url.searchParams.set("pressure", pressure);
    url.searchParams.set("step", String(step + 1));
    url.hash = "film-room";
    try {
      await navigator.clipboard.writeText(url.href);
      if (copyRequest.current !== request || window.location.href !== requestedLocation) return;
      setCopied({ search, message: "Film link copied." });
    } catch {
      if (copyRequest.current !== request || window.location.href !== requestedLocation) return;
      setCopied({ search, message: "Select this link to copy the film case.", url: url.href });
    }
  }

  return <section id="film-room" className={styles.room} aria-labelledby="film-room-heading" data-film={film.id} data-game={film.game.id}>
    <h2 id="film-room-heading" className="sr-only">Game studies</h2>
    <div className={styles.screening}>
      <details className={styles.tape}><summary>Choose a game study <span>{film.title}</span></summary><h3 id="film-tape-heading">On the tape</h3><div className={styles.filters} role="group" aria-label="Filter film plays">{(["all", "great", "painful"] as const).map((kind) => <button type="button" key={kind} aria-pressed={filter === kind} onClick={() => changeFilter(kind)}>{kind === "all" ? "All plays" : kind === "great" ? "Great plays" : "Painful plays"}</button>)}</div><ol aria-label="Choose a film play">{filtered.map((item) => <li key={item.id}><button type="button" aria-pressed={item.id === film.id} data-film-case={item.id} onClick={() => selectCase(item)}><span className={styles.tapeNumber}>{String(cases.indexOf(item) + 1).padStart(2, "0")}</span><span><small>{item.game.season} · {item.game.opponentDisplay} · {item.category === "great" ? "Great play" : "Painful play"}</small><strong>{item.title}</strong><em>{item.focus}</em></span><span aria-hidden="true">↗</span></button></li>)}</ol></details>
      <article className={styles.selected} aria-labelledby="film-case-heading"><div className={styles.caseFiling}><span>{film.category === "great" ? "Great play" : "Painful play"} / Case {String(cases.indexOf(film) + 1).padStart(2, "0")}</span><span>Recorded clock <strong data-film-clock>{clock || "Unavailable"}</strong></span></div><div className={styles.caseHeader}><div><p className={styles.fixture}>Jets {film.game.atHome ? "vs" : "at"} {film.game.opponentDisplay} · <time dateTime={film.game.date}>{formatDate(film.game.date)}</time></p><h3 id="film-case-heading">{film.title}</h3><p>{film.focus}</p></div><p className={styles.final}><span>Confirmed final{film.game.wentToOt ? " / OT" : ""}</span><strong>NYJ {film.game.jetsScore}<span aria-hidden="true"> — </span>{film.game.opponentDisplay} {film.game.oppScore}</strong></p></div><SourceViewer key={film.id} film={film} /><details className={styles.recordedDetails}><summary>Recorded play &amp; probability</summary>{film.clockNote ? <p className={styles.clockNote}>{film.clockNote}</p> : null}<div className={styles.recordedPlay}><span className={styles.recordedLabel}>Original recorded play</span><p data-film-description>{film.play.desc || "Play description unavailable."}</p><dl><div><dt>Jets probability before this play</dt><dd data-film-probability>{pct(film.play.wp)}</dd></div><div><dt>Reported change on this play</dt><dd data-film-delta>{wpaLabel(film.play.d)}</dd></div></dl><p className={styles.estimateNote}>Win probability and its change are model estimates. The final score is confirmed separately.</p></div></details></article>
    </div>
    <details className={styles.notebook} aria-labelledby="film-notebook-heading"><summary id="film-notebook-heading">Play facts &amp; sources</summary><header><span className={styles.kicker}>Evidence before interpretation</span><h3>The play notebook.</h3></header><div className={styles.notebookColumns}><section className={styles.record}><h4>Recorded</h4><dl>{film.recordedFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}<a href={fact.source.url} target="_blank" rel="noreferrer">{fact.source.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></dd></div>)}</dl></section><section className={styles.accounts}><h4>Source account</h4>{film.sourceNotes.map((note) => <div key={note.label}><h5>{note.label}</h5><p>{note.text}</p><a href={note.source.url} target="_blank" rel="noreferrer">{note.source.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></div>)}</section><section className={styles.watchFor}><h4>Watch for</h4><p>Questions to test against the available camera angles.</p><ol>{film.watchFor.map((question) => <li key={question}>{question}</li>)}</ol></section><section className={styles.unresolved}><h4>Unresolved</h4><ul>{film.unresolved.map((question) => <li key={question}>{question}</li>)}</ul></section></div><footer className={styles.evidenceLinks}><Link href={`/games/${film.game.id}`}>Complete game evidence <span aria-hidden="true">↗</span></Link>{film.replays.map((replay) => <a key={`${replay.kind}-${replay.url}`} href={replay.url} target="_blank" rel="noreferrer">{replay.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>)}<a href={`/data/curves/${film.game.id}.json`} target="_blank" rel="noreferrer">Published play-by-play curve <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></footer></details>
    <details className={styles.coverageDrawer} open={/[?&](?:coverage|pressure|step)=/.test(search) || search.endsWith("#scouting-board")}><summary>Coverage &amp; pressure lab</summary><ScoutingBoard coverage={coverage} pressure={pressure} step={step} onSelection={chooseLesson} /></details>
    <div className={styles.share}><button type="button" onClick={copyCase}>Copy film link <span aria-hidden="true">↗</span></button><p role="status">{copied?.search === search ? copied.message : ""}</p>{copied?.search === search && copied.url ? <label>Film link<input type="text" readOnly value={copied.url} onFocus={(event) => event.currentTarget.select()} /></label> : null}<Link href="/how-made">Sources &amp; methods <span aria-hidden="true">↗</span></Link></div>
  </section>;
}
