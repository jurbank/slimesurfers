import * as THREE from "three";
import type { EditorConfig } from "../../types.ts";
import type { TrackPoint, TrackState } from "./TrackTypes.ts";

interface TrackSample {
  position: THREE.Vector3;
  width: number;
  bank: number;
  terrainRadius: number;
  waterRadius: number;
}

export type TrackPreviewRadiusSampler = (nx: number, ny: number, nz: number) => number;

const TRACK_SURFACE_OFFSET = 0.18;
const TUNNEL_TERRAIN_THRESHOLD = -0.5;

export class TrackPreviewVisuals {
  private config: EditorConfig;
  private tracks: readonly TrackState[];
  private readonly group = new THREE.Group();
  private readonly trackMaterial = new THREE.MeshLambertMaterial({
    color: 0x2f343b,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.75,
  });
  private readonly bridgeMaterial = new THREE.MeshLambertMaterial({ color: 0x64748b });
  private readonly tunnelMaterial = new THREE.MeshLambertMaterial({
    color: 0x1e293b,
    side: THREE.BackSide,
  });
  private trackMesh: THREE.Mesh | null = null;
  private edgeLines: THREE.LineSegments | null = null;
  private bridgeMesh: THREE.InstancedMesh | null = null;
  private tunnelMesh: THREE.Mesh | null = null;

  constructor(
    scene: THREE.Scene,
    config: EditorConfig,
    tracks: readonly TrackState[],
    private readonly getRadiusAtNormal: TrackPreviewRadiusSampler,
  ) {
    this.config = config;
    this.tracks = tracks;
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

  setTracks(tracks: readonly TrackState[]): void {
    this.tracks = tracks;
    this.rebuild();
  }

  dispose(): void {
    this.disposeMesh(this.trackMesh);
    this.disposeLine(this.edgeLines);
    this.disposeMesh(this.bridgeMesh);
    this.disposeMesh(this.tunnelMesh);
    this.group.removeFromParent();
    this.trackMaterial.dispose();
    this.edgeMaterial.dispose();
    this.bridgeMaterial.dispose();
    this.tunnelMaterial.dispose();
  }

  private rebuild(): void {
    const samplesByTrack = this.tracks
      .map((track) => ({ track, samples: this.getSurfaceSamples(track) }))
      .filter(({ samples }) => samples.length >= 2);

    this.updateTrackSurface(samplesByTrack);
    this.updateBridgeSupports(samplesByTrack.flatMap(({ samples }) => samples));
    this.updateTunnelShell(samplesByTrack);
  }

  private updateTrackSurface(tracks: { track: TrackState; samples: TrackSample[] }[]): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const edgePositions: number[] = [];
    let vertexOffset = 0;

    for (const { track, samples } of tracks) {
      const closed = track.closed && track.points.length >= 3;
      const rings = closed ? samples.length - 1 : samples.length;
      if (rings < 2) continue;

      const left: THREE.Vector3[] = [];
      const right: THREE.Vector3[] = [];
      for (let i = 0; i < rings; i++) {
        const center = samples[i]!.position;
        const prev = closed
          ? samples[(i - 1 + rings) % rings]!.position
          : samples[Math.max(0, i - 1)]!.position;
        const next = closed
          ? samples[(i + 1) % rings]!.position
          : samples[Math.min(rings - 1, i + 1)]!.position;
        const surfaceNormal = center.clone().normalize();
        const tangent = next.clone().sub(prev);
        tangent.addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal)).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, surfaceNormal).normalize();
        side.applyAxisAngle(tangent, (samples[i]!.bank * Math.PI) / 180);

        left.push(center.clone().addScaledVector(side, -samples[i]!.width * 0.5));
        right.push(center.clone().addScaledVector(side, samples[i]!.width * 0.5));
        normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
        normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
      }

      for (let i = 0; i < rings; i++) {
        positions.push(left[i]!.x, left[i]!.y, left[i]!.z);
        positions.push(right[i]!.x, right[i]!.y, right[i]!.z);
        const nextIndex = (i + 1) % rings;
        if (!closed && i === rings - 1) continue;
        edgePositions.push(
          left[i]!.x,
          left[i]!.y,
          left[i]!.z,
          left[nextIndex]!.x,
          left[nextIndex]!.y,
          left[nextIndex]!.z,
          right[i]!.x,
          right[i]!.y,
          right[i]!.z,
          right[nextIndex]!.x,
          right[nextIndex]!.y,
          right[nextIndex]!.z,
        );
      }

      const segmentCount = closed ? rings : rings - 1;
      for (let i = 0; i < segmentCount; i++) {
        const nextIndex = (i + 1) % rings;
        const leftA = vertexOffset + i * 2;
        const rightA = leftA + 1;
        const leftB = vertexOffset + nextIndex * 2;
        const rightB = leftB + 1;
        indices.push(leftA, rightA, rightB, leftA, rightB, leftB);
      }
      vertexOffset += rings * 2;
    }

    this.replaceMesh("trackMesh", positions, normals, indices, this.trackMaterial, 4);
    this.replaceLineSegments("edgeLines", edgePositions, this.edgeMaterial, 13);
  }

  private updateBridgeSupports(samples: TrackSample[]): void {
    const bridgeData: THREE.Matrix4[] = [];
    const pillarSpacing = 4;
    const bridgeThreshold = 1.5;

    for (let i = 0; i < samples.length; i += pillarSpacing) {
      const sample = samples[i]!;
      const distToTerrain = sample.position.length() - sample.terrainRadius;
      const isOverWater =
        sample.position.length() > sample.waterRadius + 0.1 &&
        sample.terrainRadius < sample.waterRadius;

      if (distToTerrain <= bridgeThreshold && !isOverWater) continue;

      const targetRadius = isOverWater ? sample.waterRadius : sample.terrainRadius;
      const height = sample.position.length() - targetRadius;
      if (height <= 0) continue;

      const normal = sample.position.clone().normalize();
      const pos = normal.clone().multiplyScalar(targetRadius + height * 0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      const matrix = new THREE.Matrix4();
      matrix.compose(pos, quat, new THREE.Vector3(1.2, height, 1.2));
      bridgeData.push(matrix);
    }

    if (bridgeData.length === 0) {
      if (this.bridgeMesh) this.bridgeMesh.visible = false;
      return;
    }

    if (!this.bridgeMesh || this.bridgeMesh.instanceMatrix.count < bridgeData.length) {
      if (this.bridgeMesh) {
        this.bridgeMesh.geometry.dispose();
        this.group.remove(this.bridgeMesh);
      }
      this.bridgeMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, 8),
        this.bridgeMaterial,
        bridgeData.length,
      );
      this.bridgeMesh.renderOrder = 3;
      this.group.add(this.bridgeMesh);
    }

    bridgeData.forEach((matrix, index) => this.bridgeMesh?.setMatrixAt(index, matrix));
    this.bridgeMesh.count = bridgeData.length;
    this.bridgeMesh.instanceMatrix.needsUpdate = true;
    this.bridgeMesh.visible = true;
  }

  private updateTunnelShell(tracks: { track: TrackState; samples: TrackSample[] }[]): void {
    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (const { track, samples } of tracks) {
      const closed = track.closed && track.points.length >= 3;
      const rings = closed ? samples.length - 1 : samples.length;
      const isTunnelRing = samples.map(
        (s) =>
          s.position.length() - s.terrainRadius < TUNNEL_TERRAIN_THRESHOLD ||
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
    samples: TrackSample[],
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

  private getSurfaceSamples(track: TrackState): TrackSample[] {
    if (track.points.length < 2) return [];
    const controls = track.points.map((point) => this.positionFromPoint(point));
    const closed = track.closed && controls.length >= 3;
    if ((!closed && controls.length < 2) || (closed && controls.length < 3)) return [];

    const curve = new THREE.CatmullRomCurve3(controls, closed, "centripetal");
    const divisions = Math.max(
      2,
      track.segmentsPerCurve * (closed ? controls.length : controls.length - 1),
    );
    const waterRadius = this.config.planet.radius + this.config.terrain.waterLevel;
    const samples: TrackSample[] = [];

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const position = curve.getPoint(t);
      const normal = position.clone().normalize();
      const scalars = this.interpolatePointScalars(track, t, closed);
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

  private positionFromPoint(point: TrackPoint): THREE.Vector3 {
    if (point.position) return new THREE.Vector3(...point.position);
    const normal = new THREE.Vector3(...point.normal).normalize();
    return normal.multiplyScalar(
      this.getRadiusAtNormal(normal.x, normal.y, normal.z) + TRACK_SURFACE_OFFSET,
    );
  }

  private interpolatePointScalars(
    track: TrackState,
    t: number,
    closed: boolean,
  ): { width: number; bank: number } {
    const pointCount = track.points.length;
    const segmentCount = closed ? pointCount : Math.max(1, pointCount - 1);
    const scaled = Math.min(t * segmentCount, segmentCount - Number.EPSILON);
    const index = Math.floor(scaled);
    const localT = scaled - index;
    const a = track.points[Math.min(index, pointCount - 1)];
    const b = track.points[closed ? (index + 1) % pointCount : Math.min(index + 1, pointCount - 1)];
    return {
      width: THREE.MathUtils.lerp(a?.width ?? track.width, b?.width ?? track.width, localT),
      bank: THREE.MathUtils.lerp(a?.bank ?? track.bank, b?.bank ?? track.bank, localT),
    };
  }

  private replaceMesh(
    key: "trackMesh" | "tunnelMesh",
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

  private replaceLineSegments(
    key: "edgeLines",
    positions: number[],
    material: THREE.Material,
    renderOrder: number,
  ): void {
    const existing = this[key];
    if (positions.length === 0) {
      if (existing) existing.visible = false;
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (!existing) {
      const line = new THREE.LineSegments(geometry, material);
      line.renderOrder = renderOrder;
      this[key] = line;
      this.group.add(line);
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

  private disposeLine(line: THREE.LineSegments | null): void {
    if (!line) return;
    line.geometry.dispose();
  }
}
