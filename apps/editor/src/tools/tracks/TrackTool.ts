import * as THREE from "three";
import { type TerrainSurfaceProvider } from "@splat/simulation/terrain/planetTerrain.ts";
import { createMetricGroup } from "../../performance/geometryStats.ts";
import type { PerformanceMetricGroup } from "../../types.ts";
import { Gizmo } from "../Gizmo.ts";
import type { TrackPoint, TrackToolState } from "./TrackTypes.ts";
import type { EditorConfig } from "../../types.ts";
import {
  TRACK_BRIDGE_THRESHOLD,
  TRACK_SURFACE_OFFSET,
  TRACK_TUNNEL_TERRAIN_THRESHOLD,
} from "./trackConstants.ts";

export interface TrackConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMesh: THREE.Mesh;
  shouldOrbit: () => boolean;
  onTrackChange: (track: TrackToolState["track"]) => void;
  onPointSelectionChange: (pointId: string | null) => void;
  onGizmoDragChange: (dragging: boolean) => void;
  config: EditorConfig;
  terrainProvider: TerrainSurfaceProvider;
}

interface TrackSample {
  position: THREE.Vector3;
  width: number;
  bank: number;
  terrainRadius: number;
  waterRadius: number;
}

const HANDLE_RADIUS = 1.25;
const HANDLE_PICK_RADIUS = 0.12;

export class TrackTool {
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private scene: THREE.Scene | null = null;
  private planetMesh: THREE.Mesh | null = null;
  private shouldOrbit: (() => boolean) | null = null;
  private onTrackChange: ((track: TrackToolState["track"]) => void) | null = null;
  private onPointSelectionChange: ((pointId: string | null) => void) | null = null;
  private onGizmoDragChange: ((dragging: boolean) => void) | null = null;
  private config: EditorConfig | null = null;
  private terrainProvider: TerrainSurfaceProvider | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly group = new THREE.Group();
  private readonly handlesGroup = new THREE.Group();
  private readonly handleGeometry = new THREE.SphereGeometry(HANDLE_RADIUS, 12, 8);
  private readonly handleMaterial = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    depthTest: false,
  });
  private readonly selectedHandleMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    depthTest: false,
  });
  private readonly lineMaterial = new THREE.LineBasicMaterial({
    color: 0xfacc15,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
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
    opacity: 0.8,
  });
  private readonly bridgeMaterial = new THREE.MeshLambertMaterial({
    color: 0x64748b,
  });
  private readonly tunnelMaterial = new THREE.MeshLambertMaterial({
    color: 0x1e293b,
    side: THREE.BackSide,
  });

  private state: TrackToolState | null = null;
  private centerLine: THREE.Line | null = null;
  private edgeLines: THREE.LineSegments | null = null;
  private trackMesh: THREE.Mesh | null = null;
  private bridgeMesh: THREE.InstancedMesh | null = null;
  private tunnelMesh: THREE.Mesh | null = null;
  private gizmo: Gizmo | null = null;
  private selectedPointId: string | null = null;
  private isProjectingGizmo = false;

  setPlanetMesh(mesh: THREE.Mesh): void {
    this.planetMesh = mesh;
  }

  connect(options: TrackConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.planetMesh = options.planetMesh;
    this.shouldOrbit = options.shouldOrbit;
    this.onTrackChange = options.onTrackChange;
    this.onPointSelectionChange = options.onPointSelectionChange;
    this.onGizmoDragChange = options.onGizmoDragChange;
    this.config = options.config;
    this.terrainProvider = options.terrainProvider;

    this.raycaster.params.Points.threshold = HANDLE_PICK_RADIUS;
    this.group.add(this.handlesGroup);
    this.scene.add(this.group);

    this.gizmo = new Gizmo({
      camera: this.camera,
      canvas: this.canvas,
      scene: this.scene,
      onChange: this.onGizmoObjectChange,
      onDragChange: (dragging) => this.onGizmoDragChange?.(dragging),
    });
    this.group.add(this.gizmo.target);

    this.canvas.addEventListener("pointermove", this.onPointerMove, false);
    this.canvas.addEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.addEventListener("pointerup", this.onPointerUp, false);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave, false);
    window.addEventListener("keydown", this.onKeyDown);
  }

  setTrackToolState(state: TrackToolState | null): void {
    this.state = state;
    this.selectedPointId = state?.selectedPointId ?? null;
    if (this.canvas) {
      this.canvas.style.cursor = state?.mode ? "crosshair" : "";
    }
    this.updateVisuals();
  }

  syncSurface(): void {
    this.updateVisuals();
  }

  getPerformanceStats(): PerformanceMetricGroup[] {
    return [
      createMetricGroup(
        "track-ribbon",
        "Track Surface",
        [this.trackMesh, this.centerLine, this.edgeLines],
        "Ribbon mesh plus visible center and edge guide lines",
      ),
      createMetricGroup(
        "track-handles",
        "Track Handles",
        this.handlesGroup.children.filter(
          (child): child is THREE.Mesh => child instanceof THREE.Mesh,
        ),
        `${this.handlesGroup.children.length} editable control handles`,
      ),
    ];
  }

  dispose(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.style.cursor = "";
    }
    window.removeEventListener("keydown", this.onKeyDown);
    if (this.scene) this.scene.remove(this.group);

    this.disposeLine(this.centerLine);
    this.disposeLine(this.edgeLines);
    if (this.trackMesh) this.trackMesh.geometry.dispose();
    if (this.bridgeMesh) this.bridgeMesh.geometry.dispose();
    if (this.tunnelMesh) this.tunnelMesh.geometry.dispose();
    this.gizmo?.dispose();
    this.handleGeometry.dispose();
    this.handleMaterial.dispose();
    this.selectedHandleMaterial.dispose();
    this.lineMaterial.dispose();
    this.trackMaterial.dispose();
    this.edgeMaterial.dispose();
    this.bridgeMaterial.dispose();
    this.tunnelMaterial.dispose();
  }

  private updateVisuals(): void {
    this.updateHandles();
    this.updateTrackGeometry();
    this.updateTransformGizmo();
  }

  private updateHandles(): void {
    this.handlesGroup.clear();
    if (!this.state) return;

    for (const point of this.state.track.points) {
      const position = this.positionFromPoint(point);
      if (!position) continue;

      const material =
        point.id === this.selectedPointId ? this.selectedHandleMaterial : this.handleMaterial;
      const handle = new THREE.Mesh(this.handleGeometry, material);
      handle.position.copy(position);
      handle.renderOrder = 11;
      handle.userData.trackPointId = point.id;
      this.handlesGroup.add(handle);
    }
  }

  private updateTransformGizmo(): void {
    if (!this.gizmo || !this.state) return;
    const point = this.state.track.points.find((item) => item.id === this.selectedPointId);
    if (!point || this.state.mode !== "move") {
      this.gizmo.detach();
      return;
    }

    const position = this.positionFromPoint(point);
    if (!position) return;
    this.gizmo.attach(position, this.getSphereBasisQuaternion(position));
  }

  private updateTrackGeometry(): void {
    const samples = this.getSurfaceSamples();
    this.updateCenterLine(samples);
    this.updateRibbon(samples);
    this.updateBridgeSupports(samples);
    this.updateTunnelShell(samples);
  }

  private updateCenterLine(samples: TrackSample[]): void {
    if (samples.length < 2) {
      if (this.centerLine) this.centerLine.visible = false;
      return;
    }

    const positions = new Float32Array(samples.length * 3);
    for (let i = 0; i < samples.length; i++) {
      positions[i * 3] = samples[i].position.x;
      positions[i * 3 + 1] = samples[i].position.y;
      positions[i * 3 + 2] = samples[i].position.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    if (!this.centerLine) {
      this.centerLine = new THREE.Line(geometry, this.lineMaterial);
      this.centerLine.renderOrder = 12;
      this.group.add(this.centerLine);
    } else {
      this.centerLine.geometry.dispose();
      this.centerLine.geometry = geometry;
      this.centerLine.visible = true;
    }
  }

  private updateRibbon(samples: TrackSample[]): void {
    if (!this.state || samples.length < 2) {
      if (this.trackMesh) this.trackMesh.visible = false;
      if (this.edgeLines) this.edgeLines.visible = false;
      return;
    }

    const closed = this.state.track.closed && this.state.track.points.length >= 3;
    const rings = closed ? samples.length - 1 : samples.length;
    if (rings < 2) return;

    const positions: number[] = [];
    const normals: number[] = [];
    const edgePositions: number[] = [];
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];

    for (let i = 0; i < rings; i++) {
      const center = samples[i].position;
      const prev = closed
        ? samples[(i - 1 + rings) % rings].position
        : samples[Math.max(0, i - 1)].position;
      const next = closed
        ? samples[(i + 1) % rings].position
        : samples[Math.min(rings - 1, i + 1)].position;
      const surfaceNormal = center.clone().normalize();
      const tangent = next.clone().sub(prev);
      tangent.addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal)).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, surfaceNormal).normalize();
      const width = samples[i].width;
      const bankRad = (samples[i].bank * Math.PI) / 180;
      side.applyAxisAngle(tangent, bankRad);

      left.push(center.clone().addScaledVector(side, -width * 0.5));
      right.push(center.clone().addScaledVector(side, width * 0.5));
      normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
      normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
    }

    for (let i = 0; i < rings; i++) {
      positions.push(left[i].x, left[i].y, left[i].z, right[i].x, right[i].y, right[i].z);
      const nextIndex = (i + 1) % rings;
      if (!closed && i === rings - 1) continue;
      edgePositions.push(
        left[i].x,
        left[i].y,
        left[i].z,
        left[nextIndex].x,
        left[nextIndex].y,
        left[nextIndex].z,
        right[i].x,
        right[i].y,
        right[i].z,
        right[nextIndex].x,
        right[nextIndex].y,
        right[nextIndex].z,
      );
    }

    const indices: number[] = [];
    const segmentCount = closed ? rings : rings - 1;
    for (let i = 0; i < segmentCount; i++) {
      const nextIndex = (i + 1) % rings;
      const leftA = i * 2;
      const rightA = leftA + 1;
      const leftB = nextIndex * 2;
      const rightB = leftB + 1;
      indices.push(leftA, rightA, rightB, leftA, rightB, leftB);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    if (!this.trackMesh) {
      this.trackMesh = new THREE.Mesh(geometry, this.trackMaterial);
      this.trackMesh.renderOrder = 4;
      this.group.add(this.trackMesh);
    } else {
      this.trackMesh.geometry.dispose();
      this.trackMesh.geometry = geometry;
      this.trackMesh.visible = true;
    }

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
    if (!this.edgeLines) {
      this.edgeLines = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);
      this.edgeLines.renderOrder = 13;
      this.group.add(this.edgeLines);
    } else {
      this.edgeLines.geometry.dispose();
      this.edgeLines.geometry = edgeGeometry;
      this.edgeLines.visible = true;
    }
  }

  private getSurfaceSamples(): TrackSample[] {
    if (!this.state) return [];
    const { track } = this.state;
    if (track.points.length < 2) return [];

    const controls = track.points.map((point) => this.positionFromPoint(point));
    if (controls.some((point) => point === null)) return [];
    const controlPositions = controls as THREE.Vector3[];
    const closed = track.closed && controlPositions.length >= 3;
    if ((!closed && controlPositions.length < 2) || (closed && controlPositions.length < 3)) {
      return [];
    }

    const curve = new THREE.CatmullRomCurve3(controlPositions, closed, "centripetal");
    const divisions = Math.max(
      2,
      track.segmentsPerCurve * (closed ? controlPositions.length : controlPositions.length - 1),
    );

    const samples: TrackSample[] = [];
    const p0 = this.config?.planets[0];
    const waterLevel = p0?.terrain.waterLevel ?? 0;
    const terrainCfg = p0
      ? { planet: { radius: p0.radius }, terrain: p0.terrain }
      : {
          planet: { radius: 120 },
          terrain: {
            seed: 0,
            baseAmplitude: 0,
            frequency: 1,
            octaves: 1,
            lacunarity: 1,
            persistence: 1,
            waterLevel: 0,
            snowLevel: 0,
            sandBand: 0,
            rockLevel: 0,
          },
        };
    const planetRadius = terrainCfg.planet.radius;
    const waterRadius = planetRadius + waterLevel;

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const position = curve.getPoint(t);
      const scalars = this.interpolatePointScalars(t, closed);
      const normal = position.clone().normalize();
      const terrainRadius = this.terrainProvider!.getRadius(
        normal.x,
        normal.y,
        normal.z,
        terrainCfg as any,
        "planet-0",
      );
      samples.push({
        position,
        width: scalars.width,
        bank: scalars.bank,
        terrainRadius,
        waterRadius,
      });
    }
    return samples;
  }

  private interpolatePointScalars(t: number, closed: boolean): { width: number; bank: number } {
    if (!this.state) return { width: 8, bank: 0 };
    const { track } = this.state;
    const pointCount = track.points.length;
    const segmentCount = closed ? pointCount : Math.max(1, pointCount - 1);
    const scaled = Math.min(t * segmentCount, segmentCount - Number.EPSILON);
    const index = Math.floor(scaled);
    const localT = scaled - index;
    const a = track.points[Math.min(index, pointCount - 1)];
    const b = track.points[closed ? (index + 1) % pointCount : Math.min(index + 1, pointCount - 1)];
    const widthA = a?.width ?? track.width;
    const widthB = b?.width ?? track.width;
    const bankA = a?.bank ?? track.bank;
    const bankB = b?.bank ?? track.bank;
    return {
      width: THREE.MathUtils.lerp(widthA, widthB, localT),
      bank: THREE.MathUtils.lerp(bankA, bankB, localT),
    };
  }

  private surfacePointFromNormal(normalTuple: [number, number, number]): THREE.Vector3 | null {
    if (!this.planetMesh) return null;
    const normal = new THREE.Vector3(...normalTuple).normalize();
    const radius = this.planetMesh.geometry.boundingSphere?.radius ?? 120;
    const origin = normal.clone().multiplyScalar(radius * 2);
    const direction = normal.clone().negate();
    this.raycaster.set(origin, direction);
    const hits = this.raycaster.intersectObject(this.planetMesh);
    if (hits.length === 0) return normal.multiplyScalar(radius + TRACK_SURFACE_OFFSET);
    return hits[0].point.clone().addScaledVector(normal, TRACK_SURFACE_OFFSET);
  }

  private positionFromPoint(point: TrackPoint): THREE.Vector3 | null {
    if (point.position) return new THREE.Vector3(...point.position);
    return this.surfacePointFromNormal(point.normal);
  }

  private getSphereBasisQuaternion(position: THREE.Vector3): THREE.Quaternion {
    const normal = position.clone().normalize();
    const reference =
      Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(reference, normal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const basis = new THREE.Matrix4().makeBasis(tangent, normal, bitangent);
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  }

  private raycastPlanet(e: PointerEvent): THREE.Intersection | null {
    if (!this.canvas || !this.camera || !this.planetMesh) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = this.raycaster.intersectObject(this.planetMesh);
    return hits.length > 0 ? hits[0] : null;
  }

  private raycastHandle(e: PointerEvent): TrackPoint | null {
    if (!this.canvas || !this.camera || !this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(this.handlesGroup.children);
    const id = hits[0]?.object.userData.trackPointId;
    if (typeof id !== "string") return null;
    return this.state.track.points.find((point) => point.id === id) ?? null;
  }

  private addPoint(hit: THREE.Intersection): void {
    if (!this.state) return;
    const normal = hit.point.clone().normalize();
    const p = hit.point;
    const point: TrackPoint = {
      id: `point-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      normal: [normal.x, normal.y, normal.z],
      position: [p.x, p.y, p.z],
    };
    const nextTrack = { ...this.state.track, points: [...this.state.track.points, point] };
    this.state = { ...this.state, track: nextTrack, selectedPointId: point.id };
    this.selectedPointId = point.id;
    this.onPointSelectionChange?.(point.id);
    this.onTrackChange?.(nextTrack);
    this.updateVisuals();
  }

  private movePointToSurface(pointId: string, normalTuple: [number, number, number]): void {
    if (!this.state) return;
    const nextTrack = {
      ...this.state.track,
      points: this.state.track.points.map((point) =>
        point.id === pointId ? { ...point, normal: normalTuple, position: undefined } : point,
      ),
    };
    this.state = { ...this.state, track: nextTrack };
    this.onTrackChange?.(nextTrack);
    this.updateHandles();
    this.updateTrackGeometry();
  }

  private movePointToPosition(pointId: string, position: THREE.Vector3): void {
    if (!this.state) return;
    const normal = position.clone().normalize();
    const normalTuple: [number, number, number] = [normal.x, normal.y, normal.z];
    const positionTuple: [number, number, number] = [position.x, position.y, position.z];
    const nextTrack = {
      ...this.state.track,
      points: this.state.track.points.map((point) =>
        point.id === pointId ? { ...point, normal: normalTuple, position: positionTuple } : point,
      ),
    };
    this.state = { ...this.state, track: nextTrack };
    this.onTrackChange?.(nextTrack);
    this.updateHandles();
    this.updateTrackGeometry();
  }

  private deletePoint(pointId: string): void {
    if (!this.state) return;
    const nextTrack = {
      ...this.state.track,
      points: this.state.track.points.filter((point) => point.id !== pointId),
    };
    if (this.selectedPointId === pointId) this.selectedPointId = null;
    this.state = { ...this.state, track: nextTrack, selectedPointId: this.selectedPointId };
    this.onPointSelectionChange?.(this.selectedPointId);
    this.onTrackChange?.(nextTrack);
    this.updateVisuals();
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.state?.mode || !this.canvas) return;

    const handle = this.raycastHandle(e);
    this.canvas.style.cursor = handle ? "pointer" : "crosshair";
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.state?.mode || e.button !== 0 || this.shouldOrbit?.()) return;
    if (this.isTransformGizmoActive()) {
      this.onGizmoDragChange?.(true);
      return;
    }

    const handle = this.raycastHandle(e);
    if (handle) {
      e.stopImmediatePropagation();
      this.selectedPointId = handle.id;
      this.state = { ...this.state, selectedPointId: handle.id };
      this.onPointSelectionChange?.(handle.id);
      if (this.state.mode === "delete") {
        this.deletePoint(handle.id);
        return;
      }
      if (this.state.mode === "move") {
        this.updateTransformGizmo();
      }
      this.updateHandles();
      return;
    }

    if (this.state.mode !== "add") return;
    const hit = this.raycastPlanet(e);
    if (!hit) return;

    e.stopImmediatePropagation();
    this.addPoint(hit);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (!this.gizmo?.isDragging()) this.onGizmoDragChange?.(false);
  };

  private readonly onPointerLeave = (): void => {
    if (this.canvas && this.state?.mode) this.canvas.style.cursor = "crosshair";
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.state?.mode || !this.selectedPointId || this.isEditableTarget(e.target)) return;
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    e.preventDefault();
    this.deletePoint(this.selectedPointId);
  };

  private readonly onGizmoObjectChange = (): void => {
    if (!this.state || !this.selectedPointId || this.isProjectingGizmo) return;
    if (!this.gizmo) return;
    this.isProjectingGizmo = true;
    if (this.gizmo.getAxis() === "XYZ") {
      const normal = this.gizmo.target.position.clone().normalize();
      const normalTuple: [number, number, number] = [normal.x, normal.y, normal.z];
      const position = this.surfacePointFromNormal(normalTuple);
      if (position) this.gizmo.target.position.copy(position);
      this.gizmo.target.quaternion.copy(this.getSphereBasisQuaternion(this.gizmo.target.position));
      this.movePointToSurface(this.selectedPointId, normalTuple);
    } else {
      this.movePointToPosition(this.selectedPointId, this.gizmo.target.position);
    }
    this.isProjectingGizmo = false;
  };

  private isTransformGizmoActive(): boolean {
    return this.gizmo?.isActive() ?? false;
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  private disposeLine(line: THREE.Line | THREE.LineSegments | null): void {
    if (!line) return;
    line.geometry.dispose();
  }

  private updateBridgeSupports(samples: TrackSample[]): void {
    if (!this.state || samples.length < 2) {
      if (this.bridgeMesh) this.bridgeMesh.visible = false;
      return;
    }

    const bridgeData: { matrix: THREE.Matrix4 }[] = [];
    const pillarSpacing = 4;
    const waterLevel = this.config?.planets[0]?.terrain.waterLevel ?? 0;
    const planetRadius = this.config?.planets[0]?.radius ?? 120;
    const waterRadius = planetRadius + waterLevel;

    for (let i = 0; i < samples.length; i += pillarSpacing) {
      const sample = samples[i];
      const distToTerrain = sample.position.length() - sample.terrainRadius;
      const isOverWater =
        sample.position.length() > waterRadius + 0.1 && sample.terrainRadius < waterRadius;

      if (distToTerrain > TRACK_BRIDGE_THRESHOLD || isOverWater) {
        const targetRadius = isOverWater ? waterRadius : sample.terrainRadius;
        const height = sample.position.length() - targetRadius - TRACK_SURFACE_OFFSET;
        if (height <= 0) continue;

        const normal = sample.position.clone().normalize();
        const pos = normal.clone().multiplyScalar(targetRadius + height * 0.5);

        const matrix = new THREE.Matrix4();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        const scale = new THREE.Vector3(1.2, height, 1.2);
        matrix.compose(pos, quat, scale);
        bridgeData.push({ matrix });
      }
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
      const geo = new THREE.CylinderGeometry(1, 1, 1, 8);
      this.bridgeMesh = new THREE.InstancedMesh(geo, this.bridgeMaterial, bridgeData.length + 50);
      this.bridgeMesh.renderOrder = 3;
      this.group.add(this.bridgeMesh);
    }

    for (let i = 0; i < bridgeData.length; i++) {
      this.bridgeMesh.setMatrixAt(i, bridgeData[i].matrix);
    }
    this.bridgeMesh.count = bridgeData.length;
    this.bridgeMesh.instanceMatrix.needsUpdate = true;
    this.bridgeMesh.visible = true;
  }

  private updateTunnelShell(samples: TrackSample[]): void {
    if (!this.state || samples.length < 2) {
      if (this.tunnelMesh) this.tunnelMesh.visible = false;
      return;
    }

    const closed = this.state.track.closed && this.state.track.points.length >= 3;
    const rings = closed ? samples.length - 1 : samples.length;

    const tunnelIndices: number[] = [];
    const tunnelPositions: number[] = [];

    const isTunnelRing = samples.map(
      (s) =>
        s.position.length() - s.terrainRadius < TRACK_TUNNEL_TERRAIN_THRESHOLD ||
        s.position.length() < s.waterRadius,
    );

    let vertexOffset = 0;
    for (let i = 0; i < rings; i++) {
      const next = (i + 1) % rings;
      if (!isTunnelRing[i] && !isTunnelRing[next]) continue;

      const buildArch = (idx: number) => {
        const s = samples[idx];
        const center = s.position;
        const prevP = closed
          ? samples[(idx - 1 + rings) % rings].position
          : samples[Math.max(0, idx - 1)].position;
        const nextP = closed
          ? samples[(idx + 1) % rings].position
          : samples[Math.min(rings - 1, idx + 1)].position;

        const surfaceNormal = center.clone().normalize();
        const tangent = nextP.clone().sub(prevP);
        tangent.addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal)).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, surfaceNormal).normalize();
        const width = s.width + 2;
        const height = 6;
        const bankRad = (s.bank * Math.PI) / 180;
        side.applyAxisAngle(tangent, bankRad);
        const up = surfaceNormal.clone().applyAxisAngle(tangent, bankRad);

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
      };

      const archA = buildArch(i);
      const archB = buildArch(next);

      for (const p of archA) tunnelPositions.push(p.x, p.y, p.z);
      for (const p of archB) tunnelPositions.push(p.x, p.y, p.z);

      const baseA = vertexOffset;
      const baseB = vertexOffset + 4;
      for (let j = 0; j < 3; j++) {
        const a1 = baseA + j;
        const a2 = baseA + j + 1;
        const b1 = baseB + j;
        const b2 = baseB + j + 1;
        tunnelIndices.push(a1, b1, b2, a1, b2, a2);
      }
      vertexOffset += 8;
    }

    if (tunnelPositions.length === 0) {
      if (this.tunnelMesh) this.tunnelMesh.visible = false;
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(tunnelPositions, 3));
    geometry.setIndex(tunnelIndices);
    geometry.computeVertexNormals();

    if (!this.tunnelMesh) {
      this.tunnelMesh = new THREE.Mesh(geometry, this.tunnelMaterial);
      this.tunnelMesh.renderOrder = 2;
      this.group.add(this.tunnelMesh);
    } else {
      this.tunnelMesh.geometry.dispose();
      this.tunnelMesh.geometry = geometry;
      this.tunnelMesh.visible = true;
    }
  }
}
