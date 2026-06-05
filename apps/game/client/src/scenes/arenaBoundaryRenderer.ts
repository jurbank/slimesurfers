import * as THREE from "three";
import { createArenaBoundaryMaterial } from "@splat/client-runtime/materials/arenaBoundaryMaterial.ts";
import { resolveGravityRadius } from "@splat/client-runtime/materials/gravityRingMaterial.ts";

interface ArenaPlanet {
  center: { x: number; y: number; z: number };
  radius: number;
  gravityRadius?: number;
}

export interface ArenaBoundsConfig {
  /** Per-planet arena return distance from GAME_CONFIG.movement.arenaReturnDistance. */
  arenaReturnDistance: number;
  /** Multiplier on top of the bounding radius. The visual sits a bit further out
   *  than the gravity envelope so the rim glow is clearly past the planets. */
  boundaryMultiplier?: number;
}

const DEFAULT_BOUNDARY_MULTIPLIER = 1.0;

// Phase F (the eventual hard kill boundary) will compute its own collision sphere.
// Phase A is pure visualisation: a single faint fresnel sphere wrapping every
// planet so the play space has a perceivable outer wall.
export class ArenaBoundaryRenderer {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  apply(planets: ArenaPlanet[], cfg: ArenaBoundsConfig): void {
    if (planets.length === 0) {
      this.disposeMesh();
      return;
    }

    const center = computeArenaCenter(planets);
    const radius = computeArenaRadius(planets, center, cfg);

    if (!this.mesh || !this.material) {
      const material = createArenaBoundaryMaterial();
      this.material = material;
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), material);
      // Inward-facing fog: render after planets so the fog is composited on top.
      this.mesh.renderOrder = 4;
      this.scene.add(this.mesh);
    }

    this.mesh.position.set(center.x, center.y, center.z);
    this.mesh.scale.setScalar(radius);
  }

  private disposeMesh(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material?.dispose();
    this.mesh = null;
    this.material = null;
  }
}

function computeArenaCenter(planets: ArenaPlanet[]): { x: number; y: number; z: number } {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of planets) {
    cx += p.center.x;
    cy += p.center.y;
    cz += p.center.z;
  }
  const n = planets.length;
  return { x: cx / n, y: cy / n, z: cz / n };
}

function computeArenaRadius(
  planets: ArenaPlanet[],
  center: { x: number; y: number; z: number },
  cfg: ArenaBoundsConfig,
): number {
  const multiplier = cfg.boundaryMultiplier ?? DEFAULT_BOUNDARY_MULTIPLIER;
  let max = 0;
  for (const p of planets) {
    const dx = p.center.x - center.x;
    const dy = p.center.y - center.y;
    const dz = p.center.z - center.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Furthest a player can be while still inside this planet's "active" region:
    // beyond its gravity ring AND past the per-planet arena-return distance.
    const reach = Math.max(resolveGravityRadius(p), p.radius + cfg.arenaReturnDistance);
    max = Math.max(max, dist + reach);
  }
  return max * multiplier;
}
