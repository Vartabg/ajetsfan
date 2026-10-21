import * as THREE from "three";

export type StadiumOwnership = {
  geometry<T extends THREE.BufferGeometry>(value: T): T;
  material<T extends THREE.Material>(value: T): T;
  texture<T extends THREE.Texture>(value: T): T;
  instance<T extends THREE.InstancedMesh>(value: T): T;
};

type Placement = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw?: number; color: THREE.ColorRepresentation };
type RingPoint = { x: number; z: number; yaw: number };
const TAU = Math.PI * 2;
const palette = ["#df641f", "#e5772b", "#a9441b", "#4e2b20", "#382720", "#f0e8d8", "#ece9dc", "#35404a", "#a9a5a0", "#5a625a"];
const skinPalette = ["#bc8a66", "#7f533b", "#d4a17a", "#52382c", "#a46f4e", "#e0b58d"];
const noise = (index: number, seed = 1) => {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

/** Equally spaced samples of a rounded rectangular bowl, clear of field corners. */
function ring(rx: number, rz: number, spacing: number): RingPoint[] {
  const points: { x: number; z: number; distance: number }[] = [];
  let distance = 0;
  for (let i = 0; i <= 1024; i++) {
    const angle = i / 1024 * TAU, c = Math.cos(angle), s = Math.sin(angle);
    const point = { x: rx * Math.sign(c) * Math.sqrt(Math.abs(c)), z: 50 + rz * Math.sign(s) * Math.sqrt(Math.abs(s)), distance: 0 };
    if (i) distance += Math.hypot(point.x - points[i - 1].x, point.z - points[i - 1].z);
    point.distance = distance;
    points.push(point);
  }
  const count = Math.max(24, Math.floor(distance / spacing));
  let at = 0;
  return Array.from({ length: count }, (_, index) => {
    const target = index / count * distance;
    while (at < points.length - 2 && points[at + 1].distance < target) at++;
    const a = points[at], b = points[at + 1], u = (target - a.distance) / Math.max(0.0001, b.distance - a.distance);
    const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
    return { x, z, yaw: Math.atan2(-x, 50 - z) };
  });
}

/** Original Cleveland-inspired artwork; no photographed architecture or downloaded assets. */
export function addWilsonStadium(scene: THREE.Scene, ownership: StadiumOwnership): void {
  const group = new THREE.Group();
  group.name = "original-cleveland-inspired-stadium";
  const box = ownership.geometry(new THREE.BoxGeometry(1, 1, 1));
  const torso = ownership.geometry(new THREE.BufferGeometry());
  torso.setAttribute("position", new THREE.Float32BufferAttribute([-0.28, 0.24, 0, 0.28, 0.24, 0, 0.20, -0.24, 0, -0.20, -0.24, 0], 3));
  torso.setIndex([0, 2, 1, 0, 3, 2]);
  torso.computeVertexNormals();
  const head = ownership.geometry(new THREE.OctahedronGeometry(0.13, 0));
  const rail = ownership.geometry(new THREE.CylinderGeometry(1, 1, 1, 5, 1));
  const matte = ownership.material(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0 }));
  const people = ownership.material(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  const metal = ownership.material(new THREE.MeshStandardMaterial({ color: "#8b9290", roughness: 0.56, metalness: 0.4 }));
  const boxes: Placement[] = [], seatBacks: Placement[] = [], torsos: Placement[] = [], heads: Placement[] = [];
  const addBox = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, yaw = 0) => boxes.push({ x, y, z, sx, sy, sz, color, yaw });
  const addRail = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const center = a.clone().add(b).multiplyScalar(0.5), delta = b.clone().sub(a);
    const mesh = new THREE.Object3D();
    mesh.position.copy(center);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    mesh.scale.set(radius, delta.length(), radius);
    mesh.updateMatrix();
    railMatrices.push(mesh.matrix.clone());
  };
  const railMatrices: THREE.Matrix4[] = [];

  // The front wall has visible coping and a dark padded field-facing edge.
  for (const p of ring(32.7, 67.8, 2.6)) {
    addBox(p.x, 0.72, p.z, 2.65, 1.45, 0.55, "#706e64", p.yaw);
    addBox(p.x, 1.48, p.z, 2.7, 0.13, 0.69, "#b3afa0", p.yaw);
    addBox(p.x + Math.sin(p.yaw) * 0.31, 0.58, p.z + Math.cos(p.yaw) * 0.31, 2.63, 1.06, 0.09, "#583125", p.yaw);
  }

  let spectatorIndex = 0, seatCount = 0;
  const tiers = [
    { rows: 18, rx: 34.2, rz: 71.7, y: 1.85, rise: 0.62, run: 0.85 },
    { rows: 10, rx: 54.8, rz: 93.1, y: 17.0, rise: 0.68, run: 0.92 },
  ];
  for (const [tierIndex, tier] of tiers.entries()) {
    for (let row = 0; row < tier.rows; row++) {
      const rx = tier.rx + row * tier.run, rz = tier.rz + row * tier.run, y = tier.y + row * tier.rise;
      const places = ring(rx, rz, 0.94);
      // Eighteen section breaks leave clear radial concrete aisles.
      const sectionSize = places.length / 18;
      for (const [index, p] of places.entries()) {
        const sectionPosition = index % sectionSize;
        const aisle = sectionPosition < 1.35 || sectionPosition > sectionSize - 0.55;
        if (aisle) {
          addBox(p.x, y - 0.32, p.z, 0.85, 0.16, 0.9, row % 2 ? "#a5a197" : "#97948b", p.yaw);
          if (row % 3 === 0) {
            const sideways = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(0.37);
            const base = new THREE.Vector3(p.x, y - 0.2, p.z).add(sideways);
            addRail(base, base.clone().add(new THREE.Vector3(0, 0.85, 0)), 0.025);
          }
          continue;
        }
        seatCount++;
        const seatColor = noise(index + row * 113, tierIndex + 2) < 0.18 ? "#8c4a2e" : row % 5 === 0 ? "#d36b31" : "#bd5929";
        seatBacks.push({ x: p.x, y: y + 0.17, z: p.z, sx: 0.62, sy: 0.46, sz: 1, color: seatColor, yaw: p.yaw });
        if (noise(index + row * 997, tierIndex + 13) < 0.12) {
          addBox(p.x + Math.sin(p.yaw) * 0.2, y - 0.10, p.z + Math.cos(p.yaw) * 0.2, 0.61, 0.10, 0.5, seatColor, p.yaw);
          continue;
        }
        const seed = spectatorIndex++, variation = noise(seed, 7);
        const lift = variation < 0.13 ? 0.16 : 0;
        const x = p.x + Math.sin(p.yaw) * 0.23, z = p.z + Math.cos(p.yaw) * 0.23;
        const shirt = palette[Math.floor(noise(seed, 19) * palette.length)];
        const scale = 0.86 + noise(seed, 5) * 0.25;
        torsos.push({ x, y: y + 0.19 + lift, z, sx: scale, sy: scale, sz: 0.65, yaw: p.yaw + (noise(seed, 6) - 0.5) * 0.28, color: shirt });
        heads.push({ x: x + (noise(seed, 11) - 0.5) * 0.055, y: y + 0.55 + lift, z, sx: 1, sy: 1.07, sz: 1, color: skinPalette[Math.floor(noise(seed, 23) * skinPalette.length)] });
        // A few raised sleeves break the seated skyline without animated noise.
        if (variation < 0.055) {
          addBox(x + Math.cos(p.yaw) * 0.25, y + 0.57 + lift, z - Math.sin(p.yaw) * 0.25, 0.105, 0.48, 0.11, shirt, p.yaw);
        }
      }
      // Concrete risers read as thin, sectioned terraces rather than black slabs.
      for (const p of ring(rx, rz, 2.65)) {
        addBox(p.x, y - 0.44, p.z, 2.72, 0.19, tier.run + 0.05, row % 4 === 0 ? "#9d9a90" : "#8c8981", p.yaw);
      }
    }
    const rx = tier.rx + (tier.rows - 1) * tier.run, rz = tier.rz + (tier.rows - 1) * tier.run, y = tier.y + (tier.rows - 1) * tier.rise;
    const edge = ring(rx + 0.35, rz + 0.35, 3.1);
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i], b = edge[(i + 1) % edge.length];
      addRail(new THREE.Vector3(a.x, y + 0.15, a.z), new THREE.Vector3(a.x, y + 1.08, a.z), 0.028);
      addRail(new THREE.Vector3(a.x, y + 1.08, a.z), new THREE.Vector3(b.x, y + 1.08, b.z), 0.028);
      addBox(a.x, y - 0.72, a.z, 3.16, 0.88, 0.55, tierIndex ? "#b0ada4" : "#663b29", a.yaw);
    }
  }

  // Open concourse between tiers, with shadowed entries and warm concrete piers.
  for (const [index, p] of ring(51.3, 89.3, 3.6).entries()) {
    addBox(p.x, 13.8, p.z, 3.7, 0.3, 4.9, "#b4afa2", p.yaw);
    addBox(p.x, 15.0, p.z, 3.65, 1.9, 0.25, "#3c312b", p.yaw);
    if (index % 3 === 0) addBox(p.x, 15.0, p.z, 0.45, 2.0, 3.3, "#c2beb1", p.yaw);
    addBox(p.x + Math.sin(p.yaw) * 1.9, 14.8, p.z + Math.cos(p.yaw) * 1.9, 3.7, 0.85, 0.23, "#aa4b21", p.yaw);
  }

  // Practical floodlight banks and a framed home-field board, without video imagery.
  for (const x of [-48, 48]) {
    for (const z of [-34, 134]) {
      addBox(x, 16, z, 0.42, 32, 0.42, "#a5aaa4");
      addBox(x, 31.5, z, 6.7, 0.35, 1.1, "#646d69");
      for (let lamp = 0; lamp < 6; lamp++) addBox(x - 2.7 + lamp * 1.08, 31.3, z + (z < 0 ? 0.55 : -0.55), 0.73, 0.62, 0.16, "#f3efe2");
    }
  }
  addBox(0, 28.1, -52, 28.5, 9.5, 1.5, "#423a34");
  addBox(0, 33.0, -51.9, 30.2, 0.55, 2.1, "#8a8980");
  for (const x of [-10, 10]) addBox(x, 21, -52, 0.8, 12.5, 0.9, "#8c9088");

  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const batch = (geometry: THREE.BufferGeometry, material: THREE.Material, placements: Placement[], name: string) => {
    const mesh = ownership.instance(new THREE.InstancedMesh(geometry, material, placements.length));
    mesh.name = name;
    for (const [index, p] of placements.entries()) {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw ?? 0, 0);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(p.color));
    }
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  batch(box, matte, boxes, "bowl-concrete-fascia-and-fixtures");
  const seatGeometry = ownership.geometry(new THREE.PlaneGeometry(1, 1));
  batch(seatGeometry, people, seatBacks, "instanced-orange-seat-backs");
  batch(torso, people, torsos, "instanced-home-crowd-shoulders");
  batch(head, people, heads, "instanced-home-crowd-heads");
  const railMesh = ownership.instance(new THREE.InstancedMesh(rail, metal, railMatrices.length));
  railMesh.name = "instanced-concourse-and-aisle-rails";
  railMatrices.forEach((matrix, index) => railMesh.setMatrixAt(index, matrix));
  railMesh.computeBoundingSphere();
  group.add(railMesh);

  // One tiny atlas and one merged sign mesh keep all lettering to one draw.
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Stadium lettering is unavailable.");
  context.fillStyle = "#843b1b";
  context.fillRect(0, 0, 2048, 128);
  context.strokeStyle = "#ed772e";
  context.lineWidth = 5;
  context.strokeRect(7, 7, 2034, 114);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f6eee1";
  context.font = "900 76px Arial, sans-serif";
  context.fillText("CLEVELAND  •  FOOTBALL", 1024, 68);
  context.fillStyle = "#201d19";
  context.fillRect(0, 128, 2048, 384);
  context.strokeStyle = "#ed772e";
  context.lineWidth = 9;
  context.strokeRect(8, 136, 2032, 368);
  context.fillStyle = "#f6eee1";
  context.font = "900 200px Arial, sans-serif";
  context.fillText("CLEVELAND", 1024, 278);
  context.fillStyle = "#eb823d";
  context.font = "700 85px Arial, sans-serif";
  context.fillText("HOME FIELD  /  2022", 1024, 437);
  const texture = ownership.texture(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  const signMaterial = ownership.material(new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const sign = (x: number, y: number, z: number, width: number, height: number, yaw: number, board: boolean) => {
    const offset = vertices.length / 3;
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      vertices.push(x + Math.cos(yaw) * cx * width, y + cy * height, z - Math.sin(yaw) * cx * width);
    }
    const bottom = board ? 0 : 0.75, top = board ? 0.75 : 1;
    uvs.push(0, bottom, 1, bottom, 1, top, 0, top);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  };
  for (const p of ring(49.4, 87.4, 48)) sign(p.x, 14.8, p.z, 20, 1.2, p.yaw, false);
  sign(0, 28.1, -51.19, 26.8, 8.3, 0, true);
  const signGeometry = ownership.geometry(new THREE.BufferGeometry());
  signGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  signGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  signGeometry.setIndex(indices);
  signGeometry.computeBoundingSphere();
  const signMesh = new THREE.Mesh(signGeometry, signMaterial);
  signMesh.name = "original-home-field-board-and-fascia";
  group.add(signMesh);

  group.userData = { artwork: "Original Cleveland-inspired environment; architecture, crowd and fixtures are illustrative.", seats: seatCount, spectators: heads.length, batches: 6, rails: railMatrices.length, staticShadows: false };
  scene.add(group);
}
