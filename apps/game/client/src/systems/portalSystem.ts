import * as THREE from "three";
import {
  getTerrainHeight,
  getTerrainRadius,
  type TerrainConfig,
} from "@splat/simulation/terrain/planetTerrain.ts";

export const PORTAL_ENABLED = true; // temp, will enable when ready

const PORTAL_URL = "https://vibejam.cc/portal/2026";
const COLLECT_RADIUS_SQ = 4.5 * 4.5;
const HOVER_HEIGHT = 1.2;

function findPortalNormal(cfg: TerrainConfig): THREE.Vector3 {
  const isAboveWater = (nx: number, ny: number, nz: number) =>
    getTerrainHeight(nx, ny, nz, cfg) > cfg.terrain.waterLevel;

  // Preferred spot, then scan the equator in 16 steps until above water
  const candidates: [number, number, number][] = [[0, 0, 1]];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    candidates.push([Math.cos(a), 0, Math.sin(a)]);
  }

  for (const [x, y, z] of candidates) {
    const v = new THREE.Vector3(x, y, z).normalize();
    if (isAboveWater(v.x, v.y, v.z)) return v;
  }

  return new THREE.Vector3(0, 0, 1); // fallback (should never reach here)
}

function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.shadowColor = "#00ffcc";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
}

export class PortalSystem {
  readonly position: THREE.Vector3;
  private readonly root: THREE.Group;
  private readonly spinGroup: THREE.Group;
  private readonly outerRing: THREE.Mesh;
  private readonly innerRing: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private readonly createdAtMs: number;
  private triggered = false;

  constructor(scene: THREE.Scene, nowMs: number, terrainCfg: TerrainConfig) {
    this.createdAtMs = nowMs;

    const normal = findPortalNormal(terrainCfg);
    const nx = normal.x;
    const ny = normal.y;
    const nz = normal.z;
    const surfaceR = getTerrainRadius(nx, ny, nz, terrainCfg);
    this.position = new THREE.Vector3(
      nx * (surfaceR + HOVER_HEIGHT),
      ny * (surfaceR + HOVER_HEIGHT),
      nz * (surfaceR + HOVER_HEIGHT),
    );

    this.root = new THREE.Group();
    this.root.position.copy(this.position);
    // Orient group so local Y points away from planet surface
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

    this.spinGroup = new THREE.Group();
    this.root.add(this.spinGroup);

    // Upright outer ring (stands perpendicular to surface)
    this.outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.5, 0.45, 16, 64),
      new THREE.MeshLambertMaterial({
        color: 0x00ffcc,
        emissive: 0x00ffcc,
        emissiveIntensity: 1.2,
      }),
    );

    // Upright spinning ring
    this.innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.0, 0.25, 12, 48),
      new THREE.MeshLambertMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.85,
      }),
    );

    // Glowing disc (upright, filling the portal opening)
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(4.0, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
    );

    const light = new THREE.PointLight(0x00ffcc, 3.5, 22);
    this.spinGroup.add(light);
    this.spinGroup.add(this.outerRing);
    this.spinGroup.add(this.innerRing);
    this.spinGroup.add(this.disc);

    this.label = makeTextSprite("Vibe Verse");
    this.label.scale.set(10, 2.5, 1);
    this.label.position.set(0, 8.5, 0);
    this.root.add(this.label);

    scene.add(this.root);
  }

  update(nowMs: number, playerPos: THREE.Vector3): void {
    if (this.triggered) return;

    const t = (nowMs - this.createdAtMs) / 1000;

    this.spinGroup.rotation.y = t * 0.55;
    this.innerRing.rotation.x = t * 2.1;
    this.innerRing.rotation.z = t * 1.4;

    const discMat = this.disc.material as THREE.MeshBasicMaterial;
    discMat.opacity = 0.25 + Math.sin(t * 3.0) * 0.1;

    this.label.position.y = 8.5 + Math.sin(t * 1.4) * 0.4;

    const dx = playerPos.x - this.position.x;
    const dy = playerPos.y - this.position.y;
    const dz = playerPos.z - this.position.z;
    if (PORTAL_ENABLED && dx * dx + dy * dy + dz * dz < COLLECT_RADIUS_SQ) {
      this.triggered = true;
      window.location.href = PORTAL_URL;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.outerRing.geometry.dispose();
    this.innerRing.geometry.dispose();
    this.disc.geometry.dispose();
    (this.outerRing.material as THREE.Material).dispose();
    (this.innerRing.material as THREE.Material).dispose();
    (this.disc.material as THREE.Material).dispose();
    (this.label.material as THREE.SpriteMaterial).map?.dispose();
    (this.label.material as THREE.SpriteMaterial).dispose();
  }
}
