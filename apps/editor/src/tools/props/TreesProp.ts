import * as THREE from "three";
import type { PropId } from "../../types.ts";

export const MAX_TREE_INSTANCES = 2000;

const TREE_COLORS = {
  trunk: 0x6d4a2f,
  canopy: 0x2ea043,
  canopyDark: 0x1f6f3a,
  palmTrunk: 0x9b6a3d,
  palmFronds: 0x35a852,
};

export class TreesProp {
  readonly group = new THREE.Group();

  private readonly trunkMesh: THREE.InstancedMesh;
  private readonly canopyMesh: THREE.InstancedMesh;
  private readonly canopyTopMesh: THREE.InstancedMesh;
  private readonly palmTrunkMesh: THREE.InstancedMesh;
  private readonly palmFrondsMesh: THREE.InstancedMesh;

  private treeCount = 0;
  private palmCount = 0;

  constructor() {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.1, 5);
    trunkGeo.translate(0, 1.05, 0);

    const canopyGeo = new THREE.ConeGeometry(1.15, 2.1, 6);
    canopyGeo.translate(0, 2.45, 0);

    const canopyTopGeo = new THREE.ConeGeometry(0.8, 1.65, 6);
    canopyTopGeo.translate(0, 3.45, 0);

    const palmTrunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 3.6, 6, 4);
    palmTrunkGeo.translate(0, 1.8, 0);

    this.trunkMesh = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshLambertMaterial({ color: TREE_COLORS.trunk }),
      MAX_TREE_INSTANCES,
    );
    this.canopyMesh = new THREE.InstancedMesh(
      canopyGeo,
      new THREE.MeshLambertMaterial({ color: TREE_COLORS.canopy }),
      MAX_TREE_INSTANCES,
    );
    this.canopyTopMesh = new THREE.InstancedMesh(
      canopyTopGeo,
      new THREE.MeshLambertMaterial({ color: TREE_COLORS.canopyDark }),
      MAX_TREE_INSTANCES,
    );
    this.palmTrunkMesh = new THREE.InstancedMesh(
      palmTrunkGeo,
      new THREE.MeshLambertMaterial({ color: TREE_COLORS.palmTrunk }),
      MAX_TREE_INSTANCES,
    );
    this.palmFrondsMesh = new THREE.InstancedMesh(
      this.createPalmFrondsGeometry(),
      new THREE.MeshLambertMaterial({ color: TREE_COLORS.palmFronds, side: THREE.DoubleSide }),
      MAX_TREE_INSTANCES,
    );

    this.trunkMesh.count = 0;
    this.canopyMesh.count = 0;
    this.canopyTopMesh.count = 0;
    this.palmTrunkMesh.count = 0;
    this.palmFrondsMesh.count = 0;
    this.group.add(
      this.trunkMesh,
      this.canopyMesh,
      this.canopyTopMesh,
      this.palmTrunkMesh,
      this.palmFrondsMesh,
    );
  }

  getCount(propId: PropId): number {
    return propId === "palmTree" ? this.palmCount : this.treeCount;
  }

  add(propId: PropId, matrix: THREE.Matrix4): void {
    if (propId === "palmTree") {
      this.addPalmTree(matrix);
      return;
    }
    this.addLowPolyTree(matrix);
  }

  dispose(): void {
    this.trunkMesh.geometry.dispose();
    this.canopyMesh.geometry.dispose();
    this.canopyTopMesh.geometry.dispose();
    this.palmTrunkMesh.geometry.dispose();
    this.palmFrondsMesh.geometry.dispose();
    (this.trunkMesh.material as THREE.Material).dispose();
    (this.canopyMesh.material as THREE.Material).dispose();
    (this.canopyTopMesh.material as THREE.Material).dispose();
    (this.palmTrunkMesh.material as THREE.Material).dispose();
    (this.palmFrondsMesh.material as THREE.Material).dispose();
  }

  private addLowPolyTree(matrix: THREE.Matrix4): void {
    this.trunkMesh.setMatrixAt(this.treeCount, matrix);
    this.canopyMesh.setMatrixAt(this.treeCount, matrix);
    this.canopyTopMesh.setMatrixAt(this.treeCount, matrix);
    this.treeCount++;

    this.trunkMesh.count = this.treeCount;
    this.canopyMesh.count = this.treeCount;
    this.canopyTopMesh.count = this.treeCount;
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.canopyMesh.instanceMatrix.needsUpdate = true;
    this.canopyTopMesh.instanceMatrix.needsUpdate = true;
  }

  private addPalmTree(matrix: THREE.Matrix4): void {
    this.palmTrunkMesh.setMatrixAt(this.palmCount, matrix);
    this.palmFrondsMesh.setMatrixAt(this.palmCount, matrix);
    this.palmCount++;

    this.palmTrunkMesh.count = this.palmCount;
    this.palmFrondsMesh.count = this.palmCount;
    this.palmTrunkMesh.instanceMatrix.needsUpdate = true;
    this.palmFrondsMesh.instanceMatrix.needsUpdate = true;
  }

  private createPalmFrondsGeometry(): THREE.BufferGeometry {
    const frondCount = 7;
    const verts: number[] = [];
    const crownHeight = 3.65;

    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const sideX = -dirZ;
      const sideZ = dirX;
      const baseWidth = 0.42;
      const midWidth = 0.34;

      const baseX = dirX * 0.18;
      const baseZ = dirZ * 0.18;
      const midX = dirX * 1.1;
      const midZ = dirZ * 1.1;
      const tipX = dirX * 1.95;
      const tipZ = dirZ * 1.95;

      verts.push(
        baseX + sideX * baseWidth,
        crownHeight,
        baseZ + sideZ * baseWidth,
        baseX - sideX * baseWidth,
        crownHeight,
        baseZ - sideZ * baseWidth,
        midX + sideX * midWidth,
        crownHeight - 0.25,
        midZ + sideZ * midWidth,
        baseX - sideX * baseWidth,
        crownHeight,
        baseZ - sideZ * baseWidth,
        midX - sideX * midWidth,
        crownHeight - 0.25,
        midZ - sideZ * midWidth,
        midX + sideX * midWidth,
        crownHeight - 0.25,
        midZ + sideZ * midWidth,
        midX + sideX * midWidth,
        crownHeight - 0.25,
        midZ + sideZ * midWidth,
        midX - sideX * midWidth,
        crownHeight - 0.25,
        midZ - sideZ * midWidth,
        tipX,
        crownHeight - 0.7,
        tipZ,
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }
}
