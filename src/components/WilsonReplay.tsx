"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REPLAY, clampReplayTime, eventAt, sampleActor } from "@/lib/wilson-replay.mjs";
import { TEACHING } from "@/lib/wilson-teaching.mjs";
import type { ReplayScene } from "@/lib/wilson-replay-scene";
import styles from "./WilsonReplay.module.css";

type Camera = "sideline" | "endzone" | "overhead" | "quarterback";
const CAMERAS: { id: Camera; label: string }[] = [
  { id: "sideline", label: "Sideline" }, { id: "endzone", label: "End zone" },
  { id: "overhead", label: "Overhead" }, { id: "quarterback", label: "Behind Flacco" },
];
const BASIS = { recorded: "Recorded", observed: "Observed", reported: "Reported", inferred: "Inferred", unreviewed: "Unreviewed" };
const sourceTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const MOMENT_LESSONS: Record<string, string> = {
  snap: "Start with the quarterback in shotgun and watch the receivers release.",
  break: "Wilson’s reported slant turns toward the middle. Follow the highlighted route.",
  release: "Flacco described a throwing window behind the linebackers against relatively soft safeties.",
  catch: "Follow the ball into Wilson’s hands, then watch the finish.",
  finish: "The touchdown ties the game 30–30. The following extra point supplies the 31–30 win.",
};

function Roster({ selection, onSelect }: { selection: string; onSelect: (id: string) => void }) {
  return <section className={styles.roster} aria-labelledby="roster-heading" data-all22>
    <p className={styles.eyebrow}>All 22 / choose a player</p><h2 id="roster-heading">Everyone has a part.</h2>
    <p>Pick a position to follow its movement and learn its job. Unnamed players represent teaching roles.</p>
    <div className={styles.rosterUnits}>{(["offense", "defense"] as const).map(unit => <div key={unit}>
      <h3>{unit === "offense" ? "Jets offense · 11" : "Cleveland defense · 11"}</h3>
      <div className={styles.rosterPlayers}>{TEACHING.players.filter(player => player.unit === unit).map(player => {
        const actor = REPLAY.actors.find(item => item.id === player.id)!;
        return <button key={player.id} type="button" data-roster-player={player.id} data-unit={unit} aria-pressed={selection === player.id} aria-label={`${actor.name} · ${player.position}`} onClick={() => onSelect(player.id)}><strong>{player.code}</strong><span>{actor.number ? actor.name : player.title}</span></button>;
      })}</div>
    </div>)}</div>
    <a className={styles.lessonLink} href="#selected-player">Read the selected player’s lesson <span aria-hidden="true">→</span></a>
  </section>;
}

function Diagram({ time, selection, routes, labels, responsibilities }: { time: number; selection: string; routes: boolean; labels: boolean; responsibilities: boolean }) {
  const point = (x: number, z: number) => ({ x: 250 + x * 7.5, y: 90 + z * 6 });
  const selected = REPLAY.actors.find(actor => actor.id === selection)!;
  const route = selected.path.map((frame, index) => { const p = point(frame.x, frame.z); return `${index ? "L" : "M"}${p.x} ${p.y}`; }).join(" ");
  return <svg viewBox="0 0 500 300" role="img" aria-label="Top-down teaching diagram of all 22 inferred positions; choose a player from the roster for its job" className={styles.diagram}>
    <rect width="500" height="300" fill="#183f30" />
    <rect x="35" y="30" width="430" height="60" fill="#553520" />
    {[0, 5, 10, 15, 20, 25, 30].map(yard => <g key={yard}><path d={`M35 ${90 + yard * 6}H465`} stroke={yard === 15 ? "#f4bf72" : "#8dab90"} strokeDasharray={yard === 15 ? "7 5" : undefined} opacity=".5" /><text x="12" y={94 + yard * 6} fill="#dbe4d6" fontSize="10">{yard}</text></g>)}
    {routes ? <path d={route} fill="none" stroke="#f2d16c" strokeWidth="2" strokeDasharray="7 5" /> : null}
    {responsibilities ? TEACHING.relationships.filter(item => item.from === selection || item.to === selection).map(item => {
      const from = sampleActor(item.from, time), to = sampleActor(item.to, time), a = point(from.x, from.z), b = point(to.x, to.z);
      return <path key={item.id} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#b1d9e3" strokeWidth="1.5" strokeDasharray="3 4" />;
    }) : null}
    {REPLAY.actors.map(actor => {
      const pose = sampleActor(actor, time), p = point(pose.x, pose.z), role = TEACHING.players.find(item => item.id === actor.id)!;
      return <g key={actor.id}><circle cx={p.x} cy={p.y} r={actor.id === selection ? 8 : 5} fill={actor.id === selection ? "#f2d16c" : actor.team === "NYJ" ? "#edf2e5" : "#da9664"} stroke="#173829" strokeWidth="1" />{labels ? <text x={p.x} y={p.y - 10} fill="#f4f3df" stroke="#173829" strokeWidth=".4" fontSize="7" textAnchor="middle">{actor.number ?? role.code}</text> : null}</g>;
    })}
    <text x="250" y="63" textAnchor="middle" fill="#efe8da" fontSize="17" letterSpacing="6">CLEVELAND</text>
  </svg>;
}

export default function WilsonReplay() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [direction, setDirection] = useState(1);
  const [camera, setCamera] = useState<Camera>("overhead");
  const [selection, setSelection] = useState("wilson");
  const [routes, setRoutes] = useState(true);
  const [labels, setLabels] = useState(true);
  const [responsibilities, setResponsibilities] = useState(false);
  const [following, setFollowing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sceneState, setSceneState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [reducedMotion, setReducedMotion] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReplayScene | null>(null);
  const clock = useRef({ time: 0, speed: 1, direction: 1 });
  const settings = useRef({ selection: "wilson", routes: true, labels: true, responsibilities: false, following: false, camera: "overhead" as Camera });

  const pause = useCallback(() => { setPlaying(false); setTime(clock.current.time); }, []);
  const seek = useCallback((value: number) => {
    const next = clampReplayTime(value);
    clock.current.time = next;
    scene.current?.setTime(next);
    setTime(next);
  }, []);

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => { setReducedMotion(preference.matches); if (preference.matches) pause(); };
    changed(); preference.addEventListener("change", changed);
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) pause(); });
    if (host.current) observer.observe(host.current);
    return () => { preference.removeEventListener("change", changed); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); };
  }, [pause]);

  useEffect(() => {
    if (!attempt || !host.current) return;
    let disposed = false;
    let owned: ReplayScene | null = null;
    const element = host.current;
    void import("@/lib/wilson-replay-scene").then(({ createReplayScene }) => createReplayScene(element, {
      onSelect: id => { if (disposed) return; settings.current.selection = id; setSelection(id); if (settings.current.following) scene.current?.frameSelection(); },
      onFailure: () => { if (!disposed) { pause(); setSceneState("failed"); } },
    })).then(instance => {
      if (disposed) { instance.dispose(); return; }
      owned = instance; scene.current = instance;
      instance.setTime(clock.current.time);
      instance.setSelection(settings.current.selection);
      instance.setRoutes(settings.current.routes);
      instance.setLabels(settings.current.labels);
      instance.setResponsibilities(settings.current.responsibilities);
      instance.setCamera(settings.current.camera);
      if (settings.current.following) { instance.frameSelection(); instance.setFollowSelection(true); }
      setSceneState("ready");
    }).catch(() => { if (!disposed) { pause(); setSceneState("failed"); } });
    return () => { disposed = true; owned?.dispose(); if (scene.current === owned) scene.current = null; };
  }, [attempt, pause]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0, previous: number | null = null, lastUi = 0;
    const advance = (now: number) => {
      if (previous === null) previous = now;
      const elapsed = Math.min((now - previous) / 1000, .1);
      previous = now;
      const next = clampReplayTime(clock.current.time + elapsed * clock.current.speed * clock.current.direction);
      clock.current.time = next;
      scene.current?.setTime(next);
      const ended = clock.current.direction > 0 ? next >= REPLAY.duration : next <= 0;
      if (now - lastUi >= 70 || ended) { setTime(next); lastUi = now; }
      if (ended) { setPlaying(false); return; }
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function play() {
    if (playing) { pause(); seek(clock.current.time); return; }
    if (clock.current.time >= REPLAY.duration) seek(0);
    clock.current.direction = 1; setDirection(1); setPlaying(true);
  }
  function rewind() {
    if (clock.current.time <= 0) seek(REPLAY.duration);
    clock.current.direction = -1; setDirection(-1); setPlaying(true);
  }
  function chooseCamera(next: Camera) {
    settings.current.following = false; setFollowing(false); scene.current?.setFollowSelection(false);
    settings.current.camera = next; setCamera(next); scene.current?.setCamera(next);
  }
  function selectPlayer(id: string) {
    settings.current.selection = id; setSelection(id); scene.current?.setSelection(id);
    if (settings.current.following) scene.current?.frameSelection();
  }
  function followPlayer() {
    settings.current.following = true; setFollowing(true);
    scene.current?.frameSelection(); scene.current?.setFollowSelection(true);
  }
  function load() { pause(); setSceneState("loading"); setAttempt(value => value + 1); }
  const active = eventAt(time);
  const sourceFrame = REPLAY.sourceFrames.find(frame => frame.id === active.sourceFrameId);
  const actor = REPLAY.actors.find(item => item.id === selection)!;
  const player = TEACHING.players.find(item => item.id === selection)!;
  const interactions = TEACHING.relationships.filter(item => item.from === selection || item.to === selection);
  const playerEvidence = REPLAY.evidence.filter(source => player.evidenceIds.includes(source.id) || player.assessment.evidenceIds.includes(source.id));

  return <>
    <section id="replay" data-focus-moment="replay" className={styles.page} aria-labelledby="replay-heading"
      data-wilson-replay data-playing={playing} data-time={time.toFixed(3)} data-scene={sceneState} data-focus-tools>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Film Room / 3D study · September 18, 2022</p>
        <h1 id="replay-heading">Wilson’s winning touchdown</h1>
        <p className={styles.dek}>See the whole play. Choose a player. Understand the job.</p>
      </header>

      <div className={styles.matchbar}>
        <div><span className={styles.team}>NYJ</span><b>24</b><span className={styles.versus}>at</span><span className={styles.team}>CLE</span><b>30</b></div>
        <p><strong>Q4 :25</strong><span>3rd &amp; 10 · CLE 15</span><small>Recorded situation before the snap</small></p>
      </div>

      <div className={styles.studioGrid}><div className={styles.studioMain}>
      <div className={styles.viewer}>
        <div className={styles.layerBar} aria-label="Replay layers">
          <label><input type="checkbox" checked={routes} onChange={event => { settings.current.routes = event.target.checked; setRoutes(event.target.checked); scene.current?.setRoutes(event.target.checked); }} />Show inferred routes</label>
          <label><input type="checkbox" checked={labels} onChange={event => { settings.current.labels = event.target.checked; setLabels(event.target.checked); scene.current?.setLabels(event.target.checked); }} />Position labels</label>
          <label><input type="checkbox" checked={responsibilities} onChange={event => { settings.current.responsibilities = event.target.checked; setResponsibilities(event.target.checked); scene.current?.setResponsibilities(event.target.checked); }} />Teaching responsibilities</label>
        </div>
        <div className={styles.viewport}>
          <div ref={host} className={styles.canvasHost} style={{ visibility: sceneState === "ready" ? "visible" : "hidden" }} aria-hidden={sceneState !== "ready"} />
          {sceneState !== "ready" ? <div className={styles.poster}>
            <Diagram time={time} selection={selection} routes={routes} labels={labels} responsibilities={responsibilities} />
            {sceneState !== "failed" ? <div className={styles.loadCard}>
              {sceneState === "idle" ? <><p>Step onto the field.</p><button type="button" className={styles.load} onClick={load}>Load 3D replay <span aria-hidden="true">↗</span></button><small>The replay starts paused. You control the camera and time.</small></> : null}
              {sceneState === "loading" ? <p role="status">Preparing the field…</p> : null}
            </div> : null}
          </div> : null}
          <p className={styles.inferenceBanner}><span aria-hidden="true">◇</span> Inferred positions &amp; teaching times <a href="#evidence">See evidence</a></p>
          <div className={styles.cameraReadout} aria-hidden="true">{following ? "Following player" : CAMERAS.find(item => item.id === camera)?.label}<span>{player.code} / {actor.number ? actor.name : player.title}</span></div>
        </div>

        {sceneState === "failed" ? <div className={styles.failureCard}><div><p role="status">3D unavailable</p><small>Explore the teaching diagram, timeline and evidence.</small></div><button type="button" className={styles.load} onClick={load}>Try 3D again</button></div> : null}

        <div className={styles.timeline}>
          <div className={styles.timeHeading}><p>{playing ? direction < 0 ? "Rewinding" : "Playing" : "Paused"} <span>· {speed}×</span></p><output htmlFor="replay-time" aria-label="Teaching elapsed time">{time.toFixed(2)} <span>/ {REPLAY.duration.toFixed(1)} s</span></output></div>
          <label className="sr-only" htmlFor="replay-time">Replay time</label>
          <input id="replay-time" type="range" min="0" max={REPLAY.duration} step=".01" value={time} aria-valuetext={`${time.toFixed(2)} seconds of inferred teaching time`} onChange={event => { pause(); seek(Number(event.target.value)); }} />
          <div className={styles.eventTicks}>{REPLAY.events.filter(event => event.at < REPLAY.duration).map(event => <button type="button" key={event.id} onClick={() => { pause(); seek(event.at); }} aria-pressed={active.id === event.id}>{event.label}</button>)}</div>
          <div className={styles.transport}>
            <button type="button" className={styles.primary} onClick={play}>{playing ? "Pause" : "Play"}</button>
            <button type="button" onClick={rewind}>Rewind</button>
            <button type="button" onClick={() => { pause(); seek(0); }}>Return to snap</button>
            <div className={styles.steppers}><button type="button" aria-label="Rewind 1 second" onClick={() => { pause(); seek(clock.current.time - 1); }}>−1s</button><button type="button" aria-label="Forward 1 second" onClick={() => { pause(); seek(clock.current.time + 1); }}>+1s</button></div>
            <label className={styles.speed}>Playback speed<select value={speed} onChange={event => { const next = Number(event.target.value); clock.current.speed = next; setSpeed(next); }}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
          </div>
          <p className={styles.teachingClock}>Teaching time, not a synchronized game or video clock.{reducedMotion ? " Reduced motion is on; playback starts only when you press Play." : ""}</p>
        </div>
      </div>

        <div className={styles.cameraPanel}>
          <h2>Choose your view</h2>
          <div className={styles.focusActions}><button type="button" disabled={sceneState !== "ready"} aria-pressed={following} onClick={followPlayer}>Follow player</button><button type="button" disabled={sceneState !== "ready"} onClick={() => chooseCamera("overhead")}>Show everyone</button></div>
          <div className={styles.presets} aria-label="Camera presets">{CAMERAS.map(item => <button type="button" key={item.id} aria-pressed={camera === item.id} disabled={sceneState !== "ready"} onClick={() => chooseCamera(item.id)}>{item.label}</button>)}</div>
          <p>Drag to orbit · scroll or pinch to zoom · right-drag or two fingers to pan.</p>
          <div className={styles.cameraKeys} aria-label="Camera movement controls">{([
            ["left", "Rotate camera left", "←"], ["right", "Rotate camera right", "→"], ["up", "Raise camera", "↑"], ["down", "Lower camera", "↓"], ["in", "Zoom camera in", "+"], ["out", "Zoom camera out", "−"],
          ] as const).map(([action, label, glyph]) => <button type="button" key={action} aria-label={label} disabled={sceneState !== "ready"} onClick={() => scene.current?.moveCamera(action)}>{glyph}</button>)}</div>
          <label className={styles.selectPlayer}>Focus player<select value={selection} onChange={event => selectPlayer(event.target.value)}>{REPLAY.actors.map(item => <option value={item.id} key={item.id}>{item.number ? `#${item.number} ` : ""}{item.name}</option>)}</select></label>
          <a className={styles.jumpToLesson} href="#selected-player">Read this player’s job <span aria-hidden="true">↓</span></a>
          <p className={styles.visualKey}><span>Solid trail: movement so far</span><span>Dashed line: authored path or relationship</span><span>Bright yellow: selected player</span></p>
          {responsibilities ? <p className={styles.schemeNote}>Responsibility links show an illustrative teaching scheme. Actual blocking and coverage assignments are unestablished.</p> : null}
        </div>
        <Roster selection={selection} onSelect={selectPlayer} />
        </div>
        <aside id="selected-player" className={styles.lesson} aria-labelledby="player-heading" data-selected-player={selection} data-assessment-basis={player.assessment.basis}>
          <p className={styles.eyebrow}>Selected player / {player.code}</p>
          <h2 id="player-heading">{actor.number ? actor.name : player.title}</h2>
          <p className={styles.positionLine}>{player.position} <span className={styles.badge} data-basis={player.roleBasis}>{player.roleBasis === "recorded" ? "Recorded role" : "Illustration"}</span></p>
          <div className={styles.playerJob} data-teaching-job><span className={styles.badge} data-basis="inferred">Illustration</span><h3>Job in this teaching play</h3><p>{player.lesson}</p></div>
          {player.sourceAction ? <div className={styles.claim}><span className={styles.badge} data-basis="recorded">Recorded action</span><h3>Source-supported action</h3><p>{player.sourceAction}</p></div> : null}
          {player.reportedConcept ? <div className={styles.claim}><span className={styles.badge} data-basis="reported">Player account / report</span><h3>The reported idea</h3><p>{player.reportedConcept}</p></div> : null}
          <div className={styles.assessment} data-player-assessment><span className={styles.badge} data-basis={player.assessment.basis}>{player.assessment.basis === "unknown" ? "Not established" : "Recorded result"}</span><h3>{player.result ? "The recorded contribution" : "Individual assessment"}</h3><p className={player.result ? styles.result : undefined}>{player.result ?? "The actual assignment and individual outcome are unestablished for this teaching role."}</p><details><summary>Assessment evidence</summary><p>{player.assessment.detail}</p></details></div>
          {interactions.length ? <details className={styles.playerDetails}><summary>How this role connects</summary><p>Illustrative relationships in this teaching model:</p><ul>{interactions.map(item => <li key={item.id}>{item.label}</li>)}</ul></details> : null}
          <div className={styles.momentNote}>
          <p className={styles.eyebrow}>At this moment <span className={styles.badge} data-basis="inferred">Inferred timing</span></p>
          <h3 id="moment-heading">{active.label}</h3><p>{MOMENT_LESSONS[active.id] ?? active.detail}</p>
          {sourceFrame ? <div className={styles.sourceFrame}><a href={sourceFrame.url} target="_blank" rel="noreferrer">Official replay at {sourceTime(sourceFrame.seconds)} <span aria-hidden="true">↗</span></a><small>Related paused frame; this teaching timeline is not synchronized.</small><details><summary>Source and timing details</summary><p>{sourceFrame.observation}</p><p>{active.detail}</p></details></div> : null}
          </div>
          <details className={styles.playerDetails}><summary>Evidence for this player</summary><p>{actor.note}</p><p>{player.teachingJob}</p>{player.reportedIntent ? <p>{player.reportedIntent}</p> : null}<ul>{playerEvidence.map(source => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}</li>)}</ul></details>
        </aside>
      </div>
    </section>

    <section id="evidence" data-focus-moment="evidence" className={styles.evidence} aria-labelledby="evidence-heading">
      <p className={styles.eyebrow}>The evidence behind the replay</p>
      <h2 id="evidence-heading">What we know. What we’ve filled in.</h2>
      <p className={styles.evidenceIntro}>This is an evidence-based teaching reconstruction, not player tracking or recovered game footage. The 3D geometry, poses and timing are inferred. Twenty supporting players have generic roles because their identities and assignments are unverified.</p>
      <div className={styles.evidenceGrid}>
        <article><span className={styles.badge} data-basis="recorded">Recorded</span><h3>The play and its result</h3><p>Flacco to Wilson: a 15-yard touchdown from shotgun, on 3rd-and-10 at the Cleveland 15. The score became 30–30; the extra point made the final 31–30.</p><p className={styles.record}>{REPLAY.record.desc}</p><small>{REPLAY.record.canonicalPlayId}</small></article>
        <article><span className={styles.badge} data-basis="observed">Observed</span><h3>Frames from the official replay</h3><p>These paused broadcast views corroborate the sequence. Their video locators do not establish exact event boundaries or measured movement.</p><ul className={styles.observations}>{REPLAY.sourceFrames.map(frame => <li key={frame.id}><a href={frame.url} target="_blank" rel="noreferrer">{sourceTime(frame.seconds)} <span aria-hidden="true">↗</span></a><span>{frame.observation}</span></li>)}</ul></article>
        <article><span className={styles.badge} data-basis="reported">Reported</span><h3>The slant and the window</h3><p>The Jets’ account identifies Wilson’s slant. Flacco recalled soft safeties and a throw behind the linebackers through a window. This is an attributed quarterback account, not a verified defensive call.</p></article>
        <article><span className={styles.badge} data-basis="inferred">Inferred</span><h3>The movement you see</h3><p>Starting alignments, route angles, every defender’s path, protection, ball arc, body motion and subsecond timing are authored teaching choices. They show one possible way to understand the account.</p></article>
      </div>
      <details className={styles.sources}><summary>Sources &amp; replay provenance</summary><ul>{REPLAY.evidence.map(source => <li key={source.id}><span className={styles.badge} data-basis={source.basis}>{BASIS[source.basis as keyof typeof BASIS] ?? source.basis}</span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} <span aria-hidden="true">↗</span></a> : <span> {source.label}</span>}<p>{source.summary}</p></li>)}</ul><p className={styles.teachingClock}>Official highlight observations come from four paused views. Analyst breakdown pages remain cataloged by metadata; their footage and spoken analysis are unreviewed. Neither establishes the exact 3D coordinates, Cleveland’s coverage call or individual protection assignments.</p></details>
    </section>
  </>;
}
