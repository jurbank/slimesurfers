import * as THREE from "three";
import type { EditorBlastPad, EditorPlanet } from "../../types.ts";

const PAD_THICKNESS = 0.18;
const RENDER_ORDER = 8;

interface PadVisuals {
  group: THREE.Group;
  platform: THREE.Mesh;
  ring: THREE.Mesh;
  arrow: THREE.Mesh;
  platformMaterial: THREE.MeshStandardMaterial;
  ringMaterial: THREE.MeshBasicMaterial;
  arrowMaterial: THREE.MeshStandardMaterial;
  /** Last applied data — used to skip rebuilds when nothing changed. */
  signature: string;
}

/** Always-on 3D render of every authored blast pad. Mirrors the in-game
 *  `BlastPadSystem` but uses simpler materials (no charge state, no beacon).
 *  Phase E: pads no longer have a destination, so the dashed-arc to target is
 *  gone — the player aims at launch time. */
export class BlastPadPreviewVisuals {
  private readonly group = new THREE.Group();
  private readonly visuals = new Map<string, PadVisuals>();
  private pads: EditorBlastPad[] = [];
  private planets: EditorPlanet[] = [];
  private selectedPadId: string | null = null;
  private active = true;

  constructor(private readonly scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  setPads(pads: EditorBlastPad[]): void {
    this.pads = pads;
    this.rebuild();
  }

  setPlanets(planets: EditorPlanet[]): void {
    this.planets = planets;
    this.rebuild();
  }

  setSelectedPadId(padId: string | null): void {
    if (this.selectedPadId === padId) return;
    this.selectedPadId = padId;
    this.applyHighlight();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.group.visible = active;
  }

  dispose(): void {
    for (const entry of this.visuals.values()) this.disposeEntry(entry);
    this.visuals.clear();
    this.scene.remove(this.group);
  }

  private rebuild(): void {
    const seen = new Set<string>();
    for (const pad of this.pads) {
      const source = this.planets.find((p) => p.id === pad.planetId);
      if (!source) continue;
      seen.add(pad.id);

      const sig = signaturePad(pad, source);
      const existing = this.visuals.get(pad.id);
      if (existing && existing.signature === sig) continue;
      if (existing) {
        this.disposeEntry(existing);
        this.visuals.delete(pad.id);
      }
      const visuals = this.buildPadVisuals(pad, source);
      visuals.signature = sig;
      this.visuals.set(pad.id, visuals);
      this.group.add(visuals.group);
    }
    for (const [id, entry] of this.visuals) {
      if (!seen.has(id)) {
        this.disposeEntry(entry);
        this.visuals.delete(id);
      }
    }
    this.applyHighlight();
  }

  private buildPadVisuals(pad: EditorBlastPad, source: EditorPlanet): PadVisuals {
    const sourceCenter = new THREE.Vector3(source.center.x, source.center.y, source.center.z);
    const normal = new THREE.Vector3(...pad.normal).normalize();
    const tangent = new THREE.Vector3(...pad.tangent).projectOnPlane(normal).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const padPos = sourceCenter.clone().addScaledVector(normal, source.radius + 0.08);

    const group = new THREE.Group();
    group.position.copy(padPos);
    const basis = new THREE.Matrix4().makeBasis(right, normal, tangent);
    group.quaternion.setFromRotationMatrix(basis);

    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0x4a3a00,
      emissiveIntensity: 0.45,
      metalness: 0.5,
      roughness: 0.4,
    });
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(pad.radius, pad.radius, PAD_THICKNESS, 48),
      platformMaterial,
    );
    platform.renderOrder = RENDER_ORDER;
    group.add(platform);

    const arrowMaterial = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0x4a1500,
      emissiveIntensity: 0.6,
    });
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(pad.radius * 0.32, pad.radius * 0.9, 3),
      arrowMaterial,
    );
    arrow.position.z = pad.radius * 0.1;
    arrow.position.y = PAD_THICKNESS * 0.75;
    arrow.rotation.x = Math.PI * 0.5;
    arrow.renderOrder = RENDER_ORDER + 1;
    group.add(arrow);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(pad.radius * 0.82, 0.12, 8, 64),
      ringMaterial,
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = PAD_THICKNESS;
    ring.renderOrder = RENDER_ORDER + 2;
    group.add(ring);

    return {
      group,
      platform,
      ring,
      arrow,
      platformMaterial,
      ringMaterial,
      arrowMaterial,
      signature: "",
    };
  }

  private applyHighlight(): void {
    for (const [id, entry] of this.visuals) {
      const selected = id === this.selectedPadId;
      entry.platformMaterial.emissiveIntensity = selected ? 1.1 : 0.45;
      entry.arrowMaterial.emissiveIntensity = selected ? 1.3 : 0.6;
    }
  }

  private disposeEntry(entry: PadVisuals): void {
    this.group.remove(entry.group);
    entry.platform.geometry.dispose();
    entry.ring.geometry.dispose();
    entry.arrow.geometry.dispose();
    entry.platformMaterial.dispose();
    entry.ringMaterial.dispose();
    entry.arrowMaterial.dispose();
  }
}

function signaturePad(pad: EditorBlastPad, source: EditorPlanet): string {
  return [
    pad.id,
    pad.radius.toFixed(3),
    pad.normal.map((n) => n.toFixed(4)).join(","),
    pad.tangent.map((n) => n.toFixed(4)).join(","),
    source.center.x,
    source.center.y,
    source.center.z,
    source.radius,
  ].join("|");
}
