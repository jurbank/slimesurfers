import * as THREE from "three";
import { getWeaponDefinition, type WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { InputKey } from "@splat/protocol/network/clientMessages.ts";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import type { SnapshotMessage } from "@splat/protocol/network/serverMessages.ts";
import { RenderSystem } from "../systems/renderSystem.ts";
import { CameraSystem } from "../systems/cameraSystem.ts";
import { InputSystem } from "../systems/inputSystem.ts";
import { PaintSystem } from "../systems/paintSystem.ts";
import { CloudSystem } from "../systems/cloudSystem.ts";
import { PickupSystem } from "../systems/pickupSystem.ts";
import { ProjectileSystem } from "../systems/projectileSystem.ts";
import { SoundSystem } from "../systems/soundSystem.ts";
import { AUDIO } from "../assets/audioConfig.ts";
import { RoomConnection } from "../network/roomConnection.ts";
import { LocalPlayer } from "../entities/player/player.ts";
import { RemotePlayer } from "../entities/player/remotePlayer.ts";
import { ClientRuntimeState } from "../network/runtimeState.ts";
import { CombatHud } from "../ui/CombatHud.ts";
import { LeaderboardOverlay } from "../ui/LeaderboardOverlay.ts";
import { PauseMenuOverlay } from "../ui/PauseMenuOverlay.ts";
import { createPlanetMaterial } from "../materials/planetMaterial.ts";
import { createAtmosphereMaterial } from "../materials/atmosphereMaterial.ts";
import { createWaterMaterial } from "../materials/waterMaterial.ts";
import {
  getTerrainHeight,
  getTerrainNormal,
  getTerrainRadius,
  getBiome,
} from "@splat/simulation/terrain/planetTerrain.ts";
import {
  appendPaintStamp,
  createStampBuckets,
  getPaintCollisionDistance,
} from "@splat/simulation/paint/paintDetection.ts";
import { PlayerMovementState, type SimPlanetPaintState } from "@splat/simulation/match/simState.ts";

const PLANET_CENTERS = PLANET_POSITIONS.map((p) => new THREE.Vector3(p.x, p.y, p.z));
const FALLBACK_PLAYER_COLOR = 0xffffff;
const CROSSHAIR_AIM_DISTANCE = 500;

function nearestPlanetCenter(pos: THREE.Vector3): THREE.Vector3 {
  let nearest = PLANET_CENTERS[0];
  let minDist = Infinity;
  for (const center of PLANET_CENTERS) {
    const d = pos.distanceTo(center);
    if (d < minDist) {
      minDist = d;
      nearest = center;
    }
  }
  return nearest;
}

export class MatchScene {
  private readonly render: RenderSystem;
  private readonly camera: CameraSystem;
  private readonly input: InputSystem;
  private readonly paint: PaintSystem;
  private readonly clouds: CloudSystem;
  private readonly pickups: PickupSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly sound: SoundSystem;
  private readonly connection: RoomConnection;
  private readonly runtime: ClientRuntimeState;
  private readonly combatHud: CombatHud;
  private readonly leaderboard: LeaderboardOverlay;
  private readonly pauseMenu: PauseMenuOverlay;

  private localPlayer: LocalPlayer | null = null;
  private localPlayerPatternId = -1;
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private readonly playerColors = new Map<string, number>();
  private readonly playerPatterns = new Map<string, number>();
  private readonly planetPaint = new Map<string, SimPlanetPaintState>();
  private lastLocalHealth: number | null = null;
  private readonly planetMaterials: THREE.ShaderMaterial[] = [];
  private readonly atmosphereMaterials: THREE.ShaderMaterial[] = [];
  private readonly waterMaterials: THREE.ShaderMaterial[] = [];

  private onDisconnectCb: (() => void) | null = null;
  private lastAimDir: { x: number; y: number; z: number } = { x: 0, y: 0, z: 1 };
  private readonly crosshairRayDir = new THREE.Vector3();
  private readonly aimPoint = new THREE.Vector3();
  private readonly aimToPlayer = new THREE.Vector3();
  private readonly terrainSample = new THREE.Vector3();
  private readonly resolvedAimDir = new THREE.Vector3();

  private debugLines: THREE.LineSegments | null = null;

  private setPaused(paused: boolean): void {
    if (paused === this.pauseMenu.isVisible()) return;

    if (paused) {
      this.pauseMenu.show();
      this.input.setEnabled(false);
      return;
    }

    this.pauseMenu.hide();
    this.input.setEnabled(true);
  }

  private getAimPoint(localSessionId: string, weaponId: WeaponId): THREE.Vector3 {
    this.camera.camera.getWorldDirection(this.crosshairRayDir).normalize();
    this.aimPoint
      .copy(this.camera.camera.position)
      .addScaledVector(this.crosshairRayDir, CROSSHAIR_AIM_DISTANCE);

    let closestHitDistance = this.getTerrainHitDistance(CROSSHAIR_AIM_DISTANCE);
    if (closestHitDistance !== null) {
      this.aimPoint
        .copy(this.camera.camera.position)
        .addScaledVector(this.crosshairRayDir, closestHitDistance);
    } else {
      closestHitDistance = CROSSHAIR_AIM_DISTANCE;
    }

    const weapon = getWeaponDefinition(weaponId);
    const playerHitRadius = Math.max(
      GAME_CONFIG.movement.collisionRadius + weapon.projectileCollisionRadius,
      GAME_CONFIG.movement.collisionRadius * 1.2,
    );
    const playerHitRadiusSq = playerHitRadius * playerHitRadius;

    for (const [sessionId, remotePlayer] of this.remotePlayers) {
      if (sessionId === localSessionId) continue;
      if (!remotePlayer.isAimTargetVisible()) continue;

      this.aimToPlayer.copy(remotePlayer.mesh.position).sub(this.camera.camera.position);
      const centerDistance = this.aimToPlayer.dot(this.crosshairRayDir);
      if (centerDistance <= 0 || centerDistance >= closestHitDistance) continue;

      const missDistanceSq = this.aimToPlayer.lengthSq() - centerDistance * centerDistance;
      if (missDistanceSq > playerHitRadiusSq) continue;

      const entryDistance = centerDistance - Math.sqrt(playerHitRadiusSq - missDistanceSq);
      if (entryDistance <= 0 || entryDistance >= closestHitDistance) continue;

      closestHitDistance = entryDistance;
      this.aimPoint
        .copy(this.camera.camera.position)
        .addScaledVector(this.crosshairRayDir, entryDistance);
    }

    return this.aimPoint;
  }

  private getTerrainHitDistance(maxDistance: number): number | null {
    const stepDistance = Math.max(0.5, GAME_CONFIG.movement.collisionRadius);
    for (let d = stepDistance; d < maxDistance; d += stepDistance) {
      this.terrainSample.copy(this.camera.camera.position).addScaledVector(this.crosshairRayDir, d);
      const planetCenter = nearestPlanetCenter(this.terrainSample);
      const dx = this.terrainSample.x - planetCenter.x;
      const dy = this.terrainSample.y - planetCenter.y;
      const dz = this.terrainSample.z - planetCenter.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-6) return d;

      const surfaceRadius = getTerrainRadius(dx / dist, dy / dist, dz / dist, GAME_CONFIG);
      if (dist <= surfaceRadius) return d;
    }

    return null;
  }

  private updateDebugLines(): void {
    if (!GAME_CONFIG.debug.showPaintColliders) {
      if (this.debugLines) {
        this.render.scene.remove(this.debugLines);
        this.debugLines = null;
      }
      return;
    }

    if (!this.debugLines) {
      this.debugLines = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0xff00ff,
          transparent: false,
          opacity: 1.0,
          depthTest: false,
        }),
      );
      this.debugLines.frustumCulled = false;
      this.debugLines.renderOrder = 999;
      this.render.scene.add(this.debugLines);
    }

    const positions: number[] = [];
    for (const p of PLANET_POSITIONS) {
      const history = this.paint.getStampHistory(p.id);
      const planetCenter = new THREE.Vector3(p.x, p.y, p.z);

      for (const s of history) {
        const thresholdDist = getPaintCollisionDistance(s);
        // dist^2 = 2 * (1 - cosTheta) => cosTheta = 1 - dist^2 / 2
        const cosTheta = Math.max(-1, 1 - (thresholdDist * thresholdDist) / 2);
        const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));

        const normal = new THREE.Vector3(s.nx, s.ny, s.nz);
        const up =
          Math.abs(normal.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

        const segments = 16;
        for (let i = 0; i < segments; i++) {
          const a1 = (i / segments) * Math.PI * 2;
          const a2 = ((i + 1) / segments) * Math.PI * 2;

          const p1 = new THREE.Vector3()
            .copy(normal)
            .multiplyScalar(cosTheta)
            .addScaledVector(tangent, Math.cos(a1) * sinTheta)
            .addScaledVector(bitangent, Math.sin(a1) * sinTheta)
            .multiplyScalar(GAME_CONFIG.planet.radius + 1.0)
            .add(planetCenter);

          const p2 = new THREE.Vector3()
            .copy(normal)
            .multiplyScalar(cosTheta)
            .addScaledVector(tangent, Math.cos(a2) * sinTheta)
            .addScaledVector(bitangent, Math.sin(a2) * sinTheta)
            .multiplyScalar(GAME_CONFIG.planet.radius + 1.0)
            .add(planetCenter);

          positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
      }
    }

    this.debugLines.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
  }

  constructor() {
    this.render = new RenderSystem();
    this.camera = new CameraSystem();
    this.input = new InputSystem(this.render.renderer.domElement);
    this.paint = new PaintSystem(this.render.renderer);
    this.clouds = new CloudSystem(this.render.scene);
    this.pickups = new PickupSystem(this.render.scene);
    this.projectiles = new ProjectileSystem(this.render.scene);
    this.sound = new SoundSystem();
    this.connection = new RoomConnection();
    this.runtime = new ClientRuntimeState();
    this.combatHud = new CombatHud();
    this.leaderboard = new LeaderboardOverlay();
    this.pauseMenu = new PauseMenuOverlay(this.sound);
    this.pauseMenu.onResume(() => this.setPaused(false));
    this.pauseMenu.onToggle(() => this.setPaused(!this.pauseMenu.isVisible()));
    this.input.onPointerLockExit(() => this.setPaused(true));
    this.render.renderer.domElement.addEventListener("pointerdown", () => this.sound.resume(), {
      once: true,
    });
    for (const p of PLANET_POSITIONS) {
      this.planetPaint.set(p.id, {
        planetId: p.id,
        territoryRows: GAME_CONFIG.paint.territoryRows,
        territoryCols: GAME_CONFIG.paint.territoryCols,
        cells: [],
        stamps: [],
        stampBuckets: createStampBuckets(
          GAME_CONFIG.paint.territoryRows,
          GAME_CONFIG.paint.territoryCols,
        ),
      });
    }
    this.buildSkyReference();
    this.buildPlanets();
  }

  private buildSkyReference(): void {
    const positions: number[] = [];
    for (let i = 0; i < 700; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      const radius = 900 + Math.random() * 250;
      positions.push(dir.x * radius, dir.y * radius, dir.z * radius);
    }

    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      ),
      new THREE.PointsMaterial({
        color: 0xeaf4ff,
        size: 4,
        sizeAttenuation: false,
      }),
    );
    this.render.scene.add(stars);

    const beaconGeometry = new THREE.SphereGeometry(12, 18, 18);
    const beacons = [
      { pos: new THREE.Vector3(0, 0, 500), color: 0xff5d73 },
      { pos: new THREE.Vector3(500, 120, -120), color: 0x4d96ff },
      { pos: new THREE.Vector3(-420, -180, -260), color: 0xffd166 },
    ];

    for (const beacon of beacons) {
      const mesh = new THREE.Mesh(
        beaconGeometry,
        new THREE.MeshBasicMaterial({ color: beacon.color }),
      );
      mesh.position.copy(beacon.pos);
      this.render.scene.add(mesh);
    }
  }

  private buildPlanets(): void {
    const atmosphereRadius = GAME_CONFIG.planet.radius + GAME_CONFIG.shaders.atmosphere.height;
    const waterRadius = GAME_CONFIG.planet.radius + GAME_CONFIG.terrain.waterLevel;

    for (const p of PLANET_POSITIONS) {
      const paintMask = this.paint.getRenderTarget(p.id);
      const planetMaterial = createPlanetMaterial({
        paintMask: paintMask?.texture || null,
      });

      const geometry = this.buildTerrainGeometry();
      const planet = new THREE.Mesh(geometry, planetMaterial);
      planet.position.set(p.x, p.y, p.z);
      this.render.scene.add(planet);
      this.planetMaterials.push(planetMaterial);

      if (GAME_CONFIG.shaders.atmosphere.enabled) {
        const atmosphereMat = createAtmosphereMaterial();
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(atmosphereRadius, 48, 48),
          atmosphereMat,
        );
        atmosphere.position.set(p.x, p.y, p.z);
        atmosphere.renderOrder = 2;
        this.render.scene.add(atmosphere);
        this.atmosphereMaterials.push(atmosphereMat);
      }

      // Water sphere at sea level
      if (GAME_CONFIG.shaders.water.enabled) {
        const waterMat = createWaterMaterial();
        const water = new THREE.Mesh(new THREE.SphereGeometry(waterRadius, 48, 48), waterMat);
        water.position.set(p.x, p.y, p.z);
        water.renderOrder = 1;
        this.render.scene.add(water);
        this.waterMaterials.push(waterMat);
      }

      if (GAME_CONFIG.shaders.clouds.enabled) {
        this.clouds.addPlanetClouds(p);
      }
    }
  }

  /**
   * Build an icosahedron displaced by procedural terrain noise, with
   * per-face flat shading and biome vertex colors.
   */
  private buildTerrainGeometry(): THREE.BufferGeometry {
    const detail = GAME_CONFIG.terrain.icosahedronDetail;
    const indexed = new THREE.IcosahedronGeometry(GAME_CONFIG.planet.radius, detail);

    // toNonIndexed gives each triangle its own vertices → flat shading
    const geometry = indexed.toNonIndexed();
    indexed.dispose();

    const posAttr = geometry.getAttribute("position");
    const vertexCount = posAttr.count;
    const faceCount = vertexCount / 3;
    const colors = new Float32Array(vertexCount * 3);
    const smoothNormals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    // First pass: displace all vertices and compute UVs
    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;

      const radius = getTerrainRadius(nx, ny, nz, GAME_CONFIG);
      posAttr.setXYZ(i, nx * radius, ny * radius, nz * radius);
      const terrainNormal = getTerrainNormal(nx, ny, nz, GAME_CONFIG);
      smoothNormals[i * 3] = terrainNormal.nx;
      smoothNormals[i * 3 + 1] = terrainNormal.ny;
      smoothNormals[i * 3 + 2] = terrainNormal.nz;

      // Spherical UVs from undisplaced normal — must match stampShader.ts
      const theta = Math.acos(Math.max(-1, Math.min(1, -ny)));
      const phi = Math.atan2(nz, nx);
      uvs[i * 2] = 0.5 - phi / (2 * Math.PI);
      uvs[i * 2 + 1] = theta / Math.PI;
    }

    // Fix seam-crossing triangles so UV interpolation wraps the short way around
    // the sphere instead of stretching across the full paint mask.
    for (let f = 0; f < faceCount; f++) {
      const i0 = f * 3;
      const i1 = f * 3 + 1;
      const i2 = f * 3 + 2;
      const u0 = uvs[i0 * 2];
      const u1 = uvs[i1 * 2];
      const u2 = uvs[i2 * 2];
      const minU = Math.min(u0, u1, u2);
      const maxU = Math.max(u0, u1, u2);

      if (maxU - minU > 0.5) {
        if (u0 < 0.5) uvs[i0 * 2] = u0 + 1.0;
        if (u1 < 0.5) uvs[i1 * 2] = u1 + 1.0;
        if (u2 < 0.5) uvs[i2 * 2] = u2 + 1.0;
      }
    }

    // Second pass: assign per-face colors from the face centroid
    // All 3 vertices of a triangle get the same color for a crisp flat look
    for (let f = 0; f < faceCount; f++) {
      const i0 = f * 3;
      const i1 = f * 3 + 1;
      const i2 = f * 3 + 2;

      // Face centroid in displaced space
      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
      const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;

      const cLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const cnx = cx / cLen;
      const cny = cy / cLen;
      const cnz = cz / cLen;

      const displacement = getTerrainHeight(cnx, cny, cnz, GAME_CONFIG);
      // Use centroid position as a pseudo-random seed for color variation
      const variation = Math.abs(((cx * 73.17 + cy * 91.33 + cz * 127.51) % 1.0) + 0.5) % 1.0;
      const biome = getBiome(displacement, GAME_CONFIG, variation);

      const r = ((biome.color >> 16) & 0xff) / 255;
      const g = ((biome.color >> 8) & 0xff) / 255;
      const b = (biome.color & 0xff) / 255;

      for (const vi of [i0, i1, i2]) {
        colors[vi * 3] = r;
        colors[vi * 3 + 1] = g;
        colors[vi * 3 + 2] = b;
      }
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("smoothNormal", new THREE.Float32BufferAttribute(smoothNormals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

    // Recompute normals after displacement — flat normals since non-indexed
    geometry.computeVertexNormals();

    return geometry;
  }

  private clearPlanetPaint(): void {
    for (const planet of this.planetPaint.values()) {
      planet.stamps.length = 0;
      planet.stampBuckets = createStampBuckets(planet.territoryRows, planet.territoryCols);
    }
  }

  private clearPlayerEntities(): void {
    this.localPlayer?.dispose(this.render.scene);
    this.localPlayer = null;
    this.localPlayerPatternId = -1;
    for (const player of this.remotePlayers.values()) {
      player.dispose(this.render.scene);
    }
    this.remotePlayers.clear();
    this.playerColors.clear();
    this.playerPatterns.clear();
  }

  private ensureLocalPlayer(slimeColor: number, patternId: number): void {
    // Recreate if pattern changed — handles snapshot-before-onPlayerAdded race
    if (this.localPlayer && this.localPlayerPatternId === patternId) return;
    this.localPlayer?.dispose(this.render.scene);
    this.localPlayer = new LocalPlayer(this.render.scene, slimeColor, patternId);
    this.localPlayerPatternId = patternId;
  }

  private ensureRemotePlayer(sessionId: string, slimeColor: number, patternId: number): void {
    const existing = this.remotePlayers.get(sessionId);
    if (existing && this.playerPatterns.get(sessionId) === patternId) return;
    existing?.dispose(this.render.scene);
    this.remotePlayers.set(sessionId, new RemotePlayer(this.render.scene, slimeColor, patternId));
  }

  private syncProjectiles(snapshot: SnapshotMessage, receivedAtMs: number): void {
    const liveProjectileIds = new Set<string>();
    const localSessionId = this.connection.sessionId;
    for (const projectile of snapshot.projectiles) {
      liveProjectileIds.add(projectile.id);
      const color = this.playerColors.get(projectile.ownerId) ?? FALLBACK_PLAYER_COLOR;
      const isNew = this.projectiles.syncProjectile(projectile.id, projectile, color, receivedAtMs);
      if (isNew && projectile.ownerId !== localSessionId) {
        this.sound.playSfxAt(
          "pow",
          new THREE.Vector3(projectile.pos.x, projectile.pos.y, projectile.pos.z),
        );
      }
    }
    this.projectiles.removeMissing(liveProjectileIds);
  }

  private syncPickups(snapshot: SnapshotMessage, receivedAtMs: number): void {
    const livePickupIds = new Set<string>();
    for (const pickup of snapshot.pickups) {
      livePickupIds.add(pickup.id);
      this.pickups.syncPickup(pickup, receivedAtMs);
    }
    this.pickups.removeMissing(livePickupIds);
  }

  onDisconnect(cb: () => void): void {
    this.onDisconnectCb = cb;
  }

  async connect(name: string, colorIndex: number): Promise<void> {
    await Promise.all(
      Object.entries(AUDIO).map(([key, { url, category }]) =>
        this.sound.preload(key, url, category),
      ),
    );
    await this.connection.join(name, colorIndex, {
      onPlayerAdded: (
        sessionId: string,
        slimeColor: number,
        patternId: number,
        paintGroupId: number,
      ) => {
        this.playerColors.set(sessionId, slimeColor);
        this.playerPatterns.set(sessionId, patternId);
        if (sessionId === this.connection.sessionId) {
          this.ensureLocalPlayer(slimeColor, patternId);
          this.runtime.setLocalPaintGroupId(paintGroupId);
        } else {
          this.ensureRemotePlayer(sessionId, slimeColor, patternId);
        }
      },
      onPlayerRemoved: (sessionId: string) => {
        this.playerColors.delete(sessionId);
        this.playerPatterns.delete(sessionId);
        this.runtime.removePlayer(sessionId);
        if (sessionId === this.connection.sessionId) {
          this.localPlayer?.dispose(this.render.scene);
          this.localPlayer = null;
          this.lastLocalHealth = null;
          this.combatHud.clear();
        } else {
          this.remotePlayers.get(sessionId)?.dispose(this.render.scene);
          this.remotePlayers.delete(sessionId);
        }
      },
      onPaintStamps: (stamps) => {
        for (const stamp of stamps) {
          this.paint.addStamp(stamp);
          const planetState = this.planetPaint.get(stamp.planetId);
          if (planetState) {
            appendPaintStamp(planetState, stamp);
          }
        }
      },
      onSnapshot: (snapshot, receivedAtMs) => {
        const localSessionId = this.connection.sessionId;
        for (const player of snapshot.players) {
          const isLocal = player.sessionId === localSessionId;
          const slimeColor = this.playerColors.get(player.sessionId) ?? FALLBACK_PLAYER_COLOR;
          const patternId = this.playerPatterns.get(player.sessionId) ?? 0;
          if (isLocal) this.ensureLocalPlayer(slimeColor, patternId);
          else this.ensureRemotePlayer(player.sessionId, slimeColor, patternId);
          this.runtime.applySnapshot(player, isLocal, receivedAtMs, this.planetPaint);
        }
        this.syncProjectiles(snapshot, receivedAtMs);
        this.syncPickups(snapshot, receivedAtMs);
      },
      onLeaderboard: (message) => {
        this.leaderboard.update(message, this.connection.sessionId);
      },
      onDisconnect: () => {
        this.clearPlayerEntities();
        this.runtime.clear();
        this.paint.clear();
        this.clearPlanetPaint();
        this.pickups.clear();
        this.projectiles.clear();
        this.lastLocalHealth = null;
        this.combatHud.clear();
        this.setPaused(false);
        this.onDisconnectCb?.();
      },
    });
  }

  start(): void {
    let lastTime = performance.now();
    let inputSeq = 0;
    const playerPos = new THREE.Vector3();

    const animate = (): void => {
      requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Animate water
      for (const mat of this.planetMaterials) {
        mat.uniforms.time.value = now / 1000;
      }
      for (const mat of this.waterMaterials) {
        mat.uniforms.time.value = now / 1000;
      }
      this.clouds.update(dt);

      // Always update debug lines if enabled
      this.updateDebugLines();

      const localSessionId = this.connection.sessionId;
      const localState = this.runtime.getLocalPlayerState();
      if (!localSessionId || !localState) {
        this.render.render(this.camera.camera);
        return;
      }

      playerPos.set(localState.pos.x, localState.pos.y, localState.pos.z);
      const planetCenter = nearestPlanetCenter(playerPos);

      // Update orientation (parallel transport + yaw); return value unused here.
      this.input.computeAimDir(playerPos, planetCenter);
      const yawForward = this.input.getYawForward();

      // aimDir for this frame comes from the previous frame's camera position.
      // Camera is updated after prediction so it always follows the latest state.
      const aimPoint = this.getAimPoint(localSessionId, localState.equippedWeaponId);
      this.resolvedAimDir.copy(aimPoint).sub(playerPos);
      let aimDir = this.lastAimDir;
      if (this.resolvedAimDir.lengthSq() > 1e-6) {
        this.resolvedAimDir.normalize();
        aimDir = {
          x: this.resolvedAimDir.x,
          y: this.resolvedAimDir.y,
          z: this.resolvedAimDir.z,
        };
      }

      const keyBits = this.input.buildKeyBits();
      if (keyBits & InputKey.Fire) {
        const { fireCooldownMs } = getWeaponDefinition(localState.equippedWeaponId);
        this.sound.playSfx("pow", { cooldownMs: fireCooldownMs });
      }

      const input = {
        seq: ++inputSeq,
        keys: keyBits,
        aimDir,
        aimPoint: { x: aimPoint.x, y: aimPoint.y, z: aimPoint.z },
        dt,
      };
      this.connection.sendInput(input);
      this.runtime.recordLocalInput(input, this.planetPaint);

      const predictedLocalState = this.runtime.getLocalPlayerState();
      if (predictedLocalState && this.localPlayer) {
        const visualRotation =
          predictedLocalState.movementState === PlayerMovementState.Airborne
            ? this.input.getLocalRotation()
            : undefined;
        this.localPlayer.update(
          predictedLocalState,
          visualRotation,
          new THREE.Vector3(aimDir.x, aimDir.y, aimDir.z),
        );
        this.lastAimDir = this.camera.update(
          predictedLocalState.pos,
          yawForward,
          this.input.getPitch(),
          planetCenter,
        );
      }

      if (predictedLocalState) {
        if (this.lastLocalHealth !== null && predictedLocalState.health < this.lastLocalHealth) {
          this.combatHud.flashDamage();
        }
        this.lastLocalHealth = predictedLocalState.health;
        this.combatHud.update(
          getWeaponDefinition(predictedLocalState.equippedWeaponId).displayName,
          predictedLocalState.health,
          GAME_CONFIG.player.maxHealth,
          predictedLocalState.slimeLevel,
          GAME_CONFIG.slime.maxLevel,
          predictedLocalState.respawnTimer,
        );
      } else {
        this.lastLocalHealth = null;
        this.combatHud.clear();
      }

      for (const [sessionId, remotePlayer] of this.remotePlayers) {
        if (sessionId === localSessionId) continue;
        const remoteState = this.runtime.getRemotePlayerState(sessionId, now);
        if (remoteState) remotePlayer.update(remoteState);
      }

      this.pickups.update(now);
      this.projectiles.update(now);
      this.sound.updateListener(this.camera.camera);
      this.render.render(this.camera.camera);
    };

    animate();
  }
}
