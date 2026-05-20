import * as THREE from "three";
import type {
  EditorTerrainFeature,
  EditorTerrainJumpFeature,
  TerrainFeatureToolState,
} from "../../types.ts";

export interface JumpFeatureToolConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMesh: THREE.Mesh;
  shouldOrbit: () => boolean;
  onFeatureChange: (feature: EditorTerrainFeature) => void;
  onGizmoDragChange: (dragging: boolean) => void;
}

const SURFACE_OFFSET = 0.65;
const CENTER_HANDLE = "center";
const DIRECTION_HANDLE = "direction";
const CENTER_HANDLE_RADIUS = 2.6;
const DIRECTION_HANDLE_RADIUS = 2.35;
const PICK_HANDLE_RADIUS = 7;

export class JumpFeatureTool {
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private scene: THREE.Scene | null = null;
  private planetMesh: THREE.Mesh | null = null;
  private shouldOrbit: (() => boolean) | null = null;
  private onFeatureChange: ((feature: EditorTerrainFeature) => void) | null = null;
  private onGizmoDragChange: ((dragging: boolean) => void) | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly group = new THREE.Group();
  private readonly handlesGroup = new THREE.Group();
  private readonly pickHandlesGroup = new THREE.Group();
  private readonly centerGeometry = new THREE.SphereGeometry(CENTER_HANDLE_RADIUS, 16, 12);
  private readonly directionGeometry = new THREE.SphereGeometry(DIRECTION_HANDLE_RADIUS, 16, 12);
  private readonly pickGeometry = new THREE.SphereGeometry(PICK_HANDLE_RADIUS, 12, 8);
  private readonly centerMaterial = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    depthTest: false,
    depthWrite: false,
  });
  private readonly directionMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    depthTest: false,
    depthWrite: false,
  });
  private readonly pickMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  private readonly footprintMaterial = new THREE.LineBasicMaterial({
    color: 0x6ee7b7,
    depthTest: false,
    transparent: true,
    opacity: 0.72,
  });
  private readonly arrowMaterial = new THREE.LineBasicMaterial({
    color: 0xfacc15,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });

  private state: TerrainFeatureToolState | null = null;
  private footprint: THREE.Line | null = null;
  private arrow: THREE.Line | null = null;
  private dragging: string | null = null;
  private draggingPointerId: number | null = null;

  connect(options: JumpFeatureToolConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.planetMesh = options.planetMesh;
    this.shouldOrbit = options.shouldOrbit;
    this.onFeatureChange = options.onFeatureChange;
    this.onGizmoDragChange = options.onGizmoDragChange;

    this.group.add(this.handlesGroup);
    this.group.add(this.pickHandlesGroup);
    this.scene.add(this.group);
    this.canvas.addEventListener("pointermove", this.onPointerMove, false);
    this.canvas.addEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.addEventListener("pointerup", this.onPointerUp, false);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave, false);
  }

  setPlanetMesh(mesh: THREE.Mesh): void {
    this.planetMesh = mesh;
    this.updateVisuals();
  }

  setToolState(state: TerrainFeatureToolState | null): void {
    this.state = state?.feature.kind === "jump" ? state : null;
    if (this.canvas && !this.dragging) this.canvas.style.cursor = this.state ? "grab" : "";
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
    this.disposeLine(this.footprint);
    this.disposeLine(this.arrow);
    this.centerGeometry.dispose();
    this.directionGeometry.dispose();
    this.pickGeometry.dispose();
    this.centerMaterial.dispose();
    this.directionMaterial.dispose();
    this.pickMaterial.dispose();
    this.footprintMaterial.dispose();
    this.arrowMaterial.dispose();
  }

  private updateVisuals(): void {
    this.handlesGroup.clear();
    this.pickHandlesGroup.clear();
    if (!this.state) {
      this.setLineVisible(this.footprint, false);
      this.setLineVisible(this.arrow, false);
      return;
    }

    const feature = this.state.feature as EditorTerrainJumpFeature;
    const basis = this.getBasis(feature);
    const center = this.surfacePointFromNormal(feature.normal);
    if (!center || !basis) return;

    const displayCenter = center.clone().addScaledVector(basis.normal, SURFACE_OFFSET);
    const directionPosition = displayCenter
      .clone()
      .addScaledVector(basis.tangent, Math.max(8, feature.length * 0.5));

    const centerHandle = new THREE.Mesh(this.centerGeometry, this.centerMaterial);
    centerHandle.position.copy(displayCenter);
    centerHandle.renderOrder = 22;
    centerHandle.userData.jumpHandle = CENTER_HANDLE;
    this.handlesGroup.add(centerHandle);
    this.addPickHandle(displayCenter, CENTER_HANDLE);

    const directionHandle = new THREE.Mesh(this.directionGeometry, this.directionMaterial);
    directionHandle.position.copy(directionPosition);
    directionHandle.renderOrder = 22;
    directionHandle.userData.jumpHandle = DIRECTION_HANDLE;
    this.handlesGroup.add(directionHandle);
    this.addPickHandle(directionPosition, DIRECTION_HANDLE);

    const halfLength = feature.length * 0.5;
    const halfWidth = feature.width * 0.5;
    const corners = [
      displayCenter
        .clone()
        .addScaledVector(basis.tangent, -halfLength)
        .addScaledVector(basis.side, -halfWidth),
      displayCenter
        .clone()
        .addScaledVector(basis.tangent, halfLength)
        .addScaledVector(basis.side, -halfWidth),
      displayCenter
        .clone()
        .addScaledVector(basis.tangent, halfLength)
        .addScaledVector(basis.side, halfWidth),
      displayCenter
        .clone()
        .addScaledVector(basis.tangent, -halfLength)
        .addScaledVector(basis.side, halfWidth),
      displayCenter
        .clone()
        .addScaledVector(basis.tangent, -halfLength)
        .addScaledVector(basis.side, -halfWidth),
    ];
    this.footprint = this.updateLine(this.footprint, corners, this.footprintMaterial, 20);
    this.arrow = this.updateLine(
      this.arrow,
      [displayCenter, directionPosition],
      this.arrowMaterial,
      21,
    );
  }

  private getBasis(feature: EditorTerrainJumpFeature): {
    normal: THREE.Vector3;
    tangent: THREE.Vector3;
    side: THREE.Vector3;
  } | null {
    const normal = new THREE.Vector3(...feature.normal).normalize();
    const tangent = new THREE.Vector3(...feature.tangent).normalize();
    tangent.addScaledVector(normal, -tangent.dot(normal));
    if (tangent.lengthSq() < 1e-8) return null;
    tangent.normalize();
    const side = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    return { normal, tangent, side };
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

  private raycastPlanet(e: PointerEvent): THREE.Intersection | null {
    if (!this.canvas || !this.camera || !this.planetMesh) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    return this.raycaster.intersectObject(this.planetMesh)[0] ?? null;
  }

  private raycastHandle(e: PointerEvent): string | null {
    if (!this.canvas || !this.camera || !this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit =
      this.raycaster.intersectObjects(this.pickHandlesGroup.children)[0] ??
      this.raycaster.intersectObjects(this.handlesGroup.children)[0];
    const handle = hit?.object.userData.jumpHandle;
    return typeof handle === "string" ? handle : null;
  }

  private updateFeature(patch: Partial<EditorTerrainJumpFeature>): void {
    if (!this.state || this.state.feature.kind !== "jump") return;
    const nextFeature = { ...this.state.feature, ...patch };
    this.state = { ...this.state, feature: nextFeature };
    this.onFeatureChange?.(nextFeature);
    this.updateVisuals();
  }

  private moveCenter(hit: THREE.Intersection): void {
    if (!this.state || this.state.feature.kind !== "jump") return;
    const normal = hit.point.clone().normalize();
    const currentTangent = new THREE.Vector3(...this.state.feature.tangent).normalize();
    currentTangent.addScaledVector(normal, -currentTangent.dot(normal));
    if (currentTangent.lengthSq() < 1e-8) {
      currentTangent.crossVectors(new THREE.Vector3(0, 1, 0), normal);
      if (currentTangent.lengthSq() < 1e-8) currentTangent.set(1, 0, 0);
    }
    currentTangent.normalize();
    this.updateFeature({
      normal: [normal.x, normal.y, normal.z],
      tangent: [currentTangent.x, currentTangent.y, currentTangent.z],
    });
  }

  private moveDirection(hit: THREE.Intersection): void {
    if (!this.state || this.state.feature.kind !== "jump") return;
    const normal = new THREE.Vector3(...this.state.feature.normal).normalize();
    const hitNormal = hit.point.clone().normalize();
    const tangent = hitNormal.sub(normal);
    tangent.addScaledVector(normal, -tangent.dot(normal));
    if (tangent.lengthSq() < 1e-8) return;
    tangent.normalize();
    this.updateFeature({ tangent: [tangent.x, tangent.y, tangent.z] });
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.state || !this.canvas) return;
    if (this.dragging) {
      const hit = this.raycastPlanet(e);
      if (!hit) return;
      e.preventDefault();
      if (this.dragging === CENTER_HANDLE) this.moveCenter(hit);
      else this.moveDirection(hit);
      return;
    }
    this.canvas.style.cursor = this.raycastHandle(e) ? "grab" : "crosshair";
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.state || e.button !== 0 || this.shouldOrbit?.()) return;
    const handle = this.raycastHandle(e);
    if (!handle) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.dragging = handle;
    this.draggingPointerId = e.pointerId;
    this.canvas?.setPointerCapture(e.pointerId);
    if (this.canvas) this.canvas.style.cursor = "grabbing";
    this.onGizmoDragChange?.(true);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.dragging) return;
    this.dragging = null;
    if (this.draggingPointerId !== null && this.canvas?.hasPointerCapture(this.draggingPointerId)) {
      this.canvas.releasePointerCapture(this.draggingPointerId);
    }
    this.draggingPointerId = null;
    if (this.canvas) this.canvas.style.cursor = this.state ? "grab" : "";
    this.onGizmoDragChange?.(false);
  };

  private readonly onPointerLeave = (): void => {
    if (!this.dragging && this.canvas) this.canvas.style.cursor = this.state ? "grab" : "";
  };

  private updateLine(
    line: THREE.Line | null,
    positions: THREE.Vector3[],
    material: THREE.LineBasicMaterial,
    renderOrder: number,
  ): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints(positions);
    if (!line) {
      const next = new THREE.Line(geometry, material);
      next.renderOrder = renderOrder;
      this.group.add(next);
      return next;
    }
    line.geometry.dispose();
    line.geometry = geometry;
    line.visible = true;
    return line;
  }

  private addPickHandle(position: THREE.Vector3, handle: string): void {
    const pickHandle = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    pickHandle.position.copy(position);
    pickHandle.renderOrder = 23;
    pickHandle.userData.jumpHandle = handle;
    this.pickHandlesGroup.add(pickHandle);
  }

  private setLineVisible(line: THREE.Line | null, visible: boolean): void {
    if (line) line.visible = visible;
  }

  private disposeLine(line: THREE.Line | null): void {
    line?.geometry.dispose();
  }
}
