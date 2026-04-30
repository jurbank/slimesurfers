import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();

export function loadWeaponModelPrototype(modelPath: string): Promise<THREE.Object3D> {
  const cached = modelCache.get(modelPath);
  if (cached) return cached;

  const modelPromise = loader.loadAsync(modelPath).then((gltf) => gltf.scene);
  modelCache.set(modelPath, modelPromise);
  return modelPromise;
}

export async function cloneNormalizedWeaponModel(
  modelPath: string,
  targetSize: number,
): Promise<THREE.Object3D> {
  const prototype = await loadWeaponModelPrototype(modelPath);
  const model = prototype.clone(true);
  cloneModelMaterials(model);
  normalizeWeaponModel(model, targetSize);
  return model;
}

export function normalizeWeaponModel(model: THREE.Object3D, targetSize: number): void {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z);
  if (largestAxis > 1e-5) {
    model.scale.setScalar(targetSize / largestAxis);
  }

  const scaledBounds = new THREE.Box3().setFromObject(model);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.sub(center);

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

export function disposeWeaponModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

function cloneModelMaterials(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });
}
