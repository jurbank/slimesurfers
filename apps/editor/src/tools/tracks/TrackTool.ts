import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { TrackPoint, TrackToolState } from "./TrackTypes.ts";

export interface TrackConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMesh: THREE.Mesh;
  shouldOrbit: () => boolean;
  onTrackChange: (track: TrackToolState["track"]) => void;
  onPointSelectionChange: (pointId: string | null) => void;
  onGizmoDragChange: (dragging: boolean) => void;
}

interface TrackSample {
  position: THREE.Vector3;
  width: number;
  bank: number;
}

const TRACK_SURFACE_OFFSET = 0.18;
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

  private readonly raycaster = new THREE.Raycaster();
  private readonly group = new THREE.Group();
  private readonly handlesGroup = new THREE.Group();
  private readonly gizmoTarget = new THREE.Object3D();
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

  private state: TrackToolState | null = null;
  private centerLine: THREE.Line | null = null;
  private edgeLines: THREE.LineSegments | null = null;
  private trackMesh: THREE.Mesh | null = null;
  private transformControls: TransformControls | null = null;
  private transformControlsHelper: THREE.Object3D | null = null;
  private selectedPointId: string | null = null;
  private isProjectingGizmo = false;

  connect(options: TrackConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.planetMesh = options.planetMesh;
    this.shouldOrbit = options.shouldOrbit;
    this.onTrackChange = options.onTrackChange;
    this.onPointSelectionChange = options.onPointSelectionChange;
    this.onGizmoDragChange = options.onGizmoDragChange;

    this.raycaster.params.Points.threshold = HANDLE_PICK_RADIUS;
    this.gizmoTarget.visible = false;
    this.group.add(this.handlesGroup, this.gizmoTarget);
    this.scene.add(this.group);

    this.transformControls = new TransformControls(this.camera, this.canvas);
    this.transformControls.setMode("translate");
    this.transformControls.setSpace("world");
    this.transformControls.setSize(0.72);
    this.transformControls.addEventListener("objectChange", this.onGizmoObjectChange);
    this.transformControls.addEventListener("dragging-changed", this.onGizmoDraggingChanged);
    this.transformControlsHelper = this.transformControls.getHelper();
    this.transformControlsHelper.visible = false;
    this.scene.add(this.transformControlsHelper);

    this.canvas.addEventListener("pointermove", this.onPointerMove, false);
    this.canvas.addEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.addEventListener("pointerup", this.onPointerUp, false);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave, false);
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

  dispose(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.style.cursor = "";
    }
    if (this.scene) this.scene.remove(this.group);
    if (this.scene && this.transformControlsHelper) this.scene.remove(this.transformControlsHelper);

    this.disposeLine(this.centerLine);
    this.disposeLine(this.edgeLines);
    if (this.trackMesh) this.trackMesh.geometry.dispose();
    if (this.transformControls) {
      this.transformControls.removeEventListener("objectChange", this.onGizmoObjectChange);
      this.transformControls.removeEventListener("dragging-changed", this.onGizmoDraggingChanged);
      this.transformControls.detach();
      this.transformControls.dispose();
    }
    this.onGizmoDragChange?.(false);
    this.handleGeometry.dispose();
    this.handleMaterial.dispose();
    this.selectedHandleMaterial.dispose();
    this.lineMaterial.dispose();
    this.trackMaterial.dispose();
    this.edgeMaterial.dispose();
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
      const position = this.surfacePointFromNormal(point.normal);
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
    if (!this.transformControls || !this.state) return;
    const point = this.state.track.points.find((item) => item.id === this.selectedPointId);
    if (!point || this.state.mode !== "move") {
      this.transformControls.detach();
      if (this.transformControlsHelper) this.transformControlsHelper.visible = false;
      this.onGizmoDragChange?.(false);
      return;
    }

    const position = this.surfacePointFromNormal(point.normal);
    if (!position) return;
    this.gizmoTarget.position.copy(position);
    this.transformControls.attach(this.gizmoTarget);
    if (this.transformControlsHelper) this.transformControlsHelper.visible = true;
  }

  private updateTrackGeometry(): void {
    const samples = this.getSurfaceSamples();
    this.updateCenterLine(samples);
    this.updateRibbon(samples);
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

    const controls = track.points.map((point) => this.surfacePointFromNormal(point.normal));
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
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const curvePoint = curve.getPoint(t);
      const position = this.surfacePointFromNormal([curvePoint.x, curvePoint.y, curvePoint.z]);
      if (!position) continue;
      const scalars = this.interpolatePointScalars(t, closed);
      samples.push({ position, width: scalars.width, bank: scalars.bank });
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
    const point: TrackPoint = {
      id: `point-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      normal: [normal.x, normal.y, normal.z],
    };
    const nextTrack = { ...this.state.track, points: [...this.state.track.points, point] };
    this.state = { ...this.state, track: nextTrack, selectedPointId: point.id };
    this.selectedPointId = point.id;
    this.onPointSelectionChange?.(point.id);
    this.onTrackChange?.(nextTrack);
    this.updateVisuals();
  }

  private movePointToNormal(pointId: string, normalTuple: [number, number, number]): void {
    if (!this.state) return;
    const nextTrack = {
      ...this.state.track,
      points: this.state.track.points.map((point) =>
        point.id === pointId ? { ...point, normal: normalTuple } : point,
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
    if (!this.transformControls?.dragging) this.onGizmoDragChange?.(false);
  };

  private readonly onPointerLeave = (): void => {
    if (this.canvas && this.state?.mode) this.canvas.style.cursor = "crosshair";
  };

  private readonly onGizmoObjectChange = (): void => {
    if (!this.state || !this.selectedPointId || this.isProjectingGizmo) return;
    this.isProjectingGizmo = true;
    const normal = this.gizmoTarget.position.clone().normalize();
    const position = this.surfacePointFromNormal([normal.x, normal.y, normal.z]);
    if (position) this.gizmoTarget.position.copy(position);
    this.movePointToNormal(this.selectedPointId, [normal.x, normal.y, normal.z]);
    this.isProjectingGizmo = false;
  };

  private readonly onGizmoDraggingChanged = (event: { value?: unknown }): void => {
    this.onGizmoDragChange?.(event.value === true);
  };

  private isTransformGizmoActive(): boolean {
    if (!this.transformControls) return false;
    return this.transformControls.dragging || this.transformControls.axis !== null;
  }

  private disposeLine(line: THREE.Line | THREE.LineSegments | null): void {
    if (!line) return;
    line.geometry.dispose();
  }
}
