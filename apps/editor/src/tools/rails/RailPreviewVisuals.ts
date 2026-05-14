import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import type { EditorConfig } from "../../types.ts";
import type { RailPoint, RailState } from "./RailTypes.ts";
import { RAIL_SURFACE_OFFSET, RAIL_TUNNEL_TERRAIN_THRESHOLD } from "./railConstants.ts";

interface RailSample {
  position: THREE.Vector3;
  width: number;
  bank: number;
  terrainRadius: number;
  waterRadius: number;
}

export type RailPreviewRadiusSampler = (nx: number, ny: number, nz: number) => number;

const RAIL_TUBE_SEGMENTS = 12;
const RAIL_SUPPORT_SPACING = 18;
const RAIL_SUPPORT_RADIUS = 0.18;
const RAIL_SUPPORT_SEGMENTS = 6;

export class RailPreviewVisuals {
  private config: EditorConfig;
  private rails: readonly RailState[];
  private readonly group = new THREE.Group();
  private readonly railMaterial = new THREE.MeshStandardMaterial({
    color: 0xd0d8e8,
    emissive: 0x06111f,
    metalness: 0.72,
    roughness: 0.32,
  });
  private readonly supportMaterial = new THREE.MeshStandardMaterial({
    color: 0x8090a8,
    metalness: 0.7,
    roughness: 0.4,
  });
  private readonly tunnelMaterial = new THREE.MeshLambertMaterial({
    color: 0x1e293b,
    side: THREE.BackSide,
  });
  private railMeshes: THREE.Mesh[] = [];
  private supportMesh: THREE.InstancedMesh | null = null;
  private tunnelMesh: THREE.Mesh | null = null;

  constructor(
    scene: THREE.Scene,
    config: EditorConfig,
    rails: readonly RailState[],
    private readonly getRadiusAtNormal: RailPreviewRadiusSampler,
  ) {
    this.config = config;
    this.rails = rails;
    this.group.visible = false;
    scene.add(this.group);
    this.rebuild();
  }

  setActive(active: boolean): void {
    this.group.visible = active;
  }

  setConfig(config: EditorConfig): void {
    this.config = config;
    this.rebuild();
  }

  setRails(rails: readonly RailState[]): void {
    this.rails = rails;
    this.rebuild();
  }

  dispose(): void {
    this.clearRailMeshes();
    this.disposeMesh(this.supportMesh);
    this.disposeMesh(this.tunnelMesh);
    this.group.removeFromParent();
    this.railMaterial.dispose();
    this.supportMaterial.dispose();
    this.tunnelMaterial.dispose();
  }

  private rebuild(): void {
    const samplesByRail = this.rails
      .map((rail) => ({ rail, samples: this.getSurfaceSamples(rail) }))
      .filter(({ samples }) => samples.length >= 2);

    this.updateRailTubes(samplesByRail);
    this.updateRailSupports(samplesByRail);
    this.updateTunnelShell(samplesByRail);
  }

  private updateRailTubes(rails: { rail: RailState; samples: RailSample[] }[]): void {
    this.clearRailMeshes();

    for (const { rail, samples } of rails) {
      const closed = rail.closed && rail.points.length >= 3;
      const curvePoints = closed ? samples.slice(0, -1) : samples;
      if (curvePoints.length < (closed ? 3 : 2)) continue;

      const curve = new THREE.CatmullRomCurve3(
        curvePoints.map((sample) => sample.position),
        closed,
        "centripetal",
      );
      const geometry = new THREE.TubeGeometry(
        curve,
        Math.max(2, curvePoints.length - 1),
        GAME_CONFIG.rail.visualRadius,
        RAIL_TUBE_SEGMENTS,
        closed,
      );
      const mesh = new THREE.Mesh(geometry, this.railMaterial);
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.railMeshes.push(mesh);
    }
  }

  private updateRailSupports(rails: { samples: RailSample[] }[]): void {
    const supportData: THREE.Matrix4[] = [];

    for (const { samples } of rails) {
      let distanceSinceSupport = RAIL_SUPPORT_SPACING;
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i]!;
        if (i > 0) {
          distanceSinceSupport += sample.position.distanceTo(samples[i - 1]!.position);
        }
        if (distanceSinceSupport < RAIL_SUPPORT_SPACING) continue;
        distanceSinceSupport = 0;

        const railRadius = sample.position.length();
        const baseRadius = Math.max(sample.terrainRadius, sample.waterRadius);
        const height = railRadius - baseRadius - GAME_CONFIG.rail.visualRadius;
        if (height <= 0.5) continue;

        const normal = sample.position.clone().normalize();
        const pos = normal.clone().multiplyScalar(baseRadius + height * 0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        const matrix = new THREE.Matrix4();
        matrix.compose(
          pos,
          quat,
          new THREE.Vector3(RAIL_SUPPORT_RADIUS, height, RAIL_SUPPORT_RADIUS),
        );
        supportData.push(matrix);
      }
    }

    if (supportData.length === 0) {
      if (this.supportMesh) this.supportMesh.visible = false;
      return;
    }

    if (!this.supportMesh || this.supportMesh.instanceMatrix.count < supportData.length) {
      if (this.supportMesh) {
        this.supportMesh.geometry.dispose();
        this.group.remove(this.supportMesh);
      }
      this.supportMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, RAIL_SUPPORT_SEGMENTS),
        this.supportMaterial,
        supportData.length,
      );
      this.supportMesh.renderOrder = 3;
      this.group.add(this.supportMesh);
    }

    supportData.forEach((matrix, index) => this.supportMesh?.setMatrixAt(index, matrix));
    this.supportMesh.count = supportData.length;
    this.supportMesh.instanceMatrix.needsUpdate = true;
    this.supportMesh.visible = true;
  }

  private clearRailMeshes(): void {
    for (const mesh of this.railMeshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.railMeshes = [];
  }

  private updateTunnelShell(rails: { rail: RailState; samples: RailSample[] }[]): void {
    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (const { rail, samples } of rails) {
      const closed = rail.closed && rail.points.length >= 3;
      const rings = closed ? samples.length - 1 : samples.length;
      const isTunnelRing = samples.map(
        (s) =>
          s.position.length() - s.terrainRadius < RAIL_TUNNEL_TERRAIN_THRESHOLD ||
          s.position.length() < s.waterRadius,
      );

      for (let i = 0; i < rings; i++) {
        const next = (i + 1) % rings;
        if (!isTunnelRing[i] && !isTunnelRing[next]) continue;

        const archA = this.buildTunnelArch(samples, i, rings, closed);
        const archB = this.buildTunnelArch(samples, next, rings, closed);
        for (const p of archA) positions.push(p.x, p.y, p.z);
        for (const p of archB) positions.push(p.x, p.y, p.z);

        const baseA = vertexOffset;
        const baseB = vertexOffset + 4;
        for (let j = 0; j < 3; j++) {
          const a1 = baseA + j;
          const a2 = baseA + j + 1;
          const b1 = baseB + j;
          const b2 = baseB + j + 1;
          indices.push(a1, b1, b2, a1, b2, a2);
        }
        vertexOffset += 8;
      }
    }

    this.replaceMesh("tunnelMesh", positions, null, indices, this.tunnelMaterial, 2);
  }

  private buildTunnelArch(
    samples: RailSample[],
    idx: number,
    rings: number,
    closed: boolean,
  ): THREE.Vector3[] {
    const sample = samples[idx]!;
    const center = sample.position;
    const prev = closed
      ? samples[(idx - 1 + rings) % rings]!.position
      : samples[Math.max(0, idx - 1)]!.position;
    const next = closed
      ? samples[(idx + 1) % rings]!.position
      : samples[Math.min(rings - 1, idx + 1)]!.position;
    const surfaceNormal = center.clone().normalize();
    const tangent = next.clone().sub(prev);
    tangent.addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal)).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, surfaceNormal).normalize();
    side.applyAxisAngle(tangent, (sample.bank * Math.PI) / 180);
    const up = surfaceNormal.clone().applyAxisAngle(tangent, (sample.bank * Math.PI) / 180);
    const width = sample.width + 2;
    const height = 6;

    return [
      center.clone().addScaledVector(side, -width * 0.5),
      center
        .clone()
        .addScaledVector(side, -width * 0.5)
        .addScaledVector(up, height),
      center
        .clone()
        .addScaledVector(side, width * 0.5)
        .addScaledVector(up, height),
      center.clone().addScaledVector(side, width * 0.5),
    ];
  }

  private getSurfaceSamples(rail: RailState): RailSample[] {
    if (rail.points.length < 2) return [];
    const controls = rail.points.map((point) => this.positionFromPoint(point));
    const closed = rail.closed && controls.length >= 3;
    if ((!closed && controls.length < 2) || (closed && controls.length < 3)) return [];

    const curve = new THREE.CatmullRomCurve3(controls, closed, "centripetal");
    const divisions = Math.max(
      2,
      rail.segmentsPerCurve * (closed ? controls.length : controls.length - 1),
    );
    const p0 = this.config.planets[0]!;
    const waterRadius = p0.radius + p0.terrain.waterLevel;
    const samples: RailSample[] = [];

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const position = curve.getPoint(t);
      const normal = position.clone().normalize();
      const scalars = this.interpolatePointScalars(rail, t, closed);
      samples.push({
        position,
        width: scalars.width,
        bank: scalars.bank,
        terrainRadius: this.getRadiusAtNormal(normal.x, normal.y, normal.z),
        waterRadius,
      });
    }

    return samples;
  }

  private positionFromPoint(point: RailPoint): THREE.Vector3 {
    if (point.position) return new THREE.Vector3(...point.position);
    const normal = new THREE.Vector3(...point.normal).normalize();
    return normal.multiplyScalar(
      this.getRadiusAtNormal(normal.x, normal.y, normal.z) + RAIL_SURFACE_OFFSET,
    );
  }

  private interpolatePointScalars(
    rail: RailState,
    t: number,
    closed: boolean,
  ): { width: number; bank: number } {
    const pointCount = rail.points.length;
    const segmentCount = closed ? pointCount : Math.max(1, pointCount - 1);
    const scaled = Math.min(t * segmentCount, segmentCount - Number.EPSILON);
    const index = Math.floor(scaled);
    const localT = scaled - index;
    const a = rail.points[Math.min(index, pointCount - 1)];
    const b = rail.points[closed ? (index + 1) % pointCount : Math.min(index + 1, pointCount - 1)];
    return {
      width: THREE.MathUtils.lerp(a?.width ?? rail.width, b?.width ?? rail.width, localT),
      bank: THREE.MathUtils.lerp(a?.bank ?? rail.bank, b?.bank ?? rail.bank, localT),
    };
  }

  private replaceMesh(
    key: "tunnelMesh",
    positions: number[],
    normals: number[] | null,
    indices: number[],
    material: THREE.Material,
    renderOrder: number,
  ): void {
    const existing = this[key];
    if (positions.length === 0 || indices.length === 0) {
      if (existing) existing.visible = false;
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    if (normals) {
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    if (!existing) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = renderOrder;
      this[key] = mesh;
      this.group.add(mesh);
    } else {
      existing.geometry.dispose();
      existing.geometry = geometry;
      existing.visible = true;
    }
  }

  private disposeMesh(mesh: THREE.Mesh | THREE.InstancedMesh | null): void {
    if (!mesh) return;
    mesh.geometry.dispose();
  }
}
