import * as THREE from "three";
import type { PerformanceMetricGroup } from "../types.ts";

export function getGeometryTriangleCount(geometry: THREE.BufferGeometry | null): number {
  if (!geometry) return 0;
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);

  const position = geometry.getAttribute("position");
  return position ? Math.floor(position.count / 3) : 0;
}

export function getMeshTriangleCount(mesh: THREE.Mesh | THREE.InstancedMesh): number {
  const baseTriangles = getGeometryTriangleCount(mesh.geometry);
  if (mesh instanceof THREE.InstancedMesh) return baseTriangles * mesh.count;
  return baseTriangles;
}

export function createMetricGroup(
  id: string,
  label: string,
  items: (THREE.Mesh | THREE.InstancedMesh | THREE.Line | THREE.LineSegments | null)[],
  notes?: string,
): PerformanceMetricGroup {
  let triangles = 0;
  let drawCalls = 0;
  let meshes = 0;
  let instances = 0;

  for (const item of items) {
    if (!item || !item.visible) continue;
    meshes++;
    drawCalls += item instanceof THREE.InstancedMesh && item.count === 0 ? 0 : 1;

    if (item instanceof THREE.InstancedMesh) {
      instances += item.count;
      triangles += getMeshTriangleCount(item);
      continue;
    }

    if (item instanceof THREE.Mesh) {
      triangles += getMeshTriangleCount(item);
    }
  }

  return { id, label, triangles, drawCalls, meshes, instances, notes };
}

export function emptyMetricGroup(
  id: string,
  label: string,
  notes?: string,
): PerformanceMetricGroup {
  return { id, label, triangles: 0, drawCalls: 0, meshes: 0, instances: 0, notes };
}
