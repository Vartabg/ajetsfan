import * as THREE from "three";
import type * as Three from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { samplePose } from "./wilson-replay.mjs";

type Pose = ReturnType<typeof samplePose>;
export type WilsonBodyControls = {
  root: Three.Group; pelvis: Three.Group; torso: Three.Group; head: Three.Group;
  leftArm: Three.Group; rightArm: Three.Group; leftForearm: Three.Group; rightForearm: Three.Group;
  leftHand: Three.Mesh; rightHand: Three.Mesh;
  leftLeg: Three.Group; rightLeg: Three.Group; leftShin: Three.Group; rightShin: Three.Group;
  leftFoot: Three.Group; rightFoot: Three.Group;
};
type Owner = {
  geometry<T extends Three.BufferGeometry>(value: T): T;
  material<T extends Three.Material>(value: T): T;
};
type Binding = {
  control: keyof WilsonBodyControls; offset: Three.Vector3; rotation: Three.Quaternion; scale: Three.Vector3;
};

/** These frames are fitted to the verified Quaternius Standard 65-bone body. */
export function prepareWilsonSkinnedPlayers(source: Three.Group, clips: Three.AnimationClip[], owner: Owner) {
  source.updateWorldMatrix(true, true);
  const originals: Three.SkinnedMesh[] = [];
  source.traverse(object => { if ((object as Three.SkinnedMesh).isSkinnedMesh) originals.push(object as Three.SkinnedMesh); });
  const body = originals.reduce<Three.SkinnedMesh | undefined>((largest, mesh) => !largest || mesh.geometry.getAttribute("position").count > largest.geometry.getAttribute("position").count ? mesh : largest, undefined);
  if (!body || body.skeleton.bones.length !== 65) throw new Error("The verified football player skeleton is unavailable.");
  const anatomyAttributes = body.geometry.attributes, anatomyIndex = body.geometry.index;
  const rest = new Map(body.skeleton.bones.map(bone => [bone.name, {
    position: bone.getWorldPosition(new THREE.Vector3()), quaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
    localPosition: bone.position.clone(), localQuaternion: bone.quaternion.clone(), localScale: bone.scale.clone(),
  }]));
  const bindings = new Map<string, Binding>();
  const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
  function bind(name: string, control: keyof WilsonBodyControls, offset: number[], size: number[], child?: string, direction?: Three.Vector3) {
    const native = rest.get(name);
    if (!native) throw new Error(`Missing verified player bone: ${name}`);
    const rotation = native.quaternion.clone();
    if (child && direction) {
      const end = rest.get(child);
      if (!end) throw new Error(`Missing verified player bone: ${child}`);
      rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(end.position.clone().sub(native.position).normalize(), direction.clone().normalize()));
    }
    bindings.set(name, { control, offset: new THREE.Vector3(...offset as [number, number, number]), rotation, scale: new THREE.Vector3(...size as [number, number, number]) });
  }
  bind("root", "root", [0, 0, 0], [1, 1, 1]);
  bind("pelvis", "pelvis", [0, -0.02, 0], [1.35, 1, 1.18]);
  bind("spine_01", "torso", [0, 0.13, 0], [1.5, 1.1, 1.25]);
  bind("spine_02", "torso", [0, 0.26, 0], [1.5, 1.1, 1.25]);
  bind("spine_03", "torso", [0, 0.4, 0], [1.5, 1.1, 1.25]);
  bind("neck_01", "torso", [0, 0.64, 0.01], [1.1, 1.05, 1.1], "Head", up);
  bind("Head", "head", [0, -0.14, 0], [1.15, 1.15, 1.15]);
  for (const [suffix, side, sign] of [["l", "left", 1], ["r", "right", -1]] as const) {
    bind(`clavicle_${suffix}`, "torso", [sign * 0.1, 0.535, 0.015], [1.25, 1.57, 1.2], `upperarm_${suffix}`, new THREE.Vector3(sign * 0.33, -0.025, -0.015));
    bind(`upperarm_${suffix}`, `${side}Arm`, [0, 0, 0], [1.15, 0.31 / rest.get(`lowerarm_${suffix}`)!.position.distanceTo(rest.get(`upperarm_${suffix}`)!.position), 1.15], `lowerarm_${suffix}`, down);
    bind(`lowerarm_${suffix}`, `${side}Forearm`, [0, 0, 0], [1.1, 0.3 / rest.get(`hand_${suffix}`)!.position.distanceTo(rest.get(`lowerarm_${suffix}`)!.position), 1.1], `hand_${suffix}`, down);
    bind(`hand_${suffix}`, `${side}Forearm`, [0, -0.245, 0], [0.75, 0.65, 0.75], `index_01_${suffix}`, down);
    const handRest = rest.get(`hand_${suffix}`)!;
    bindings.get(`hand_${suffix}`)!.rotation.copy(handRest.quaternion).premultiply(new THREE.Quaternion().setFromUnitVectors(up.clone().applyQuaternion(handRest.quaternion), down));
    bind(`thigh_${suffix}`, `${side}Leg`, [0, 0, 0], [1.15, 0.42 / rest.get(`calf_${suffix}`)!.position.distanceTo(rest.get(`thigh_${suffix}`)!.position), 1.15], `calf_${suffix}`, down);
    bind(`calf_${suffix}`, `${side}Shin`, [0, 0, 0], [1.05, 0.4 / rest.get(`foot_${suffix}`)!.position.distanceTo(rest.get(`calf_${suffix}`)!.position), 1.05], `foot_${suffix}`, down);
    bind(`foot_${suffix}`, `${side}Foot`, [0, 0, 0], [0.85, 0.9, 0.85], `ball_${suffix}`, new THREE.Vector3(0, 0, 1));
  }

  // Clothing follows anatomical skin weights, not a height plane through the
  // shoulders. Vertex colors keep material boundaries continuous across the
  // imported triangles; a fitted fabric cuff covers the short sleeve edge.
  const positions = body.geometry.getAttribute("position"), joints = body.geometry.getAttribute("skinIndex"), weights = body.geometry.getAttribute("skinWeight");
  const regions = new Float32Array(positions.count * 6), sourcePoint = new THREE.Vector3();
  for (let vertex = 0; vertex < positions.count; vertex++) {
    sourcePoint.fromBufferAttribute(positions, vertex).applyMatrix4(body.bindMatrix);
    const indices = [joints.getX(vertex), joints.getY(vertex), joints.getZ(vertex), joints.getW(vertex)];
    const influences = [weights.getX(vertex), weights.getY(vertex), weights.getZ(vertex), weights.getW(vertex)];
    for (let slot = 0; slot < 4; slot++) {
      const name = body.skeleton.bones[indices[slot]].name, weight = influences[slot];
      if (/^upperarm_/.test(name)) {
        const side = name.endsWith("_l") ? "l" : "r", start = rest.get(name)!.position, end = rest.get(`lowerarm_${side}`)!.position;
        const axis = end.clone().sub(start), along = sourcePoint.clone().sub(start).dot(axis) / axis.lengthSq();
        const cloth = 1 - THREE.MathUtils.smoothstep(along, 0.43, 0.53);
        regions[vertex * 6] += weight * cloth;
        regions[vertex * 6 + 2] += weight * (1 - cloth);
      } else {
        const region = /^(Head|neck_|lowerarm_)/.test(name) ? 2 : /^(hand_|thumb|index|middle|ring|pinky)/.test(name) ? 5 : /^(pelvis|thigh_)/.test(name) ? 1 : /^calf_/.test(name) ? 3 : /^(foot_|ball_)/.test(name) ? 4 : 0;
        regions[vertex * 6 + region] += weight;
      }
    }
    // The jersey hem is a narrow cloth boundary, not the broad pelvis/spine
    // skin-weight transition. This mask never reaches shoulders or sleeves.
    if (sourcePoint.y < 1.3) {
      const cloth = regions[vertex * 6] + regions[vertex * 6 + 1];
      const jersey = THREE.MathUtils.smoothstep(sourcePoint.y, 1.025, 1.04);
      regions[vertex * 6] = cloth * jersey;
      regions[vertex * 6 + 1] = cloth * (1 - jersey);
    }
  }
  const bodyMaterial = owner.material(new THREE.MeshStandardMaterial({ color: "white", vertexColors: true, roughness: 0.91, metalness: 0 }));
  const palettes = new Map<string, Three.BufferGeometry>();
  function teamGeometry(team: "NYJ" | "CLE", skin: Three.Color, quarterback: boolean) {
    const key = `${team}:${skin.getHexString()}:${quarterback}`;
    const existing = palettes.get(key);
    if (existing) return existing;
    const colors = [new THREE.Color(team === "NYJ" ? "#f5f6ef" : "#3a2118"), new THREE.Color("#eff1e9"), skin, new THREE.Color(team === "NYJ" ? "#eff1e9" : "#43261b"), new THREE.Color(team === "NYJ" ? "#e9eee8" : "#101411"), quarterback ? skin : new THREE.Color("#eff1e9")];
    const values = new Float32Array(positions.count * 3);
    for (let vertex = 0; vertex < positions.count; vertex++) for (let region = 0; region < 6; region++) {
      const weight = regions[vertex * 6 + region], color = colors[region];
      values[vertex * 3] += color.r * weight; values[vertex * 3 + 1] += color.g * weight; values[vertex * 3 + 2] += color.b * weight;
    }
    const geometry = owner.geometry(new THREE.BufferGeometry());
    // Share all immutable anatomy/weight/index buffers across all 22 players.
    for (const [name, attribute] of Object.entries(anatomyAttributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(anatomyIndex);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
    palettes.set(key, geometry);
    return geometry;
  }

  const motionTracks = new Map(clips.map(clip => [clip.name, {
    duration: clip.duration,
    tracks: new Map(clip.tracks.filter(track => track.name.endsWith(".quaternion")).map(track => [track.name.slice(0, -11), new THREE.QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4))])),
  }]));
  const bodies = new Set<{ object: Three.Object3D; skeleton: Three.Skeleton }>();
  return {
    create(controls: WilsonBodyControls, team: "NYJ" | "CLE", skin: Three.Color) {
      const object = clone(source);
      object.name = `skinned-football-${controls.root.userData.actorId}`;
      const meshes: Three.SkinnedMesh[] = [];
      object.traverse(child => {
        child.userData.actorId = controls.root.userData.actorId;
        const mesh = child as Three.SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        meshes.push(mesh); mesh.frustumCulled = false; mesh.castShadow = true;
        if (mesh.geometry === body.geometry) { mesh.geometry = teamGeometry(team, skin, controls.root.userData.actorId === "qb"); mesh.material = bodyMaterial; }
      });
      const skeleton = meshes[0].skeleton;
      // The three source primitives use the same skin. One independent bone
      // palette per actor serves the body, eyes and eyebrows.
      meshes.forEach(mesh => { mesh.skeleton = skeleton; });
      const bones = [...skeleton.bones].sort((a, b) => {
        const depth = (bone: Three.Object3D) => { let n = 0; for (let parent = bone.parent; parent; parent = parent.parent) n++; return n; };
        return depth(a) - depth(b);
      });
      bones.forEach(bone => { bone.matrixAutoUpdate = false; });
      const nativeBones = new Map(bones.map(bone => [bone.name, bone]));
      const renderBounds = meshes.map(mesh => {
        const sphere = new THREE.Sphere(new THREE.Vector3(), 3), box = new THREE.Box3();
        const exactSphere = new THREE.Sphere(), exactBox = new THREE.Box3();
        const worldSphere = new THREE.Sphere(), inverse = new THREE.Matrix4();
        const state = { sphere, box, inverse, dirty: true };
        mesh.boundingSphere = sphere; mesh.boundingBox = box;
        const raycast = mesh.raycast;
        mesh.raycast = function (raycaster, intersections) {
          // Cheap broad phase first. Render sorting also reads boundingSphere,
          // so it must never be null between clicks (even with culling off).
          worldSphere.copy(sphere).applyMatrix4(mesh.matrixWorld);
          if (!raycaster.ray.intersectsSphere(worldSphere)) return;
          mesh.boundingSphere = exactSphere; mesh.boundingBox = exactBox;
          try {
            if (state.dirty) {
              mesh.computeBoundingSphere(); mesh.computeBoundingBox();
              state.dirty = false;
            }
            raycast.call(mesh, raycaster, intersections);
          } finally {
            mesh.boundingSphere = sphere; mesh.boundingBox = box;
          }
        };
        return state;
      });
      bodies.add({ object, skeleton });
      const desired = new THREE.Matrix4(), rotation = new THREE.Quaternion(), delta = new THREE.Quaternion(), clipDelta = new THREE.Quaternion(), point = new THREE.Vector3();
      const identity = new THREE.Quaternion();
      const boundSize = new THREE.Vector3(6, 6, 6);
      function update(motion: Pose) {
        controls.root.updateWorldMatrix(true, true);
        object.updateWorldMatrix(true, true);
        const idle = 1 - THREE.MathUtils.smoothstep(motion.locomotion, 0.02, 0.3);
        const sprint = THREE.MathUtils.smoothstep(motion.locomotion, 0.55, 0.9);
        const push = motion.engagement;
        const weights = [["Idle_Loop", idle * (1 - push)], ["Jog_Fwd_Loop", (1 - idle - sprint) * (1 - push)], ["Sprint_Loop", sprint * (1 - push)], ["Push_Loop", push]] as const;
        for (const bone of bones) {
          const native = rest.get(bone.name)!;
          delta.identity();
          let totalWeight = 0;
          for (const [name, weight] of weights) {
            const clip = motionTracks.get(name), track = clip?.tracks.get(bone.name);
            if (!clip || !track || weight <= 0) continue;
            rotation.fromArray(track.evaluate((motion.stridePhase - Math.floor(motion.stridePhase)) * clip.duration));
            clipDelta.copy(native.localQuaternion).invert().multiply(rotation);
            totalWeight += weight;
            delta.slerp(clipDelta, weight / totalWeight);
          }
          const secondary = /^(spine_|clavicle_)/.test(bone.name) ? 0.13 : /^(thumb|index|middle|ring|pinky)/.test(bone.name) ? 0.45 : 0;
          delta.slerpQuaternions(identity, delta, secondary * (1 - motion.dive));
          const binding = bindings.get(bone.name);
          if (binding) {
            const control = controls[binding.control];
            point.copy(binding.offset).applyMatrix4(control.matrixWorld);
            control.getWorldQuaternion(rotation).multiply(binding.rotation).multiply(delta);
            desired.compose(point, rotation, binding.scale);
            bone.matrix.copy(bone.parent!.matrixWorld).invert().multiply(desired);
          } else {
            rotation.copy(native.localQuaternion).multiply(delta);
            bone.matrix.compose(native.localPosition, rotation, native.localScale);
          }
          bone.matrixWorld.multiplyMatrices(bone.parent!.matrixWorld, bone.matrix);
          bone.matrixWorldNeedsUpdate = false;
        }
        skeleton.update();
        // A three-yard envelope includes the complete fitted body, including
        // the dive. Only actual picking computes the expensive deformed skin.
        const centre = point.setFromMatrixPosition(controls.root.matrixWorld);
        centre.y += 0.9;
        renderBounds.forEach((bounds, index) => {
          bounds.inverse.copy(meshes[index].matrixWorld).invert();
          bounds.sphere.center.copy(centre).applyMatrix4(bounds.inverse);
          bounds.box.setFromCenterAndSize(bounds.sphere.center, boundSize);
          bounds.dirty = true;
        });
      }
      function diagnostics() {
        const position = (name: string, local = new THREE.Vector3()) => local.applyMatrix4(nativeBones.get(name)!.matrixWorld).toArray().map(value => Number(value.toFixed(4)));
        const palms = [position("hand_l", new THREE.Vector3(0, 0.085, 0)), position("hand_r", new THREE.Vector3(0, 0.085, 0))];
        const feet = [position("foot_l"), position("foot_r")];
        const targets = [controls.leftHand, controls.rightHand, controls.leftFoot, controls.rightFoot];
        const errors = [...palms, ...feet].map((values, index) => new THREE.Vector3(...values as [number, number, number]).distanceTo(targets[index].getWorldPosition(point)));
        const quaternions = (names: string[]) => names.flatMap(name => nativeBones.get(name)!.getWorldQuaternion(rotation).toArray().map(value => Number(value.toFixed(4))));
        return { handPositions: palms, footPositions: feet, endpointErrors: errors, bodyJoints: quaternions(["root", "pelvis", "spine_03", "Head"]), limbJoints: quaternions(["upperarm_l", "lowerarm_l", "hand_l", "upperarm_r", "lowerarm_r", "hand_r", "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r"]), clipCount: motionTracks.size, meshCount: meshes.length, boneCount: skeleton.bones.length };
      }
      return { object, update, diagnostics, skeleton };
    },
    dispose() { for (const body of bodies) { body.skeleton.dispose(); body.object.removeFromParent(); } bodies.clear(); palettes.clear(); },
  };
}

export type WilsonSkinnedPlayer = ReturnType<ReturnType<typeof prepareWilsonSkinnedPlayers>["create"]>;
