"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { FIELD, concepts, createPlay, defensiveFormations, formationWarnings, offensiveFormations, routeForPlayer, routePatterns, sampleBall, samplePlayer, validatePlayDesign, type PlayDesign, type PlaybookPlayer, type Point } from "@/lib/playbook";
import { getJetsPlayDesign, jetsPlays, type JetsPlay } from "@/lib/jets-playbook";
import { getJetsStudy, type JetsStudy } from "@/lib/jets-snap-study";
import { formatDate } from "@/lib/current";
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
const samePlayer = (player: PlaybookPlayer, original: PlaybookPlayer) =>
  player.id === original.id && player.label === original.label && player.side === original.side && player.eligible === original.eligible
  && player.x === original.x && player.y === original.y
  && player.motionWindow?.from === original.motionWindow?.from && player.motionWindow?.to === original.motionWindow?.to
  && player.path.length === original.path.length && player.path.every((point, index) => point.x === original.path[index].x && point.y === original.path[index].y);

// The letters on the board, in plain words. Covers every code the presets and Jets studies use.
const positionKey: [string, string][] = [
  ["QB", "quarterback"], ["RB · FB", "running back · fullback"], ["WR · TE", "wide receiver · tight end (X, Y, Z, H name each receiver’s spot)"],
  ["LT LG C RG RT", "offensive line: left tackle, left guard, center, right guard, right tackle"], ["REC · DB", "receiver · defensive back, shown when a named player’s label is long"],
  ["DE · DT · NT", "defensive end · defensive tackle · nose tackle (L or R = left or right)"], ["LB", "linebacker: WLB weak side, MLB middle, SLB strong side, ILB inside, OLB outside"],
  ["CB · NB", "cornerback · nickel back, a fifth defensive back"], ["FS · SS", "free safety · strong safety"],
];
const nameList = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// Reuse the static field while the player and ball positions animate.
const fieldMarkings = <>
  <rect x="20" y="20" width="960" height="580" className={styles.boundary} />
  {[60, 120, 180, 240, 300, 360, 420, 480, 540].map((y, at) => <g key={y}><rect x="20" y={y - 30} width="960" height="60" className={at % 2 ? styles.fieldStripe : styles.fieldStripeQuiet} /><line x1="20" x2="980" y1={y} y2={y} className={styles.yardLine} />{[340, 660].map((x) => <line key={x} x1={x - 7} x2={x + 7} y1={y - 30} y2={y - 30} className={styles.hash} />)}</g>)}
  <line x1="20" x2="980" y1={FIELD.lineOfScrimmage} y2={FIELD.lineOfScrimmage} className={styles.scrimmage} /><text x="954" y={FIELD.lineOfScrimmage - 12} className={styles.fieldLabel} textAnchor="end">LINE OF SCRIMMAGE</text>
  <text x="500" y="44" className={styles.fieldLabel} textAnchor="middle">UPFIELD ↑</text><text x="42" y="588" className={styles.fieldLabel}>CHALKBOARD · NOT TO SCALE</text>
</>;

export default function PlaybookLab() {
  const encoded = useSyncExternalStore(subscribeLocation, diagramSnapshot, serverDiagramSnapshot);
  const [loaded, setLoaded] = useState({ seen: encoded, token: encoded, generation: 0 });
  // A different shared diagram loads a new workspace. Ordinary section anchors
  // leave the current edit session intact, including its undo history.
  if (encoded !== loaded.seen) setLoaded({ seen: encoded, token: encoded || loaded.token, generation: encoded ? loaded.generation + 1 : loaded.generation });
  const shared = loaded.token.startsWith("jets:") ? getJetsStudy(loaded.token.slice(5))?.design : loaded.token ? readSharedDesign(loaded.token) : null;
  return <PlaybookWorkspace key={loaded.generation} initialDesign={shared ?? getJetsStudy("wilson-cleveland")?.design ?? createPlay()} sharedError={Boolean(loaded.token && !shared)} sharedLoaded={Boolean(shared)} />;
}

function PlaybookWorkspace({ initialDesign, sharedError, sharedLoaded }: { initialDesign: PlayDesign; sharedError: boolean; sharedLoaded: boolean }) {
  const [{ design, undo }, dispatch] = useReducer(ledgerReducer, { design: initialDesign, undo: [] });
  const [selectedId, setSelectedId] = useState(() => jetsPlays.find((play) => play.id === initialDesign.archiveId)?.focusPlayerIds[0] ?? "x");
  const [tool, setTool] = useState<"move" | "draw">("move");
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const fieldRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeRef = useRef(0);
  const [notice, setNotice] = useState(sharedError ? "This diagram link is invalid or too large. A fresh Jets study diagram is ready." : sharedLoaded ? "Shared diagram loaded. You can edit your own copy." : "");
  const [shareUrl, setShareUrl] = useState("");
  const copyRequest = useRef(0);
  const importRequest = useRef(0);
  const [importText, setImportText] = useState("");
  const [followId, setFollowId] = useState("x");
  const [routePattern, setRoutePattern] = useState("go");
  const [archiveFilter, setArchiveFilter] = useState<"all" | "great" | "painful">("all");
  const [pathView, setPathView] = useState<"selected" | "all" | "offense" | "defense">("selected");
  const archive = jetsPlays.find((play) => play.id === design.archiveId);
  const study = useMemo(() => archive ? getJetsStudy(archive.id) : null, [archive]);
  const fullSnap = design.studyMode === "full-snap";
  const canonical = fullSnap ? study?.design : archive?.design;
  // Playback changes only the clock. Validate and compare the design after an
  // edit, rather than cloning and serializing all 22 players on every frame.
  const originalArchive = useMemo(() => Boolean(canonical && JSON.stringify(validatePlayDesign(canonical)) === JSON.stringify(validatePlayDesign(design))), [canonical, design]);
  const archiveMoment = archive?.moments.filter((moment) => moment.at <= seconds).at(-1);
  const sourcedNames = study?.assignments.filter((assignment) => assignment.basis === "source-supported").flatMap((assignment) => design.players.find((player) => player.id === assignment.playerId)?.label ?? []) ?? [];
  const illustrativeCount = study?.assignments.filter((assignment) => assignment.basis === "illustrative").length ?? 0;
  const filteredArchive = useMemo(() => jetsPlays.filter((play) => archiveFilter === "all" || play.category === archiveFilter), [archiveFilter]);
  const selected = design.players.find((player) => player.id === selectedId) ?? design.players[0];
  const { offense, defense, eligible, movingPlayers } = useMemo(() => {
    const offense = design.players.filter((player) => player.side === "offense");
    return {
      offense,
      defense: design.players.filter((player) => player.side === "defense"),
      eligible: offense.filter((player) => player.eligible),
      movingPlayers: design.players.filter((player) => player.path.length > 0).length,
    };
  }, [design.players]);
  const followTarget = eligible.find((player) => player.id === followId) ?? eligible[0];
  const offensiveFormation = offensiveFormations.find((formation) => formation.id === design.offenseId)!;
  const defensiveFormation = defensiveFormations.find((formation) => formation.id === design.defenseId)!;
  const concept = concepts.find((item) => item.id === design.conceptId)!;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const baseline = useMemo(() => createPlay(design.offenseId, design.defenseId, design.conceptId), [design.offenseId, design.defenseId, design.conceptId]);
  const customAlignment = useMemo(() => {
    return design.players.some((player) => {
      const original = baseline.players.find((item) => item.id === player.id);
      return !original || original.x !== player.x || original.y !== player.y || original.label !== player.label || original.eligible !== player.eligible;
    });
  }, [baseline, design.players]);
  const alignmentWarnings = useMemo(() => formationWarnings(design), [design]);
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

  useEffect(() => {
    const pause = () => setRunning(false);
    window.addEventListener("ajetsfan:film-workspace", pause);
    window.addEventListener("hashchange", pause);
    window.addEventListener("popstate", pause);
    return () => {
      window.removeEventListener("ajetsfan:film-workspace", pause);
      window.removeEventListener("hashchange", pause);
      window.removeEventListener("popstate", pause);
    };
  }, []);

  useEffect(() => () => { copyRequest.current += 1; importRequest.current += 1; }, []);
  useEffect(() => {
    if (sharedLoaded) {
      // Let the workspace switch finish before moving focus out of its hidden
      // initiating link. Cancel if another diagram replaces this one first.
      const frame = requestAnimationFrame(() => {
        stageRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
        playButtonRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
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

  function loadJetsPlay(playId: string, mode: "full-snap" | "source-action" = "full-snap") {
    cancelDrag();
    const next = mode === "full-snap" ? getJetsStudy(playId)?.design : getJetsPlayDesign(playId);
    if (!next) return;
    if (edit(next, mode === "full-snap" ? "Full-snap study loaded: 22 moving players. Supporting assignments are illustrative study choices; only labeled actions are source-supported. Undo restores your previous design." : "Source-supported action loaded. Unknown supporting assignments are left blank; stationary markers do not mean those players stood still.")) {
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

  const selectPlayer = useCallback((player: PlaybookPlayer) => {
    setSelectedId(player.id);
    setNotice("");
  }, [setNotice]);

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

  // The story card's button: run from the snap and bring the board into view.
  function watchPlay() {
    replay();
    const stage = stageRef.current;
    if (stage && stage.getBoundingClientRect().top > window.innerHeight * .35) {
      stage.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
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

  return <section id="playbook-lab" className={styles.lab} aria-labelledby="playbook-lab-heading" data-offense={design.offenseId} data-defense={design.defenseId} data-concept={design.conceptId} data-time={seconds.toFixed(2)} data-running={running} data-selected={selected.id} data-tool={tool} data-archive={archive?.id ?? ""} data-archive-original={originalArchive} data-study-mode={archive ? fullSnap ? "full-snap" : "source-action" : "teaching"} data-study-original={fullSnap && originalArchive}>
    <h2 id="playbook-lab-heading" className="sr-only">Chalkboard</h2>
    {archive ? <div className={styles.story} data-jets-story={archive.id}>
      <p className={styles.storyMeta}><span>{formatDate(archive.date)} · {archive.opponent}</span><em>{archive.category === "great" ? "Glory" : "Agony"}</em></p>
      <h3 id="jets-play-heading">{archive.title}</h3>
      <p className={styles.storySituation}>{archive.situation}</p>
      <p className={styles.storyResult}>{archive.result}</p>
      <p className={styles.storySummary}>{archive.summary}</p>
      <div className={styles.storyActions}><button type="button" className={styles.watchButton} onClick={watchPlay} data-jets-watch><span aria-hidden="true">▶</span>Watch the play</button>{originalArchive ? null : <p>The board shows your edited copy of this play.</p>}</div>
    </div> : null}
    <details className={styles.archivePicker}><summary>Choose a Jets play <span>{jetsPlays.length} to pick from, glory and agony</span></summary><section className={styles.archive} aria-labelledby="jets-archive-heading">
      <header className={styles.archiveHeading}><div><span className={styles.kicker}>The Jets archive / {String(jetsPlays.length).padStart(2, "0")} snaps</span><h3 id="jets-archive-heading">Jets moments</h3></div><div className={styles.archiveFilters} role="group" aria-label="Filter Jets archive">{(["all", "great", "painful"] as const).map((filter) => <button key={filter} type="button" aria-pressed={archiveFilter === filter} onClick={() => setArchiveFilter(filter)}>{filter === "all" ? "Every snap" : filter === "great" ? "The glory" : "The agony"}</button>)}</div></header>
      <div className={styles.archiveCards}>{filteredArchive.map((play) => <button key={play.id} type="button" data-jets-play={play.id} aria-pressed={archive?.id === play.id} aria-label={`Load ${play.title}`} onClick={() => loadJetsPlay(play.id)}><span className={styles.archiveMeta}>{play.date.slice(0, 4)} · {play.opponent}<em>{play.category === "great" ? "Glory" : "Agony"}</em></span><strong>{play.title}</strong><span>{play.result}</span><small>{archive?.id === play.id ? originalArchive ? "Loaded / study diagram" : "Loaded / edited copy" : "Draw this play"}<span aria-hidden="true"> ↗</span></small></button>)}</div>
      <div className={styles.archiveFoot}><button type="button" onClick={() => { cancelDrag(); if (edit(createPlay(), "Teaching play loaded. Draw your own assignments; Undo restores the Jets study diagram.")) setSelectedId("x"); }}>Start a teaching play</button></div>
    </section></details>
    <div ref={stageRef} id="jets-play-stage" className={styles.stage}>
      <div className={styles.stageHeader}><div><span>{archive ? originalArchive ? "Chalkboard" : "Your edited copy" : "Teaching play"} · {seconds === 0 ? "At the snap" : running ? "Running" : "Paused"}</span><strong>{design.name}</strong></div><p><span data-lab-count="offense">{offense.length}</span> {archive?.jetsSide === "offense" ? "Jets" : archive ? archive.opponent : "offense"} <i aria-hidden="true">/</i> <span data-lab-count="defense">{defense.length}</span> {archive?.jetsSide === "defense" ? "Jets" : archive ? archive.opponent : "defense"}</p></div>
      <p className={styles.studyLabel} data-study-limit>{archive ? fullSnap ? `What ${nameList(sourcedNames)} ${sourcedNames.length === 1 ? "does" : "do"} comes from the record. The other ${illustrativeCount} players’ moves are illustrative supporting assignments, drawn to show the idea.` : `Only the recorded action is drawn. What the other players did on this snap is unknown, so they stand still.` : "A teaching diagram: pick a preset, change it, run it."}</p>
      <figure className={styles.figure}>
        <svg ref={fieldRef} role="group" viewBox={`0 0 ${FIELD.width} ${FIELD.height}`} className={`${styles.field} ${tool === "draw" ? styles.drawing : ""}`} aria-labelledby={`${id}-field-title ${id}-field-desc`} onClick={drawPoint} onKeyDown={(event) => { if (event.key === "Escape") cancelDrag(); }}>
          <title id={`${id}-field-title`}>Interactive football playbook</title><desc id={`${id}-field-desc`}>Eleven offensive and eleven defensive players. Offense moves upfield. Select a player to move its starting position or draw an assignment. The roster and coordinate forms provide the same controls without dragging.</desc>
          <defs><marker id={`${id}-offense-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#d2f66b" /></marker><marker id={`${id}-defense-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#9ae5e4" /></marker></defs>
          {fieldMarkings}
          {design.players.map((player) => player.path.length && (pathView === "all" || pathView === player.side || selected.id === player.id) ? <polyline key={`route-${player.id}`} points={pathString(drag?.id === player.id ? { ...player, ...drag.point } : player)} className={`${player.side === "offense" ? styles.offensePath : styles.defensePath} ${selected.id === player.id ? styles.selectedPath : ""}`} markerEnd={`url(#${id}-${player.side}-arrow)`} data-lab-path={player.id} /> : null)}
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
        <figcaption><span><i className={styles.offenseKey} />{archive?.jetsSide === "offense" ? "Jets offense" : archive ? `${archive.opponent} offense` : "Offense & route"}</span><span><i className={styles.defenseKey} />{archive?.jetsSide === "defense" ? "Jets defense" : archive ? `${archive.opponent} defense` : "Defense & assignment"}</span><span><i className={styles.eligibleKey} />Eligible receiver</span><span data-lab-alignment>{archive ? originalArchive ? "Starting spots are approximate" : "Your edited starting spots" : customAlignment ? "Custom alignment: check formation legality" : "Preset starting spots"}</span></figcaption>
      </figure>
      <details className={styles.positionKey} data-position-key><summary>What the letters mean</summary><dl>{positionKey.map(([code, meaning]) => <div key={code}><dt>{code}</dt><dd>{meaning}</dd></div>)}<div><dt><i className={styles.eligibleKey} /></dt><dd>eligible receiver: allowed to catch a forward pass</dd></div></dl></details>
      <div className={styles.playerSelect}><label>Selected player<select aria-label="Selected player" value={selected.id} onChange={(event) => selectPlayer(design.players.find((player) => player.id === event.target.value)!)}><optgroup label="Offense">{offense.map((player) => <option key={player.id} value={player.id}>{player.label}{player.eligible ? " · eligible" : ""}</option>)}</optgroup><optgroup label="Defense">{defense.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}</optgroup></select></label></div>
      <div className={styles.transport}>
        <div className={styles.playButtons}><button ref={playButtonRef} type="button" className={styles.playButton} onClick={togglePlayback} aria-label={running ? "Pause play" : "Run play"}><span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span>{running ? "Pause" : "Run play"}</button><button type="button" onClick={replay}>Replay</button><button type="button" onClick={() => { cancelDrag(); stopAtSnap(); }}>Back to snap</button></div>
        <label className={styles.timeline}>Play timeline <output>{seconds.toFixed(1)} / {FIELD.duration.toFixed(1)} sec</output><input type="range" min="0" max={FIELD.duration} step="0.05" value={seconds} aria-label="Play timeline" aria-valuetext={`${seconds.toFixed(2)} seconds of ${FIELD.duration}`} onChange={(event) => scrub(Number(event.target.value))} /></label>
        <label className={styles.speed}>Playback speed<select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
      </div>
      <details className={styles.diagramOptions}><summary>Diagram options</summary>{archive && study ? <div className={styles.studyMode}><div role="group" aria-label="Jets diagram mode"><button type="button" aria-pressed={fullSnap} onClick={() => loadJetsPlay(archive.id)}>Full-snap study</button><button type="button" aria-pressed={!fullSnap} onClick={() => loadJetsPlay(archive.id, "source-action")}>Source-supported action</button></div><p>{fullSnap ? `${movingPlayers} of 22 moving · illustrative supporting assignments` : "Source action · supporting assignments unknown"}</p></div> : null}
      <div className={styles.pathTools} role="group" aria-label="Show assignment paths">{(["selected", "all", "offense", "defense"] as const).map((view) => <button key={view} type="button" aria-pressed={pathView === view} onClick={() => setPathView(view)}>{view === "selected" ? "Selected player" : view === "all" ? "All assignments" : view === "offense" ? "Offense paths" : "Defense paths"}</button>)}</div>
      </details>
      {archive && originalArchive ? <div className={styles.moments}><p className={styles.momentsLabel}>Step through the play</p><div role="group" aria-label="Step through Jets play">{archive.moments.map((moment, at) => <button type="button" key={moment.at} aria-pressed={archiveMoment?.at === moment.at} onClick={() => scrub(moment.at)} data-jets-moment={moment.at}><span>{String(at + 1).padStart(2, "0")}</span>{moment.label}</button>)}</div><details className={styles.momentDetails}><summary>About this step</summary><p data-jets-moment-detail><strong>{archiveMoment?.label}</strong>{fullSnap ? archiveMoment?.detail.replace("Stationary defensive markers do not reproduce the coverage error.", "The supporting defensive movement is illustrative; each defender’s actual responsibility remains unverified.") : archiveMoment?.detail}</p><small>Steps use illustrative diagram time, not timestamps from the film.</small></details></div> : null}
      {archive && study ? <PlayerAssignments archive={archive} study={study} design={design} selected={selected} fullSnap={fullSnap} onSelect={selectPlayer} /> : null}
      <details className={styles.playbackDetails}><summary>Playback details</summary><p className={styles.playbackNote}>Movement follows the drawn paths over six diagram seconds. {fullSnap ? "Supporting assignments, spacing and timing are illustrative study choices, not verified from All-22 film. " : ""}Ball movement is illustrative. This is assignment playback, not film tracking, collision physics, or a prediction of who wins the play. No animation starts automatically.</p></details>
    </div>
    <div className={styles.deeper}><h3>Go deeper</h3><p>Sources, every player’s job, and tools to change the play or draw your own.</p></div>
    {archive ? <details className={styles.playFacts}><summary>Sources &amp; what’s illustrative</summary><article className={styles.archiveRecord} aria-labelledby="jets-play-heading">
      <div className={styles.archiveEvidence}><span className={styles.kicker}>{originalArchive ? fullSnap ? "22-player study / supporting assignments illustrative" : "Source-supported action / partial diagram" : "Edited study copy / source play below"} · Jets on {archive.jetsSide}</span><p>Template formations, routes, spacing and the six-second clock are editing aids. They do not establish the historical play call or actual player tracking.</p><details><summary>What the sources establish</summary><ul>{archive.confirmed.map((fact) => <li key={fact}>{fact}</li>)}</ul>{archive.filmObservations?.length ? <><h4>Observed in the source film</h4><ul>{archive.filmObservations.map((observation) => <li key={observation.offsetLabel}><strong>{observation.offsetLabel}.</strong> {observation.detail}</li>)}</ul></> : null}<h4>What remains illustrative</h4><ul>{archive.illustrative.filter((note) => !fullSnap || !note.includes("stationary")).map((note) => <li key={note}>{note}</li>)}{fullSnap ? <li>All supporting routes, protection, rush and coverage movement are illustrative study choices. No historical protection, coverage or blitz call has been verified.</li> : null}</ul></details><div className={styles.archiveSources}>{archive.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>)}</div>{!originalArchive ? <button type="button" onClick={() => loadJetsPlay(archive.id, fullSnap ? "full-snap" : "source-action")}>Restore source diagram</button> : null}</div>
    </article></details> : null}
    <p className={styles.status} role="status" aria-live="polite" data-lab-status>{notice}</p>
    <details className={styles.formationOptions}><summary>Formations &amp; concepts</summary><div className={styles.presets}>
      <label>Offensive formation<select aria-label="Offensive formation" value={design.offenseId} onChange={(event) => changeFormation("offense", event.target.value)}>{offensiveFormations.map((formation) => <option key={formation.id} value={formation.id}>{formation.label} · {formation.personnel}</option>)}</select><span>{offensiveFormation.description}</span></label>
      <label>Defensive front<select aria-label="Defensive front" value={design.defenseId} onChange={(event) => changeFormation("defense", event.target.value)}>{defensiveFormations.map((formation) => <option key={formation.id} value={formation.id}>{formation.label} · {formation.personnel}</option>)}</select><span>{defensiveFormation.description}</span></label>
      <label>Play concept<select aria-label="Play concept" value={design.conceptId} onChange={(event) => choosePreset(design.offenseId, design.defenseId, event.target.value)}>{concepts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span>{concept.description}</span></label>
    </div>
    <p className={styles.presetHelp}>{archive ? "These are teaching templates, not verified historical formations. " : ""}Changing a formation replaces that side’s assignments. A new play concept reloads both sides; Undo edit restores your previous design.</p></details>
    <details className={styles.editDrawer} onToggle={(event) => { if (!event.currentTarget.open) { cancelDrag(); setTool("move"); } }}><summary>Edit players &amp; ball</summary>
      <div className={styles.fieldTools}><div role="group" aria-label="Field tool"><button type="button" aria-pressed={tool === "move"} onClick={() => { cancelDrag(); setTool("move"); }}>Move players</button><button type="button" aria-pressed={tool === "draw"} onClick={() => { cancelDrag(); setTool("draw"); stopAtSnap(); }}>Draw assignment</button></div><p>{tool === "draw" ? `Click or tap the field to add points for ${selected.label}.` : "Select a player. Drag to move; arrow keys also work."}</p></div>
      <div className={styles.editor}>
      <section className={styles.playerEditor} aria-labelledby="lab-player-heading"><header><span className={styles.kicker}>The assignment desk</span><h3 id="lab-player-heading">{selected.label}<small>{selected.side} {selected.eligible ? "· eligible" : ""}</small></h3><span>{selected.path.length} / {MAX_POINTS} points</span></header>

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

      </section>
    </div><div className={styles.editActions}><button type="button" disabled={!undo.length} onClick={undoEdit}>Undo edit{undo.length ? ` (${undo.length})` : ""}</button><button type="button" onClick={() => choosePreset(design.offenseId, design.defenseId, design.conceptId)}>Reset preset</button></div></details>
    <details className={styles.saveDrawer}><summary>Save, share &amp; exchange</summary><div className={styles.designActions}><button type="button" onClick={saveLocal}>Save in browser</button><button type="button" onClick={loadLocal}>Load saved design</button><button type="button" onClick={exportDesign}>Export JSON</button><button type="button" onClick={shareDesign}>Copy diagram link</button></div>
        {shareUrl ? <label className={styles.shareLink}>Diagram link<input type="text" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /></label> : null}
        <p className={styles.editorHelp}>One saved design stays in this browser. Share links carry the design; JSON keeps a portable copy. Undo retains your last thirty edits during this visit.</p>
        <details className={styles.import}><summary>Import a playbook design</summary><label>Import JSON file<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importFile(file); }} /></label><label>Playbook JSON<textarea value={importText} maxLength={MAX_IMPORT_LENGTH} onChange={(event) => setImportText(event.target.value)} rows={5} placeholder="Paste a JSON design exported from this playbook." spellCheck={false} /></label><button type="button" onClick={importDesign} disabled={!importText.trim()}>Import JSON</button><p>Imports are checked for valid formations, player counts, field coordinates, and assignment limits before they replace this design.</p></details></details>
    {alignmentWarnings.length ? <aside className={styles.alignmentNotice} aria-label="Diagram alignment check"><strong>Check the custom alignment.</strong><ul>{alignmentWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p>This checks marker positions, not every NFL rule.</p></aside> : null}
    <details className={styles.methodsDrawer}><summary>How the board works</summary><footer className={styles.methods}><p><strong>Personnel is who. Formation is where.</strong> The same personnel can align in different formations. A defensive front does not establish the coverage or the number of rushers. Presets start with seven offensive players on the line and eligible ends; free editing can change their legality. These diagrams are independent teaching examples.</p><div><a href="https://operations.nfl.com/rules-officiating/nfl-football-basics/formations" target="_blank" rel="noreferrer">NFL formation guide ↗<span className="sr-only"> (opens in a new tab)</span></a><Link href="/how-made#playbook-methods">Playbook methods &amp; limits ↗</Link></div></footer></details>
  </section>;
}

// The study text and 22-position ledger change with edits or selection, not time.
const PlayerAssignments = memo(function PlayerAssignments({ archive, study, design, selected, fullSnap, onSelect }: {
  archive: JetsPlay;
  study: JetsStudy;
  design: PlayDesign;
  selected: PlaybookPlayer;
  fullSnap: boolean;
  onSelect: (player: PlaybookPlayer) => void;
}) {
  const selectedAssignment = study.assignments.find((assignment) => assignment.playerId === selected.id);
  const canonical = fullSnap ? study.design : archive.design;
  const selectedOriginalPlayer = canonical.players.find((player) => player.id === selected.id);
  const selectedAssignmentCustom = Boolean(selectedOriginalPlayer && !samePlayer(selected, selectedOriginalPlayer));
  return <details className={styles.assignmentDrawer}><summary>Player assignments</summary><section className={styles.snapDesk} aria-label="Player assignment study"><div className={styles.snapDeskHeading}><div><span>{fullSnap ? "THE COMPLETE SNAP / STUDY PLAN" : "SOURCE ACTION / SUPPORTING ASSIGNMENTS UNKNOWN"}</span><h4>Every position has a job.</h4></div><p>{study.assignments.filter((assignment) => assignment.basis === "source-supported").length} sourced actions <i aria-hidden="true">/</i> {study.assignments.filter((assignment) => assignment.basis === "illustrative").length} illustrative supporting assignments</p></div>
        {selectedAssignment ? <article className={styles.assignmentRead} data-selected-assignment={selected.id} data-assignment-custom={selectedAssignmentCustom}><div><span>{selectedAssignmentCustom ? "Your edited movement / original study note" : !fullSnap && selectedAssignment.basis === "illustrative" ? "Supporting assignment unknown / optional study choice" : selectedAssignment.basis === "source-supported" ? "Source-supported action / schematic movement" : "Illustrative study choice / actual assignment unverified"}</span><h5>{selected.label} <small>{selectedAssignment.role}</small></h5><strong>{selectedAssignment.action}</strong></div><p>{selectedAssignment.detail}{selectedAssignmentCustom ? " Your edits replace the movement described in this study plan." : ""}</p>{selectedAssignment.sourceLabels?.length ? <div className={styles.assignmentSources}>{selectedAssignment.sourceLabels.map((label) => { const source = archive.sources.find((item) => item.label === label); return source ? <a key={label} href={source.url} target="_blank" rel="noreferrer">{label} ↗<span className="sr-only"> (opens in a new tab)</span></a> : null; })}</div> : null}</article> : null}
        <details className={styles.snapLedger}><summary>All 22 assignments</summary><p>{fullSnap ? "Choose a position to isolate its path and read the study plan. Actual off-ball assignments have not been verified." : "These supporting study choices are available in Full-snap study. They are not established by the source-action diagram."}</p><div>{(["offense", "defense"] as const).map((side) => <section key={side} aria-label={`${side} study assignments`}><h5>{side === "offense" ? "Offense / protection & releases" : "Defense / rush & reaction"}</h5>{study.assignments.filter((assignment) => design.players.find((player) => player.id === assignment.playerId)?.side === side).map((assignment) => { const player = design.players.find((item) => item.id === assignment.playerId)!; return <button key={assignment.playerId} type="button" aria-pressed={selected.id === assignment.playerId} data-study-assignment={assignment.playerId} onClick={() => onSelect(player)}><span>{player.label}</span><strong>{assignment.action}</strong><small>{assignment.basis === "source-supported" ? "Sourced action" : "Study choice"}</small></button>; })}</section>)}</div></details>
        <details className={styles.snapQuestions}><summary>Questions to take back to the film</summary><p>{study.summary}</p><ol>{study.questions.map((question) => <li key={question}>{question}</li>)}</ol></details>
      </section></details>;
});
