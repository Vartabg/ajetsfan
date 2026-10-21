import type * as Three from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** A parsed source cancelled before the scene claims it still owns GPU/image resources. */
function disposeUnclaimedSource(source: Three.Group) {
  const geometries = new Set<Three.BufferGeometry>();
  const materials = new Set<Three.Material>();
  const textures = new Set<Three.Texture>();
  const skeletons = new Set<Three.Skeleton>();
  const images = new Set<{ close(): void }>();
  source.traverse(object => {
    const mesh = object as Three.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value && value.isTexture) textures.add(value as Three.Texture);
      }
    }
    const skinned = mesh as Three.SkinnedMesh;
    if (skinned.isSkinnedMesh) skeletons.add(skinned.skeleton);
  });
  for (const texture of textures) {
    const image = texture.image as { close?: () => void } | undefined;
    if (typeof image?.close === "function") images.add(image as { close(): void });
    texture.dispose();
  }
  skeletons.forEach(skeleton => skeleton.dispose());
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  images.forEach(image => image.close());
  source.clear();
}

/**
 * One fetch/parse per scene, followed by synchronous resource ownership transfer.
 * claimSource must register all parsed resources before deriving the player factory;
 * once called, scene cleanup owns them, including if factory preparation throws.
 */
export async function loadWilsonPlayerAsset<T>(
  url: string,
  signal: AbortSignal | undefined,
  claimSource: (source: Three.Group, animations: Three.AnimationClip[]) => T,
): Promise<{ value: T; bytes: number }> {
  signal?.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`The player asset could not load (${response.status}).`);
  const bytes = await response.arrayBuffer();
  signal?.throwIfAborted();
  const resourceBase = new URL(".", new URL(url, window.location.href)).href;
  const gltf = await new GLTFLoader().parseAsync(bytes, resourceBase);
  if (signal?.aborted) {
    disposeUnclaimedSource(gltf.scene);
    signal.throwIfAborted();
  }
  return { value: claimSource(gltf.scene, gltf.animations), bytes: bytes.byteLength };
}
