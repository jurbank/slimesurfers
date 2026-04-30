import * as THREE from "three";
import { createMetricGroup } from "../../performance/geometryStats.ts";
import type { PerformanceMetricGroup } from "../../types.ts";
import type { PropId } from "../../types.ts";
import { createRampGeometry, SKATE_PARK_COLORS } from "./PropGeometries.ts";

export const MAX_SKATE_PARK_INSTANCES = 1000;

export class SkateParkProp {
  readonly group = new THREE.Group();

  private readonly rampGeometry: THREE.BufferGeometry;
  private readonly rampMesh: THREE.InstancedMesh;
  private readonly rampPreviewMesh: THREE.Mesh;
  private rampCount = 0;

  constructor() {
    this.rampGeometry = createRampGeometry();
    this.rampMesh = new THREE.InstancedMesh(
      this.rampGeometry,
      new THREE.MeshLambertMaterial({
        color: SKATE_PARK_COLORS.rampDeck,
        flatShading: true,
      }),
      MAX_SKATE_PARK_INSTANCES,
    );
    this.rampMesh.count = 0;

    this.rampPreviewMesh = new THREE.Mesh(
      this.rampGeometry,
      new THREE.MeshLambertMaterial({
        color: 0x67e8f9,
        emissive: 0x123a45,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        flatShading: true,
      }),
    );
    this.rampPreviewMesh.renderOrder = 9;
    this.rampPreviewMesh.visible = false;
    this.group.add(this.rampMesh, this.rampPreviewMesh);
  }

  getCount(propId: PropId): number {
    return propId === "ramp" ? this.rampCount : 0;
  }

  getPerformanceStats(): PerformanceMetricGroup[] {
    return [
      createMetricGroup(
        "props-ramp",
        "Ramps",
        [this.rampMesh, this.rampPreviewMesh],
        `${this.rampCount} placed ramps plus visible placement preview`,
      ),
    ];
  }

  add(propId: PropId, matrix: THREE.Matrix4): void {
    if (propId !== "ramp") return;
    this.rampMesh.setMatrixAt(this.rampCount, matrix);
    this.rampCount++;
    this.rampMesh.count = this.rampCount;
    this.rampMesh.instanceMatrix.needsUpdate = true;
  }

  setPreview(propId: PropId, matrix: THREE.Matrix4 | null): void {
    if (propId !== "ramp" || !matrix) {
      this.rampPreviewMesh.visible = false;
      return;
    }
    this.rampPreviewMesh.matrixAutoUpdate = false;
    this.rampPreviewMesh.matrix.copy(matrix);
    this.rampPreviewMesh.matrixWorldNeedsUpdate = true;
    this.rampPreviewMesh.visible = true;
  }

  dispose(): void {
    this.rampGeometry.dispose();
    (this.rampMesh.material as THREE.Material).dispose();
    (this.rampPreviewMesh.material as THREE.Material).dispose();
  }
}
