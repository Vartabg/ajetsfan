"use client";

import Link from "next/link";
import { useEffect, useId, useReducer, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { FIELD, concepts, createPlay, defensiveFormations, formationWarnings, offensiveFormations, routeForPlayer, routePatterns, sampleBall, samplePlayer, validatePlayDesign, type PlayDesign, type PlaybookPlayer, type Point } from "@/lib/playbook";
import { getJetsPlayDesign, jetsPlays } from "@/lib/jets-playbook";
import styles from "./PlaybookLab.module.css";

const STORAGE_KEY = "ajetsfan:playbook:v1";
const MAX_SHARE_LENGTH = 40000;
const MAX_IMPORT_LENGTH = 32000;
const MAX_POINTS = 12;
type Ledger = { design: PlayDesign; undo: PlayDesign[] };
type LedgerAction = { type: "edit"; design: PlayDesign } | { type: "undo" };
type Drag = { id: string; pointerId: number; origin: Point; start: Point; point: Point };

function ledgerReducer(state: Ledger, action: LedgerAction): Ledger {
  if (action.type === "undo") {
    const previous = state.undo.at(-1);
    return previous ? { design: previous, undo: state.undo.slice(0, -1) } : state;
  }
  if (JSON.stringify(state.design) === JSON.stringify(action.design)) return state;
  return { design: action.design, undo: [...state.undo.slice(-29), state.design] };
}

function subscribeLocation(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  return () => { window.removeEventListener("popstate", notify); window.removeEventListener("hashchange", notify); };
}
const diagramSnapshot = () => window.location.hash.startsWith("#playbook-lab:") ? window.location.hash.slice("#playbook-lab:".length)
  : window.location.hash.startsWith("#jets-play:") ? `jets:${window.location.hash.slice("#jets-play:".length)}` : "";
const serverDiagramSnapshot = () => "";

function encodeDesign(design: PlayDesign) {
  const bytes = new TextEncoder().encode(JSON.stringify(design));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function readSharedDesign(encoded: string): PlayDesign | null {
  if (!encoded || encoded.length > MAX_SHARE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const raw = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(raw, (character) => character.charCodeAt(0)));
    return text.length <= MAX_IMPORT_LENGTH ? validatePlayDesign(JSON.parse(text)) : null;
  } catch { return null; }
}

const clampPoint = (point: Point): Point => ({ x: Math.round(Math.max(20, Math.min(FIELD.width - 20, point.x))), y: Math.round(Math.max(20, Math.min(FIELD.height - 20, point.y))) });
const pathString = (player: PlaybookPlayer) => [player, ...player.path].map((point) => `${point.x},${point.y}`).join(" ");

export default function PlaybookLab() {
  const encoded = useSyncExternalStore(subscribeLocation, diagramSnapshot, serverDiagramSnapshot);
  const [loaded, setLoaded] = useState({ seen: encoded, token: encoded, generation: 0 });
  // A different shared diagram loads a new workspace. Ordinary section anchors
  // leave the current edit session intact, including its undo history.
  if (encoded !== loaded.seen) setLoaded({ seen: encoded, token: encoded || loaded.token, generation: encoded ? loaded.generation + 1 : loaded.generation });
  const shared = loaded.token.startsWith("jets:") ? getJetsPlayDesign(loaded.token.slice(5)) : loaded.token ? readSharedDesign(loaded.token) : null;
  return <PlaybookWorkspace key={loaded.generation} initialDesign={shared ?? getJetsPlayDesign("wilson-cleveland") ?? createPlay()} sharedError={Boolean(loaded.token && !shared)} sharedLoaded={Boolean(shared)} />;
}

function PlaybookWorkspace({ initialDesign, sharedError, sharedLoaded }: { initialDesign: PlayDesign; sharedError: boolean; sharedLoaded: boolean }) {
  const [{ design, undo }, dispatch] = useReducer(ledgerReducer, { design: initialDesign, undo: [] });
  const [selectedId, setSelectedId] = useState(() => jetsPlays.find((play) => play.id === initialDesign.archiveId)?.focusPlayerIds[0] ?? "x");
  const [tool, setTool] = useState<"move" | "draw">("move");
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const fieldRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeRef = useRef(0);
  const [notice, setNotice] = useState(sharedError ? "This diagram link is invalid or too large. A fresh Jets study diagram is ready." : sharedLoaded ? "Shared diagram loaded. You can edit your own copy." : "Wilson’s Cleveland touchdown is on the board. Choose another Jets moment, run the play, or draw your own answer.");
  const [shareUrl, setShareUrl] = useState("");
  const copyRequest = useRef(0);
  const importRequest = useRef(0);
  const [importText, setImportText] = useState("");
  const [followId, setFollowId] = useState("x");
  const [routePattern, setRoutePattern] = useState("go");
  const [archiveFilter, setArchiveFilter] = useState<"all" | "great" | "painful">("all");
  const archive = jetsPlays.find((play) => play.id === design.archiveId);
  const originalArchive = Boolean(archive && JSON.stringify(validatePlayDesign(archive.design)) === JSON.stringify(validatePlayDesign(design)));
  const archiveMoment = archive?.moments.filter((moment) => moment.at <= seconds).at(-1);
  const filteredArchive = jetsPlays.filter((play) => archiveFilter === "all" || play.category === archiveFilter);
  const selected = design.players.find((player) => player.id === selectedId) ?? design.players[0];
  const offense = design.players.filter((player) => player.side === "offense");
  const defense = design.players.filter((player) => player.side === "defense");
  const eligible = offense.filter((player) => player.eligible);
  const followTarget = eligible.find((player) => player.id === followId) ?? eligible[0];
  const offensiveFormation = offensiveFormations.find((formation) => formation.id === design.offenseId)!;
  const defensiveFormation = defensiveFormations.find((formation) => formation.id === design.defenseId)!;
  const concept = concepts.find((item) => item.id === design.conceptId)!;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const baseline = createPlay(design.offenseId, design.defenseId, design.conceptId);
  const customAlignment = design.players.some((player) => {
    const original = baseline.players.find((item) => item.id === player.id);
    return !original || original.x !== player.x || original.y !== player.y || original.label !== player.label || original.eligible !== player.eligible;
  });
  const alignmentWarnings = formationWarnings(design);
  const ball = sampleBall(design, seconds);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous: number | null = null;
    let elapsed = timeRef.current;
    const tick = (timestamp: number) => {
      if (previous !== null) elapsed = Math.min(FIELD.duration, elapsed + Math.min((timestamp - previous) / 1000, .1) * speed);
      previous = timestamp;
      timeRef.current = elapsed;
      setSeconds(elapsed);
      if (elapsed >= FIELD.duration) setRunning(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, speed]);

  useEffect(() => () => { copyRequest.current += 1; importRequest.current += 1; }, []);
  useEffect(() => {
    if (sharedLoaded) stageRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    else if (sharedError) document.getElementById("playbook-lab")?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [sharedLoaded, sharedError]);

  function stopAtSnap() {
    setRunning(false);
    timeRef.current = 0;
    setSeconds(0);
  }

  function edit(next: PlayDesign, message?: string) {
    const checked = validatePlayDesign(next);
    if (!checked) { setNotice("That change could not be applied. Check the player coordinates and assignments."); return false; }
    stopAtSnap();
    copyRequest.current += 1;
    importRequest.current += 1;
    setShareUrl("");
    dispatch({ type: "edit", design: checked });
    setNotice(message ?? "Assignment updated. Run the play to inspect the movement.");
    return true;
  }

  function changePlayer(playerId: string, changes: Partial<Pick<PlaybookPlayer, "x" | "y" | "path">>, message?: string) {
    edit({ ...design, players: design.players.map((player) => player.id === playerId ? { ...player, ...changes } : player) }, message);
  }

  function choosePreset(offenseId: string, defenseId: string, conceptId: string) {
    setDrag(null);
    dragRef.current = null;
    edit(createPlay(offenseId, defenseId, conceptId), "Preset loaded. Every new preset starts with eleven players on each side.");
  }

  function loadJetsPlay(playId: string) {
    cancelDrag();
    const next = getJetsPlayDesign(playId);
    if (!next) return;
    if (edit(next, "Jets study diagram loaded. The source records the action; positions and timing are illustrative. Undo restores your previous design.")) {
      setSelectedId(jetsPlays.find((play) => play.id === playId)?.focusPlayerIds[0] ?? "qb");
      setTool("move");
      requestAnimationFrame(() => stageRef.current?.scrollIntoView({ behavior: "instant", block: "start" }));
    }
  }

  function editBall(ball: PlayDesign["ball"]) {
    const { ballEvents: _events, ...withoutEvents } = design;
    void _events;
    edit({ ...withoutEvents, ball }, "Custom ball settings applied. The archival ball sequence has been replaced by your pass or handoff.");
  }

  function changeFormation(side: "offense" | "defense", formationId: string) {
    cancelDrag();
    const next = createPlay(side === "offense" ? formationId : design.offenseId, side === "defense" ? formationId : design.defenseId, design.conceptId);
    const players = design.players.filter((player) => player.side !== side).concat(next.players.filter((player) => player.side === side));
    const sameBallPlayers = players.some((player) => player.id === design.ball.carrierId && player.side === "offense") && players.some((player) => player.id === design.ball.targetId && player.side === "offense" && player.eligible);
    const { ballEvents: _events, ...withoutEvents } = design;
    void _events;
    edit({ ...withoutEvents, offenseId: next.offenseId, defenseId: next.defenseId, players, ball: sameBallPlayers ? design.ball : next.ball, name: design.name === baseline.name ? next.name : design.name }, side === "defense" ? "Defensive front changed. Your offensive routes have been kept; any archival ball sequence is now a custom pass or handoff." : "Offensive formation changed. Your defensive assignments have been kept; any archival ball sequence is now a custom pass or handoff.");
  }

  function fieldPoint(clientX: number, clientY: number): Point | null {
    const svg = fieldRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return clampPoint({ x: transformed.x, y: transformed.y });
  }

  function selectPlayer(player: PlaybookPlayer) {
    setSelectedId(player.id);
    setNotice(`${player.label} selected. ${player.side === "offense" ? player.eligible ? "Eligible receiver." : "Ineligible offensive player." : "Defensive assignment."}`);
  }

  function startDrag(event: PointerEvent<SVGGElement>, player: PlaybookPlayer) {
    event.stopPropagation();
    if (event.button !== 0 || tool !== "move") { selectPlayer(player); return; }
    const point = fieldPoint(event.clientX, event.clientY);
    if (!point) return;
    selectPlayer(player);
    stopAtSnap();
    const next = { id: player.id, pointerId: event.pointerId, origin: { x: player.x, y: player.y }, start: point, point: { x: player.x, y: player.y } };
    dragRef.current = next;
    setDrag(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<SVGGElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = fieldPoint(event.clientX, event.clientY);
    if (!point) return;
    const next = { ...current, point: clampPoint({ x: current.origin.x + point.x - current.start.x, y: current.origin.y + point.y - current.start.y }) };
    dragRef.current = next;
    setDrag(next);
  }

  function finishDrag(event: PointerEvent<SVGGElement>, cancelled = false) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && (current.point.x !== current.origin.x || current.point.y !== current.origin.y)) changePlayer(current.id, current.point, "Starting position updated. Check formation legality before treating a custom alignment as legal.");
  }

  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
  }

  function keyboardPlayer(event: KeyboardEvent<SVGGElement>, player: PlaybookPlayer) {
    if (event.key === "Escape") { cancelDrag(); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPlayer(player); return; }
    const moves: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const direction = moves[event.key];
    if (!direction) return;
    event.preventDefault();
    setSelectedId(player.id);
    const distance = event.shiftKey ? 20 : 5;
    changePlayer(player.id, clampPoint({ x: player.x + direction.x * distance, y: player.y + direction.y * distance }), `${player.label} starting position moved. Arrow keys move five units; Shift moves twenty.`);
  }

  function drawPoint(event: React.MouseEvent<SVGSVGElement>) {
    if (tool !== "draw" || (event.target instanceof Element && event.target.closest("[data-lab-player], [data-route-point]"))) return;
    const point = fieldPoint(event.clientX, event.clientY);
    if (!point) return;
    if (selected.path.length >= MAX_POINTS) { setNotice("Twelve assignment points is the limit. Remove a point before adding another."); return; }
    changePlayer(selected.id, { path: [...selected.path, point] }, `Point ${selected.path.length + 1} added to ${selected.label}’s assignment.`);
  }

  function positionPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const x = Number(fields.get("x"));
    const y = Number(fields.get("y"));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    changePlayer(selected.id, clampPoint({ x, y }), `${selected.label} starting position updated.`);
  }

  function timingPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const from = Number(fields.get("from"));
    const to = Number(fields.get("to"));
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > FIELD.duration || from >= to) {
      setNotice("Movement must start before it ends, within the six-second diagram timeline.");
      return;
    }
    edit({ ...design, players: design.players.map((player) => {
      if (player.id !== selected.id) return player;
      const { motionWindow: _window, ...withoutWindow } = player;
      void _window;
      return from === 0 && to === FIELD.duration ? withoutWindow : { ...withoutWindow, motionWindow: { from, to } };
    }) }, `${selected.label} moves from ${from.toFixed(1)} to ${to.toFixed(1)} diagram seconds, holding position outside that window.`);
  }

  function pointForm(event: FormEvent<HTMLFormElement>, index: number | null) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const x = Number(fields.get("x"));
    const y = Number(fields.get("y"));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const point = clampPoint({ x, y });
    if (index === null) {
      if (selected.path.length >= MAX_POINTS) { setNotice("Remove an assignment point before adding another."); return; }
      changePlayer(selected.id, { path: [...selected.path, point] });
    } else changePlayer(selected.id, { path: selected.path.map((existing, at) => at === index ? point : existing) });
  }

  function followReceiver() {
    const target = followTarget;
    if (!target || selected.side !== "defense") return;
    if (!target.path.length) { setNotice("Draw the receiver’s route first, then assign a defender to follow it."); return; }
    const offset = { x: selected.x - target.x, y: selected.y - target.y };
    const path = target.path.map((point) => clampPoint({ x: point.x + offset.x * .25, y: point.y - 22 }));
    changePlayer(selected.id, { path }, `${selected.label} follows ${target.label}’s current route with a teaching offset. Later receiver edits do not automatically change this assignment.`);
  }

  function rushQuarterback() {
    const quarterback = offense.find((player) => player.id === "qb") ?? offense.find((player) => player.id === design.ball.carrierId)!;
    changePlayer(selected.id, { path: [clampPoint({ x: selected.x, y: FIELD.lineOfScrimmage + 30 }), clampPoint({ x: quarterback.x, y: quarterback.y - 24 })] }, `${selected.label}’s teaching rush path is drawn toward the quarterback’s starting position. Protection and contact are not simulated.`);
  }

  function scrub(value: number) {
    setRunning(false);
    const next = Math.min(FIELD.duration, Math.max(0, value));
    timeRef.current = next;
    setSeconds(next);
  }

  function togglePlayback() {
    cancelDrag();
    if (running) { setRunning(false); return; }
    if (timeRef.current >= FIELD.duration) { timeRef.current = 0; setSeconds(0); }
    setRunning(true);
  }

  function replay() {
    cancelDrag();
    timeRef.current = 0;
    setSeconds(0);
    setRunning(true);
  }

  function undoEdit() {
    cancelDrag();
    stopAtSnap();
    copyRequest.current += 1;
    importRequest.current += 1;
    setShareUrl("");
    dispatch({ type: "undo" });
    setNotice("Previous design restored.");
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(design)); setNotice("Design saved in this browser. Saving again replaces this local copy."); }
    catch { setNotice("This browser could not save the design. Export JSON to keep a copy."); }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setNotice("No design has been saved in this browser yet."); return; }
      const checked = raw.length <= MAX_IMPORT_LENGTH ? validatePlayDesign(JSON.parse(raw)) : null;
      if (!checked) { setNotice("The saved design is invalid or too large. Your current design has been kept."); return; }
      edit(checked, "Saved design loaded from this browser.");
    } catch { setNotice("The saved design could not be read. Your current design has been kept."); }
  }

  function exportDesign() {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "jets-playbook.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Design exported as JSON.");
  }

  function importDesign() {
    try {
      const checked = importText.length <= MAX_IMPORT_LENGTH ? validatePlayDesign(JSON.parse(importText)) : null;
      if (!checked) { setNotice("Import rejected: use a valid playbook JSON design with eleven players per side and at most twelve points per assignment."); return; }
      edit(checked, "JSON design imported. The previous design is available through Undo edit.");
      setImportText("");
    } catch { setNotice("Import rejected: this is not valid playbook JSON. Your current design has been kept."); }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const request = ++importRequest.current;
    if (file.size > MAX_IMPORT_LENGTH) { setNotice("Import rejected: this file exceeds the 32 KB design limit."); return; }
    try {
      const raw = await file.text();
      if (request !== importRequest.current) return;
      const checked = raw.length <= MAX_IMPORT_LENGTH ? validatePlayDesign(JSON.parse(raw)) : null;
      if (!checked) { setNotice("Import rejected: this file is not a valid playbook design. Your current design has been kept."); return; }
      edit(checked, "JSON file imported. The previous design is available through Undo edit.");
    } catch {
      if (request === importRequest.current) setNotice("Import rejected: this JSON file could not be read. Your current design has been kept.");
    }
  }

  async function shareDesign() {
    const request = ++copyRequest.current;
    const encoded = encodeDesign(design);
    const url = new URL(window.location.href);
    url.searchParams.delete("diagram");
    // Fragments stay in the browser, so a complete play does not create an
    // oversized request URI or place editable designs in server request logs.
    url.hash = `playbook-lab:${encoded}`;
    if (encoded.length > MAX_SHARE_LENGTH) { setNotice("This design is too large for a share link. Export JSON instead."); return; }
    setShareUrl(url.href);
    try {
      await navigator.clipboard.writeText(url.href);
      if (request === copyRequest.current) setNotice("Diagram link copied. It includes the design and opens at the snap.");
    } catch {
      if (request === copyRequest.current) setNotice("Select the diagram link below to copy it. This browser did not grant clipboard access.");
    }
  }

  return <section id="playbook-lab" className={styles.lab} aria-labelledby="playbook-lab-heading" data-offense={design.offenseId} data-defense={design.defenseId} data-concept={design.conceptId} data-time={seconds.toFixed(2)} data-running={running} data-selected={selected.id} data-tool={tool} data-archive={archive?.id ?? ""} data-archive-original={originalArchive}>
    <header className={styles.heading}><div><span className={styles.kicker}>The chalkboard comes alive</span><h2 id="playbook-lab-heading">Draw it. Run it. Read it.</h2></div><p>Build the look. Draw the assignments. Roll the play forward and inspect every movement, one frame at a time.</p></header>
    <section className={styles.archive} aria-labelledby="jets-archive-heading">
      <header className={styles.archiveHeading}><div><span className={styles.kicker}>The Jets archive / {String(jetsPlays.length).padStart(2, "0")} snaps</span><h3 id="jets-archive-heading">Some plays never leave you.</h3><p>Load a moment from Jets history. Follow the named players, step through the action, then draw your own answer.</p></div><div className={styles.archiveFilters} role="group" aria-label="Filter Jets archive">{(["all", "great", "painful"] as const).map((filter) => <button key={filter} type="button" aria-pressed={archiveFilter === filter} onClick={() => setArchiveFilter(filter)}>{filter === "all" ? "Every snap" : filter === "great" ? "The glory" : "The agony"}</button>)}</div></header>
      <div className={styles.archiveCards}>{filteredArchive.map((play) => <button key={play.id} type="button" data-jets-play={play.id} aria-pressed={archive?.id === play.id} aria-label={`Load ${play.title}`} onClick={() => loadJetsPlay(play.id)}><span className={styles.archiveMeta}>{play.date.slice(0, 4)} · {play.opponent}<em>{play.category === "great" ? "Glory" : "Agony"}</em></span><strong>{play.title}</strong><span>{play.result}</span><small>{archive?.id === play.id ? originalArchive ? "Loaded / study diagram" : "Loaded / edited copy" : "Draw this play"}<span aria-hidden="true"> ↗</span></small></button>)}</div>
      <div className={styles.archiveFoot}><p>Sourced football action. Illustrative positions and timing. Unknown assignments stay blank.</p><button type="button" onClick={() => { cancelDrag(); if (edit(createPlay(), "Teaching play loaded. Draw your own assignments; Undo restores the Jets study diagram.")) setSelectedId("x"); }}>Start a teaching play</button></div>
    </section>
    {archive ? <article className={styles.archiveRecord} aria-labelledby="jets-play-heading">
      <div className={styles.archiveSituation}><span className={styles.kicker}>{originalArchive ? "Sourced action / study diagram" : "Edited study copy / source play below"} · Jets on {archive.jetsSide}</span><h3 id="jets-play-heading">{archive.title}</h3><p>{archive.situation}</p><strong>{archive.result}</strong><p>{archive.summary}</p><a href="#jets-play-stage">Go to the board <span aria-hidden="true">↓</span></a></div>
      <div className={styles.archiveEvidence}><p>Template formations, routes, spacing and the six-second clock are editing aids. They do not establish the historical play call or actual player tracking.</p><details><summary>What the sources establish</summary><ul>{archive.confirmed.map((fact) => <li key={fact}>{fact}</li>)}</ul><h4>What remains illustrative</h4><ul>{archive.illustrative.map((note) => <li key={note}>{note}</li>)}</ul></details><div className={styles.archiveSources}>{archive.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>)}</div>{!originalArchive ? <button type="button" onClick={() => loadJetsPlay(archive.id)}>Restore source diagram</button> : null}</div>
    </article> : null}
    <div className={styles.presets}>
      <label>Offensive formation<select aria-label="Offensive formation" value={design.offenseId} onChange={(event) => changeFormation("offense", event.target.value)}>{offensiveFormations.map((formation) => <option key={formation.id} value={formation.id}>{formation.label} · {formation.personnel}</option>)}</select><span>{offensiveFormation.description}</span></label>
      <label>Defensive front<select aria-label="Defensive front" value={design.defenseId} onChange={(event) => changeFormation("defense", event.target.value)}>{defensiveFormations.map((formation) => <option key={formation.id} value={formation.id}>{formation.label} · {formation.personnel}</option>)}</select><span>{defensiveFormation.description}</span></label>
      <label>Play concept<select aria-label="Play concept" value={design.conceptId} onChange={(event) => choosePreset(design.offenseId, design.defenseId, event.target.value)}>{concepts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span>{concept.description}</span></label>
    </div>
    <p className={styles.presetHelp}>{archive ? "These are teaching templates, not verified historical formations. " : ""}Changing a formation replaces that side’s assignments. A new play concept reloads both sides; Undo edit restores your previous design.</p>
    <div ref={stageRef} id="jets-play-stage" className={styles.stage}>
      <div className={styles.stageHeader}><div><span>{archive ? originalArchive ? "Jets study diagram" : "Your edited study copy" : "Assignment playback"} / {seconds === 0 ? "At the snap" : running ? "Running" : "Paused"}</span><strong>{design.name}</strong></div><p><span data-lab-count="offense">{offense.length}</span> {archive?.jetsSide === "offense" ? "Jets" : archive ? archive.opponent : "offense"} <i aria-hidden="true">/</i> <span data-lab-count="defense">{defense.length}</span> {archive?.jetsSide === "defense" ? "Jets" : archive ? archive.opponent : "defense"}</p></div>
      <div className={styles.fieldTools}><div role="group" aria-label="Field tool"><button type="button" aria-pressed={tool === "move"} onClick={() => { cancelDrag(); setTool("move"); }}>Move players</button><button type="button" aria-pressed={tool === "draw"} onClick={() => { cancelDrag(); setTool("draw"); stopAtSnap(); }}>Draw assignment</button></div><p>{tool === "draw" ? `Click or tap the field to add points for ${selected.label}.` : "Select a player. Drag to move; arrow keys also work."}</p></div>
      <figure className={styles.figure}>
        <svg ref={fieldRef} role="group" viewBox={`0 0 ${FIELD.width} ${FIELD.height}`} className={`${styles.field} ${tool === "draw" ? styles.drawing : ""}`} aria-labelledby={`${id}-field-title ${id}-field-desc`} onClick={drawPoint} onKeyDown={(event) => { if (event.key === "Escape") cancelDrag(); }}>
          <title id={`${id}-field-title`}>Interactive football playbook</title><desc id={`${id}-field-desc`}>Eleven offensive and eleven defensive players. Offense moves upfield. Select a player to move its starting position or draw an assignment. The roster and coordinate forms provide the same controls without dragging.</desc>
          <defs><marker id={`${id}-offense-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#d2f66b" /></marker><marker id={`${id}-defense-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#9ae5e4" /></marker></defs>
          <rect x="20" y="20" width="960" height="580" className={styles.boundary} />
          {[60, 120, 180, 240, 300, 360, 420, 480, 540].map((y, at) => <g key={y}><rect x="20" y={y - 30} width="960" height="60" className={at % 2 ? styles.fieldStripe : styles.fieldStripeQuiet} /><line x1="20" x2="980" y1={y} y2={y} className={styles.yardLine} />{[340, 660].map((x) => <line key={x} x1={x - 7} x2={x + 7} y1={y - 30} y2={y - 30} className={styles.hash} />)}</g>)}
          <line x1="20" x2="980" y1={FIELD.lineOfScrimmage} y2={FIELD.lineOfScrimmage} className={styles.scrimmage} /><text x="954" y={FIELD.lineOfScrimmage - 12} className={styles.fieldLabel} textAnchor="end">LINE OF SCRIMMAGE</text>
          <text x="500" y="44" className={styles.fieldLabel} textAnchor="middle">UPFIELD ↑</text><text x="42" y="588" className={styles.fieldLabel}>TEACHING FIELD · COORDINATES, NOT YARDS</text>
          {design.players.map((player) => player.path.length ? <polyline key={`route-${player.id}`} points={pathString(drag?.id === player.id ? { ...player, ...drag.point } : player)} className={`${player.side === "offense" ? styles.offensePath : styles.defensePath} ${selected.id === player.id ? styles.selectedPath : ""}`} markerEnd={`url(#${id}-${player.side}-arrow)`} data-lab-path={player.id} /> : null)}
          {seconds === 0 ? selected.path.map((point, at) => <g key={`${selected.id}-${at}`} data-route-point={at} className={styles.routePoint}><circle cx={point.x} cy={point.y} r="11" /><text x={point.x} y={point.y + 4} textAnchor="middle">{at + 1}</text></g>) : null}
          {design.players.map((player) => {
            const point = drag?.id === player.id ? drag.point : samplePlayer(player, seconds);
            const lineName = ["lt", "lg", "c", "rg", "rt"].includes(player.id);
            const sideName = player.side === "defense";
            const qbName = archive?.id === "sanchez-thanksgiving" && player.id === "qb";
            const labelPosition = lineName ? { x: 0, y: -64, textAnchor: "middle" as const }
              : sideName ? { x: 30, y: 4, textAnchor: "start" as const }
              : qbName ? { x: -30, y: 4, textAnchor: "end" as const }
              : { x: 0, y: 35, textAnchor: "middle" as const };
            return <g key={player.id} className={`${styles.player} ${player.side === "offense" ? styles.offensivePlayer : styles.defensivePlayer} ${selected.id === player.id ? styles.selectedPlayer : ""}`} role="button" tabIndex={selected.id === player.id ? 0 : -1} aria-label={`Select ${player.label}, ${player.side}${player.eligible ? ", eligible receiver" : ""}`} aria-pressed={selected.id === player.id} data-lab-player={player.id} data-side={player.side} data-x={point.x.toFixed(2)} data-y={point.y.toFixed(2)} transform={`translate(${point.x} ${point.y})`} onPointerDown={(event) => startDrag(event, player)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={cancelDrag} onClick={(event) => { event.stopPropagation(); selectPlayer(player); }} onKeyDown={(event) => keyboardPlayer(event, player)} onBlur={cancelDrag}>
              <circle r="25" className={styles.playerHit} /><circle r="16" className={styles.playerBody} /><text y="5" textAnchor="middle">{player.label.length > 5 ? player.label.match(/^\d+|\d+$/)?.[0] ?? (player.id === "qb" ? "QB" : player.side === "offense" ? "REC" : "DB") : player.label}</text>{player.label.length > 5 ? <text {...labelPosition} className={styles.playerName}>{player.label}</text> : null}{player.eligible ? <circle cx="15" cy="-14" r="4" className={styles.eligibleDot} /> : null}
            </g>;
          })}
          <g transform={`translate(${ball.x} ${ball.y})`} data-lab-ball data-x={ball.x.toFixed(2)} data-y={ball.y.toFixed(2)} className={styles.ball}><g transform="translate(20 -20)"><ellipse rx="10" ry="6" /><path d="M-4 0H4M-2-2V2M1-2V2" /></g></g>
        </svg>
        <figcaption><span><i className={styles.offenseKey} />{archive?.jetsSide === "offense" ? "Jets offense" : archive ? `${archive.opponent} offense` : "Offense & route"}</span><span><i className={styles.defenseKey} />{archive?.jetsSide === "defense" ? "Jets defense" : archive ? `${archive.opponent} defense` : "Defense & assignment"}</span><span><i className={styles.eligibleKey} />Eligible receiver</span><span data-lab-alignment>{archive ? originalArchive ? "Illustrative alignment / unknown assignments blank" : "Edited study alignment / custom assignments" : customAlignment ? "Custom alignment: check formation legality" : "Preset starting alignment"}</span></figcaption>
      </figure>
      <div className={styles.transport}>
        <div className={styles.playButtons}><button type="button" className={styles.playButton} onClick={togglePlayback} aria-label={running ? "Pause play" : "Run play"}><span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span>{running ? "Pause" : "Run play"}</button><button type="button" onClick={replay}>Replay</button><button type="button" onClick={() => { cancelDrag(); stopAtSnap(); }}>Back to snap</button></div>
        <label className={styles.timeline}>Play timeline <output>{seconds.toFixed(1)} / {FIELD.duration.toFixed(1)} sec</output><input type="range" min="0" max={FIELD.duration} step="0.05" value={seconds} aria-label="Play timeline" aria-valuetext={`${seconds.toFixed(2)} seconds of ${FIELD.duration}`} onChange={(event) => scrub(Number(event.target.value))} /></label>
        <label className={styles.speed}>Playback speed<select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
      </div>
      {archive && originalArchive ? <div className={styles.moments}><div role="group" aria-label="Step through Jets play">{archive.moments.map((moment, at) => <button type="button" key={moment.at} aria-pressed={archiveMoment?.at === moment.at} onClick={() => scrub(moment.at)} data-jets-moment={moment.at}><span>{String(at + 1).padStart(2, "0")}</span>{moment.label}</button>)}</div><p data-jets-moment-detail><strong>{archiveMoment?.label}</strong>{archiveMoment?.detail}</p><small>Steps use illustrative diagram time, not timestamps from the film.</small></div> : null}
      <p className={styles.playbackNote}>Movement follows the paths you draw over six seconds{archive ? ", with staged movement windows for the central action" : ""}. Ball movement is illustrative. This is assignment playback, not film tracking, collision physics, or a prediction of who wins the play. No animation starts automatically.</p>
    </div>
    <p className={styles.status} role="status" aria-live="polite" data-lab-status>{notice}</p>
    <div className={styles.editor}>
      <section className={styles.playerEditor} aria-labelledby="lab-player-heading"><header><span className={styles.kicker}>The assignment desk</span><h3 id="lab-player-heading">{selected.label}<small>{selected.side} {selected.eligible ? "· eligible" : ""}</small></h3><span>{selected.path.length} / {MAX_POINTS} points</span></header>
        <label>Selected player<select aria-label="Selected player" value={selected.id} onChange={(event) => selectPlayer(design.players.find((player) => player.id === event.target.value)!)}><optgroup label="Offense">{offense.map((player) => <option key={player.id} value={player.id}>{player.label}{player.eligible ? " · eligible" : ""}</option>)}</optgroup><optgroup label="Defense">{defense.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}</optgroup></select></label>
        <div className={styles.roster} role="group" aria-label="Select offensive player">{offense.map((player) => <button type="button" key={player.id} aria-pressed={selected.id === player.id} onClick={() => selectPlayer(player)} aria-label={`Select ${player.label}, offense`} data-lab-roster={player.id}>{player.label}</button>)}</div><div className={`${styles.roster} ${styles.defenseRoster}`} role="group" aria-label="Select defensive player">{defense.map((player) => <button type="button" key={player.id} aria-pressed={selected.id === player.id} onClick={() => selectPlayer(player)} aria-label={`Select ${player.label}, defense`} data-lab-roster={player.id}>{player.label}</button>)}</div>
        <form key={`${selected.id}-${selected.x}-${selected.y}`} onSubmit={positionPlayer} className={styles.coordinates}><label>Start X<input type="number" name="x" min="20" max={FIELD.width - 20} defaultValue={selected.x} step="1" required /></label><label>Start Y<input type="number" name="y" min="20" max={FIELD.height - 20} defaultValue={selected.y} step="1" required /></label><button type="submit">Move to position</button></form>
        <p className={styles.editorHelp}>Upfield decreases Y. Moving a start leaves the assignment’s destination points in place. Field players support arrow keys; hold Shift for a larger move. Edits return playback to the snap.</p>
        <details><summary>Movement timing</summary><p>Stage a release, a catch or a return. A player holds the start before this window and the final point after it. Times are diagram seconds.</p><form key={`${selected.id}-${selected.motionWindow?.from ?? 0}-${selected.motionWindow?.to ?? FIELD.duration}`} onSubmit={timingPlayer} className={styles.coordinates}><label>Movement starts<input type="number" name="from" min="0" max="5.9" step="0.1" defaultValue={selected.motionWindow?.from ?? 0} required /></label><label>Movement ends<input type="number" name="to" min="0.1" max={FIELD.duration} step="0.1" defaultValue={selected.motionWindow?.to ?? FIELD.duration} required /></label><button type="submit">Apply movement timing</button></form></details>
        <div className={styles.quickRoute}><label>Route pattern<select aria-label="Route pattern" value={routePattern} onChange={(event) => setRoutePattern(event.target.value)}>{routePatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select></label><button type="button" onClick={() => changePlayer(selected.id, { path: routeForPlayer(selected, routePattern) }, `${selected.label}’s ${routePatterns.find((pattern) => pattern.id === routePattern)?.label.toLowerCase()} assignment applied.`)}>Apply route pattern</button></div>
        <div className={styles.assignmentButtons}><button type="button" disabled={!selected.path.length} onClick={() => changePlayer(selected.id, { path: selected.path.slice(0, -1) }, "Last assignment point removed.")}>Remove last point</button><button type="button" disabled={!selected.path.length} onClick={() => changePlayer(selected.id, { path: [] }, `${selected.label}’s assignment cleared.`)}>Clear assignment</button></div>
        {selected.side === "defense" ? <div className={styles.follow}><label>Follow a receiver<select aria-label="Receiver to follow" value={followTarget.id} onChange={(event) => setFollowId(event.target.value)}>{eligible.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}</select></label><button type="button" onClick={followReceiver}>Draw follow assignment</button><button type="button" onClick={rushQuarterback}>Rush the quarterback</button><p>Follow copies the receiver’s current route with a fixed teaching offset; it does not model leverage, reaction, or real coverage. A rush aims at the quarterback’s starting position.</p></div> : null}
        <details className={styles.pointEditor}><summary>Assignment coordinates ({selected.path.length} points)</summary><p>Add or edit destinations numerically. Each point is visited in order; the route starts at the player’s position.</p>{selected.path.map((point, at) => <form key={`${selected.id}-${at}-${point.x}-${point.y}`} onSubmit={(event) => pointForm(event, at)} className={styles.coordinates}><strong>{at + 1}</strong><label>Point {at + 1} X<input type="number" name="x" min="20" max={FIELD.width - 20} defaultValue={point.x} step="1" required /></label><label>Point {at + 1} Y<input type="number" name="y" min="20" max={FIELD.height - 20} defaultValue={point.y} step="1" required /></label><button type="submit">Update point {at + 1}</button></form>)}<form key={selected.id} onSubmit={(event) => pointForm(event, null)} className={styles.coordinates}><label>New point X<input type="number" name="x" min="20" max={FIELD.width - 20} defaultValue={selected.x} step="1" required /></label><label>New point Y<input type="number" name="y" min="20" max={FIELD.height - 20} defaultValue={Math.max(20, selected.y - 80)} step="1" required /></label><button type="submit" disabled={selected.path.length >= MAX_POINTS}>Add assignment point</button></form></details>
      </section>
      <section className={styles.designEditor} aria-labelledby="lab-design-heading"><span className={styles.kicker}>Make it your own</span><h3 id="lab-design-heading">Keep the playbook.</h3><label key={design.name}>Design name<input type="text" defaultValue={design.name} maxLength={80} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== design.name) { if (!edit({ ...design, name }, "Design renamed.")) event.target.value = design.name; } else if (!name) { event.target.value = design.name; setNotice("A design needs a name. The previous name has been kept."); } }} /></label>
        {design.ballEvents ? <div className={styles.eventBall}><strong>Staged ball sequence</strong><p>This design follows {design.ballEvents.length} ball events. Flights, loose balls and possession changes are replayed as drawn. Custom pass settings replace that sequence.</p><button type="button" onClick={() => editBall(design.ball)}>Use a custom pass or handoff</button></div> : null}
        <div className={styles.ballControls}><label>Ball carrier<select aria-label="Ball carrier" disabled={Boolean(design.ballEvents)} value={design.ball.carrierId} onChange={(event) => editBall({ ...design.ball, carrierId: event.target.value })}>{offense.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}</select></label><label>Pass target<select aria-label="Pass target" disabled={Boolean(design.ballEvents)} value={design.ball.targetId} onChange={(event) => editBall({ ...design.ball, targetId: event.target.value })}>{eligible.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}</select></label><label>Release time (seconds)<input aria-label="Release time" disabled={Boolean(design.ballEvents)} type="number" min="0" max="5.4" step="0.1" value={design.ball.releaseAt} onChange={(event) => { if (event.target.value !== "") editBall({ ...design.ball, releaseAt: Number(event.target.value) }); }} /></label></div>
        <div className={styles.designActions}><button type="button" disabled={!undo.length} onClick={undoEdit}>Undo edit{undo.length ? ` (${undo.length})` : ""}</button><button type="button" onClick={() => choosePreset(design.offenseId, design.defenseId, design.conceptId)}>Reset preset</button><button type="button" onClick={saveLocal}>Save in browser</button><button type="button" onClick={loadLocal}>Load saved design</button><button type="button" onClick={exportDesign}>Export JSON</button><button type="button" onClick={shareDesign}>Copy diagram link</button></div>
        {shareUrl ? <label className={styles.shareLink}>Diagram link<input type="text" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /></label> : null}
        <p className={styles.editorHelp}>One saved design stays in this browser. Share links carry the design; JSON keeps a portable copy. Undo retains your last thirty edits during this visit.</p>
        <details className={styles.import}><summary>Import a playbook design</summary><label>Import JSON file<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importFile(file); }} /></label><label>Playbook JSON<textarea value={importText} maxLength={MAX_IMPORT_LENGTH} onChange={(event) => setImportText(event.target.value)} rows={5} placeholder="Paste a JSON design exported from this playbook." spellCheck={false} /></label><button type="button" onClick={importDesign} disabled={!importText.trim()}>Import JSON</button><p>Imports are checked for valid formations, player counts, field coordinates, and assignment limits before they replace this design.</p></details>
      </section>
    </div>
    {alignmentWarnings.length ? <aside className={styles.alignmentNotice} aria-label="Diagram alignment check"><strong>Check the custom alignment.</strong><ul>{alignmentWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p>This checks marker positions, not every NFL rule.</p></aside> : null}
    <footer className={styles.methods}><p><strong>Personnel is who. Formation is where.</strong> The same personnel can align in different formations. A defensive front does not establish the coverage or the number of rushers. Presets start with seven offensive players on the line and eligible ends; free editing can change their legality. These diagrams are independent teaching examples.</p><div><a href="https://operations.nfl.com/rules-officiating/nfl-football-basics/formations" target="_blank" rel="noreferrer">NFL formation guide ↗<span className="sr-only"> (opens in a new tab)</span></a><Link href="/how-made#playbook-methods">Playbook methods &amp; limits ↗</Link></div></footer>
  </section>;
}
