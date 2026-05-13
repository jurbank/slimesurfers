import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { type TerrainSurfaceProvider } from "@splat/simulation/terrain/planetTerrain.ts";
import { createMetricGroup } from "../../performance/geometryStats.ts";
import type { PerformanceMetricGroup } from "../../types.ts";
import { Gizmo } from "../Gizmo.ts";
import type { RailPoint, RailToolState } from "./RailTypes.ts";
import type { EditorConfig } from "../../types.ts";
import { RAIL_SURFACE_OFFSET, RAIL_TUNNEL_TERRAIN_THRESHOLD } from "./railConstants.ts";

export interface RailConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMesh: THREE.Mesh;
  shouldOrbit: () => boolean;
  onRailChange: (rail: RailToolState["rail"]) => void;
  onPointSelectionChange: (pointId: string | null) => void;
  onGizmoDragChange: (dragging: boolean) => void;
  config: EditorConfig;
  terrainProvider: TerrainSurfaceProvider;
}

interface RailSample {
  position: THREE.Vector3;
  width: number;
  bank: number;
  terrainRadius: number;
  waterRadius: number;
}

const HANDLE_RADIUS = 1.25;
const HANDLE_PICK_RADIUS = 0.12;
const RAIL_TUBE_SEGMENTS = 12;
const RAIL_SUPPORT_SPACING = 18;
const RAIL_SUPPORT_RADIUS = 0.18;
const RAIL_SUPPORT_SEGMENTS = 6;

export class RailTool {
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private scene: THREE.Scene | null = null;
  private planetMesh: THREE.Mesh | null = null;
  private shouldOrbit: (() => boolean) | null = null;
  private onRailChange: ((rail: RailToolState["rail"]) => void) | null = null;
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
    opacity: 0.45,
  });
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

  private state: RailToolState | null = null;
  private centerLine: THREE.Line | null = null;
  private railMesh: THREE.Mesh | null = null;
  private supportMesh: THREE.InstancedMesh | null = null;
  private tunnelMesh: THREE.Mesh | null = null;
  private gizmo: Gizmo | null = null;
  private selectedPointId: string | null = null;
  private isProjectingGizmo = false;

  setPlanetMesh(mesh: THREE.Mesh): void {
    this.planetMesh = mesh;
  }

  connect(options: RailConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.planetMesh = options.planetMesh;
    this.shouldOrbit = options.shouldOrbit;
    this.onRailChange = options.onRailChange;
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

  setRailToolState(state: RailToolState | null): void {
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
        "rail-authoring",
        "Rail Authoring",
        [this.railMesh, this.supportMesh, this.centerLine],
        "Editable rail tube, support columns, and center guide line",
      ),
      createMetricGroup(
        "rail-handles",
        "Rail Handles",
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
    if (this.railMesh) this.railMesh.geometry.dispose();
    if (this.supportMesh) this.supportMesh.geometry.dispose();
    if (this.tunnelMesh) this.tunnelMesh.geometry.dispose();
    this.gizmo?.dispose();
    this.handleGeometry.dispose();
    this.handleMaterial.dispose();
    this.selectedHandleMaterial.dispose();
    this.lineMaterial.dispose();
    this.railMaterial.dispose();
    this.supportMaterial.dispose();
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

    for (const point of this.state.rail.points) {
      const position = this.positionFromPoint(point);
      if (!position) continue;

      const material =
        point.id === this.selectedPointId ? this.selectedHandleMaterial : this.handleMaterial;
      const handle = new THREE.Mesh(this.handleGeometry, material);
      handle.position.copy(position);
      handle.renderOrder = 11;
      handle.userData.railPointId = point.id;
      this.handlesGroup.add(handle);
    }
  }

  private updateTransformGizmo(): void {
    if (!this.gizmo || !this.state) return;
    const point = this.state.rail.points.find((item) => item.id === this.selectedPointId);
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
    this.updateRailTube(samples);
    this.updateRailSupports(samples);
    this.updateTunnelShell(samples);
  }

  private updateCenterLine(samples: RailSample[]): void {
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

  private updateRailTube(samples: RailSample[]): void {
    if (!this.state || samples.length < 2) {
      if (this.railMesh) this.railMesh.visible = false;
      return;
    }

    const closed = this.state.rail.closed && this.state.rail.points.length >= 3;
    const curveSamples = closed ? samples.slice(0, -1) : samples;
    if (curveSamples.length < (closed ? 3 : 2)) {
      if (this.railMesh) this.railMesh.visible = false;
      return;
    }

    const curve = new THREE.CatmullRomCurve3(
      curveSamples.map((sample) => sample.position),
      closed,
      "centripetal",
    );
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.max(2, curveSamples.length - 1),
      GAME_CONFIG.rail.visualRadius,
      RAIL_TUBE_SEGMENTS,
      closed,
    );

    if (!this.railMesh) {
      this.railMesh = new THREE.Mesh(geometry, this.railMaterial);
      this.railMesh.renderOrder = 4;
      this.group.add(this.railMesh);
    } else {
      this.railMesh.geometry.dispose();
      this.railMesh.geometry = geometry;
      this.railMesh.visible = true;
    }
  }

  private getSurfaceSamples(): RailSample[] {
    if (!this.state) return [];
    const { rail } = this.state;
    if (rail.points.length < 2) return [];

    const controls = rail.points.map((point) => this.positionFromPoint(point));
    if (controls.some((point) => point === null)) return [];
    const controlPositions = controls as THREE.Vector3[];
    const closed = rail.closed && controlPositions.length >= 3;
    if ((!closed && controlPositions.length < 2) || (closed && controlPositions.length < 3)) {
      return [];
    }

    const curve = new THREE.CatmullRomCurve3(controlPositions, closed, "centripetal");
    const divisions = Math.max(
      2,
      rail.segmentsPerCurve * (closed ? controlPositions.length : controlPositions.length - 1),
    );

    const samples: RailSample[] = [];
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
    const { rail } = this.state;
    const pointCount = rail.points.length;
    const segmentCount = closed ? pointCount : Math.max(1, pointCount - 1);
    const scaled = Math.min(t * segmentCount, segmentCount - Number.EPSILON);
    const index = Math.floor(scaled);
    const localT = scaled - index;
    const a = rail.points[Math.min(index, pointCount - 1)];
    const b = rail.points[closed ? (index + 1) % pointCount : Math.min(index + 1, pointCount - 1)];
    const widthA = a?.width ?? rail.width;
    const widthB = b?.width ?? rail.width;
    const bankA = a?.bank ?? rail.bank;
    const bankB = b?.bank ?? rail.bank;
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
    if (hits.length === 0) return normal.multiplyScalar(radius + RAIL_SURFACE_OFFSET);
    return hits[0].point.clone().addScaledVector(normal, RAIL_SURFACE_OFFSET);
  }

  private positionFromPoint(point: RailPoint): THREE.Vector3 | null {
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

  private raycastHandle(e: PointerEvent): RailPoint | null {
    if (!this.canvas || !this.camera || !this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(this.handlesGroup.children);
    const id = hits[0]?.object.userData.railPointId;
    if (typeof id !== "string") return null;
    return this.state.rail.points.find((point) => point.id === id) ?? null;
  }

  private addPoint(hit: THREE.Intersection): void {
    if (!this.state) return;
    const normal = hit.point.clone().normalize();
    const p = hit.point;
    const point: RailPoint = {
      id: `point-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      normal: [normal.x, normal.y, normal.z],
      position: [p.x, p.y, p.z],
    };
    const nextTrack = { ...this.state.rail, points: [...this.state.rail.points, point] };
    this.state = { ...this.state, rail: nextTrack, selectedPointId: point.id };
    this.selectedPointId = point.id;
    this.onPointSelectionChange?.(point.id);
    this.onRailChange?.(nextTrack);
    this.updateVisuals();
  }

  private movePointToSurface(pointId: string, normalTuple: [number, number, number]): void {
    if (!this.state) return;
    const nextTrack = {
      ...this.state.rail,
      points: this.state.rail.points.map((point) =>
        point.id === pointId ? { ...point, normal: normalTuple, position: undefined } : point,
      ),
    };
    this.state = { ...this.state, rail: nextTrack };
    this.onRailChange?.(nextTrack);
    this.updateHandles();
    this.updateTrackGeometry();
  }

  private movePointToPosition(pointId: string, position: THREE.Vector3): void {
    if (!this.state) return;
    const normal = position.clone().normalize();
    const normalTuple: [number, number, number] = [normal.x, normal.y, normal.z];
    const positionTuple: [number, number, number] = [position.x, position.y, position.z];
    const nextTrack = {
      ...this.state.rail,
      points: this.state.rail.points.map((point) =>
        point.id === pointId ? { ...point, normal: normalTuple, position: positionTuple } : point,
      ),
    };
    this.state = { ...this.state, rail: nextTrack };
    this.onRailChange?.(nextTrack);
    this.updateHandles();
    this.updateTrackGeometry();
  }

  private deletePoint(pointId: string): void {
    if (!this.state) return;
    const nextTrack = {
      ...this.state.rail,
      points: this.state.rail.points.filter((point) => point.id !== pointId),
    };
    if (this.selectedPointId === pointId) this.selectedPointId = null;
    this.state = { ...this.state, rail: nextTrack, selectedPointId: this.selectedPointId };
    this.onPointSelectionChange?.(this.selectedPointId);
    this.onRailChange?.(nextTrack);
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

  private updateRailSupports(samples: RailSample[]): void {
    if (!this.state || samples.length < 2) {
      if (this.supportMesh) this.supportMesh.visible = false;
      return;
    }

    const supportData: THREE.Matrix4[] = [];
    let distanceSinceSupport = RAIL_SUPPORT_SPACING;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      if (i > 0) distanceSinceSupport += sample.position.distanceTo(samples[i - 1]!.position);
      if (distanceSinceSupport < RAIL_SUPPORT_SPACING) continue;
      distanceSinceSupport = 0;

      const railRadius = sample.position.length();
      const baseRadius = Math.max(sample.terrainRadius, sample.waterRadius);
      const height = railRadius - baseRadius - GAME_CONFIG.rail.visualRadius;
      if (height <= 0.5) continue;

      const normal = sample.position.clone().normalize();
      const pos = normal.clone().multiplyScalar(baseRadius + height * 0.5);
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      const scale = new THREE.Vector3(RAIL_SUPPORT_RADIUS, height, RAIL_SUPPORT_RADIUS);
      matrix.compose(pos, quat, scale);
      supportData.push(matrix);
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
      const geo = new THREE.CylinderGeometry(1, 1, 1, RAIL_SUPPORT_SEGMENTS);
      this.supportMesh = new THREE.InstancedMesh(geo, this.supportMaterial, supportData.length);
      this.supportMesh.renderOrder = 3;
      this.group.add(this.supportMesh);
    }

    for (let i = 0; i < supportData.length; i++) {
      this.supportMesh.setMatrixAt(i, supportData[i]!);
    }
    this.supportMesh.count = supportData.length;
    this.supportMesh.instanceMatrix.needsUpdate = true;
    this.supportMesh.visible = true;
  }

  private updateTunnelShell(samples: RailSample[]): void {
    if (!this.state || samples.length < 2) {
      if (this.tunnelMesh) this.tunnelMesh.visible = false;
      return;
    }

    const closed = this.state.rail.closed && this.state.rail.points.length >= 3;
    const rings = closed ? samples.length - 1 : samples.length;

    const tunnelIndices: number[] = [];
    const tunnelPositions: number[] = [];

    const isTunnelRing = samples.map(
      (s) =>
        s.position.length() - s.terrainRadius < RAIL_TUNNEL_TERRAIN_THRESHOLD ||
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
