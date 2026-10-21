import * as THREE from "three";

type TurfMaterial = { material: THREE.MeshStandardMaterial; tint: string };

/** CC0 ambientCG Grass 005. Maps refine the field after its first usable frame. */
export function loadWilsonTurf(
  entries: TurfMaterial[],
  own: (texture: THREE.Texture) => void,
  invalidate: () => void,
  anisotropy: number,
  onReady: (state: "ready" | "partial") => void,
) {
  let active = true, settled = 0, loaded = 0;
  const loader = new THREE.TextureLoader();
  const finish = () => {
    if (!active) return;
    settled++;
    if (settled === 2) onReady(loaded === 2 ? "ready" : "partial");
  };
  const load = (file: string, isColor: boolean) => {
    const texture = loader.load(file, (map) => {
      if (!active) return;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(32, 3);
      map.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.anisotropy = Math.min(anisotropy, 8);
      map.needsUpdate = true;
      entries.forEach(({ material, tint }) => {
        if (isColor) { material.map = map; material.color.set(tint); }
        else { material.normalMap = map; material.normalScale.set(0.22, 0.22); }
        material.needsUpdate = true;
      });
      loaded++;
      finish();
      invalidate();
    }, undefined, finish);
    own(texture);
  };
  load("/film-room/art/grass005-basecolor.webp", true);
  load("/film-room/art/grass005-normalgl.webp", false);
  return () => { active = false; };
}
