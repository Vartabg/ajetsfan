"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REPLAY, clampReplayTime, eventAt, sampleActor } from "@/lib/wilson-replay.mjs";
import type { ReplayScene } from "@/lib/wilson-replay-scene";
import styles from "./WilsonReplay.module.css";

type Camera = "sideline" | "endzone" | "overhead" | "quarterback";
const CAMERAS: { id: Camera; label: string }[] = [
  { id: "sideline", label: "Sideline" }, { id: "endzone", label: "End zone" },
  { id: "overhead", label: "Overhead" }, { id: "quarterback", label: "Behind Flacco" },
];
const BASIS = { recorded: "Recorded", observed: "Observed", reported: "Reported", inferred: "Inferred", unreviewed: "Unreviewed" };
const sourceTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function Diagram({ time }: { time: number }) {
  const wilson = sampleActor("wilson", time), qb = sampleActor("qb", time);
  const point = (x: number, z: number) => ({ x: 250 + x * 7.5, y: 90 + z * 6 });
  const w = point(wilson.x, wilson.z), q = point(qb.x, qb.z);
  const route = REPLAY.actors.find(actor => actor.id === "wilson")!.path.map((frame, index) => { const p = point(frame.x, frame.z); return `${index ? "L" : "M"}${p.x} ${p.y}`; }).join(" ");
  return <svg viewBox="0 0 500 300" role="img" aria-label="Top-down teaching diagram of the inferred slant, with Flacco and Wilson highlighted" className={styles.diagram}>
    <rect width="500" height="300" fill="#183f30" />
    <rect x="35" y="30" width="430" height="60" fill="#553520" />
    {[0, 5, 10, 15, 20, 25, 30].map(yard => <g key={yard}><path d={`M35 ${90 + yard * 6}H465`} stroke={yard === 15 ? "#f4bf72" : "#8dab90"} strokeDasharray={yard === 15 ? "7 5" : undefined} opacity=".5" /><text x="12" y={94 + yard * 6} fill="#dbe4d6" fontSize="10">{yard}</text></g>)}
    <path d={route} fill="none" stroke="#d5f59e" strokeWidth="3" strokeDasharray="7 5" />
    <circle cx={q.x} cy={q.y} r="11" fill="#f1f2e9" /><text x={q.x} y={q.y + 4} fill="#122b21" fontSize="10" textAnchor="middle">19</text>
    <circle cx={w.x} cy={w.y} r="13" fill="#d5f59e" /><text x={w.x} y={w.y + 4} fill="#122b21" fontSize="11" textAnchor="middle">17</text>
    <text x="250" y="63" textAnchor="middle" fill="#efe8da" fontSize="17" letterSpacing="6">CLEVELAND</text>
  </svg>;
}

export default function WilsonReplay() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [direction, setDirection] = useState(1);
  const [camera, setCamera] = useState<Camera>("sideline");
  const [selection, setSelection] = useState("wilson");
  const [routes, setRoutes] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [sceneState, setSceneState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [reducedMotion, setReducedMotion] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReplayScene | null>(null);
  const clock = useRef({ time: 0, speed: 1, direction: 1 });
  const settings = useRef({ selection: "wilson", routes: true, camera: "sideline" as Camera });

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
      onSelect: id => { if (disposed) return; settings.current.selection = id; setSelection(id); scene.current?.setSelection(id); },
      onFailure: () => { if (!disposed) { pause(); setSceneState("failed"); } },
    })).then(instance => {
      if (disposed) { instance.dispose(); return; }
      owned = instance; scene.current = instance;
      instance.setTime(clock.current.time);
      instance.setSelection(settings.current.selection);
      instance.setRoutes(settings.current.routes);
      instance.setCamera(settings.current.camera);
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
    settings.current.camera = next; setCamera(next); scene.current?.setCamera(next);
  }
  function load() { pause(); setSceneState("loading"); setAttempt(value => value + 1); }
  const active = eventAt(time);
  const sourceFrame = REPLAY.sourceFrames.find(frame => frame.id === active.sourceFrameId);
  const actor = REPLAY.actors.find(item => item.id === selection)!;

  return <>
    <section id="replay" data-focus-moment="replay" className={styles.page} aria-labelledby="replay-heading"
      data-wilson-replay data-playing={playing} data-time={time.toFixed(3)} data-scene={sceneState} data-focus-tools>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Film Room / 3D study · September 18, 2022</p>
        <h1 id="replay-heading">Wilson’s winning touchdown</h1>
        <p className={styles.dek}>Find the window. Follow the slant. See the play from anywhere.</p>
      </header>

      <div className={styles.matchbar}>
        <div><span className={styles.team}>NYJ</span><b>24</b><span className={styles.versus}>at</span><span className={styles.team}>CLE</span><b>30</b></div>
        <p><strong>Q4 :25</strong><span>3rd &amp; 10 · CLE 15</span><small>Recorded situation before the snap</small></p>
      </div>

      <div className={styles.viewer}>
        <div className={styles.viewport}>
          <div ref={host} className={styles.canvasHost} style={{ visibility: sceneState === "ready" ? "visible" : "hidden" }} aria-hidden={sceneState !== "ready"} />
          {sceneState !== "ready" ? <div className={styles.poster}>
            <Diagram time={time} />
            {sceneState !== "failed" ? <div className={styles.loadCard}>
              {sceneState === "idle" ? <><p>Step onto the field.</p><button type="button" className={styles.load} onClick={load}>Load 3D replay <span aria-hidden="true">↗</span></button><small>The replay starts paused. You control the camera and time.</small></> : null}
              {sceneState === "loading" ? <p role="status">Preparing the field…</p> : null}
            </div> : null}
          </div> : null}
          <p className={styles.inferenceBanner}><span aria-hidden="true">◇</span> Inferred positions &amp; teaching times <a href="#evidence">See evidence</a></p>
          <div className={styles.cameraReadout} aria-hidden="true">{CAMERAS.find(item => item.id === camera)?.label}<span>{actor.number ? `${actor.number} / ` : ""}{actor.name}</span></div>
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

      <div className={styles.studyGrid}>
        <div className={styles.cameraPanel}>
          <h2>Choose your view</h2>
          <div className={styles.presets} aria-label="Camera presets">{CAMERAS.map(item => <button type="button" key={item.id} aria-pressed={camera === item.id} disabled={sceneState !== "ready"} onClick={() => chooseCamera(item.id)}>{item.label}</button>)}</div>
          <p>Drag to orbit · scroll or pinch to zoom · right-drag or two fingers to pan.</p>
          <div className={styles.cameraKeys} aria-label="Camera movement controls">{([
            ["left", "Rotate camera left", "←"], ["right", "Rotate camera right", "→"], ["up", "Raise camera", "↑"], ["down", "Lower camera", "↓"], ["in", "Zoom camera in", "+"], ["out", "Zoom camera out", "−"],
          ] as const).map(([action, label, glyph]) => <button type="button" key={action} aria-label={label} disabled={sceneState !== "ready"} onClick={() => scene.current?.moveCamera(action)}>{glyph}</button>)}</div>
          <label className={styles.selectPlayer}>Focus player<select value={selection} onChange={event => { settings.current.selection = event.target.value; setSelection(event.target.value); scene.current?.setSelection(event.target.value); }}>{REPLAY.actors.map(item => <option value={item.id} key={item.id}>{item.number ? `#${item.number} ` : ""}{item.name}</option>)}</select></label>
          <label className={styles.routeSwitch}><input type="checkbox" checked={routes} onChange={event => { settings.current.routes = event.target.checked; setRoutes(event.target.checked); scene.current?.setRoutes(event.target.checked); }} />Show inferred routes</label>
        </div>
        <aside className={styles.lesson} aria-labelledby="moment-heading">
          <p className={styles.eyebrow}>At this moment <span className={styles.badge} data-basis="inferred">Inferred timing</span></p>
          <h2 id="moment-heading">{active.label}</h2><p>{active.detail}</p>
          {sourceFrame ? <div className={styles.sourceFrame}><a href={sourceFrame.url} target="_blank" rel="noreferrer">Official replay at {sourceTime(sourceFrame.seconds)} <span aria-hidden="true">↗</span></a><p>{sourceFrame.observation}</p><small>Related paused frame; this teaching timeline is not synchronized.</small></div> : null}
          <div className={styles.playerNote}><h3>{actor.name}</h3><p>{actor.note}</p><small>{actor.identityBasis === "recorded" ? "Recorded identity · inferred movement" : "Inferred identity and movement"}</small></div>
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
      <details className={styles.sources} open><summary>Sources &amp; replay provenance</summary><ul>{REPLAY.evidence.map(source => <li key={source.id}><span className={styles.badge} data-basis={source.basis}>{BASIS[source.basis as keyof typeof BASIS] ?? source.basis}</span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} <span aria-hidden="true">↗</span></a> : <span> {source.label}</span>}<p>{source.summary}</p></li>)}</ul><p className={styles.teachingClock}>Official highlight observations come from four paused views. Analyst breakdown pages remain cataloged by metadata; their footage and spoken analysis are unreviewed. Neither establishes the exact 3D coordinates, Cleveland’s coverage call or individual protection assignments.</p></details>
    </section>
  </>;
}
