import * as THREE from "three";
import { createMetricGroup } from "../../performance/geometryStats.ts";
import type { PerformanceMetricGroup } from "../../types.ts";
import type { PropId } from "../../types.ts";
import {
  createLowPolyTreeGeometry,
  createPalmTreeGeometry,
  createMushroomGeometry,
  createCactusGeometry,
  createBushGeometry,
  createFlowerGeometry,
  TREE_COLORS,
} from "./PropGeometries.ts";

export const MAX_NATURE_INSTANCES = 2000;

export class NatureProps {
  readonly group = new THREE.Group();

  // Trees
  private readonly trunkMesh: THREE.InstancedMesh;
  private readonly canopyMesh: THREE.InstancedMesh;
  private readonly canopyTopMesh: THREE.InstancedMesh;
  private readonly palmTrunkMesh: THREE.InstancedMesh;
  private readonly palmFrondsMesh: THREE.InstancedMesh;

  // Nature
  private readonly mushroomTrunkMesh: THREE.InstancedMesh;
  private readonly mushroomCapMesh: THREE.InstancedMesh;
  private readonly cactusMesh: THREE.InstancedMesh;
  private readonly bushMesh: THREE.InstancedMesh;
  private readonly flowerStemMesh: THREE.InstancedMesh;
  private readonly flowerPetalMesh: THREE.InstancedMesh;

  private counts: Record<PropId, number> = {
    lowPolyTree: 0,
    palmTree: 0,
    mushroom: 0,
    cactus: 0,
    bush: 0,
    flower: 0,
    ramp: 0, // Not used here but included for type safety
  };

  constructor() {
    // Geometries
    const { trunkGeo, canopyGeo, canopyTopGeo } = createLowPolyTreeGeometry();
    const { palmTrunkGeo, palmFrondsGeo } = createPalmTreeGeometry();
    const { trunkGeo: mushTrunkGeo, capGeo: mushCapGeo } = createMushroomGeometry();
    const { cactusGeo } = createCactusGeometry();
    const { bushGeo } = createBushGeometry();
    const { stemGeo: flowerStemGeo, petalGeo: flowerPetalGeo } = createFlowerGeometry();

    // Meshes
    this.trunkMesh = this.createIMesh(trunkGeo, TREE_COLORS.trunk);
    this.canopyMesh = this.createIMesh(canopyGeo, TREE_COLORS.canopy);
    this.canopyTopMesh = this.createIMesh(canopyTopGeo, TREE_COLORS.canopyDark);
    this.palmTrunkMesh = this.createIMesh(palmTrunkGeo, TREE_COLORS.palmTrunk);
    this.palmFrondsMesh = this.createIMesh(palmFrondsGeo, TREE_COLORS.palmFronds, true);

    this.mushroomTrunkMesh = this.createIMesh(mushTrunkGeo, TREE_COLORS.mushroomTrunk);
    this.mushroomCapMesh = this.createIMesh(mushCapGeo, TREE_COLORS.mushroomCap);
    this.cactusMesh = this.createIMesh(cactusGeo, TREE_COLORS.cactus);
    this.bushMesh = this.createIMesh(bushGeo, TREE_COLORS.bush);
    this.flowerStemMesh = this.createIMesh(flowerStemGeo, TREE_COLORS.flowerStem);
    this.flowerPetalMesh = this.createIMesh(flowerPetalGeo, TREE_COLORS.flowerPetal, true);

    this.group.add(
      this.trunkMesh,
      this.canopyMesh,
      this.canopyTopMesh,
      this.palmTrunkMesh,
      this.palmFrondsMesh,
      this.mushroomTrunkMesh,
      this.mushroomCapMesh,
      this.cactusMesh,
      this.bushMesh,
      this.flowerStemMesh,
      this.flowerPetalMesh,
    );
  }

  private createIMesh(
    geo: THREE.BufferGeometry,
    color: number,
    doubleSide = false,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({
        color,
        side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      }),
      MAX_NATURE_INSTANCES,
    );
    mesh.count = 0;
    return mesh;
  }

  getCount(propId: PropId): number {
    return this.counts[propId] || 0;
  }

  getPerformanceStats(): PerformanceMetricGroup[] {
    return [
      createMetricGroup(
        "props-nature-trees",
        "Trees",
        [
          this.trunkMesh,
          this.canopyMesh,
          this.canopyTopMesh,
          this.palmTrunkMesh,
          this.palmFrondsMesh,
        ],
        `${this.counts.lowPolyTree + this.counts.palmTree} trees`,
      ),
      createMetricGroup(
        "props-nature-veg",
        "Vegetation",
        [
          this.mushroomTrunkMesh,
          this.mushroomCapMesh,
          this.cactusMesh,
          this.bushMesh,
          this.flowerStemMesh,
          this.flowerPetalMesh,
        ],
        `${this.counts.mushroom + this.counts.cactus + this.counts.bush + this.counts.flower} items`,
      ),
    ];
  }

  add(propId: PropId, matrix: THREE.Matrix4): void {
    const idx = this.counts[propId];
    if (idx >= MAX_NATURE_INSTANCES) return;

    switch (propId) {
      case "lowPolyTree":
        this.updateInstance(this.trunkMesh, idx, matrix);
        this.updateInstance(this.canopyMesh, idx, matrix);
        this.updateInstance(this.canopyTopMesh, idx, matrix);
        break;
      case "palmTree":
        this.updateInstance(this.palmTrunkMesh, idx, matrix);
        this.updateInstance(this.palmFrondsMesh, idx, matrix);
        break;
      case "mushroom":
        this.updateInstance(this.mushroomTrunkMesh, idx, matrix);
        this.updateInstance(this.mushroomCapMesh, idx, matrix);
        break;
      case "cactus":
        this.updateInstance(this.cactusMesh, idx, matrix);
        break;
      case "bush":
        this.updateInstance(this.bushMesh, idx, matrix);
        break;
      case "flower":
        this.updateInstance(this.flowerStemMesh, idx, matrix);
        this.updateInstance(this.flowerPetalMesh, idx, matrix);
        break;
    }

    this.counts[propId]++;
  }

  private updateInstance(mesh: THREE.InstancedMesh, index: number, matrix: THREE.Matrix4): void {
    mesh.setMatrixAt(index, matrix);
    mesh.count = index + 1;
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.children.forEach((child) => {
      if (child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}
