import * as THREE from "three";
import type { EditorBlastPad, EditorPlanet } from "../../types.ts";
import type { BlastPadToolState } from "./BlastPadTypes.ts";

const HANDLE_RADIUS = 1.6;
const HANDLE_OFFSET = 0.6;

export interface BlastPadConnectOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  getPlanetMesh: (planetId: string) => THREE.Mesh | null;
  getPlanet: (planetId: string) => EditorPlanet | null;
  shouldOrbit: () => boolean;
  onPadsChange: (pads: EditorBlastPad[]) => void;
  onSelectionChange: (padId: string | null) => void;
}

/** Pointer-driven blast-pad authoring tool. Picks against the active source
 *  planet for placement/move/delete. Phase E: there are no targets — pads are
 *  aim-and-fire launchers — so the previous target-pick mode and the related
 *  raycast against "other" planets are gone. Renders selectable spheres above
 *  each pad on the active planet only; the pad footprint visuals live in
 *  BlastPadPreviewVisuals. */
export class BlastPadTool {
  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private scene: THREE.Scene | null = null;
  private getPlanetMesh: ((planetId: string) => THREE.Mesh | null) | null = null;
  private getPlanet: ((planetId: string) => EditorPlanet | null) | null = null;
  private shouldOrbit: (() => boolean) | null = null;
  private onPadsChange: ((pads: EditorBlastPad[]) => void) | null = null;
  private onSelectionChange: ((padId: string | null) => void) | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly group = new THREE.Group();
  private readonly handlesGroup = new THREE.Group();
  private readonly handleGeometry = new THREE.SphereGeometry(HANDLE_RADIUS, 12, 8);
  private readonly handleMaterial = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    depthTest: false,
  });
  private readonly selectedHandleMaterial = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    depthTest: false,
  });

  private state: BlastPadToolState | null = null;
  private isDraggingPad: string | null = null;

  connect(options: BlastPadConnectOptions): void {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.getPlanetMesh = options.getPlanetMesh;
    this.getPlanet = options.getPlanet;
    this.shouldOrbit = options.shouldOrbit;
    this.onPadsChange = options.onPadsChange;
    this.onSelectionChange = options.onSelectionChange;

    this.group.add(this.handlesGroup);
    this.scene.add(this.group);

    this.canvas.addEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  setToolState(state: BlastPadToolState | null): void {
    this.state = state;
    if (this.canvas) {
      this.canvas.style.cursor = state?.mode ? "crosshair" : "";
    }
    this.updateHandles();
  }

  /** Called by EditorScene whenever pads change externally (e.g. the panel
   *  edits radius or heading) so handle positions track the new normals. */
  syncHandles(): void {
    this.updateHandles();
  }

  dispose(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.style.cursor = "";
    }
    if (this.scene) this.scene.remove(this.group);
    this.handleGeometry.dispose();
    this.handleMaterial.dispose();
    this.selectedHandleMaterial.dispose();
  }

  private updateHandles(): void {
    this.handlesGroup.clear();
    if (!this.state) return;
    const padsOnPlanet = this.state.pads.filter(
      (pad) => pad.planetId === this.state!.sourcePlanetId,
    );
    for (const pad of padsOnPlanet) {
      const position = this.handlePositionForPad(pad);
      if (!position) continue;
      const material =
        pad.id === this.state.selectedPadId ? this.selectedHandleMaterial : this.handleMaterial;
      const handle = new THREE.Mesh(this.handleGeometry, material);
      handle.position.copy(position);
      handle.renderOrder = 14;
      handle.userData.padId = pad.id;
      this.handlesGroup.add(handle);
    }
  }

  private handlePositionForPad(pad: EditorBlastPad): THREE.Vector3 | null {
    const planet = this.getPlanet?.(pad.planetId);
    if (!planet) return null;
    const mesh = this.getPlanetMesh?.(pad.planetId);
    const center = new THREE.Vector3(planet.center.x, planet.center.y, planet.center.z);
    const normal = new THREE.Vector3(...pad.normal).normalize();

    // Raycast against the actual terrain so handles sit on hills, not on the bare radius.
    if (mesh) {
      const origin = center.clone().addScaledVector(normal, planet.radius * 2);
      const direction = normal.clone().negate();
      this.raycaster.set(origin, direction);
      const hits = this.raycaster.intersectObject(mesh);
      if (hits[0]) return hits[0].point.clone().addScaledVector(normal, HANDLE_OFFSET);
    }
    return center.clone().addScaledVector(normal, planet.radius + HANDLE_OFFSET);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.state || e.button !== 0 || this.shouldOrbit?.()) return;
    if (!this.state.mode) return;

    const handle = this.raycastHandle(e);
    if (handle) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.state.selectedPadId !== handle.id) {
        this.onSelectionChange?.(handle.id);
      }
      if (this.state.mode === "delete") {
        const nextPads = this.state.pads.filter((p) => p.id !== handle.id);
        this.onPadsChange?.(nextPads);
        if (this.state.selectedPadId === handle.id) this.onSelectionChange?.(null);
        return;
      }
      if (this.state.mode === "move") {
        this.isDraggingPad = handle.id;
      }
      return;
    }

    if (this.state.mode !== "place") return;
    const hit = this.raycastSourcePlanet(e);
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const planet = this.getPlanet?.(this.state.sourcePlanetId);
    if (!planet) return;
    const center = new THREE.Vector3(planet.center.x, planet.center.y, planet.center.z);
    const normal = hit.point.clone().sub(center).normalize();
    const newPad = this.createPadAtNormal(normal);
    if (!newPad) return;
    this.onPadsChange?.([...this.state.pads, newPad]);
    this.onSelectionChange?.(newPad.id);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.canvas || !this.state) return;

    if (!this.isDraggingPad) {
      if (this.state.mode) {
        const handle = this.raycastHandle(e);
        this.canvas.style.cursor = handle ? "pointer" : "crosshair";
      }
      return;
    }

    const pad = this.state.pads.find((p) => p.id === this.isDraggingPad);
    if (!pad) return;
    const hit = this.raycastSourcePlanet(e);
    if (!hit) return;
    const planet = this.getPlanet?.(pad.planetId);
    if (!planet) return;
    const center = new THREE.Vector3(planet.center.x, planet.center.y, planet.center.z);
    const newNormal = hit.point.clone().sub(center).normalize();
    const reprojectedTangent = projectTangent(new THREE.Vector3(...pad.tangent), newNormal);
    const nextPad: EditorBlastPad = {
      ...pad,
      normal: [newNormal.x, newNormal.y, newNormal.z],
      tangent: [reprojectedTangent.x, reprojectedTangent.y, reprojectedTangent.z],
    };
    this.commitPadChange(nextPad);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.isDraggingPad = null;
  };

  private readonly onPointerLeave = (): void => {
    if (this.canvas && this.state?.mode) this.canvas.style.cursor = "crosshair";
    this.isDraggingPad = null;
  };

  private createPadAtNormal(normal: THREE.Vector3): EditorBlastPad | null {
    if (!this.state) return null;
    const sourceId = this.state.sourcePlanetId;
    const source = this.getPlanet?.(sourceId);
    if (!source) return null;

    const existingIds = new Set(this.state.pads.map((p) => p.id));
    const id = nextPadId(existingIds);
    const tangent = projectTangent(new THREE.Vector3(1, 0, 0), normal);

    return {
      id,
      planetId: sourceId,
      normal: [normal.x, normal.y, normal.z],
      tangent: [tangent.x, tangent.y, tangent.z],
      radius: 5,
      launchSpeed: 78,
      upwardBias: 0.45,
    };
  }

  private commitPadChange(nextPad: EditorBlastPad): void {
    if (!this.state) return;
    const nextPads = this.state.pads.map((p) => (p.id === nextPad.id ? nextPad : p));
    this.onPadsChange?.(nextPads);
  }

  private raycastSourcePlanet(e: PointerEvent): THREE.Intersection | null {
    if (!this.canvas || !this.camera || !this.state) return null;
    const mesh = this.getPlanetMesh?.(this.state.sourcePlanetId);
    if (!mesh) return null;
    const ndc = this.toNdc(e);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(mesh)[0] ?? null;
  }

  private raycastHandle(e: PointerEvent): { id: string } | null {
    if (!this.canvas || !this.camera) return null;
    const ndc = this.toNdc(e);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.handlesGroup.children);
    const id = hits[0]?.object.userData.padId;
    if (typeof id !== "string") return null;
    return { id };
  }

  private toNdc(e: PointerEvent): THREE.Vector2 {
    const rect = this.canvas!.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }
}

function projectTangent(candidate: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  const projected = candidate.clone().projectOnPlane(normal);
  if (projected.lengthSq() < 1e-6) {
    const ref = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    return ref.projectOnPlane(normal).normalize();
  }
  return projected.normalize();
}

function nextPadId(existing: ReadonlySet<string>): string {
  for (let i = 1; ; i++) {
    const candidate = `blast-pad-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
}
