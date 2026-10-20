import * as THREE from "three";

/** Original daylight and reflection artwork; no stadium photograph is used. */
export function addWilsonDaylight(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const width = 256, height = 128;
  const data = new Uint16Array(width * height * 4);
  const horizon = new THREE.Color("#d5e4ed");
  const zenith = new THREE.Color("#6ca3d1");
  const ground = new THREE.Color("#7d8060");
  const color = new THREE.Color();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const h = y / (height - 1), u = x / width;
    if (h < 0.5) color.copy(ground).multiplyScalar(0.55 + h * 0.5);
    else {
      const elevation = (h - 0.5) * 2;
      color.copy(horizon).lerp(zenith, Math.pow(elevation, 0.45));
      const cloud = Math.max(0, Math.sin(u * 29 + elevation * 8) * Math.sin(u * 13 - elevation * 19) - 0.18) * (1 - elevation) * 0.48;
      color.lerp(horizon, cloud);
      const sun = Math.exp(-((u - 0.63) ** 2 + (h - 0.74) ** 2) * 2800) * 5;
      color.r += sun; color.g += sun * 0.94; color.b += sun * 0.83;
    }
    const offset = (y * width + x) * 4;
    data[offset] = THREE.DataUtils.toHalfFloat(color.r);
    data[offset + 1] = THREE.DataUtils.toHalfFloat(color.g);
    data[offset + 2] = THREE.DataUtils.toHalfFloat(color.b);
    data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const sky = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  let reflection: THREE.WebGLRenderTarget;
  try { reflection = generator.fromEquirectangular(sky); }
  catch (error) { sky.dispose(); throw error; }
  finally { generator.dispose(); }
  scene.background = sky;
  scene.backgroundIntensity = 1.1;
  scene.environment = reflection.texture;
  scene.environmentIntensity = 0.65;
  scene.fog = new THREE.Fog("#c7d9e4", 115, 220);

  const fill = new THREE.HemisphereLight("#cde3fb", "#786849", 1.35);
  const sun = new THREE.DirectionalLight("#fff3df", 3.1);
  sun.position.set(-26, 44, -16);
  sun.target.position.set(0, 0, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -31;
  sun.shadow.camera.right = 31;
  sun.shadow.camera.top = 31;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.00015;
  scene.add(fill, sun, sun.target);
  return () => {
    scene.remove(fill, sun, sun.target);
    scene.environment = null;
    scene.background = null;
    sun.shadow.dispose();
    reflection.dispose();
    sky.dispose();
  };
}
