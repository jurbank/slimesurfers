import * as THREE from "three";
import { getTerrainRadius } from "@splat/simulation/terrain/planetTerrain.ts";
import type {
  BrushFalloff,
  BrushState,
  EditorConfig,
  EditorPlanet,
  EditorSculptState,
} from "../../types.ts";
import { terrainStampDelta, terrainStampRadiusRadians } from "../terrain/terrainStampMath.ts";
import type { TerrainStampState } from "../terrain/TerrainStampTypes.ts";

const BRUSH_COLORS: Record<string, number> = {
  raise: 0x00ff99,
  lower: 0xff5533,
  smooth: 0xffffff,
  flatten: 0xffcc00,
};

const MAX_DISPLACEMENT = 60;
const STROKE_DELTA = 0.2;

export interface BrushConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  planetMeshes: THREE.Mesh[];
  onStrokeEnd: (sculpt: EditorSculptState) => void;
  shouldOrbit: () => boolean;
}

export class BrushTool {
  // Sculpt data — indexed in non-indexed geometry vertex order
  private sculptDetail = -1;
  private sculptBaseNormals = new Float32Array(0);
  private sculptBaseHeights = new Float32Array(0);
  private sculptDisplacements = new Float32Array(0);

  // 3D / DOM resources — populated during connect()
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private planetMeshes: THREE.Mesh[] = [];
  private onStrokeEnd: ((sculpt: EditorSculptState) => void) | null = null;
  private shouldOrbit: (() => boolean) | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private brushCursor: THREE.LineLoop | null = null;

  // Interaction state
  private brushState: BrushState | null = null;
  private isSliming = false;
  private flattenTarget: number | null = null;

  constructor(config: EditorConfig) {
    this.initSculptBase(config.planets[0]!);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  connect(options: BrushConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.planetMeshes = options.planetMeshes;
    this.onStrokeEnd = options.onStrokeEnd;
    this.shouldOrbit = options.shouldOrbit;

    this.brushCursor = this.createBrushCursor();
    options.scene.add(this.brushCursor);

    this.canvas.addEventListener("pointermove", this.onPointerMove, false);
    this.canvas.addEventListener("pointerdown", this.onPointerDown, true); // capture to intercept before OrbitControls
    this.canvas.addEventListener("pointerup", this.onPointerUp, false);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave, false);
  }

  setBrushState(state: BrushState | null): void {
    this.brushState = state;
    if (!state) {
      if (this.brushCursor) this.brushCursor.visible = false;
      if (this.canvas) this.canvas.style.cursor = "";
      this.isSliming = false;
      return;
    }
    if (this.brushCursor) {
      const mat = this.brushCursor.material as THREE.LineBasicMaterial;
      mat.color.setHex(BRUSH_COLORS[state.mode] ?? 0xffffff);
    }
    if (this.canvas) this.canvas.style.cursor = "crosshair";
  }

  setPlanetMeshes(meshes: THREE.Mesh[]): void {
    this.planetMeshes = meshes;
  }

  syncDetail(config: EditorConfig): void {
    this.syncDetailForPlanet(config.planets[0]!);
  }

  syncDetailForPlanet(planet: EditorPlanet): void {
    if (planet.terrain.icosahedronDetail !== this.sculptDetail) {
      this.initSculptBase(planet);
    }
  }

  resetSculptBase(planet: EditorPlanet): void {
    this.initSculptBase(planet);
  }

  getDisplacements(): Float32Array {
    return this.sculptDisplacements;
  }

  getSculptState(): EditorSculptState {
    const samples: EditorSculptState["samples"] = [];
    for (let i = 0; i < this.sculptDisplacements.length; i++) {
      const value = this.sculptDisplacements[i] ?? 0;
      if (Math.abs(value) > 1e-4) samples.push({ index: i, value });
    }
    return {
      detail: this.sculptDetail,
      vertexCount: this.sculptDisplacements.length,
      samples,
    };
  }

  getSculptSummary(): { editedVertices: number; maxAbsDisplacement: number } {
    let editedVertices = 0;
    let maxAbsDisplacement = 0;
    for (let i = 0; i < this.sculptDisplacements.length; i++) {
      const value = Math.abs(this.sculptDisplacements[i] ?? 0);
      if (value <= 1e-4) continue;
      editedVertices++;
      if (value > maxAbsDisplacement) maxAbsDisplacement = value;
    }
    return { editedVertices, maxAbsDisplacement };
  }

  getDisplacementAtNormal(nx: number, ny: number, nz: number): number {
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-8 || this.sculptDisplacements.length === 0) return 0;

    const x = nx / len;
    const y = ny / len;
    const z = nz / len;
    const count = this.sculptBaseNormals.length / 3;
    let bestDot = -Infinity;
    let bestIndex = 0;

    for (let i = 0; i < count; i++) {
      const dot =
        this.sculptBaseNormals[i * 3] * x +
        this.sculptBaseNormals[i * 3 + 1] * y +
        this.sculptBaseNormals[i * 3 + 2] * z;
      if (dot > bestDot) {
        bestDot = dot;
        bestIndex = i;
      }
    }

    return this.sculptDisplacements[bestIndex] ?? 0;
  }

  applyTerrainStamp(hitPoint: THREE.Vector3, state: TerrainStampState): EditorSculptState {
    const hitNormal = hitPoint.clone().normalize();
    const baseUp =
      Math.abs(hitNormal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(baseUp, hitNormal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(hitNormal, tangent).normalize();
    const rotation = (state.rotation * Math.PI) / 180;
    const rotatedTangent = tangent
      .clone()
      .multiplyScalar(Math.cos(rotation))
      .addScaledVector(bitangent, Math.sin(rotation))
      .normalize();
    const rotatedBitangent = new THREE.Vector3().crossVectors(hitNormal, rotatedTangent);
    const radiusRadians = terrainStampRadiusRadians(state);
    const count = this.sculptBaseNormals.length / 3;

    for (let i = 0; i < count; i++) {
      const delta = terrainStampDelta(state.kind, {
        normal: [
          this.sculptBaseNormals[i * 3],
          this.sculptBaseNormals[i * 3 + 1],
          this.sculptBaseNormals[i * 3 + 2],
        ],
        center: [hitNormal.x, hitNormal.y, hitNormal.z],
        tangent: [rotatedTangent.x, rotatedTangent.y, rotatedTangent.z],
        bitangent: [rotatedBitangent.x, rotatedBitangent.y, rotatedBitangent.z],
        radiusRadians,
        strength: state.strength,
        roughness: state.roughness,
        falloff: state.falloff,
      });
      if (delta === 0) continue;
      const next = this.sculptDisplacements[i] + delta;
      this.sculptDisplacements[i] = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, next));
    }

    this.fastUpdatePositions();
    return this.getSculptState();
  }

  dispose(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.style.cursor = "";
    }
    if (this.brushCursor) {
      this.brushCursor.geometry.dispose();
      (this.brushCursor.material as THREE.Material).dispose();
    }
  }

  // ─── Sculpt base ──────────────────────────────────────────────────────────

  private initSculptBase(planet: EditorPlanet): void {
    const detail = planet.terrain.icosahedronDetail;
    const indexed = new THREE.IcosahedronGeometry(planet.radius, detail);
    const geo = indexed.toNonIndexed();
    indexed.dispose();

    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const count = pos.count;
    this.sculptBaseNormals = new Float32Array(count * 3);
    this.sculptBaseHeights = new Float32Array(count);
    this.sculptDisplacements = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;
      this.sculptBaseNormals[i * 3] = nx;
      this.sculptBaseNormals[i * 3 + 1] = ny;
      this.sculptBaseNormals[i * 3 + 2] = nz;
      this.sculptBaseHeights[i] = getTerrainRadius(nx, ny, nz, {
        planet: { radius: planet.radius },
        terrain: planet.terrain,
      });
    }

    geo.dispose();
    this.sculptDetail = detail;
    this.loadSculptState(planet.sculpt);
  }

  private loadSculptState(sculpt: EditorSculptState | undefined): void {
    if (!sculpt || sculpt.detail !== this.sculptDetail) return;
    if (sculpt.vertexCount > 0 && sculpt.vertexCount !== this.sculptDisplacements.length) return;

    for (const sample of sculpt.samples) {
      if (!Number.isInteger(sample.index)) continue;
      if (sample.index < 0 || sample.index >= this.sculptDisplacements.length) continue;
      this.sculptDisplacements[sample.index] = Math.max(
        -MAX_DISPLACEMENT,
        Math.min(MAX_DISPLACEMENT, sample.value),
      );
    }
  }

  // ─── Brush stroke ─────────────────────────────────────────────────────────

  private applyBrushStroke(hitPoint: THREE.Vector3): void {
    if (!this.brushState) return;
    const { mode, size, strength, falloff } = this.brushState;

    const brushSizeRad = (size * Math.PI) / 180;
    const cosMax = Math.cos(brushSizeRad);

    const len = hitPoint.length();
    const hx = hitPoint.x / len;
    const hy = hitPoint.y / len;
    const hz = hitPoint.z / len;

    const count = this.sculptBaseNormals.length / 3;

    // Flatten: record target displacement at click point once per stroke
    if (mode === "flatten" && this.flattenTarget === null) {
      let bestDot = -Infinity;
      let bestIdx = 0;
      for (let i = 0; i < count; i++) {
        const dot =
          this.sculptBaseNormals[i * 3] * hx +
          this.sculptBaseNormals[i * 3 + 1] * hy +
          this.sculptBaseNormals[i * 3 + 2] * hz;
        if (dot > bestDot) {
          bestDot = dot;
          bestIdx = i;
        }
      }
      this.flattenTarget = this.sculptDisplacements[bestIdx];
    }

    // Smooth: weighted average of displacements in brush radius
    let smoothTarget = 0;
    if (mode === "smooth") {
      let wSum = 0;
      let wTot = 0;
      for (let i = 0; i < count; i++) {
        const dot =
          this.sculptBaseNormals[i * 3] * hx +
          this.sculptBaseNormals[i * 3 + 1] * hy +
          this.sculptBaseNormals[i * 3 + 2] * hz;
        if (dot <= cosMax) continue;
        const t = Math.acos(Math.min(dot, 1)) / brushSizeRad;
        const w = this.falloffWeight(t, falloff);
        wSum += w * this.sculptDisplacements[i];
        wTot += w;
      }
      smoothTarget = wTot > 0 ? wSum / wTot : 0;
    }

    const delta = STROKE_DELTA * strength;

    for (let i = 0; i < count; i++) {
      const dot =
        this.sculptBaseNormals[i * 3] * hx +
        this.sculptBaseNormals[i * 3 + 1] * hy +
        this.sculptBaseNormals[i * 3 + 2] * hz;
      if (dot <= cosMax) continue;

      const t = Math.acos(Math.min(dot, 1)) / brushSizeRad;
      const w = this.falloffWeight(t, falloff);

      let d = this.sculptDisplacements[i];
      switch (mode) {
        case "raise":
          d += delta * w;
          break;
        case "lower":
          d -= delta * w;
          break;
        case "smooth":
          d += w * strength * 0.1 * (smoothTarget - d);
          break;
        case "flatten": {
          const target = this.flattenTarget ?? 0;
          d += w * strength * 0.1 * (target - d);
          break;
        }
      }
      this.sculptDisplacements[i] = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, d));
    }

    this.fastUpdatePositions();
  }

  private fastUpdatePositions(): void {
    if (this.planetMeshes.length === 0) return;
    const geo = this.planetMeshes[0].geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const r = this.sculptBaseHeights[i] + this.sculptDisplacements[i];
      posAttr.setXYZ(
        i,
        this.sculptBaseNormals[i * 3] * r,
        this.sculptBaseNormals[i * 3 + 1] * r,
        this.sculptBaseNormals[i * 3 + 2] * r,
      );
    }
    posAttr.needsUpdate = true;

    // Recompute normals from actual displaced geometry and push to smoothNormal
    // so the cel shader gets live-correct lighting during the stroke
    geo.computeVertexNormals();
    const normalAttr = geo.getAttribute("normal") as THREE.BufferAttribute;
    const smoothNormalAttr = geo.getAttribute("smoothNormal") as THREE.BufferAttribute;
    if (smoothNormalAttr) {
      (smoothNormalAttr.array as Float32Array).set(normalAttr.array as Float32Array);
      smoothNormalAttr.needsUpdate = true;
    }
  }

  private falloffWeight(t: number, falloff: BrushFalloff): number {
    switch (falloff) {
      case "smooth":
        return 1 - 3 * t * t + 2 * t * t * t;
      case "linear":
        return 1 - t;
      case "sharp":
        return Math.pow(1 - t, 3);
    }
  }

  // ─── Cursor ───────────────────────────────────────────────────────────────

  private createBrushCursor(): THREE.LineLoop {
    const SEGMENTS = 64;
    const positions = new Float32Array(SEGMENTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x00ff99,
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

    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(up, n).normalize();
    const bitangent = new THREE.Vector3().crossVectors(n, tangent);

    const posAttr = this.brushCursor.geometry.getAttribute("position") as THREE.BufferAttribute;
    const SEGMENTS = posAttr.count;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    for (let i = 0; i < SEGMENTS; i++) {
      const phi = (i / SEGMENTS) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const dx = n.x * cosA + (tangent.x * cosPhi + bitangent.x * sinPhi) * sinA;
      const dy = n.y * cosA + (tangent.y * cosPhi + bitangent.y * sinPhi) * sinA;
      const dz = n.z * cosA + (tangent.z * cosPhi + bitangent.z * sinPhi) * sinA;
      posAttr.setXYZ(i, dx * r, dy * r, dz * r);
    }
    posAttr.needsUpdate = true;
  }

  // ─── Pointer events ───────────────────────────────────────────────────────

  private raycastPlanet(e: PointerEvent): THREE.Intersection | null {
    if (!this.canvas || !this.camera) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = this.raycaster.intersectObject(this.planetMeshes[0]);
    return hits.length > 0 ? hits[0] : null;
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.brushState || !this.brushCursor || !this.canvas) return;
    const hit = this.raycastPlanet(e);
    if (!hit) {
      this.brushCursor.visible = false;
      this.canvas.style.cursor = "crosshair";
      return;
    }
    this.updateBrushCursor(hit.point);
    this.brushCursor.visible = true;
    this.canvas.style.cursor = "none";

    if (this.isSliming) {
      this.applyBrushStroke(hit.point);
    }
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.brushState || e.button !== 0 || this.shouldOrbit?.()) return;
    const hit = this.raycastPlanet(e);
    if (!hit) return;

    e.stopImmediatePropagation();
    this.isSliming = true;
    this.flattenTarget = null;
    this.applyBrushStroke(hit.point);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0 && this.isSliming) {
      this.isSliming = false;
      this.flattenTarget = null;
      this.onStrokeEnd?.(this.getSculptState());
    }
  };

  private readonly onPointerLeave = (): void => {
    if (this.brushCursor) this.brushCursor.visible = false;
  };
}
