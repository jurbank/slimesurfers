import * as THREE from "three";
import type { PerformanceMetricGroup, PropBrushState } from "../../types.ts";
import { MAX_SKATE_PARK_INSTANCES, SkateParkProp } from "./SkateParkProp.ts";
import { MAX_TREE_INSTANCES, TreesProp } from "./TreesProp.ts";

export interface PropPaintConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMesh: THREE.Mesh;
  shouldOrbit: () => boolean;
}

export class PropPaintTool {
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private scene: THREE.Scene | null = null;
  private planetMesh: THREE.Mesh | null = null;
  private shouldOrbit: (() => boolean) | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly treesProp = new TreesProp();
  private readonly skateParkProp = new SkateParkProp();
  private readonly dummy = new THREE.Object3D();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly placement = new THREE.Vector3();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly centerNormal = new THREE.Vector3();
  private readonly modelUp = new THREE.Vector3(0, 1, 0);
  private readonly matrix = new THREE.Matrix4();
  private readonly alignQuat = new THREE.Quaternion();
  private readonly spinQuat = new THREE.Quaternion();
  private readonly scaleVec = new THREE.Vector3();

  private brushState: PropBrushState | null = null;
  private brushCursor: THREE.LineLoop | null = null;
  private isPainting = false;
  private nextPlacementTime = 0;

  connect(options: PropPaintConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.planetMesh = options.planetMesh;
    this.shouldOrbit = options.shouldOrbit;

    this.brushCursor = this.createBrushCursor();
    this.scene.add(this.treesProp.group, this.skateParkProp.group, this.brushCursor);

    this.canvas.addEventListener("pointermove", this.onPointerMove, false);
    this.canvas.addEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.addEventListener("pointerup", this.onPointerUp, false);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave, false);
  }

  setBrushState(state: PropBrushState | null): void {
    this.brushState = state;
    if (!state) {
      if (this.brushCursor) this.brushCursor.visible = false;
      this.skateParkProp.setPreview("ramp", null);
      if (this.canvas) this.canvas.style.cursor = "";
      this.isPainting = false;
      return;
    }
    if (state.propId !== "ramp") this.skateParkProp.setPreview("ramp", null);
    if (this.canvas) this.canvas.style.cursor = "crosshair";
  }

  getPerformanceStats(): PerformanceMetricGroup[] {
    return [...this.treesProp.getPerformanceStats(), ...this.skateParkProp.getPerformanceStats()];
  }

  dispose(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.style.cursor = "";
    }
    if (this.scene) {
      this.scene.remove(this.treesProp.group);
      this.scene.remove(this.skateParkProp.group);
      if (this.brushCursor) this.scene.remove(this.brushCursor);
    }
    this.treesProp.dispose();
    this.skateParkProp.dispose();
    if (this.brushCursor) {
      this.brushCursor.geometry.dispose();
      (this.brushCursor.material as THREE.Material).dispose();
    }
  }

  private paintProps(hit: THREE.Intersection): void {
    if (!this.brushState) return;
    if (this.brushState.propId === "ramp") {
      if (
        this.getPropCount(this.brushState.propId) >= this.getMaxInstances(this.brushState.propId)
      ) {
        return;
      }
      if (this.composePropMatrix(hit.point, hit.face?.normal ?? hit.point, false)) {
        this.addPropInstance(this.brushState.propId, this.matrix);
      }
      return;
    }

    const propCount = this.getPropCount(this.brushState.propId);
    const maxInstances = this.getMaxInstances(this.brushState.propId);
    if (propCount >= maxInstances) return;
    const remaining = maxInstances - propCount;
    const count = Math.min(this.brushState.density, remaining);
    const brushAngle = (this.brushState.size * Math.PI) / 180;
    this.centerNormal.copy(hit.point).normalize();
    this.buildBasis(this.centerNormal);

    for (let i = 0; i < count; i++) {
      const radial = Math.sqrt(Math.random()) * brushAngle;
      const theta = Math.random() * Math.PI * 2;
      this.normal
        .copy(this.centerNormal)
        .multiplyScalar(Math.cos(radial))
        .addScaledVector(this.tangent, Math.cos(theta) * Math.sin(radial))
        .addScaledVector(this.bitangent, Math.sin(theta) * Math.sin(radial))
        .normalize();

      const surfaceHit = this.raycastNormal(this.normal);
      if (!surfaceHit) continue;
      if (this.composePropMatrix(surfaceHit.point, surfaceHit.face?.normal ?? this.normal, true)) {
        this.addPropInstance(this.brushState.propId, this.matrix);
      }
    }
  }

  private composePropMatrix(
    point: THREE.Vector3,
    localFaceNormal: THREE.Vector3,
    randomize: boolean,
  ): boolean {
    if (!this.brushState || !this.planetMesh) return false;
    this.normal.copy(localFaceNormal).transformDirection(this.planetMesh.matrixWorld).normalize();
    this.placement.copy(point).addScaledVector(this.normal, 0.08);

    const scale = randomize ? this.brushState.scale * (0.8 + Math.random() * 0.35) : 1;
    this.alignQuat.setFromUnitVectors(this.modelUp, this.normal);
    const spin = randomize ? Math.random() * Math.PI * 2 : 0;
    this.spinQuat.setFromAxisAngle(this.normal, spin);
    this.alignQuat.premultiply(this.spinQuat);

    this.scaleVec.setScalar(scale);
    this.matrix.compose(this.placement, this.alignQuat, this.scaleVec);
    return true;
  }

  private getPropCount(propId: PropBrushState["propId"]): number {
    return propId === "ramp"
      ? this.skateParkProp.getCount(propId)
      : this.treesProp.getCount(propId);
  }

  private getMaxInstances(propId: PropBrushState["propId"]): number {
    return propId === "ramp" ? MAX_SKATE_PARK_INSTANCES : MAX_TREE_INSTANCES;
  }

  private addPropInstance(propId: PropBrushState["propId"], matrix: THREE.Matrix4): void {
    if (propId === "ramp") {
      this.skateParkProp.add(propId, matrix);
      return;
    }
    this.treesProp.add(propId, matrix);
  }

  private buildBasis(n: THREE.Vector3): void {
    const up = Math.abs(n.y) < 0.9 ? this.dummy.up.set(0, 1, 0) : this.dummy.up.set(1, 0, 0);
    this.tangent.crossVectors(up, n).normalize();
    this.bitangent.crossVectors(n, this.tangent).normalize();
  }

  private raycastNormal(normal: THREE.Vector3): THREE.Intersection | null {
    if (!this.planetMesh) return null;
    const radius = this.planetMesh.geometry.boundingSphere?.radius ?? 120;
    this.rayOrigin.copy(normal).multiplyScalar(radius * 2);
    this.rayDirection.copy(normal).negate();
    this.raycaster.set(this.rayOrigin, this.rayDirection);
    const hits = this.raycaster.intersectObject(this.planetMesh);
    return hits.length > 0 ? hits[0] : null;
  }

  private createBrushCursor(): THREE.LineLoop {
    const segments = 64;
    const positions = new Float32Array(segments * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const loop = new THREE.LineLoop(geo, mat);
    loop.visible = false;
    loop.renderOrder = 10;
    return loop;
  }

  private updateBrushCursor(hitPoint: THREE.Vector3): void {
    if (!this.brushState || !this.brushCursor) return;
    const angleRad = (this.brushState.size * Math.PI) / 180;
    const r = hitPoint.length();
    const n = hitPoint.clone().normalize();
    this.buildBasis(n);

    const posAttr = this.brushCursor.geometry.getAttribute("position") as THREE.BufferAttribute;
    const segments = posAttr.count;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    for (let i = 0; i < segments; i++) {
      const phi = (i / segments) * Math.PI * 2;
      const dx =
        n.x * cosA + (this.tangent.x * Math.cos(phi) + this.bitangent.x * Math.sin(phi)) * sinA;
      const dy =
        n.y * cosA + (this.tangent.y * Math.cos(phi) + this.bitangent.y * Math.sin(phi)) * sinA;
      const dz =
        n.z * cosA + (this.tangent.z * Math.cos(phi) + this.bitangent.z * Math.sin(phi)) * sinA;
      posAttr.setXYZ(i, dx * r, dy * r, dz * r);
    }
    posAttr.needsUpdate = true;
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

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.brushState || !this.brushCursor || !this.canvas) return;
    const hit = this.raycastPlanet(e);
    if (!hit) {
      this.brushCursor.visible = false;
      this.skateParkProp.setPreview("ramp", null);
      this.canvas.style.cursor = "crosshair";
      return;
    }

    if (this.brushState.propId === "ramp") {
      this.brushCursor.visible = false;
      if (this.composePropMatrix(hit.point, hit.face?.normal ?? hit.point, false)) {
        this.skateParkProp.setPreview("ramp", this.matrix);
      }
      this.canvas.style.cursor = "crosshair";
      return;
    }

    this.skateParkProp.setPreview("ramp", null);
    this.updateBrushCursor(hit.point);
    this.brushCursor.visible = true;
    this.canvas.style.cursor = "none";

    if (this.isPainting && performance.now() >= this.nextPlacementTime) {
      this.paintProps(hit);
      this.nextPlacementTime = performance.now() + 80;
    }
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.brushState || e.button !== 0 || this.shouldOrbit?.()) return;
    const hit = this.raycastPlanet(e);
    if (!hit) return;

    e.stopImmediatePropagation();
    this.paintProps(hit);
    if (this.brushState.propId === "ramp") return;

    this.isPainting = true;
    this.nextPlacementTime = performance.now() + 80;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this.isPainting = false;
  };

  private readonly onPointerLeave = (): void => {
    if (this.brushCursor) this.brushCursor.visible = false;
    this.skateParkProp.setPreview("ramp", null);
    this.isPainting = false;
  };
}
