import * as THREE from "three";
import type {
  EditorTerrainFeaturePoint,
  EditorTerrainSlopeFeature,
  TerrainFeatureToolState,
} from "../../types.ts";
import { Gizmo } from "../Gizmo.ts";

type SlopeFeatureToolState = TerrainFeatureToolState & { feature: EditorTerrainSlopeFeature };

export interface SlopeFeatureToolConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMesh: THREE.Mesh;
  shouldOrbit: () => boolean;
  onFeatureChange: (feature: EditorTerrainSlopeFeature) => void;
  onPointSelectionChange: (pointId: string | null) => void;
  onGizmoDragChange: (dragging: boolean) => void;
}

const HANDLE_RADIUS = 1.45;
const HANDLE_PICK_RADIUS = 0.14;
const SURFACE_OFFSET = 0.35;

export class SlopeFeatureTool {
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private scene: THREE.Scene | null = null;
  private planetMesh: THREE.Mesh | null = null;
  private shouldOrbit: (() => boolean) | null = null;
  private onFeatureChange: ((feature: EditorTerrainSlopeFeature) => void) | null = null;
  private onPointSelectionChange: ((pointId: string | null) => void) | null = null;
  private onGizmoDragChange: ((dragging: boolean) => void) | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly group = new THREE.Group();
  private readonly handlesGroup = new THREE.Group();
  private readonly handleGeometry = new THREE.SphereGeometry(HANDLE_RADIUS, 12, 8);
  private readonly handleMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    depthTest: false,
  });
  private readonly selectedHandleMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    depthTest: false,
  });
  private readonly centerLineMaterial = new THREE.LineBasicMaterial({
    color: 0x67e8f9,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  private readonly edgeLineMaterial = new THREE.LineBasicMaterial({
    color: 0x22c55e,
    depthTest: false,
    transparent: true,
    opacity: 0.48,
  });

  private state: SlopeFeatureToolState | null = null;
  private centerLine: THREE.Line | null = null;
  private leftEdge: THREE.Line | null = null;
  private rightEdge: THREE.Line | null = null;
  private gizmo: Gizmo | null = null;
  private selectedPointId: string | null = null;
  private isProjectingGizmo = false;

  connect(options: SlopeFeatureToolConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.planetMesh = options.planetMesh;
    this.shouldOrbit = options.shouldOrbit;
    this.onFeatureChange = options.onFeatureChange;
    this.onPointSelectionChange = options.onPointSelectionChange;
    this.onGizmoDragChange = options.onGizmoDragChange;

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

  setPlanetMesh(mesh: THREE.Mesh): void {
    this.planetMesh = mesh;
    this.updateVisuals();
  }

  setToolState(state: TerrainFeatureToolState | null): void {
    this.state = state?.feature.kind === "slope" ? (state as SlopeFeatureToolState) : null;
    this.selectedPointId = state?.selectedPointId ?? null;
    if (this.canvas) this.canvas.style.cursor = this.state?.mode ? "crosshair" : "";
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
    window.removeEventListener("keydown", this.onKeyDown);
    if (this.scene) this.scene.remove(this.group);
    this.disposeLine(this.centerLine);
    this.disposeLine(this.leftEdge);
    this.disposeLine(this.rightEdge);
    this.gizmo?.dispose();
    this.handleGeometry.dispose();
    this.handleMaterial.dispose();
    this.selectedHandleMaterial.dispose();
    this.centerLineMaterial.dispose();
    this.edgeLineMaterial.dispose();
  }

  private updateVisuals(): void {
    this.updateHandles();
    this.updateGuideLines();
    this.updateTransformGizmo();
  }

  private updateHandles(): void {
    this.handlesGroup.clear();
    if (!this.state) return;

    for (const point of this.state.feature.points) {
      const position = this.positionFromPoint(point);
      if (!position) continue;
      const material =
        point.id === this.selectedPointId ? this.selectedHandleMaterial : this.handleMaterial;
      const handle = new THREE.Mesh(this.handleGeometry, material);
      handle.position.copy(position);
      handle.renderOrder = 18;
      handle.userData.slopePointId = point.id;
      this.handlesGroup.add(handle);
    }
  }

  private updateGuideLines(): void {
    if (!this.state || this.state.feature.points.length < 2) {
      this.setLineVisible(this.centerLine, false);
      this.setLineVisible(this.leftEdge, false);
      this.setLineVisible(this.rightEdge, false);
      return;
    }

    const positions = this.state.feature.points
      .map((point) => this.positionFromPoint(point))
      .filter((point): point is THREE.Vector3 => point !== null);
    if (positions.length < 2) return;

    this.centerLine = this.updateLine(this.centerLine, positions, this.centerLineMaterial);

    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    const halfWidth = this.state.feature.width * 0.5;
    for (let i = 0; i < positions.length; i++) {
      const current = positions[i]!;
      const prev = positions[Math.max(0, i - 1)]!;
      const next = positions[Math.min(positions.length - 1, i + 1)]!;
      const normal = current.clone().normalize();
      const tangent = next.clone().sub(prev);
      tangent.addScaledVector(normal, -tangent.dot(normal));
      if (tangent.lengthSq() < 1e-8) continue;
      tangent.normalize();
      const side = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      left.push(current.clone().addScaledVector(side, -halfWidth));
      right.push(current.clone().addScaledVector(side, halfWidth));
    }

    this.leftEdge = this.updateLine(this.leftEdge, left, this.edgeLineMaterial);
    this.rightEdge = this.updateLine(this.rightEdge, right, this.edgeLineMaterial);
  }

  private updateLine(
    line: THREE.Line | null,
    positions: THREE.Vector3[],
    material: THREE.LineBasicMaterial,
  ): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints(positions);
    if (!line) {
      const next = new THREE.Line(geo, material);
      next.renderOrder = 17;
      this.group.add(next);
      return next;
    }
    line.geometry.dispose();
    line.geometry = geo;
    line.visible = true;
    return line;
  }

  private updateTransformGizmo(): void {
    if (!this.gizmo || !this.state) return;
    const point = this.state.feature.points.find((item) => item.id === this.selectedPointId);
    if (!point || this.state.mode !== "move") {
      this.gizmo.detach();
      return;
    }
    const position = this.positionFromPoint(point);
    if (!position) return;
    this.gizmo.attach(position, this.getSphereBasisQuaternion(position));
  }

  private positionFromPoint(point: EditorTerrainFeaturePoint): THREE.Vector3 | null {
    const surface = this.surfacePointFromNormal(point.normal);
    if (!surface) return null;
    const normal = surface.clone().normalize();
    return surface.addScaledVector(normal, point.heightOffset + SURFACE_OFFSET);
  }

  private surfacePointFromNormal(normalTuple: [number, number, number]): THREE.Vector3 | null {
    if (!this.planetMesh) return null;
    const normal = new THREE.Vector3(...normalTuple).normalize();
    const radius = this.planetMesh.geometry.boundingSphere?.radius ?? 120;
    const origin = normal.clone().multiplyScalar(radius * 2);
    const direction = normal.clone().negate();
    this.raycaster.set(origin, direction);
    const hit = this.raycaster.intersectObject(this.planetMesh)[0];
    return hit?.point.clone() ?? normal.multiplyScalar(radius);
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
    return this.raycaster.intersectObject(this.planetMesh)[0] ?? null;
  }

  private raycastHandle(e: PointerEvent): EditorTerrainFeaturePoint | null {
    if (!this.canvas || !this.camera || !this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(this.handlesGroup.children);
    const id = hits[0]?.object.userData.slopePointId;
    if (typeof id !== "string") return null;
    return this.state.feature.points.find((point) => point.id === id) ?? null;
  }

  private addPoint(hit: THREE.Intersection): void {
    if (!this.state) return;
    const normal = hit.point.clone().normalize();
    const point: EditorTerrainFeaturePoint = {
      id: `slope-point-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      normal: [normal.x, normal.y, normal.z],
      heightOffset: 0,
    };
    const nextFeature = { ...this.state.feature, points: [...this.state.feature.points, point] };
    this.state = { ...this.state, feature: nextFeature, selectedPointId: point.id };
    this.selectedPointId = point.id;
    this.onPointSelectionChange?.(point.id);
    this.onFeatureChange?.(nextFeature);
    this.updateVisuals();
  }

  private updatePoint(pointId: string, patch: Partial<EditorTerrainFeaturePoint>): void {
    if (!this.state) return;
    const nextFeature = {
      ...this.state.feature,
      points: this.state.feature.points.map((point) =>
        point.id === pointId ? { ...point, ...patch } : point,
      ),
    };
    this.state = { ...this.state, feature: nextFeature };
    this.onFeatureChange?.(nextFeature);
    this.updateVisuals();
  }

  private movePoint(pointId: string, position: THREE.Vector3): void {
    const normal = position.clone().normalize();
    this.updatePoint(pointId, {
      normal: [normal.x, normal.y, normal.z],
    });
  }

  private setPointHeightFromPosition(pointId: string, position: THREE.Vector3): void {
    if (!this.state) return;
    const point = this.state.feature.points.find((item) => item.id === pointId);
    if (!point) return;
    const normal = new THREE.Vector3(...point.normal).normalize();
    const surface = this.surfacePointFromNormal(point.normal);
    if (!surface) return;
    const heightOffset = position.clone().sub(surface).dot(normal) - SURFACE_OFFSET;
    this.updatePoint(pointId, { heightOffset });
  }

  private deletePoint(pointId: string): void {
    if (!this.state || this.state.feature.points.length <= 2) return;
    const nextFeature = {
      ...this.state.feature,
      points: this.state.feature.points.filter((point) => point.id !== pointId),
    };
    if (this.selectedPointId === pointId) this.selectedPointId = null;
    this.state = { ...this.state, feature: nextFeature, selectedPointId: this.selectedPointId };
    this.onPointSelectionChange?.(this.selectedPointId);
    this.onFeatureChange?.(nextFeature);
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
      e.preventDefault();
      e.stopImmediatePropagation();
      this.selectedPointId = handle.id;
      this.state = { ...this.state, selectedPointId: handle.id };
      this.onPointSelectionChange?.(handle.id);
      if (this.state.mode === "delete") {
        this.deletePoint(handle.id);
        return;
      }
      this.updateVisuals();
      return;
    }

    if (this.state.mode !== "add") return;
    const hit = this.raycastPlanet(e);
    if (!hit) return;
    e.preventDefault();
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
    if (!this.state || !this.selectedPointId || this.isProjectingGizmo || !this.gizmo) return;
    this.isProjectingGizmo = true;

    if (this.gizmo.getAxis() === "Y") {
      this.setPointHeightFromPosition(this.selectedPointId, this.gizmo.target.position);
    } else {
      const normal = this.gizmo.target.position.clone().normalize();
      const surface = this.surfacePointFromNormal([normal.x, normal.y, normal.z]);
      if (surface) {
        const point = this.state.feature.points.find((item) => item.id === this.selectedPointId);
        const heightOffset = point?.heightOffset ?? 0;
        this.gizmo.target.position
          .copy(surface)
          .addScaledVector(normal, heightOffset + SURFACE_OFFSET);
      }
      this.movePoint(this.selectedPointId, this.gizmo.target.position);
    }

    this.gizmo.target.quaternion.copy(this.getSphereBasisQuaternion(this.gizmo.target.position));
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

  private setLineVisible(line: THREE.Line | null, visible: boolean): void {
    if (line) line.visible = visible;
  }

  private disposeLine(line: THREE.Line | null): void {
    if (!line) return;
    line.geometry.dispose();
  }
}
