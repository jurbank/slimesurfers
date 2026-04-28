import * as THREE from "three";
import { createMetricGroup } from "../../performance/geometryStats.ts";
import type { PerformanceMetricGroup } from "../../types.ts";
import type { PropId } from "../../types.ts";

export const MAX_SKATE_PARK_INSTANCES = 1000;

const SKATE_PARK_COLORS = {
  rampDeck: 0x8b95a1,
};

export class SkateParkProp {
  readonly group = new THREE.Group();

  private readonly rampGeometry: THREE.BufferGeometry;
  private readonly rampMesh: THREE.InstancedMesh;
  private readonly rampPreviewMesh: THREE.Mesh;
  private rampCount = 0;

  constructor() {
    this.rampGeometry = this.createRampGeometry();
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

  private createRampGeometry(): THREE.BufferGeometry {
    const halfWidth = 1.35;
    const frontZ = -1.65;
    const lipZ = 0.75;
    const backZ = 1.45;
    const height = 1.0;
    const curveSegments = 7;
    const positions: number[] = [];

    const quad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number],
    ) => {
      positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    };

    const curve: [number, number][] = [];
    for (let i = 0; i <= curveSegments; i++) {
      const t = i / curveSegments;
      const z = frontZ + (lipZ - frontZ) * t;
      const y = height * (1 - Math.cos((t * Math.PI) / 2));
      curve.push([z, y]);
    }

    for (let i = 0; i < curve.length - 1; i++) {
      const [z0, y0] = curve[i];
      const [z1, y1] = curve[i + 1];
      quad([-halfWidth, y0, z0], [halfWidth, y0, z0], [halfWidth, y1, z1], [-halfWidth, y1, z1]);
    }

    quad(
      [-halfWidth, height, lipZ],
      [halfWidth, height, lipZ],
      [halfWidth, height, backZ],
      [-halfWidth, height, backZ],
    );
    quad(
      [-halfWidth, 0, frontZ],
      [-halfWidth, 0, backZ],
      [halfWidth, 0, backZ],
      [halfWidth, 0, frontZ],
    );
    quad(
      [-halfWidth, 0, backZ],
      [-halfWidth, height, backZ],
      [halfWidth, height, backZ],
      [halfWidth, 0, backZ],
    );

    for (const x of [-halfWidth, halfWidth]) {
      for (let i = 0; i < curve.length - 1; i++) {
        const [z0, y0] = curve[i];
        const [z1, y1] = curve[i + 1];
        if (x < 0) {
          quad([x, 0, z0], [x, y0, z0], [x, y1, z1], [x, 0, z1]);
        } else {
          quad([x, 0, z0], [x, 0, z1], [x, y1, z1], [x, y0, z0]);
        }
      }
      if (x < 0) {
        quad([x, 0, lipZ], [x, height, lipZ], [x, height, backZ], [x, 0, backZ]);
      } else {
        quad([x, 0, lipZ], [x, 0, backZ], [x, height, backZ], [x, height, lipZ]);
      }
    }

    const copingRadius = 0.09;
    const copingSegments = 8;
    for (let i = 0; i < copingSegments; i++) {
      const a0 = (i / copingSegments) * Math.PI * 2;
      const a1 = ((i + 1) / copingSegments) * Math.PI * 2;
      const y0 = height + Math.sin(a0) * copingRadius;
      const z0 = lipZ + Math.cos(a0) * copingRadius;
      const y1 = height + Math.sin(a1) * copingRadius;
      const z1 = lipZ + Math.cos(a1) * copingRadius;
      quad([-halfWidth, y0, z0], [halfWidth, y0, z0], [halfWidth, y1, z1], [-halfWidth, y1, z1]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }
}
