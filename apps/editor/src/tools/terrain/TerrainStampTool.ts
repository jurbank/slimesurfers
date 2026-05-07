import * as THREE from "three";
import type { TerrainStampState } from "./TerrainStampTypes.ts";

const STAMP_COLORS: Record<TerrainStampState["kind"], number> = {
  crater: 0xff7a3d,
  ridge: 0x7dd3fc,
  crevasse: 0xa78bfa,
  mesa: 0xfacc15,
};

export interface TerrainStampConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMesh: THREE.Mesh;
  shouldOrbit: () => boolean;
  onStamp: (hitPoint: THREE.Vector3, state: TerrainStampState) => void;
}

export class TerrainStampTool {
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private planetMesh: THREE.Mesh | null = null;
  private shouldOrbit: (() => boolean) | null = null;
  private onStamp: ((hitPoint: THREE.Vector3, state: TerrainStampState) => void) | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private cursor: THREE.LineLoop | null = null;
  private stampState: TerrainStampState | null = null;

  connect(options: TerrainStampConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.planetMesh = options.planetMesh;
    this.shouldOrbit = options.shouldOrbit;
    this.onStamp = options.onStamp;
    this.cursor = this.createCursor();
    options.scene.add(this.cursor);

    this.canvas.addEventListener("pointermove", this.onPointerMove, false);
    this.canvas.addEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave, false);
  }

  setPlanetMesh(mesh: THREE.Mesh): void {
    this.planetMesh = mesh;
  }

  setStampState(state: TerrainStampState | null): void {
    this.stampState = state;
    if (!state) {
      if (this.cursor) this.cursor.visible = false;
      if (this.canvas) this.canvas.style.cursor = "";
      return;
    }
    if (this.cursor) {
      const mat = this.cursor.material as THREE.LineBasicMaterial;
      mat.color.setHex(STAMP_COLORS[state.kind]);
    }
    if (this.canvas) this.canvas.style.cursor = "crosshair";
  }

  dispose(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.style.cursor = "";
    }
    if (this.cursor) {
      this.cursor.geometry.dispose();
      (this.cursor.material as THREE.Material).dispose();
    }
  }

  private createCursor(): THREE.LineLoop {
    const segments = 80;
    const positions = new Float32Array(segments * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: STAMP_COLORS.crater,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const loop = new THREE.LineLoop(geo, mat);
    loop.visible = false;
    loop.renderOrder = 11;
    return loop;
  }

  private updateCursor(hitPoint: THREE.Vector3): void {
    if (!this.stampState || !this.cursor || !this.planetMesh) return;
    const angleRad = (this.stampState.size * Math.PI) / 180;
    const localHitPoint = this.planetMesh.worldToLocal(hitPoint.clone());
    const r = localHitPoint.length();
    const n = localHitPoint.clone().normalize();
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(up, n).normalize();
    const bitangent = new THREE.Vector3().crossVectors(n, tangent);
    const posAttr = this.cursor.geometry.getAttribute("position") as THREE.BufferAttribute;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    for (let i = 0; i < posAttr.count; i++) {
      const phi = (i / posAttr.count) * Math.PI * 2;
      const dx = n.x * cosA + (tangent.x * Math.cos(phi) + bitangent.x * Math.sin(phi)) * sinA;
      const dy = n.y * cosA + (tangent.y * Math.cos(phi) + bitangent.y * Math.sin(phi)) * sinA;
      const dz = n.z * cosA + (tangent.z * Math.cos(phi) + bitangent.z * Math.sin(phi)) * sinA;
      const worldPoint = this.planetMesh.localToWorld(new THREE.Vector3(dx * r, dy * r, dz * r));
      posAttr.setXYZ(i, worldPoint.x, worldPoint.y, worldPoint.z);
    }
    posAttr.needsUpdate = true;
  }

  private raycastPlanet(e: PointerEvent): THREE.Intersection | null {
    if (!this.canvas || !this.camera || !this.planetMesh) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    return this.raycaster.intersectObject(this.planetMesh)[0] ?? null;
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.stampState || !this.cursor || !this.canvas) return;
    const hit = this.raycastPlanet(e);
    if (!hit) {
      this.cursor.visible = false;
      this.canvas.style.cursor = "crosshair";
      return;
    }
    this.updateCursor(hit.point);
    this.cursor.visible = true;
    this.canvas.style.cursor = "none";
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.stampState || e.button !== 0 || this.shouldOrbit?.()) return;
    const hit = this.raycastPlanet(e);
    if (!hit || !this.planetMesh) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.onStamp?.(this.planetMesh.worldToLocal(hit.point.clone()), this.stampState);
  };

  private readonly onPointerLeave = (): void => {
    if (this.cursor) this.cursor.visible = false;
  };
}
