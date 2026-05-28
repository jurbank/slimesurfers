import * as THREE from "three";
import type { MapDataMessage } from "@splat/protocol/network/serverMessages.ts";
import type { SimBlastPadState } from "@splat/simulation/match/simState.ts";
import { NO_SLIME_GROUP_ID } from "@splat/protocol/schemas/slimedState.ts";
import { createTerrainConfig, getTerrainRadius } from "@splat/simulation/terrain/planetTerrain.ts";

const PAD_THICKNESS = 0.18;
const BEACON_HEIGHT = 10;
const RENDER_ORDER_MARKER = 8;
// Neutral (uncharged) appearance — dull and grey so charged pads stand out.
const NEUTRAL_BASE_COLOR = 0x2a2a32;
const NEUTRAL_EMISSIVE_COLOR = 0x111118;
const NEUTRAL_EMISSIVE_INTENSITY = 0.15;
const CHARGED_EMISSIVE_INTENSITY = 1.45;

interface PadEntry {
  group: THREE.Group;
  platformMaterial: THREE.MeshStandardMaterial;
  ringMaterial: THREE.MeshBasicMaterial;
  beaconMaterial: THREE.MeshBasicMaterial;
  hoverRingMaterial: THREE.MeshBasicMaterial;
  arrowMaterial: THREE.MeshStandardMaterial;
}

export class BlastPadSystem {
  private readonly pads = new Map<string, PadEntry>();

  constructor(private readonly scene: THREE.Scene) {}

  setMapData(msg: MapDataMessage): void {
    this.dispose();
    for (const pad of msg.blastPads ?? []) {
      const planet = msg.planets.find((p) => p.id === pad.planetId);
      if (!planet) continue;

      const cfg = createTerrainConfig(planet);
      const normal = new THREE.Vector3(pad.normal.x, pad.normal.y, pad.normal.z).normalize();
      const tangent = new THREE.Vector3(pad.tangent.x, pad.tangent.y, pad.tangent.z)
        .projectOnPlane(normal)
        .normalize();
      const right = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      const center = new THREE.Vector3(planet.center.x, planet.center.y, planet.center.z);
      const radius = getTerrainRadius(normal.x, normal.y, normal.z, cfg) + 0.08;
      const padPos = center.clone().addScaledVector(normal, radius);

      const group = new THREE.Group();
      group.position.copy(padPos);
      const basis = new THREE.Matrix4().makeBasis(right, normal, tangent);
      group.quaternion.setFromRotationMatrix(basis);

      const platformMaterial = new THREE.MeshStandardMaterial({
        color: NEUTRAL_BASE_COLOR,
        emissive: NEUTRAL_EMISSIVE_COLOR,
        emissiveIntensity: NEUTRAL_EMISSIVE_INTENSITY,
        metalness: 0.45,
        roughness: 0.18,
      });
      const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.radius, pad.radius, PAD_THICKNESS, 48),
        platformMaterial,
      );
      platform.renderOrder = RENDER_ORDER_MARKER;
      group.add(platform);

      const arrowMaterial = new THREE.MeshStandardMaterial({
        color: NEUTRAL_BASE_COLOR,
        emissive: NEUTRAL_EMISSIVE_COLOR,
        emissiveIntensity: NEUTRAL_EMISSIVE_INTENSITY,
      });
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(pad.radius * 0.32, pad.radius * 0.9, 3),
        arrowMaterial,
      );
      arrow.position.z = pad.radius * 0.1;
      arrow.position.y = PAD_THICKNESS * 0.75;
      arrow.rotation.x = Math.PI * 0.5;
      arrow.renderOrder = RENDER_ORDER_MARKER + 1;
      group.add(arrow);

      const ringMaterial = new THREE.MeshBasicMaterial({ color: NEUTRAL_BASE_COLOR });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(pad.radius * 0.82, 0.12, 8, 64),
        ringMaterial,
      );
      ring.rotation.x = Math.PI * 0.5;
      ring.position.y = PAD_THICKNESS;
      ring.renderOrder = RENDER_ORDER_MARKER + 2;
      group.add(ring);

      const beaconMaterial = new THREE.MeshBasicMaterial({
        color: NEUTRAL_BASE_COLOR,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, BEACON_HEIGHT, 12),
        beaconMaterial,
      );
      beacon.position.y = BEACON_HEIGHT * 0.5 + PAD_THICKNESS;
      beacon.renderOrder = RENDER_ORDER_MARKER + 3;
      group.add(beacon);

      const hoverRingMaterial = new THREE.MeshBasicMaterial({
        color: NEUTRAL_BASE_COLOR,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const hoverRing = new THREE.Mesh(
        new THREE.TorusGeometry(pad.radius * 0.7, 0.09, 8, 48),
        hoverRingMaterial,
      );
      hoverRing.rotation.x = Math.PI * 0.5;
      hoverRing.position.y = BEACON_HEIGHT + PAD_THICKNESS;
      hoverRing.renderOrder = RENDER_ORDER_MARKER + 4;
      group.add(hoverRing);

      this.scene.add(group);
      this.pads.set(pad.id, {
        group,
        platformMaterial,
        ringMaterial,
        beaconMaterial,
        hoverRingMaterial,
        arrowMaterial,
      });
    }
  }

  /** Recolor each pad mesh to reflect ownership and charge: neutral pads stay dull,
   *  partially-painted pads glow at intensity proportional to coverage in the owner's
   *  color, and fully charged pads glow at full intensity. Called whenever a snapshot
   *  arrives. */
  setPadStates(states: ReadonlyMap<string, SimBlastPadState>): void {
    for (const [id, entry] of this.pads) {
      const state = states.get(id);
      const owned = !!state && state.ownerSlimeGroupId !== NO_SLIME_GROUP_ID;
      const coverage = state ? Math.max(0, Math.min(1, state.coverageProgress)) : 0;
      if (owned && coverage > 0) {
        const color = state.ownerColor;
        const t = coverage;
        const emissiveIntensity =
          NEUTRAL_EMISSIVE_INTENSITY + t * (CHARGED_EMISSIVE_INTENSITY - NEUTRAL_EMISSIVE_INTENSITY);
        entry.platformMaterial.color.setHex(0x2a1a22);
        entry.platformMaterial.emissive.setHex(color);
        entry.platformMaterial.emissiveIntensity = emissiveIntensity;
        entry.arrowMaterial.color.setHex(color);
        entry.arrowMaterial.emissive.setHex(color);
        entry.arrowMaterial.emissiveIntensity = 0.2 + t * 1.2;
        entry.ringMaterial.color.setHex(color);
        entry.beaconMaterial.color.setHex(color);
        entry.beaconMaterial.opacity = 0.3 + t * 0.55;
        entry.hoverRingMaterial.color.setHex(color);
        entry.hoverRingMaterial.opacity = 0.35 + t * 0.6;
      } else {
        entry.platformMaterial.color.setHex(NEUTRAL_BASE_COLOR);
        entry.platformMaterial.emissive.setHex(NEUTRAL_EMISSIVE_COLOR);
        entry.platformMaterial.emissiveIntensity = NEUTRAL_EMISSIVE_INTENSITY;
        entry.arrowMaterial.color.setHex(NEUTRAL_BASE_COLOR);
        entry.arrowMaterial.emissive.setHex(NEUTRAL_EMISSIVE_COLOR);
        entry.arrowMaterial.emissiveIntensity = NEUTRAL_EMISSIVE_INTENSITY;
        entry.ringMaterial.color.setHex(NEUTRAL_BASE_COLOR);
        entry.beaconMaterial.color.setHex(NEUTRAL_BASE_COLOR);
        entry.beaconMaterial.opacity = 0.6;
        entry.hoverRingMaterial.color.setHex(NEUTRAL_BASE_COLOR);
        entry.hoverRingMaterial.opacity = 0.8;
      }
    }
  }

  dispose(): void {
    for (const entry of this.pads.values()) {
      this.scene.remove(entry.group);
      entry.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) material.dispose();
        }
      });
    }
    this.pads.clear();
  }
}
