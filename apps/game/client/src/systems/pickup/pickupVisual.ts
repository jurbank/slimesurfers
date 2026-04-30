import * as THREE from "three";
import { cloneNormalizedWeaponModel, disposeWeaponModel } from "../../assets/weaponModels.ts";

const OUTLINE_FALLBACK_SCALE = 1.25;
const OUTLINE_MODEL_SCALE = 1.18;

export interface PickupVisualEntry {
  root: THREE.Group;
  modelPivot: THREE.Group;
  fallbackMesh: THREE.Mesh;
  modelRoot?: THREE.Object3D;
  outlineModelClone?: THREE.Object3D;
  outlineMaterial: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  modelPath: string;
  baseY: number;
  createdAtMs: number;
  disposed: boolean;
}

export interface PickupSpinRates {
  rootY: number;
  pivotX: number;
  pivotZ: number;
  ringZ: number;
  bobFreq: number;
}

export function createPickupVisual(
  scene: THREE.Scene,
  pos: { x: number; y: number; z: number },
  color: number,
  modelPath: string,
  modelSize: number,
  nowMs: number,
): PickupVisualEntry {
  const root = new THREE.Group();
  const modelPivot = new THREE.Group();

  const fallbackGeom = new THREE.IcosahedronGeometry(1.25, 0);
  const fallbackMesh = new THREE.Mesh(
    fallbackGeom,
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.9 }),
  );

  const outlineMaterial = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.8,
  });
  const outlineFallback = new THREE.Mesh(fallbackGeom, outlineMaterial);
  outlineFallback.scale.setScalar(OUTLINE_FALLBACK_SCALE);
  fallbackMesh.add(outlineFallback);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.8, 0.14, 12, 32),
    new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.9,
    }),
  );
  ring.rotation.x = Math.PI / 2;

  modelPivot.add(fallbackMesh);
  root.add(modelPivot);
  root.add(ring);
  root.position.set(pos.x, pos.y, pos.z);
  scene.add(root);

  const entry: PickupVisualEntry = {
    root,
    modelPivot,
    fallbackMesh,
    outlineMaterial,
    ring,
    modelPath,
    baseY: pos.y,
    createdAtMs: nowMs,
    disposed: false,
  };

  loadPickupModel(entry, modelPath, modelSize);
  return entry;
}

export function loadPickupModel(
  entry: PickupVisualEntry,
  modelPath: string,
  modelSize: number,
): void {
  if (typeof window === "undefined") return;

  void cloneNormalizedWeaponModel(modelPath, modelSize)
    .then((model) => {
      if (entry.disposed) return;
      if (entry.modelPath !== modelPath) return;

      if (entry.modelRoot) entry.modelPivot.remove(entry.modelRoot);
      if (entry.outlineModelClone) {
        entry.modelPivot.remove(entry.outlineModelClone);
        entry.outlineModelClone = undefined;
      }

      entry.fallbackMesh.visible = false;
      entry.modelRoot = model;
      entry.modelPivot.add(model);

      const outlineClone = model.clone(true);
      outlineClone.scale.multiplyScalar(OUTLINE_MODEL_SCALE);
      outlineClone.traverse((child) => {
        if (child instanceof THREE.Mesh) child.material = entry.outlineMaterial;
      });
      entry.modelPivot.add(outlineClone);
      entry.outlineModelClone = outlineClone;
    })
    .catch(() => {
      if (!entry.disposed) entry.fallbackMesh.visible = true;
    });
}

export function updatePickupVisual(
  entry: PickupVisualEntry,
  nowMs: number,
  spin: PickupSpinRates,
): void {
  const t = (nowMs - entry.createdAtMs) / 1000;
  entry.root.rotation.y = t * spin.rootY;
  entry.modelPivot.rotation.x = t * spin.pivotX;
  entry.modelPivot.rotation.z = t * spin.pivotZ;
  entry.ring.rotation.z = t * spin.ringZ;
  entry.root.position.y = entry.baseY + Math.sin(t * spin.bobFreq) * 0.45;

  entry.modelPivot.scale.setScalar(1.0 + 0.05 * Math.sin(t * 1.9));
  entry.outlineMaterial.opacity = 0.55 + 0.35 * Math.sin(t * 1.9 + 0.6);

  const fallbackMat = entry.fallbackMesh.material;
  if (fallbackMat instanceof THREE.MeshLambertMaterial && entry.fallbackMesh.visible) {
    fallbackMat.emissiveIntensity = 0.65 + 0.55 * Math.sin(t * 1.9);
  }
}

export function disposePickupVisual(scene: THREE.Scene, entry: PickupVisualEntry): void {
  entry.disposed = true;
  scene.remove(entry.root);
  entry.fallbackMesh.geometry.dispose();
  entry.ring.geometry.dispose();
  (entry.fallbackMesh.material as THREE.Material).dispose();
  (entry.ring.material as THREE.Material).dispose();
  entry.outlineMaterial.dispose();
  if (entry.outlineModelClone) entry.modelPivot.remove(entry.outlineModelClone);
  if (entry.modelRoot) disposeWeaponModel(entry.modelRoot);
}
