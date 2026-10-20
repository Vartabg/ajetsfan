import type * as Three from "three";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { REPLAY, sampleActor, sampleBall, samplePose } from "./wilson-replay.mjs";
import { TEACHING } from "./wilson-teaching.mjs";

export type ReplayCamera = "sideline" | "endzone" | "overhead" | "quarterback";
export type ReplayCameraMove = "left" | "right" | "up" | "down" | "in" | "out";
export type ReplayInitialState = { time: number; selection: string; routes: boolean; labels: boolean; responsibilities: boolean; camera: ReplayCamera; following: boolean };

export interface ReplaySceneMetrics {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  frames: number;
  actors: number;
  pixelRatio: number;
  aspect: number;
  contextLost: boolean;
  pendingFrame: boolean;
  renderP95Ms: number;
}

export interface ReplayScene {
  setTime(time: number): void;
  setSelection(id: string): void;
  setRoutes(visible: boolean): void;
  setLabels(visible: boolean): void;
  setResponsibilities(visible: boolean): void;
  frameSelection(): void;
  setFollowSelection(visible: boolean): void;
  setCamera(preset: ReplayCamera): void;
  moveCamera(action: ReplayCameraMove): void;
  getMetrics(): ReplaySceneMetrics;
  dispose(): void;
}

type Actor = (typeof REPLAY.actors)[number];
type PlayerRig = {
  actor: Actor;
  root: Three.Group;
  torso: Three.Group;
  head: Three.Group;
  shadow: Three.Mesh;
  leftArm: Three.Group;
  rightArm: Three.Group;
  leftForearm: Three.Group;
  rightForearm: Three.Group;
  rightHand: Three.Mesh;
  leftLeg: Three.Group;
  rightLeg: Three.Group;
  leftShin: Three.Group;
  rightShin: Three.Group;
  leftFoot: Three.Group;
  rightFoot: Three.Group;
};

/** Original procedural artwork. Every player position is a teaching reconstruction. */
export async function createReplayScene(
  host: HTMLElement,
  callbacks: {
    onSelect?: (id: string) => void;
    onFailure?: (message: string) => void;
    initialState?: Partial<ReplayInitialState>;
  } = {},
): Promise<ReplayScene> {
  const buildStarted = performance.now();
  const geometries = new Set<Three.BufferGeometry>();
  const materials = new Set<Three.Material>();
  const textures = new Set<Three.Texture>();
  const fieldTextures = new Map<string, Three.Texture>();
  const instances = new Set<Three.InstancedMesh>();
  const cleanupListeners: (() => void)[] = [];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101e20");
  scene.fog = new THREE.Fog("#101e20", 88, 182);
  let disposed = false;
  let contextLost = false;
  let frameRequest = 0;
  let frames = 0;
  let time = 0;
  let selected = REPLAY.actors.some((actor) => actor.id === callbacks.initialState?.selection) ? callbacks.initialState!.selection! : "wilson";
  let lastWidth = 0;
  let lastHeight = 0;
  let cameraPreset: ReplayCamera = callbacks.initialState?.camera ?? "sideline";
  let labelsVisible = callbacks.initialState?.labels ?? true;
  let responsibilitiesVisible = callbacks.initialState?.responsibilities ?? false;
  let followSelection = callbacks.initialState?.following ?? false;
  let followAnchor: Three.Vector3 | null = null;
  const renderDurations: number[] = [];
  const releaseAt = REPLAY.events.find((event) => event.id === "release")?.at ?? 1.7;
  const catchAt = REPLAY.events.find((event) => event.id === "catch")?.at ?? 2.4;

  let renderer: Three.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default" });
  } catch (error) {
    throw new Error(`The 3D field could not start: ${error instanceof Error ? error.message : "WebGL is unavailable"}`);
  }
  function cleanup() {
    if (disposed) return;
    disposed = true;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    cleanupListeners.reverse().forEach((remove) => remove());
    instances.forEach((owned) => owned.dispose());
    scene.clear();
    geometries.forEach((owned) => owned.dispose());
    materials.forEach((owned) => owned.dispose());
    textures.forEach((owned) => owned.dispose());
    instances.clear();
    geometries.clear();
    materials.clear();
    textures.clear();
    fieldTextures.clear();
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  try {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-label", "Three-dimensional schematic of Garrett Wilson’s winning touchdown. All movement is inferred. Use the camera controls and the player list outside this image.");
  canvas.setAttribute("role", "img");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.25, 220);
  const controls = new OrbitControls(camera, canvas);
  cleanupListeners.push(() => controls.dispose());
  controls.enableDamping = false;
  controls.minDistance = 5;
  controls.maxDistance = 105;
  controls.maxPolarAngle = Math.PI / 2 - 0.035;
  controls.minPolarAngle = 0.035;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.55;
  controls.panSpeed = 0.65;
  controls.screenSpacePanning = false;
  controls.target.set(0, 0.6, 8);

  const geometry = <T extends Three.BufferGeometry>(value: T): T => {
    geometries.add(value);
    return value;
  };
  const material = <T extends Three.Material>(value: T): T => {
    materials.add(value);
    return value;
  };
  const standard = (color: Three.ColorRepresentation, roughness = 0.88) =>
    material(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
  const grassDark = standard("#235f47");
  const grassLight = standard("#296c51");
  const endZone = standard("#3b281d");
  const fieldWhite = material(new THREE.MeshBasicMaterial({ color: "#d7e8db" }));
  const goalYellow = standard("#f1c75a", 0.55);
  const stadiumMaterial = standard("#1d3031");
  const trimMaterial = standard("#405053");
  const whiteUniform = standard("#f1f0df");
  const greenUniform = standard("#0d503d");
  const brownUniform = standard("#522f24");
  const orangeHelmet = standard("#e46d29", 0.6);
  const darkTrim = standard("#172d2b");
  const brownTrim = standard("#291b17");
  const skin = standard("#b38160");
  const ballMaterial = standard("#814528");
  const whiteTrim = standard("#e4e4d8");
  const unitBox = geometry(new THREE.BoxGeometry(1, 1, 1));
  const limbGeometry = geometry(new THREE.CylinderGeometry(0.11, 0.095, 1, 7));
  const helmetGeometry = geometry(new THREE.SphereGeometry(0.238, 12, 9));
  const jointGeometry = geometry(new THREE.SphereGeometry(0.105, 7, 5));
  const shoeGeometry = geometry(new THREE.BoxGeometry(0.19, 0.13, 0.36));
  const groundCircle = geometry(new THREE.CircleGeometry(0.53, 24));
  const groundShadow = material(new THREE.MeshBasicMaterial({ color: "#062c22", transparent: true, opacity: 0.37, depthWrite: false }));

  function box(parent: Three.Object3D, mat: Three.Material, width: number, height: number, depth: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent: Three.Object3D, mat: Three.Material, start: Three.Vector3, finish: Three.Vector3, radius: number) {
    const mesh = new THREE.Mesh(limbGeometry, mat);
    const length = start.distanceTo(finish);
    mesh.scale.set(radius / 0.11, length, radius / 0.11);
    mesh.position.copy(start).add(finish).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), finish.clone().sub(start).normalize());
    parent.add(mesh);
    return mesh;
  }

  function textTexture(text: string, options: { background?: string; foreground?: string; width?: number; height?: number; fontSize?: number } = {}) {
    const element = document.createElement("canvas");
    element.width = options.width ?? 512;
    element.height = options.height ?? 128;
    const context = element.getContext("2d");
    if (!context) throw new Error("Canvas text is unavailable");
    context.clearRect(0, 0, element.width, element.height);
    if (options.background) {
      context.fillStyle = options.background;
      context.beginPath();
      context.roundRect(0, 0, element.width, element.height, 14);
      context.fill();
    }
    context.font = `700 ${options.fontSize ?? 53}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = options.foreground ?? "#edf4eb";
    const lines = text.split("\n");
    const lineHeight = element.height / lines.length;
    lines.forEach((line, index) => context.fillText(line, element.width / 2, lineHeight * (index + 0.5), element.width - 28));
    const texture = new THREE.CanvasTexture(element);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    textures.add(texture);
    return texture;
  }

  function fieldText(text: string, x: number, z: number, width: number, depth: number, rotation = 0, color = "#d7e8db") {
    const cacheKey = `${text}:${color}`;
    let texture = fieldTextures.get(cacheKey);
    if (!texture) {
      texture = textTexture(text, { foreground: color, ...( /^\d+$/.test(text) ? { width: 128, height: 128, fontSize: 96 } : {}) });
      fieldTextures.set(cacheKey, texture);
    }
    const mat = material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
    const mesh = new THREE.Mesh(geometry(new THREE.PlaneGeometry(width, depth)), mat);
    mesh.rotation.set(-Math.PI / 2, 0, rotation);
    mesh.position.set(x, 0.024, z);
    scene.add(mesh);
    return mesh;
  }

  scene.add(new THREE.HemisphereLight("#edf6f4", "#2b4537", 2.8));
  const keyLight = new THREE.DirectionalLight("#fff4d8", 3.5);
  cleanupListeners.push(() => keyLight.shadow.dispose());
  keyLight.position.set(-26, 44, -16);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -32;
  keyLight.shadow.camera.right = 32;
  keyLight.shadow.camera.top = 32;
  keyLight.shadow.camera.bottom = -22;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 120;
  keyLight.shadow.normalBias = 0.035;
  keyLight.target.position.set(0, 0, 9);
  scene.add(keyLight, keyLight.target);

  // Yard coordinates: Cleveland goal line z=0; Jets attack toward decreasing z.
  box(scene, grassDark, 69, 0.3, 141, 0, -0.19, 48).receiveShadow = true;
  for (let z = 0; z < 100; z += 5) {
    box(scene, z % 10 === 0 ? grassLight : grassDark, 53.333, 0.05, 5, 0, -0.018, z + 2.5).receiveShadow = true;
  }
  box(scene, endZone, 53.333, 0.05, 10, 0, -0.018, -5).receiveShadow = true;
  box(scene, greenUniform, 53.333, 0.05, 10, 0, -0.018, 105).receiveShadow = true;
  for (const x of [-26.667, 26.667]) box(scene, fieldWhite, 0.18, 0.02, 120, x, 0.02, 50);
  for (let z = 0; z <= 100; z += 5) {
    box(scene, fieldWhite, 53.333, z === 0 ? 0.035 : 0.018, z === 0 ? 0.24 : 0.09, 0, 0.02, z);
    if (z > 0 && z < 100 && z % 10 === 0) {
      const label = String(z <= 50 ? z : 100 - z);
      fieldText(label, -20.5, z, 2.7, 2.4, Math.PI / 2);
      fieldText(label, 20.5, z, 2.7, 2.4, -Math.PI / 2);
    }
  }
  for (let z = 1; z < 100; z++) {
    if (z % 5 === 0) continue;
    for (const x of [-26, -3.08, 3.08, 26]) box(scene, fieldWhite, 0.65, 0.017, 0.055, x, 0.022, z);
  }
  for (const z of [-10, 110]) box(scene, fieldWhite, 53.333, 0.025, 0.18, 0, 0.02, z);
  fieldText("CLEVELAND", 0, -5, 39, 5, Math.PI, "#f7d8b9");
  fieldText("NEW YORK", 0, 105, 35, 5);
  fieldText("GOAL LINE", 0, -0.85, 8.3, 0.75, Math.PI, "#f7e5b2");
  const losMaterial = material(new THREE.LineDashedMaterial({ color: "#f6cc6d", dashSize: 0.8, gapSize: 0.5, linewidth: 1 }));
  const firstDownMaterial = material(new THREE.LineDashedMaterial({ color: "#7ac9ef", dashSize: 0.45, gapSize: 0.6, transparent: true, opacity: 0.68 }));
  for (const [z, mat] of [[15, losMaterial], [5, firstDownMaterial]] as const) {
    const line = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-26.6, 0.055, z), new THREE.Vector3(26.6, 0.055, z)])), mat);
    line.computeLineDistances();
    scene.add(line);
  }
  fieldText("SNAP · CLE 15", 20, 16.1, 9.4, 1.0, 0, "#ffe3a0");
  fieldText("FIRST DOWN", 20, 6, 8, 0.8, 0, "#9cdaf5");

  // A quiet, original stadium surround gives scale without suggesting licensed footage.
  for (const side of [-1, 1]) {
    box(scene, trimMaterial, 1.3, 1.1, 128, side * 32.8, 0.3, 49);
    for (let tier = 0; tier < 6; tier++) {
      box(scene, stadiumMaterial, 4, 0.9, 126, side * (36 + tier * 3.1), 1.1 + tier * 1.8, 49);
      box(scene, trimMaterial, 3.6, 0.08, 125, side * (36 + tier * 3.1), 1.59 + tier * 1.8, 49);
    }
  }
  for (let tier = 0; tier < 5; tier++) {
    box(scene, stadiumMaterial, 67 + tier * 5, 1.2, 3.6, 0, 1.2 + tier * 1.7, -19 - tier * 3);
  }
  const goal = new THREE.Group();
  cylinder(goal, goalYellow, new THREE.Vector3(0, 0, -13), new THREE.Vector3(0, 3.45, -13), 0.12);
  cylinder(goal, goalYellow, new THREE.Vector3(0, 3.45, -13), new THREE.Vector3(0, 3.45, -10), 0.12);
  cylinder(goal, goalYellow, new THREE.Vector3(-3.08, 3.45, -10), new THREE.Vector3(3.08, 3.45, -10), 0.08);
  for (const x of [-3.08, 3.08]) cylinder(goal, goalYellow, new THREE.Vector3(x, 3.45, -10), new THREE.Vector3(x, 9.5, -10), 0.075);
  scene.add(goal);
  for (const x of [-26.4, 26.4]) {
    for (const z of [0, -10]) box(scene, orangeHelmet, 0.16, 0.55, 0.16, x, 0.275, z);
  }

  // The hundreds of repeated field marks and terrace blocks share a few draws.
  const staticBoxes = new Map<Three.Material, Three.Mesh[]>();
  for (const child of [...scene.children]) {
    if (!(child instanceof THREE.Mesh) || child.geometry !== unitBox || Array.isArray(child.material)) continue;
    const batch = staticBoxes.get(child.material) ?? [];
    batch.push(child);
    staticBoxes.set(child.material, batch);
  }
  for (const [mat, meshes] of staticBoxes) {
    const batch = new THREE.InstancedMesh(unitBox, mat, meshes.length);
    instances.add(batch);
    meshes.forEach((mesh, index) => {
      mesh.updateMatrix();
      batch.setMatrixAt(index, mesh.matrix);
      scene.remove(mesh);
    });
    batch.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
    batch.computeBoundingSphere();
    scene.add(batch);
  }

  function limb(parent: Three.Group, mat: Three.Material, x: number, y: number, length: number, foreLength: number, isLeg: boolean) {
    const joint = new THREE.Group();
    joint.position.set(x, y, 0);
    const upper = new THREE.Mesh(limbGeometry, mat);
    upper.scale.set(isLeg ? 1.25 : 1, length, isLeg ? 1.25 : 1);
    upper.position.y = -length / 2;
    upper.castShadow = true;
    joint.add(upper);
    const lowerJoint = new THREE.Group();
    lowerJoint.position.y = -length;
    const lower = new THREE.Mesh(limbGeometry, isLeg ? mat : skin);
    lower.scale.set(isLeg ? 1.02 : 0.81, foreLength, isLeg ? 1.02 : 0.81);
    lower.position.y = -foreLength / 2;
    lower.castShadow = true;
    lowerJoint.add(lower);
    let hand: Three.Mesh | null = null;
    let foot: Three.Group | null = null;
    if (isLeg) {
      foot = new THREE.Group();
      foot.position.y = -foreLength;
      const shoe = new THREE.Mesh(shoeGeometry, darkTrim);
      shoe.position.set(0, 0.01, 0.085);
      foot.add(shoe);
      lowerJoint.add(foot);
      box(lowerJoint, whiteTrim, 0.16, 0.12, 0.17, 0, -foreLength + 0.15, 0);
    } else {
      hand = new THREE.Mesh(jointGeometry, whiteTrim);
      hand.scale.set(0.75, 1, 0.8);
      hand.position.y = -foreLength;
      lowerJoint.add(hand);
    }
    joint.add(lowerJoint);
    parent.add(joint);
    return { joint, lowerJoint, hand, foot };
  }

  function createPlayer(actor: Actor): PlayerRig {
    const root = new THREE.Group();
    root.userData.actorId = actor.id;
    const offense = actor.team === "NYJ";
    const jersey = offense ? whiteUniform : brownUniform;
    const pants = whiteUniform;
    const trim = offense ? greenUniform : whiteTrim;
    const torso = new THREE.Group();
    torso.position.y = 0.98;
    root.add(torso);
    const chest = box(torso, jersey, 0.67, 0.58, 0.36, 0, 0.3, 0);
    chest.castShadow = true;
    box(torso, jersey, 0.86, 0.25, 0.42, 0, 0.52, 0).castShadow = true;
    box(torso, pants, 0.47, 0.19, 0.32, 0, -0.02, 0);
    box(torso, darkTrim, 0.5, 0.075, 0.35, 0, 0.025, 0);
    // Jersey stripes, helmet and open face mask read as football at field scale.
    for (const x of [-0.405, 0.405]) box(torso, trim, 0.035, 0.15, 0.43, x, 0.48, 0);
    const neck = new THREE.Mesh(jointGeometry, skin);
    neck.position.set(0, 0.67, 0.015);
    torso.add(neck);
    const head = new THREE.Group();
    head.position.set(0, 0.84, 0.02);
    torso.add(head);
    const helmet = new THREE.Mesh(helmetGeometry, offense ? greenUniform : orangeHelmet);
    helmet.castShadow = true;
    head.add(helmet);
    box(head, skin, 0.245, 0.23, 0.11, 0, -0.05, 0.2);
    const maskMaterial = offense ? darkTrim : brownTrim;
    for (const y of [-0.11, 0.02]) cylinder(head, maskMaterial, new THREE.Vector3(-0.16, y, 0.27), new THREE.Vector3(0.16, y, 0.27), 0.019);
    for (const x of [-0.17, 0.17]) cylinder(head, maskMaterial, new THREE.Vector3(x, -0.16, 0.25), new THREE.Vector3(x, 0.06, 0.25), 0.018);
    box(head, trim, 0.055, 0.019, 0.365, 0, 0.229, 0);
    const leftArm = limb(torso, jersey, 0.43, 0.51, 0.31, 0.3, false);
    const rightArm = limb(torso, jersey, -0.43, 0.51, 0.31, 0.3, false);
    const leftLeg = limb(root, pants, 0.17, 0.87, 0.42, 0.4, true);
    const rightLeg = limb(root, pants, -0.17, 0.87, 0.42, 0.4, true);
    if (actor.number !== null && actor.number !== undefined) {
      const texture = textTexture(String(actor.number), { foreground: "#0b4938", width: 128, height: 128, fontSize: 104 });
      const numberMaterial = material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
      for (const front of [-1, 1]) {
        const number = new THREE.Mesh(geometry(new THREE.PlaneGeometry(0.33, 0.34)), numberMaterial);
        number.position.set(0, 0.3, front * 0.186);
        if (front < 0) number.rotation.y = Math.PI;
        torso.add(number);
      }
    }
    const shadow = new THREE.Mesh(groundCircle, groundShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    root.add(shadow);
    root.traverse((child) => { child.userData.actorId = actor.id; });
    scene.add(root);
    return { actor, root, torso, head, shadow, leftArm: leftArm.joint, rightArm: rightArm.joint, leftForearm: leftArm.lowerJoint, rightForearm: rightArm.lowerJoint, rightHand: rightArm.hand!, leftLeg: leftLeg.joint, rightLeg: rightLeg.joint, leftShin: leftLeg.lowerJoint, rightShin: rightLeg.lowerJoint, leftFoot: leftLeg.foot!, rightFoot: rightLeg.foot! };
  }

  const rigs = REPLAY.actors.map(createPlayer);
  // Retain the articulated hierarchy for posing and hit testing; render shared
  // geometry/material combinations together instead of one draw per body part.
  const playerParts = new Map<string, Three.Mesh[]>();
  for (const rig of rigs) {
    rig.root.traverse((part) => {
      if (!(part instanceof THREE.Mesh) || Array.isArray(part.material)) return;
      const key = `${part.geometry.uuid}:${part.material.uuid}`;
      const parts = playerParts.get(key) ?? [];
      parts.push(part);
      playerParts.set(key, parts);
    });
    rig.root.visible = false;
  }
  const playerBatches: { mesh: Three.InstancedMesh; parts: Three.Mesh[] }[] = [];
  for (const parts of playerParts.values()) {
    const mesh = new THREE.InstancedMesh(parts[0].geometry, parts[0].material, parts.length);
    mesh.castShadow = parts.some((part) => part.castShadow);
    mesh.receiveShadow = parts.some((part) => part.receiveShadow);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // This tiny, bounded field scene deliberately avoids stale animated bounds.
    mesh.frustumCulled = false;
    instances.add(mesh);
    scene.add(mesh);
    playerBatches.push({ mesh, parts });
  }
  const selectedMaterial = material(new THREE.MeshBasicMaterial({ color: "#f5d55e", transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  const selectionRing = new THREE.Mesh(geometry(new THREE.RingGeometry(0.68, 0.77, 40)), selectedMaterial);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.045;
  scene.add(selectionRing);
  const wilsonHalo = new THREE.Mesh(geometry(new THREE.RingGeometry(0.87, 0.91, 40)), material(new THREE.MeshBasicMaterial({ color: "#9de86a", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })));
  wilsonHalo.rotation.x = -Math.PI / 2;
  wilsonHalo.position.y = 0.04;
  scene.add(wilsonHalo);

  let selectionLabelTexture: Three.Texture | undefined;
  const selectionLabelMaterial = material(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
  const selectionLabel = new THREE.Sprite(selectionLabelMaterial);
  selectionLabel.visible = false;
  selectionLabel.scale.set(7.8, 1.35, 1);
  selectionLabel.renderOrder = 10;
  scene.add(selectionLabel);

  function updateSelectionLabel() {
    const actor = REPLAY.actors.find((candidate) => candidate.id === selected) ?? REPLAY.actors[0];
    selected = actor.id;
    const title = actor.number !== null && actor.number !== undefined ? `${actor.name} · #${actor.number}` : `${actor.team} · ${actor.role}`;
    const texture = textTexture(`${title.toUpperCase()}\nINFERRED POSITION`, { background: "#10251eea", foreground: "#edffd7", width: 640, height: 128, fontSize: 34 });
    const oldTexture = selectionLabelTexture;
    selectionLabelTexture = texture;
    selectionLabelMaterial.map = texture;
    selectionLabelMaterial.needsUpdate = true;
    if (oldTexture) {
      oldTexture.dispose();
      textures.delete(oldTexture);
    }
  }
  updateSelectionLabel();

  const labelOverlay = document.createElement("div");
  labelOverlay.setAttribute("aria-hidden", "true");
  labelOverlay.dataset.replayLabels = "true";
  Object.assign(labelOverlay.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden", zIndex: "2" });
  const originalHostPosition = host.style.position;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.appendChild(labelOverlay);
  cleanupListeners.push(() => { labelOverlay.remove(); host.style.position = originalHostPosition; });
  const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  Object.assign(leaders.style, { position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible" });
  labelOverlay.appendChild(leaders);
  const roleLabels = TEACHING.players.map((player) => {
    const actor = REPLAY.actors.find((candidate) => candidate.id === player.id)!;
    const element = document.createElement("div");
    element.textContent = actor.number ? `${player.code} ${actor.number}` : player.code;
    element.dataset.actorId = player.id;
    element.title = `${player.position} · authored role and movement`;
    Object.assign(element.style, { position: "absolute", height: "23px", minWidth: "34px", padding: "3px 6px", borderRadius: "4px", border: "1px solid", font: "800 11px/15px system-ui, sans-serif", textAlign: "center", whiteSpace: "nowrap", boxSizing: "border-box", boxShadow: "0 1px 4px #0009" });
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leader.setAttribute("stroke-width", "1");
    leaders.appendChild(leader);
    labelOverlay.appendChild(element);
    return { player, actor, element, leader };
  });

  const responsibilityGroup = new THREE.Group();
  scene.add(responsibilityGroup);
  const relatedRings = new Map<string, Three.Mesh>();
  const relatedGeometry = geometry(new THREE.RingGeometry(0.62, 0.69, 28));
  const relatedMaterials = {
    NYJ: material(new THREE.MeshBasicMaterial({ color: "#84d6b0", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })),
    CLE: material(new THREE.MeshBasicMaterial({ color: "#efb487", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })),
  };
  for (const actor of REPLAY.actors) {
    const ring = new THREE.Mesh(relatedGeometry, relatedMaterials[actor.team]);
    ring.rotation.x = -Math.PI / 2;
    responsibilityGroup.add(ring);
    relatedRings.set(actor.id, ring);
  }
  const relationshipLines = TEACHING.relationships.map((relationship) => {
    const points = geometry(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
    points.setAttribute("lineDistance", new THREE.Float32BufferAttribute([0, 0], 1));
    const color = relationship.kind === "coverage" ? "#efb487" : relationship.kind === "protection" ? "#84d6b0" : "#e9d78a";
    const mat = material(new THREE.LineDashedMaterial({ color, dashSize: relationship.kind === "coverage" ? 0.22 : 0.55, gapSize: 0.32, transparent: true, opacity: 0.6, depthWrite: false }));
    const line = new THREE.Line(points, mat);
    responsibilityGroup.add(line);
    return { relationship, line, mat };
  });
  responsibilityGroup.visible = responsibilitiesVisible;

  const routes = new THREE.Group();
  routes.visible = callbacks.initialState?.routes ?? true;
  scene.add(routes);
  const wilson = REPLAY.actors.find((actor) => actor.id === "wilson") ?? REPLAY.actors.find((actor) => actor.number === "17");
  if (wilson) {
    const routePoints: Three.Vector3[] = [];
    for (let step = 0; step <= 100; step++) {
      const position = sampleActor(wilson, (step / 100) * REPLAY.duration);
      routePoints.push(new THREE.Vector3(position.x, 0.085, position.z));
    }
    const routeLine = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(routePoints)), material(new THREE.LineDashedMaterial({ color: "#b6ef87", dashSize: 0.6, gapSize: 0.32, transparent: true, opacity: 0.9 })));
    routeLine.computeLineDistances();
    routes.add(routeLine);
    const last = routePoints.at(-1)!;
    const arrow = new THREE.Mesh(geometry(new THREE.ConeGeometry(0.32, 0.85, 3)), selectedMaterial);
    arrow.position.copy(last).setY(0.1);
    arrow.rotation.x = -Math.PI / 2;
    routes.add(arrow);
  }
  const flightPoints: Three.Vector3[] = [];
  for (let step = 0; step <= 32; step++) {
    const position = sampleBall(releaseAt + (step / 32) * (catchAt - releaseAt));
    flightPoints.push(new THREE.Vector3(position.x, position.y, position.z));
  }
  const ballArc = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(flightPoints)), material(new THREE.LineDashedMaterial({ color: "#f4ce7d", dashSize: 0.22, gapSize: 0.23, transparent: true, opacity: 0.7 })));
  ballArc.computeLineDistances();
  routes.add(ballArc);

  const eligibleIds = ["x", "z", "y", "rb"];
  for (const actor of REPLAY.actors.filter((candidate) => eligibleIds.includes(candidate.id))) {
    const points = Array.from({ length: 81 }, (_, index) => {
      const position = sampleActor(actor, (index / 80) * REPLAY.duration);
      return new THREE.Vector3(position.x, 0.07, position.z);
    });
    const line = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(points)), material(new THREE.LineDashedMaterial({ color: "#8dc7ac", dashSize: 0.42, gapSize: 0.35, transparent: true, opacity: 0.55 })));
    line.computeLineDistances();
    routes.add(line);
  }
  const selectedPathGeometry = geometry(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 81 }, () => new THREE.Vector3())));
  selectedPathGeometry.setAttribute("lineDistance", new THREE.Float32BufferAttribute(new Float32Array(81), 1));
  const selectedPath = new THREE.Line(selectedPathGeometry, material(new THREE.LineDashedMaterial({ color: "#f5d55e", dashSize: 0.5, gapSize: 0.25, transparent: true, opacity: 0.92 })));
  const selectedTrailGeometry = geometry(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 81 }, () => new THREE.Vector3())));
  const selectedTrail = new THREE.Line(selectedTrailGeometry, material(new THREE.LineBasicMaterial({ color: "#ffe38b", transparent: true, opacity: 0.92 })));
  routes.add(selectedPath, selectedTrail);

  const ball = new THREE.Group();
  const football = new THREE.Mesh(geometry(new THREE.SphereGeometry(1, 10, 7)), ballMaterial);
  football.scale.set(0.12, 0.12, 0.205);
  football.castShadow = true;
  ball.add(football);
  for (let i = -2; i <= 2; i++) box(ball, whiteTrim, 0.09, 0.012, 0.017, 0, 0.115, i * 0.036);
  scene.add(ball);

  function reachArm(rig: PlayerRig, side: "left" | "right", target: Three.Vector3, weight = 1) {
    // Two-bone IK changes authored posing, never the evidence or ball model.
    rig.torso.updateWorldMatrix(true, false);
    const arm = side === "left" ? rig.leftArm : rig.rightArm;
    const forearm = side === "left" ? rig.leftForearm : rig.rightForearm;
    const shoulder = arm.position.clone();
    const destination = rig.torso.worldToLocal(target.clone());
    const direction = destination.clone().sub(shoulder);
    const distance = THREE.MathUtils.clamp(direction.length(), 0.011, 0.6099);
    direction.normalize();
    destination.copy(shoulder).addScaledVector(direction, distance);
    const along = (0.31 ** 2 - 0.3 ** 2 + distance ** 2) / (2 * distance);
    const bend = new THREE.Vector3(0, -1, 0).addScaledVector(direction, direction.y);
    if (bend.lengthSq() < 0.001) bend.set(0, 0, 1).addScaledVector(direction, -direction.z);
    bend.normalize().multiplyScalar(Math.sqrt(Math.max(0, 0.31 ** 2 - along ** 2)));
    const elbow = shoulder.clone().addScaledVector(direction, along).add(bend);
    const upperRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), elbow.clone().sub(shoulder).normalize());
    const lowerDirection = destination.sub(elbow).normalize().applyQuaternion(upperRotation.clone().invert());
    const lowerRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), lowerDirection);
    arm.quaternion.slerp(upperRotation, weight);
    forearm.quaternion.slerp(lowerRotation, weight);
  }

  function placeLeg(rig: PlayerRig, side: "left" | "right", target: Three.Vector3, footYaw: number) {
    const leg = side === "left" ? rig.leftLeg : rig.rightLeg;
    const shin = side === "left" ? rig.leftShin : rig.rightShin;
    const foot = side === "left" ? rig.leftFoot : rig.rightFoot;
    rig.root.updateWorldMatrix(true, false);
    const hip = leg.position.clone();
    const destination = rig.root.worldToLocal(target.clone());
    const direction = destination.clone().sub(hip);
    const distance = THREE.MathUtils.clamp(direction.length(), 0.05, 0.8199);
    direction.normalize();
    destination.copy(hip).addScaledVector(direction, distance);
    const along = (0.42 ** 2 - 0.4 ** 2 + distance ** 2) / (2 * distance);
    // Knees flex toward the player's front; stance feet remain on the ground.
    const bend = new THREE.Vector3(0, 0, 1).addScaledVector(direction, -direction.z).normalize();
    const knee = hip.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, 0.42 ** 2 - along ** 2)));
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), knee.clone().sub(hip).normalize());
    const lower = destination.sub(knee).normalize().applyQuaternion(leg.quaternion.clone().invert());
    shin.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lower);
    shin.updateWorldMatrix(true, false);
    const parentRotation = shin.getWorldQuaternion(new THREE.Quaternion());
    const groundedRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), footYaw);
    foot.quaternion.copy(parentRotation.invert().multiply(groundedRotation));
  }

  function blendJoint(joint: Three.Object3D, x: number, y: number, z: number, weight: number) {
    joint.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)), weight);
  }

  function sampleFoot(rig: PlayerRig, motion: ReturnType<typeof samplePose>, side: "left" | "right") {
    const cadence = Math.max(0.8, motion.cadence);
    const cycle = motion.stridePhase + (side === "left" ? 0 : 0.5);
    const phase = cycle - Math.floor(cycle);
    const plantTime = time - phase / cadence;
    const sideSign = side === "left" ? 1 : -1;
    const width = motion.roleFamily === "blocker" || motion.roleFamily === "rusher" ? 0.24 : 0.17;
    const anchor = (at: number) => {
      const position = sampleActor(rig.actor, at);
      const facing = samplePose(rig.actor, at).facingYaw;
      const before = sampleActor(rig.actor, Math.max(0, at) - 0.03);
      const after = sampleActor(rig.actor, Math.max(0, at) + 0.15 / cadence);
      const direction = new THREE.Vector3(after.x - before.x, 0, after.z - before.z);
      if (direction.lengthSq() > 0.00001) direction.normalize();
      const cycleSpeed = Math.max(position.speed, sampleActor(rig.actor, at + 0.5 / cadence).speed, sampleActor(rig.actor, at + 1 / cadence).speed);
      // At most .66 yards of body travel per planted interval keeps the ankle
      // reachable with .82-yard legs, including an accelerating first step.
      const stance = THREE.MathUtils.clamp(0.66 * cadence / Math.max(0.1, cycleSpeed), 0.10, 0.72);
      const lead = Math.min(0.33, cycleSpeed * stance / (2 * cadence));
      return { point: new THREE.Vector3(position.x + Math.cos(facing) * width * sideSign + direction.x * lead, 0.07, position.z - Math.sin(facing) * width * sideSign + direction.z * lead), yaw: facing, stance };
    };
    const from = anchor(plantTime);
    const stance = from.stance;
    if (phase < stance) return { ...from, planted: true };
    const to = anchor(plantTime + 1 / cadence);
    const progress = (phase - stance) / (1 - stance);
    const eased = progress * progress * (3 - 2 * progress);
    from.point.lerp(to.point, eased);
    const lift = motion.roleFamily === "blocker" ? 0.11 : motion.roleFamily === "quarterback" ? 0.13 : motion.roleFamily === "rusher" ? 0.22 : 0.32;
    from.point.y += Math.sin(progress * Math.PI) * lift * motion.gait;
    const yawDelta = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
    return { ...from, yaw: from.yaw + yawDelta * eased, planted: false };
  }

  function sizeSelectionLabel() {
    camera.updateMatrixWorld();
    const depth = Math.max(1, -selectionLabel.position.clone().applyMatrix4(camera.matrixWorldInverse).z);
    const unitsPerPixel = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, lastHeight);
    const width = Math.min(190, Math.max(120, lastWidth * 0.48));
    selectionLabel.scale.set(width * unitsPerPixel, width * 0.2 * unitsPerPixel, 1);
  }

  function relatedActors() {
    const ids = new Set<string>([selected]);
    if (responsibilitiesVisible) {
      for (const relationship of TEACHING.relationships) {
        if (relationship.from === selected) ids.add(relationship.to);
        if (relationship.to === selected) ids.add(relationship.from);
      }
    }
    return ids;
  }

  function updateTeachingGeometry() {
    const connected = relatedActors();
    if (responsibilitiesVisible) {
    for (const actor of REPLAY.actors) {
      const pose = sampleActor(actor, time);
      const ring = relatedRings.get(actor.id)!;
      ring.position.set(pose.x, 0.05, pose.z);
      ring.visible = actor.id !== selected && connected.has(actor.id);
    }
    for (const { relationship, line, mat } of relationshipLines) {
      const from = sampleActor(relationship.from, time);
      const to = sampleActor(relationship.to, time);
      const points = line.geometry.getAttribute("position") as Three.BufferAttribute;
      points.setXYZ(0, from.x, 0.22, from.z);
      points.setXYZ(1, to.x, 0.22, to.z);
      points.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      const distances = line.geometry.getAttribute("lineDistance") as Three.BufferAttribute;
      distances.setX(1, Math.hypot(to.x - from.x, to.z - from.z));
      distances.needsUpdate = true;
      mat.opacity = relationship.from === selected || relationship.to === selected ? 0.9 : 0.23;
    }
    }
    if (!routes.visible) return;
    const pathPositions = selectedPathGeometry.getAttribute("position") as Three.BufferAttribute;
    const trailPositions = selectedTrailGeometry.getAttribute("position") as Three.BufferAttribute;
    const pathDistances = selectedPathGeometry.getAttribute("lineDistance") as Three.BufferAttribute;
    let previous = sampleActor(selected, 0);
    let distance = 0;
    for (let index = 0; index <= 80; index++) {
      const full = sampleActor(selected, (index / 80) * REPLAY.duration);
      const past = sampleActor(selected, (index / 80) * time);
      pathPositions.setXYZ(index, full.x, 0.12, full.z);
      trailPositions.setXYZ(index, past.x, 0.135, past.z);
      distance += Math.hypot(full.x - previous.x, full.z - previous.z);
      pathDistances.setX(index, distance);
      previous = full;
    }
    pathPositions.needsUpdate = true;
    trailPositions.needsUpdate = true;
    pathDistances.needsUpdate = true;
    selectedPathGeometry.computeBoundingSphere();
    selectedTrailGeometry.computeBoundingSphere();
  }

  function updateRoleLabels() {
    labelOverlay.style.display = labelsVisible ? "block" : "none";
    const connected = relatedActors();
    const placed: { left: number; top: number; width: number; height: number }[] = [];
    const anchors: Record<string, { x: number; y: number }> = {};
    let visibleCount = 0;
    const labelOrder = [...roleLabels].sort((a, b) => Number(b.actor.id === selected) - Number(a.actor.id === selected));
    for (const label of labelOrder) {
      const pose = sampleActor(label.actor, time);
      const labelHeight = label.player.unit === "offense" ? 0.05 : 2.1;
      const projected = new THREE.Vector3(pose.x, labelHeight, pose.z).project(camera);
      const anchorX = (projected.x * 0.5 + 0.5) * lastWidth;
      const anchorY = (-projected.y * 0.5 + 0.5) * lastHeight;
      const pickPoint = new THREE.Vector3(pose.x, 1.35, pose.z).project(camera);
      anchors[label.actor.id] = { x: Number(((pickPoint.x * 0.5 + 0.5) * lastWidth).toFixed(2)), y: Number(((-pickPoint.y * 0.5 + 0.5) * lastHeight).toFixed(2)) };
      const onScreen = projected.z >= -1 && projected.z <= 1 && anchorX > -30 && anchorX < lastWidth + 30 && anchorY > -20 && anchorY < lastHeight + 30;
      label.element.style.display = onScreen ? "block" : "none";
      label.leader.style.display = onScreen ? "block" : "none";
      if (!labelsVisible || !onScreen) continue;
      visibleCount++;
      const isSelected = label.actor.id === selected;
      const isRelated = connected.has(label.actor.id);
      const color = isSelected ? "#fff1ad" : label.actor.team === "NYJ" ? "#b9efda" : "#f4c6a2";
      const background = isSelected ? "#f4d568" : label.actor.team === "NYJ" ? "#102e27ee" : "#3d271fee";
      label.element.style.color = isSelected ? "#242719" : color;
      label.element.style.background = background;
      label.element.style.borderColor = color;
      label.element.style.borderWidth = isRelated ? "2px" : "1px";
      label.element.dataset.selected = String(isSelected);
      label.element.dataset.related = String(isRelated && !isSelected);
      const width = label.actor.number ? 52 : Math.max(35, label.player.code.length * 7 + 13);
      label.element.style.width = `${width}px`;
      const preferredDy = label.player.unit === "offense" ? 2 : -29;
      const verticalOffsets = label.player.unit === "offense" ? [2, 27, 52, -23, 77, -48, -73] : [-29, -54, -79, -104, -4, 21, 46];
      let best = { left: anchorX - width / 2, top: anchorY + preferredDy, width, height: 23 };
      let bestScore = Infinity;
      for (const dy of verticalOffsets) {
        for (const dx of [0, -43, 43, -86, 86]) {
          const candidate = { left: THREE.MathUtils.clamp(anchorX - width / 2 + dx, 5, Math.max(5, lastWidth - width - 5)), top: THREE.MathUtils.clamp(anchorY + dy, 42, Math.max(42, lastHeight - 28)), width, height: 23 };
          const overlaps = placed.reduce((sum, other) => {
            const x = Math.max(0, Math.min(candidate.left + width + 3, other.left + other.width + 3) - Math.max(candidate.left - 3, other.left - 3));
            const y = Math.max(0, Math.min(candidate.top + 26, other.top + other.height + 3) - Math.max(candidate.top - 3, other.top - 3));
            return sum + x * y;
          }, 0);
          const score = overlaps * 500 + Math.abs(dx) * 1.2 + Math.abs(dy - preferredDy) * 1.4;
          if (score < bestScore) { best = candidate; bestScore = score; }
        }
      }
      placed.push(best);
      label.element.style.left = `${best.left}px`;
      label.element.style.top = `${best.top}px`;
      label.leader.setAttribute("x1", String(anchorX));
      label.leader.setAttribute("y1", String(anchorY));
      label.leader.setAttribute("x2", String(best.left + width / 2));
      label.leader.setAttribute("y2", String(best.top > anchorY ? best.top : best.top + 23));
      label.leader.setAttribute("stroke", color);
      label.leader.setAttribute("opacity", isRelated ? "0.95" : "0.65");
    }
    canvas.dataset.labelCount = String(visibleCount);
    canvas.dataset.labelsVisible = String(labelsVisible);
    canvas.dataset.playerAnchors = JSON.stringify(anchors);
    canvas.dataset.responsibilitiesVisible = String(responsibilityGroup.visible);
    canvas.dataset.responsibilityCount = String(responsibilityGroup.visible ? relationshipLines.filter(({ line }) => line.visible).length : 0);
    canvas.dataset.routesVisible = String(routes.visible);
    canvas.dataset.routeCount = String(routes.visible ? routes.children.filter((child) => child instanceof THREE.Line && child.visible).length : 0);
    canvas.dataset.movementActorCount = String(routes.visible ? new Set(["wilson", ...eligibleIds, selected]).size : 0);
    canvas.dataset.selectedActor = selected;
    canvas.dataset.selectedHighlight = String(selectionRing.visible);
    canvas.dataset.highlightedActors = [...connected].join(",");
    canvas.dataset.followSelection = String(followSelection);
    const selectedPose = sampleActor(selected, time);
    canvas.dataset.selectedAnchor = [selectedPose.x, 0.8, selectedPose.z].map((value) => value.toFixed(3)).join(",");
  }

  function applyTime(value: number) {
    const poseStarted = performance.now();
    time = Math.max(0, Math.min(REPLAY.duration, Number.isFinite(value) ? value : 0));
    const ballPose = sampleBall(time);
    const ballTarget = new THREE.Vector3(ballPose.x, ballPose.y, ballPose.z);
    const actionDiagnostics: Record<string, unknown> = {};
    for (const rig of rigs) {
      const pose = sampleActor(rig.actor, time);
      const motion = samplePose(rig.actor, time);
      const phase = motion.stridePhase * Math.PI * 2;
      const lineFamily = motion.roleFamily === "blocker" || motion.roleFamily === "rusher";
      const contactWeight = lineFamily ? Math.max(motion.engagement, (1 - THREE.MathUtils.smoothstep(time, 0, 0.8)) * 0.55, motion.roleFamily === "blocker" ? 0.55 * (1 - THREE.MathUtils.smoothstep(time, 3.5, 4.3)) : 0) : 0;
      const direction = new THREE.Vector3(pose.vx, 0, pose.vz);
      const forwardness = direction.lengthSq() > 0.00001 ? (1 + direction.normalize().dot(new THREE.Vector3(Math.sin(motion.facingYaw), 0, Math.cos(motion.facingYaw)))) / 2 : 1;
      const walkingHeight = motion.roleFamily === "quarterback" ? -0.035 : -0.035 - (0.06 + 0.055 * forwardness) * motion.gait;
      const crouch = THREE.MathUtils.lerp(walkingHeight, -0.22, contactWeight);
      const weightShift = Math.sin(phase * 2) * THREE.MathUtils.lerp(0.022 * motion.gait, 0.012, contactWeight);
      const rootHeight = THREE.MathUtils.lerp(crouch + weightShift, 0.15 + Math.sin(motion.dive * Math.PI) * 0.48, motion.dive);
      rig.root.position.set(pose.x, rootHeight, pose.z);
      rig.root.rotation.set(0, motion.facingYaw, 0);
      rig.root.rotateX(motion.dive * 1.42);
      const recovering = motion.action.includes("recover");
      if (recovering) rig.root.rotateZ(Math.sin(motion.dive * Math.PI) * 0.35);
      const shoulderCounter = THREE.MathUtils.lerp(Math.sin(phase) * 0.055 * motion.gait, Math.sin(phase * 0.5) * 0.06, contactWeight);
      const lean = motion.roleFamily === "coverage" ? THREE.MathUtils.lerp(-0.08, 0.08 + 0.09 * motion.gait, forwardness) : motion.lean;
      rig.torso.rotation.set(lean * (1 - motion.dive), shoulderCounter, Math.sin(phase) * 0.025 * motion.gait * (1 - contactWeight));
      const armSwing = Math.sin(phase) * THREE.MathUtils.lerp(0.28, 0.82, forwardness) * motion.gait * (1 - 0.85 * contactWeight);
      rig.leftArm.rotation.set(armSwing - 0.15, 0, 0.13);
      rig.rightArm.rotation.set(-armSwing - 0.15, 0, -0.13);
      rig.leftForearm.rotation.set(-0.6, 0, 0);
      rig.rightForearm.rotation.set(-0.6, 0, 0);
      rig.leftLeg.rotation.set(0, 0, 0);
      rig.rightLeg.rotation.set(0, 0, 0);
      rig.leftShin.rotation.set(0, 0, 0);
      rig.rightShin.rotation.set(0, 0, 0);
      rig.leftFoot.rotation.set(0, 0, 0);
      rig.rightFoot.rotation.set(0, 0, 0);
      if (lineFamily) {
        rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, -1.15, contactWeight);
        rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, -1.15, contactWeight);
        rig.leftForearm.rotation.x = THREE.MathUtils.lerp(-0.6, -0.8, contactWeight);
        rig.rightForearm.rotation.x = THREE.MathUtils.lerp(-0.6, -0.8, contactWeight);
        if (motion.roleFamily === "rusher") {
          // Alternate a rip/swim attempt while maintaining the authored contact.
          const counter = Math.sin(phase * 0.5);
          rig.leftArm.rotation.z += Math.max(0, counter) * 0.25 * contactWeight;
          rig.rightArm.rotation.z -= Math.max(0, -counter) * 0.25 * contactWeight;
          rig.torso.rotation.z = counter * 0.045 * contactWeight;
        }
        if (motion.engagementTarget) {
          const opponent = sampleActor(motion.engagementTarget, time);
          const midpoint = new THREE.Vector3((pose.x + opponent.x) / 2, 1.04, (pose.z + opponent.z) / 2);
          const lateral = new THREE.Vector3(Math.cos(motion.facingYaw) * 0.19, 0, -Math.sin(motion.facingYaw) * 0.19);
          reachArm(rig, "left", midpoint.clone().add(lateral), motion.engagement);
          reachArm(rig, "right", midpoint.clone().sub(lateral), motion.engagement);
        }
      }
      if (motion.roleFamily === "quarterback") {
        if (time <= releaseAt) {
          rig.leftArm.rotation.x = -0.7;
          rig.rightArm.rotation.x = -0.7;
          rig.leftForearm.rotation.x = -1.0;
          rig.rightForearm.rotation.x = -1.0;
          reachArm(rig, "left", ballTarget.clone().add(new THREE.Vector3(-0.12, 0, 0)), 1 - motion.throw * 0.8);
          rig.torso.rotation.y += -0.25 + motion.throw * 0.45;
        } else {
          const followThrough = Math.max(0, 1 - (time - releaseAt) / 0.75);
          const followProgress = THREE.MathUtils.smoothstep(time, releaseAt, releaseAt + 0.65);
          rig.rightArm.rotation.x = -1.55 * followThrough - 0.1;
          rig.rightForearm.rotation.x = -0.25 - followThrough * 0.3;
          rig.leftArm.rotation.x = THREE.MathUtils.lerp(-0.7, -0.4, followProgress);
          rig.torso.rotation.y += followThrough * 0.25;
          const launch = sampleBall(releaseAt);
          const handFinish = new THREE.Vector3(pose.x + Math.sin(motion.facingYaw) * 0.48 - Math.cos(motion.facingYaw) * 0.2, 1.18, pose.z + Math.cos(motion.facingYaw) * 0.48 + Math.sin(motion.facingYaw) * 0.2);
          const handPath = new THREE.Vector3(launch.x, launch.y, launch.z).lerp(handFinish, followProgress);
          reachArm(rig, "right", handPath, 1 - THREE.MathUtils.smoothstep(time, releaseAt + 0.55, releaseAt + 1.1));
          reachArm(rig, "left", new THREE.Vector3(launch.x - 0.12, launch.y, launch.z), 0.2 * (1 - followProgress));
        }
      }
      if (motion.catch > 0 && rig.actor.id === "wilson") {
        const destination = time < catchAt ? sampleBall(catchAt) : ballPose;
        const catchTarget = new THREE.Vector3(destination.x, destination.y, destination.z);
        reachArm(rig, "left", catchTarget.clone().add(new THREE.Vector3(-0.06, 0.02, 0)), motion.catch);
        if (time < catchAt) reachArm(rig, "right", catchTarget, motion.catch);
      }
      if (motion.carry > 0) {
        rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, -0.7, motion.carry);
        rig.rightForearm.rotation.x = THREE.MathUtils.lerp(rig.rightForearm.rotation.x, -1.5, motion.carry);
      }
      const quarterback = sampleActor("qb", time);
      const receiver = sampleActor("wilson", time);
      const lookProgress = motion.roleFamily === "coverage" ? THREE.MathUtils.smoothstep(time, catchAt - 0.2, catchAt + 0.3) : 0;
      const lookBase = motion.roleFamily === "quarterback" ? receiver : quarterback;
      const watch = { x: THREE.MathUtils.lerp(lookBase.x, receiver.x, lookProgress), z: THREE.MathUtils.lerp(lookBase.z, receiver.z, lookProgress) };
      if (motion.engagementTarget) {
        const opponent = sampleActor(motion.engagementTarget, time);
        watch.x = THREE.MathUtils.lerp(watch.x, opponent.x, motion.engagement);
        watch.z = THREE.MathUtils.lerp(watch.z, opponent.z, motion.engagement);
      }
      const headAngle = Math.atan2(watch.x - pose.x, watch.z - pose.z) - motion.facingYaw;
      const relativeHead = Math.atan2(Math.sin(headAngle), Math.cos(headAngle));
      rig.head.rotation.set(motion.roleFamily === "blocker" ? -0.12 : -0.025, THREE.MathUtils.clamp(relativeHead, -0.6, 0.6) * (motion.carry > 0 ? 0.15 : 0.75), 0);
      const leftFoot = sampleFoot(rig, motion, "left");
      const rightFoot = sampleFoot(rig, motion, "right");
      placeLeg(rig, "left", leftFoot.point, leftFoot.yaw);
      placeLeg(rig, "right", rightFoot.point, rightFoot.yaw);
      if (motion.dive > 0) {
        blendJoint(rig.leftLeg, 0.2 + Math.sin(phase) * 0.12, 0, 0.08, motion.dive);
        blendJoint(rig.rightLeg, -0.12, 0, -0.08, motion.dive);
        blendJoint(rig.leftShin, 0.45, 0, 0, motion.dive);
        blendJoint(rig.rightShin, 0.7, 0, 0, motion.dive);
        blendJoint(rig.leftArm, -2.65, 0, 0.15, motion.dive);
        blendJoint(rig.rightArm, -2.65, 0, -0.15, motion.dive);
        blendJoint(rig.leftForearm, -0.15, 0, 0, motion.dive);
        blendJoint(rig.rightForearm, -0.15, 0, 0, motion.dive);
      }
      rig.root.updateWorldMatrix(true, true);
      const shadowTarget = rig.root.worldToLocal(new THREE.Vector3(pose.x, 0.012, pose.z));
      rig.shadow.position.copy(shadowTarget);
      rig.shadow.quaternion.copy(rig.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)));
      actionDiagnostics[rig.actor.id] = { action: motion.action, phase: motion.phase, gait: motion.footMode, position: [pose.x, rootHeight, pose.z].map((number) => Number(number.toFixed(4))), torso: rig.torso.rotation.toArray().slice(0, 3), arms: [rig.leftArm.rotation.x, rig.rightArm.rotation.x, rig.leftForearm.rotation.x, rig.rightForearm.rotation.x].map((number) => Number(number.toFixed(4))), feet: [leftFoot.planted, rightFoot.planted], dive: motion.dive };
      if (rig.actor.id === selected) {
        selectionRing.position.set(pose.x, 0.045, pose.z);
        selectionLabel.position.set(pose.x, 3.0, pose.z);
      }
      if (rig.actor.id === "wilson") wilsonHalo.position.set(pose.x, 0.04, pose.z);
    }
    ball.position.set(ballPose.x, ballPose.y, ballPose.z);
    ball.rotation.set(time >= releaseAt && time < catchAt ? time * 12 : 0.3, -0.2, time >= releaseAt && time < catchAt ? 0.9 : 0.1);
    const contactRig = time <= releaseAt ? rigs.find((rig) => rig.actor.id === "qb") : time >= catchAt ? rigs.find((rig) => rig.actor.id === "wilson") : undefined;
    if (contactRig) {
      reachArm(contactRig, "right", ball.position);
      contactRig.root.updateWorldMatrix(true, true);
      const handPosition = contactRig.rightHand.getWorldPosition(new THREE.Vector3());
      canvas.dataset.ballContactError = handPosition.distanceTo(ball.getWorldPosition(new THREE.Vector3())).toFixed(5);
    } else {
      delete canvas.dataset.ballContactError;
    }
    canvas.dataset.renderTime = time.toFixed(4);
    for (const rig of rigs) {
      rig.root.updateWorldMatrix(true, true);
      const actual = actionDiagnostics[rig.actor.id] as Record<string, unknown>;
      actual.joints = [rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg].flatMap((joint) => joint.quaternion.toArray().map((number) => Number(number.toFixed(4))));
      actual.footPositions = [rig.leftFoot, rig.rightFoot].map((foot) => foot.getWorldPosition(new THREE.Vector3()).toArray().map((number) => Number(number.toFixed(4))));
    }
    canvas.dataset.actorMotion = JSON.stringify(actionDiagnostics);
    for (const batch of playerBatches) {
      batch.parts.forEach((part, index) => batch.mesh.setMatrixAt(index, part.matrixWorld));
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
    updateTeachingGeometry();
    if (followSelection) {
      const pose = sampleActor(selected, time);
      const anchor = new THREE.Vector3(pose.x, 0, pose.z);
      if (followAnchor) {
        const delta = anchor.clone().sub(followAnchor);
        camera.position.add(delta);
        controls.target.add(delta);
        controls.update();
      }
      followAnchor = anchor;
    }
    canvas.dataset.poseUpdateMs = (performance.now() - poseStarted).toFixed(3);
  }

  const failure = (message: string) => {
    if (disposed || contextLost) return;
    contextLost = true;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    try {
      callbacks.onFailure?.(message);
    } finally {
      cleanup();
    }
  };

  function render() {
    frameRequest = 0;
    if (disposed || contextLost) return;
    const started = performance.now();
    try {
      sizeSelectionLabel();
      updateRoleLabels();
      renderer.render(scene, camera);
      frames++;
      canvas.dataset.renderedTime = time.toFixed(4);
      canvas.dataset.renderFrames = String(frames);
      canvas.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(3)).join(",");
      canvas.dataset.cameraTarget = controls.target.toArray().map((value) => value.toFixed(3)).join(",");
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
      canvas.dataset.triangles = String(renderer.info.render.triangles);
      renderDurations.push(performance.now() - started);
      if (renderDurations.length > 600) renderDurations.shift();
    } catch {
      failure("The 3D field stopped rendering. Reload the field to try again; the play facts and controls remain available.");
    }
  }

  function invalidate() {
    if (!disposed && !contextLost && !frameRequest) frameRequest = requestAnimationFrame(render);
  }

  function boundCamera() {
    // OrbitControls is the sole camera owner. Bound only its requested target/distance.
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -27, 27);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0.3, 5);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -10, 35);
    camera.position.y = Math.max(1.4, camera.position.y);
  }
  const onControlsChange = () => { boundCamera(); invalidate(); };
  controls.addEventListener("change", onControlsChange);
  cleanupListeners.push(() => controls.removeEventListener("change", onControlsChange));

  function setCamera(preset: ReplayCamera) {
    cameraPreset = preset;
    const portrait = camera.aspect < 0.85;
    const spread = portrait ? 1.28 : 1;
    const overviewHeight = Math.max(42, 25 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(0.25, camera.aspect)));
    const poses = {
      sideline: { position: [43 * spread, 30 * spread, 17], target: [0, 0.5, 7] },
      endzone: { position: [0, 23 * spread, -32 * spread], target: [0, 0.6, 8] },
      overhead: { position: [0, overviewHeight, 7.5 + overviewHeight * 0.2], target: [0, 0.3, 7.5] },
      quarterback: { position: [0.4, 6.3, 34], target: [2, 1, 6] },
    } satisfies Record<ReplayCamera, { position: number[]; target: number[] }>;
    const pose = poses[preset];
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
    controls.update();
    invalidate();
  }

  function frameSelection() {
    if (disposed) return;
    const pose = sampleActor(selected, time);
    controls.target.set(pose.x, 0.8, pose.z);
    const spread = camera.aspect < 0.85 ? 1.25 : 1;
    camera.position.set(pose.x + 7 * spread, 9 * spread, pose.z + 12 * spread);
    followAnchor = new THREE.Vector3(pose.x, 0, pose.z);
    controls.update();
    invalidate();
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    if (width === lastWidth && height === lastHeight) return;
    const firstSize = lastWidth === 0;
    const crossedPortrait = (lastWidth / Math.max(1, lastHeight) < 0.85) !== (width / height < 0.85);
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.85 ? 53 : 43;
    camera.updateProjectionMatrix();
    if (firstSize || crossedPortrait) {
      if (followSelection) frameSelection();
      else setCamera(cameraPreset);
    }
    invalidate();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  cleanupListeners.push(() => resizeObserver.disconnect());

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerStart: { x: number; y: number; id: number } | null = null;
  const onPointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; };
  const onPointerCancel = () => { pointerStart = null; };
  const onPointerUp = (event: PointerEvent) => {
    const start = pointerStart;
    pointerStart = null;
    if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7 || contextLost) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(rigs.map((rig) => rig.root), true).find((intersection) => intersection.object.userData.actorId);
    if (hit) {
      selected = hit.object.userData.actorId as string;
      followAnchor = null;
      updateSelectionLabel();
      applyTime(time);
      invalidate();
      callbacks.onSelect?.(selected);
    }
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  cleanupListeners.push(() => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
  });
  const onContextLost = (event: Event) => {
    event.preventDefault();
    failure("The browser lost the 3D graphics context. Reload the field to restore it; the verified play record is still available below.");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  cleanupListeners.push(() => canvas.removeEventListener("webglcontextlost", onContextLost));

  applyTime(callbacks.initialState?.time ?? 0);
  resize();
  canvas.dataset.initBuildMs = (performance.now() - buildStarted).toFixed(2);
  // Resolve only after the configured initial state has actually been rendered.
  if (frameRequest) cancelAnimationFrame(frameRequest);
  frameRequest = 0;
  render();
  canvas.dataset.initFirstFrameMs = (performance.now() - buildStarted).toFixed(2);
  if (contextLost) throw new Error("The first 3D frame could not be rendered");

  return {
    setTime(value) { if (!disposed) { applyTime(value); invalidate(); } },
    setSelection(id) {
      if (disposed || !REPLAY.actors.some((actor) => actor.id === id)) return;
      selected = id;
      followAnchor = null;
      updateSelectionLabel();
      applyTime(time);
      invalidate();
    },
    setRoutes(visible) { if (!disposed) { routes.visible = visible; updateTeachingGeometry(); invalidate(); } },
    setLabels(visible) { if (!disposed) { labelsVisible = visible; invalidate(); } },
    setResponsibilities(visible) {
      if (disposed) return;
      responsibilitiesVisible = visible;
      responsibilityGroup.visible = visible;
      updateTeachingGeometry();
      invalidate();
    },
    frameSelection,
    setFollowSelection(visible) {
      if (disposed) return;
      followSelection = visible;
      const pose = sampleActor(selected, time);
      followAnchor = visible ? new THREE.Vector3(pose.x, 0, pose.z) : null;
      invalidate();
    },
    setCamera(preset) { if (!disposed) setCamera(preset); },
    moveCamera(action) {
      if (disposed) return;
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (action === "left") spherical.theta -= 0.17;
      if (action === "right") spherical.theta += 0.17;
      if (action === "up") spherical.phi = Math.max(0.05, spherical.phi - 0.13);
      if (action === "down") spherical.phi = Math.min(Math.PI / 2 - 0.04, spherical.phi + 0.13);
      if (action === "in") spherical.radius = Math.max(controls.minDistance, spherical.radius * 0.85);
      if (action === "out") spherical.radius = Math.min(controls.maxDistance, spherical.radius / 0.85);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      boundCamera();
      controls.update();
      invalidate();
    },
    getMetrics() {
      const sorted = [...renderDurations].sort((a, b) => a - b);
      return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, frames, actors: rigs.length, pixelRatio: renderer.getPixelRatio(), aspect: camera.aspect, contextLost, pendingFrame: frameRequest !== 0, renderP95Ms: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0 };
    },
    dispose: cleanup,
  };
  } catch (error) {
    cleanup();
    throw error;
  }
}
