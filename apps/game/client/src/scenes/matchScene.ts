import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { getAirTrickDefinition } from "@splat/content/tricks/airTrickDefs.ts";
import { InputKey } from "@splat/protocol/network/clientMessages.ts";
import {
  GAME_CONFIG,
  getPaintTerritoryDimensions,
  PLANET_POSITIONS,
} from "@splat/content/config/gameConfig.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type {
  EmoteEventMessage,
  KillEventMessage,
  LeaderboardMessage,
  SnapshotMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { RenderSystem } from "../systems/renderSystem.ts";
import { CameraSystem } from "../systems/cameraSystem.ts";
import { InputSystem } from "../systems/inputSystem.ts";
import { PaintSystem } from "../systems/paintSystem.ts";
import { CloudSystem } from "../systems/cloudSystem.ts";
import { PropSystem } from "../systems/propSystem.ts";
import { PickupSystem } from "../systems/pickupSystem.ts";
import { PORTAL_ENABLED, PortalSystem } from "../systems/portalSystem.ts";
import { ProjectileSystem } from "../systems/projectileSystem.ts";
import { SkiTrailSystem } from "../systems/skiTrailSystem.ts";
import { TrickTextSystem } from "../systems/trickTextSystem.ts";
import { EmoteBubbleSystem } from "../systems/emoteBubbleSystem.ts";
import { RailSystem } from "../systems/railSystem.ts";
import { MatchAudioSystem } from "../systems/matchAudioSystem.ts";
import { SoundSystem } from "../systems/soundSystem.ts";
import { AUDIO } from "../assets/audioConfig.ts";
import { RoomConnection } from "../network/roomConnection.ts";
import { LocalPlayer } from "../entities/player/player.ts";
import { RemotePlayer } from "../entities/player/remotePlayer.ts";
import { ClientRuntimeState } from "../network/runtimeState.ts";
import { CombatHud } from "../ui/CombatHud.ts";
import { SkiDebugHud } from "../ui/SkiDebugHud.ts";
import { CountdownOverlay } from "../ui/CountdownOverlay.ts";
import { LeaderboardOverlay } from "../ui/LeaderboardOverlay.ts";
import { MatchEndOverlay } from "../ui/MatchEndOverlay.ts";
import { PauseMenuOverlay } from "../ui/PauseMenuOverlay.ts";
import { EmoteMenuOverlay } from "../ui/EmoteMenuOverlay.ts";
import { HintToast } from "../ui/HintToast.ts";
import { createPlanetMaterial } from "../materials/planetMaterial.ts";
import { createAtmosphereMaterial } from "../materials/atmosphereMaterial.ts";
import { createWaterMaterial } from "../materials/waterMaterial.ts";
import { createOutlineMaterial } from "../materials/outlineMaterial.ts";
import {
  getTerrainHeight,
  getTerrainNormal,
  getTerrainRadius,
} from "@splat/simulation/terrain/planetTerrain.ts";
import {
  appendPaintStamp,
  createStampBuckets,
  getPaintCollisionDistance,
} from "@splat/simulation/paint/paintDetection.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type SimPlanetPaintState,
} from "@splat/simulation/match/simState.ts";

const PLANET_CENTERS = PLANET_POSITIONS.map((p) => new THREE.Vector3(p.x, p.y, p.z));
const CROSSHAIR_AIM_DISTANCE = 500;

const BAZOOKA_HOLD_THRESHOLD_MS = 500;
const ACQUISITION_RAMP_MS = 2000;
const ACQUISITION_OUTER_MIN_HALF = 20;
const ACQUISITION_OUTER_MAX_HALF = 90;
const ACQUISITION_INNER_HALF = 14;
const ACQUISITION_FOV_SCALE = 0.72;

const SNIPER_HOLD_THRESHOLD_MS = 200;
const SNIPER_CHARGE_MS = 1500;
const SNIPER_FOV_SCALE = 0.4;

function getLocalFireSoundKey(weaponId: WeaponId): string {
  if (weaponId === WeaponId.Bazooka) return "bazookaPow";
  if (weaponId === WeaponId.Sniper) return "riflePow";
  return "pow";
}

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
  private readonly props: PropSystem;
  private readonly pickups: PickupSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly trickText: TrickTextSystem;
  private readonly emoteBubbles: EmoteBubbleSystem;
  private readonly rails: RailSystem;
  private readonly sound: SoundSystem;
  private readonly matchAudio: MatchAudioSystem;
  private readonly connection: RoomConnection;
  private readonly runtime: ClientRuntimeState;
  private readonly combatHud: CombatHud;
  private readonly skiDebugHud: SkiDebugHud;
  private readonly leaderboard: LeaderboardOverlay;
  private readonly countdown: CountdownOverlay;
  private readonly matchEnd: MatchEndOverlay;
  private readonly pauseMenu: PauseMenuOverlay;
  private readonly emoteMenu: EmoteMenuOverlay;
  private readonly hintToast: HintToast;
  private lastLeaderboard: LeaderboardMessage | null = null;
  private currentPhase: MatchPhase = MatchPhase.Lobby;
  private connectParams: { name: string; colorIndex: number; playerUuid: string | null } | null =
    null;
  private reconnecting = false;

  private localPlayer: LocalPlayer | null = null;
  private localPlayerColor = -1;
  private localPlayerPatternId = -1;
  private localTrail: SkiTrailSystem | null = null;
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private readonly remoteTrails = new Map<string, SkiTrailSystem>();
  private readonly playerColors = new Map<string, number>();
  private readonly playerPatterns = new Map<string, number>();
  private readonly removedSessions = new Set<string>();
  private readonly planetPaint = new Map<string, SimPlanetPaintState>();
  private lastLocalHealth: number | null = null;
  private lastWasCarving = false;
  private lastWasAirborne = false;
  private portal: PortalSystem | null = null;
  private readonly planetMaterials: THREE.ShaderMaterial[] = [];
  private readonly planetOutlines: THREE.Mesh[] = [];
  private readonly atmosphereMaterials: THREE.ShaderMaterial[] = [];
  private readonly waterMaterials: THREE.ShaderMaterial[] = [];

  private onDisconnectCb: (() => void) | null = null;
  private lastAimDir: { x: number; y: number; z: number } = { x: 0, y: 0, z: 1 };
  private readonly crosshairRayDir = new THREE.Vector3();
  private readonly aimPoint = new THREE.Vector3();
  private readonly aimToPlayer = new THREE.Vector3();

  // Bazooka homing acquisition state
  private fireHoldStartMs: number | null = null;
  private prevFireDown = false;
  private acquisitionLockedTargetId: string | null = null;
  private acquisitionIsGuaranteed = false;
  private readonly acquisitionTestVec = new THREE.Vector3();
  private readonly losDir = new THREE.Vector3();
  private readonly terrainSample = new THREE.Vector3();
  private readonly resolvedAimDir = new THREE.Vector3();

  private debugLines: THREE.LineSegments | null = null;

  private setPaused(paused: boolean): void {
    if (paused === this.pauseMenu.isVisible()) return;

    if (paused) {
      this.pauseMenu.show();
      this.emoteMenu.close(false);
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

  private isTargetOccludedByTerrain(targetWorldPos: THREE.Vector3): boolean {
    const cameraPos = this.camera.camera.position;
    const totalDist = cameraPos.distanceTo(targetWorldPos);
    if (totalDist < 1e-4) return false;
    this.losDir.subVectors(targetWorldPos, cameraPos).normalize();
    const stepDistance = Math.max(0.5, GAME_CONFIG.movement.collisionRadius);
    for (let d = stepDistance; d < totalDist - stepDistance; d += stepDistance) {
      this.terrainSample.copy(cameraPos).addScaledVector(this.losDir, d);
      const planetCenter = nearestPlanetCenter(this.terrainSample);
      const dx = this.terrainSample.x - planetCenter.x;
      const dy = this.terrainSample.y - planetCenter.y;
      const dz = this.terrainSample.z - planetCenter.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-6) return true;
      const surfaceRadius = getTerrainRadius(dx / dist, dy / dist, dz / dist, GAME_CONFIG);
      if (dist <= surfaceRadius) return true;
    }
    return false;
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

  private syncCenterCountdown(respawnTimer: number): void {
    if (this.currentPhase === MatchPhase.Countdown) {
      this.countdown.show(this.connection.matchTimer, {
        label: "MATCH STARTING IN",
        note: "Weapons disabled until match begins",
        dangerThreshold: 3,
      });
      return;
    }

    if (this.currentPhase === MatchPhase.Active && respawnTimer > 0) {
      this.countdown.show(respawnTimer, {
        label: "RESPAWNING IN",
        note: "You will drop back into the match automatically",
        dangerThreshold: 1,
      });
      return;
    }

    this.countdown.hide();
  }

  constructor() {
    this.render = new RenderSystem();
    this.camera = new CameraSystem();
    this.input = new InputSystem(this.render.renderer.domElement);
    this.paint = new PaintSystem(this.render.renderer);
    this.clouds = new CloudSystem(this.render.scene);
    this.props = new PropSystem(this.render.scene);
    this.pickups = new PickupSystem(this.render.scene);
    this.projectiles = new ProjectileSystem(this.render.scene);
    this.trickText = new TrickTextSystem();
    this.emoteBubbles = new EmoteBubbleSystem();
    this.rails = new RailSystem(this.render.scene);
    this.sound = new SoundSystem();
    this.matchAudio = new MatchAudioSystem(
      this.sound,
      (sessionId) => this.getPlayerMesh(sessionId),
      () => this.connection.sessionId,
    );
    this.connection = new RoomConnection();
    this.runtime = new ClientRuntimeState();
    this.combatHud = new CombatHud();
    this.skiDebugHud = new SkiDebugHud();
    this.skiDebugHud.setVisible(import.meta.env.VITE_DEV_MODE === "true");
    this.leaderboard = new LeaderboardOverlay();
    this.countdown = new CountdownOverlay();
    this.matchEnd = new MatchEndOverlay(
      () => this.reconnect(),
      () => window.location.reload(),
    );
    this.pauseMenu = new PauseMenuOverlay(this.sound);
    this.emoteMenu = new EmoteMenuOverlay();
    this.hintToast = new HintToast();
    this.pauseMenu.onResume(() => this.setPaused(false));
    this.pauseMenu.onToggle(() => this.setPaused(!this.pauseMenu.isVisible()));
    this.emoteMenu.onPost((emoteIds) => this.connection.sendEmotePost(emoteIds));
    this.input.onPointerLockExit(() => this.setPaused(true));
    this.render.renderer.domElement.addEventListener("pointerdown", () => this.sound.resume(), {
      once: true,
    });
    const { rows, cols } = getPaintTerritoryDimensions();
    for (const p of PLANET_POSITIONS) {
      this.planetPaint.set(p.id, {
        planetId: p.id,
        territoryRows: rows,
        territoryCols: cols,
        cells: [],
        stamps: [],
        stampBuckets: createStampBuckets(rows, cols),
      });
    }
  }

  async preload(onProgress?: (progress: number) => void): Promise<void> {
    const audioEntries = Object.entries(AUDIO);
    const totalSteps = audioEntries.length + 2; // audio + sky + planets
    let completedSteps = 0;

    const increment = (): void => {
      completedSteps++;
      onProgress?.(Math.floor((completedSteps / totalSteps) * 100));
    };

    // 1. Audio
    await Promise.all(
      audioEntries.map(async ([key, { url, category, volume }]) => {
        await this.sound.preload(key, url, category, volume);
        increment();
      }),
    );

    // 2. Sky (fast but good to separate)
    this.buildSkyReference();
    increment();

    // 3. Planets (heavy geometry)
    this.buildPlanets();
    if (PORTAL_ENABLED) this.portal = new PortalSystem(this.render.scene, performance.now());
    increment();
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
        planetCenter: new THREE.Vector3(p.x, p.y, p.z),
        waterRadius,
      });

      const geometry = this.buildTerrainGeometry();
      const planet = new THREE.Mesh(geometry, planetMaterial);
      planet.position.set(p.x, p.y, p.z);
      this.render.scene.add(planet);
      this.planetMaterials.push(planetMaterial);

      // JSR Style Planet Outline
      const planetOutline = new THREE.Mesh(geometry, createOutlineMaterial());
      planetOutline.position.set(p.x, p.y, p.z);
      this.render.scene.add(planetOutline);
      this.planetOutlines.push(planetOutline);

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
        const water = new THREE.Mesh(this.buildWaterGeometry(waterRadius), waterMat);
        water.position.set(p.x, p.y, p.z);
        water.renderOrder = 1;
        this.render.scene.add(water);
        this.waterMaterials.push(waterMat);
      }

      if (GAME_CONFIG.shaders.clouds.enabled) {
        this.clouds.addPlanetClouds(p);
      }

      if (GAME_CONFIG.shaders.props.enabled) {
        this.props.addPlanetProps(p);
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

    geometry.setAttribute("smoothNormal", new THREE.Float32BufferAttribute(smoothNormals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

    // Recompute normals after displacement — flat normals since non-indexed
    geometry.computeVertexNormals();

    return geometry;
  }

  private buildWaterGeometry(waterRadius: number): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(waterRadius, 64, 64);
    const posAttr = geometry.getAttribute("position");
    const waterDepths = new Float32Array(posAttr.count);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;
      waterDepths[i] = GAME_CONFIG.terrain.waterLevel - getTerrainHeight(nx, ny, nz, GAME_CONFIG);
    }

    geometry.setAttribute("waterDepth", new THREE.Float32BufferAttribute(waterDepths, 1));
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
    this.localTrail?.dispose();
    this.trickText.clear();
    this.localPlayer = null;
    this.localTrail = null;
    this.localPlayerPatternId = -1;
    for (const player of this.remotePlayers.values()) {
      player.dispose(this.render.scene);
    }
    for (const trail of this.remoteTrails.values()) {
      trail.dispose();
    }
    this.remotePlayers.clear();
    this.remoteTrails.clear();
    this.playerColors.clear();
    this.playerPatterns.clear();
    this.removedSessions.clear();
  }

  private ensureLocalPlayer(slimeColor: number, patternId: number): void {
    if (
      this.localPlayer &&
      this.localPlayerPatternId === patternId &&
      this.localPlayerColor === slimeColor
    )
      return;
    this.localPlayer?.dispose(this.render.scene);
    this.localTrail?.dispose();
    this.localPlayer = new LocalPlayer(this.render.scene, slimeColor, patternId);
    this.localTrail = new SkiTrailSystem(this.render.scene, slimeColor);
    this.localPlayerColor = slimeColor;
    this.localPlayerPatternId = patternId;
  }

  private ensureRemotePlayer(sessionId: string, slimeColor: number, patternId: number): void {
    const existing = this.remotePlayers.get(sessionId);
    if (
      existing &&
      this.playerPatterns.get(sessionId) === patternId &&
      this.playerColors.get(sessionId) === slimeColor
    )
      return;
    // Don't recreate a mesh for a session that was explicitly removed.
    if (!existing && this.removedSessions.has(sessionId)) return;
    existing?.dispose(this.render.scene);
    this.remoteTrails.get(sessionId)?.dispose();
    this.remotePlayers.set(sessionId, new RemotePlayer(this.render.scene, slimeColor, patternId));
    this.remoteTrails.set(sessionId, new SkiTrailSystem(this.render.scene, slimeColor));
    this.playerColors.set(sessionId, slimeColor);
    this.playerPatterns.set(sessionId, patternId);
  }

  private removeRemotePlayers(liveIds: Set<string>): void {
    const stale: string[] = [];
    for (const sid of this.remotePlayers.keys()) {
      if (!liveIds.has(sid)) stale.push(sid);
    }
    for (const sid of stale) {
      this.remotePlayers.get(sid)!.dispose(this.render.scene);
      this.remoteTrails.get(sid)?.dispose();
      this.remotePlayers.delete(sid);
      this.remoteTrails.delete(sid);
      this.playerColors.delete(sid);
      this.playerPatterns.delete(sid);
      this.runtime.removePlayer(sid);
      this.emoteBubbles.clearPlayer(sid);
    }
  }

  private syncProjectiles(snapshot: SnapshotMessage, receivedAtMs: number): void {
    const liveProjectileIds = new Set<string>();
    for (const projectile of snapshot.projectiles) {
      liveProjectileIds.add(projectile.id);
      const color = projectile.slimeColor;
      const isNew = this.projectiles.syncProjectile(projectile.id, projectile, color, receivedAtMs);
      this.matchAudio.handleProjectileSync(projectile, isNew);
    }
    this.matchAudio.handleRemovedProjectiles(this.projectiles.removeMissing(liveProjectileIds));
  }

  private syncPickups(snapshot: SnapshotMessage, receivedAtMs: number): void {
    const livePickupIds = new Set<string>();
    for (const pickup of snapshot.pickups) {
      livePickupIds.add(pickup.id);
      this.pickups.syncPickup(pickup, receivedAtMs);
    }
    for (const removed of this.pickups.removeMissing(livePickupIds)) {
      this.sound.playSfxAt("weaponPickup", removed.position, {
        refDistance: 14,
      });
    }
  }

  private getPlayerMesh(sessionId: string): THREE.Object3D | null {
    if (sessionId === this.connection.sessionId) return this.localPlayer?.mesh ?? null;
    return this.remotePlayers.get(sessionId)?.mesh ?? null;
  }

  private handleTrickEvents(events: TrickEventMessage[]): void {
    this.matchAudio.handleTrickEvents(events);
    for (const event of events) {
      const trick = getAirTrickDefinition(event.trickId);
      if (event.playerId === this.connection.sessionId) {
        this.localPlayer?.triggerTrick(event.trickId, event.combo);
      } else {
        this.remotePlayers.get(event.playerId)?.triggerTrick(event.trickId, event.combo);
      }
      this.trickText.show(event.playerId, `${trick.name} x${event.combo}`);
    }
  }

  private handleKillEvents(events: KillEventMessage[]): void {
    this.leaderboard.pushKillEvents(events, this.connection.sessionId);
    this.matchAudio.handleKillEvents(events);
  }

  private handleEmoteEvents(events: EmoteEventMessage[]): void {
    for (const event of events) {
      this.emoteBubbles.show(event.playerId, event.emoteIds);
    }
  }

  onDisconnect(cb: () => void): void {
    this.onDisconnectCb = cb;
  }

  showHint(message: string): void {
    this.hintToast.show(message);
  }

  setEmoteToggleVisible(visible: boolean): void {
    this.emoteMenu.setToggleVisible(visible);
  }

  requestPointerCapture(): void {
    void this.render.renderer.domElement.requestPointerLock().catch(() => {});
  }

  private reconnect(): void {
    if (!this.connectParams) return;
    this.reconnecting = true;
    this.matchEnd.hide();
    this.input.setEnabled(true);
    this.connection.leave();
  }

  async connect(name: string, colorIndex: number, playerUuid: string | null): Promise<void> {
    this.connectParams = { name, colorIndex, playerUuid };
    await this.connection.join(name, colorIndex, playerUuid, {
      onPlayerInit: (
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
      onPlayerAdded: (
        sessionId: string,
        name: string,
        slimeColor: number,
        patternId: number,
        paintGroupId: number,
      ) => {
        this.removedSessions.delete(sessionId);
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
        this.removedSessions.add(sessionId);
        this.playerColors.delete(sessionId);
        this.playerPatterns.delete(sessionId);
        this.matchAudio.removePlayer(sessionId);
        this.runtime.removePlayer(sessionId);
        if (sessionId === this.connection.sessionId) {
          this.localPlayer?.dispose(this.render.scene);
          this.localPlayer = null;
          this.localPlayerColor = -1;
          this.lastLocalHealth = null;
          this.combatHud.clear();
        } else {
          this.remotePlayers.get(sessionId)?.dispose(this.render.scene);
          this.remoteTrails.get(sessionId)?.dispose();
          this.remotePlayers.delete(sessionId);
          this.remoteTrails.delete(sessionId);
        }
        this.trickText.clear();
        this.emoteBubbles.clearPlayer(sessionId);
      },
      onPaintStamps: (stamps) => {
        this.matchAudio.handlePaintStamps(stamps);
        for (const stamp of stamps) {
          this.paint.addStamp(stamp);
          const planetState = this.planetPaint.get(stamp.planetId);
          if (planetState) {
            appendPaintStamp(planetState, stamp);
          }
        }
      },
      onTrickEvents: (events) => {
        this.handleTrickEvents(events);
      },
      onEmoteEvents: (events) => {
        this.handleEmoteEvents(events);
      },
      onKillEvents: (events: KillEventMessage[]) => {
        this.handleKillEvents(events);
      },
      onSnapshot: (snapshot, receivedAtMs) => {
        const localSessionId = this.connection.sessionId;
        const liveRemoteIds = new Set<string>();
        this.matchAudio.handleSnapshotPlayers(snapshot.players);
        for (const player of snapshot.players) {
          const isLocal = player.sessionId === localSessionId;
          const slimeColor = player.slimeColor;
          const patternId = player.patternId;
          if (isLocal) this.ensureLocalPlayer(slimeColor, patternId);
          else {
            liveRemoteIds.add(player.sessionId);
            this.ensureRemotePlayer(player.sessionId, slimeColor, patternId);
          }
          this.runtime.applySnapshot(player, isLocal, receivedAtMs, this.planetPaint);
        }
        this.removeRemotePlayers(liveRemoteIds);
        this.syncProjectiles(snapshot, receivedAtMs);
        this.syncPickups(snapshot, receivedAtMs);
      },
      onLeaderboard: (message) => {
        this.lastLeaderboard = message;
        const timer = this.currentPhase === MatchPhase.Active ? this.connection.matchTimer : 0;
        this.leaderboard.update(message, this.connection.sessionId, timer);
      },
      onMatchPhase: (phase) => {
        this.currentPhase = phase;
        if (phase === MatchPhase.Countdown) {
          this.syncCenterCountdown(0);
        } else if (phase === MatchPhase.Active) {
          this.paint.clear();
          this.clearPlanetPaint();
          this.projectiles.clear();
          this.syncCenterCountdown(this.runtime.getLocalPlayerState()?.respawnTimer ?? 0);
        } else if (phase === MatchPhase.Ended) {
          this.countdown.hide();
          this.matchEnd.show(this.lastLeaderboard, this.connection.sessionId);
          this.input.setEnabled(false);
        }
      },
      onDisconnect: () => {
        this.clearPlayerEntities();
        this.runtime.clear();
        this.paint.clear();
        this.clearPlanetPaint();
        this.clouds.dispose();
        this.props.dispose();
        this.pickups.clear();
        this.projectiles.clear();
        this.rails.dispose(this.render.scene);
        this.trickText.clear();
        this.emoteBubbles.clear();
        this.leaderboard.clear();
        this.matchAudio.clear();
        this.countdown.hide();
        this.matchEnd.hide();
        this.lastLeaderboard = null;
        this.currentPhase = MatchPhase.Lobby;
        this.emoteMenu.close(false);
        this.lastLocalHealth = null;
        this.combatHud.clear();
        this.setPaused(false);
        if (this.reconnecting) {
          this.reconnecting = false;
          const { name, colorIndex, playerUuid } = this.connectParams!;
          void this.connect(name, colorIndex, playerUuid);
        } else {
          this.onDisconnectCb?.();
        }
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

      if (this.input.consumeMenuPress()) this.setPaused(true);

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

      const rawFire = this.input.isFireDown();
      const equippedDef = getWeaponDefinition(localState.equippedWeaponId);
      const isHomingCapable = equippedDef.homingCapable === true;
      const fireJustReleased = this.prevFireDown && !rawFire;
      this.prevFireDown = rawFire;

      let { keys: keyBits, pressedKeys } = this.input.buildInputBits();
      let lockedTargetId: string | undefined;
      let guaranteedHoming: boolean | undefined;
      let chargeProgress: number | undefined;

      if (isHomingCapable) {
        if (rawFire && this.fireHoldStartMs === null) {
          this.fireHoldStartMs = now;
        }

        if (fireJustReleased && this.fireHoldStartMs !== null) {
          const holdMs = now - this.fireHoldStartMs;
          keyBits |= InputKey.Fire;
          if (holdMs >= BAZOOKA_HOLD_THRESHOLD_MS && this.acquisitionLockedTargetId !== null) {
            lockedTargetId = this.acquisitionLockedTargetId;
            guaranteedHoming = this.acquisitionIsGuaranteed || undefined;
          }
          this.fireHoldStartMs = null;
          this.acquisitionLockedTargetId = null;
          this.acquisitionIsGuaranteed = false;
          this.camera.setFovScale(1.0);
          this.combatHud.hideAcquisitionOverlay();
          for (const remote of this.remotePlayers.values()) remote.setAcquired(false);
        } else if (rawFire && this.fireHoldStartMs !== null) {
          keyBits &= ~InputKey.Fire;
          const holdMs = now - this.fireHoldStartMs;
          if (holdMs >= BAZOOKA_HOLD_THRESHOLD_MS) {
            this.camera.setFovScale(ACQUISITION_FOV_SCALE);
            const acquisitionMs = holdMs - BAZOOKA_HOLD_THRESHOLD_MS;
            const holdProgress = Math.min(1, acquisitionMs / ACQUISITION_RAMP_MS);
            const outerHalf =
              ACQUISITION_OUTER_MIN_HALF +
              holdProgress * (ACQUISITION_OUTER_MAX_HALF - ACQUISITION_OUTER_MIN_HALF);
            const cx = window.innerWidth * 0.5;
            const cy = window.innerHeight * 0.5;
            let newLockedId: string | null = null;
            let newGuaranteed = false;
            for (const [sid, remote] of this.remotePlayers) {
              if (!remote.isAimTargetVisible()) continue;
              this.acquisitionTestVec.copy(remote.mesh.position).project(this.camera.camera);
              if (this.acquisitionTestVec.z > 1) continue;
              const sx = (this.acquisitionTestVec.x * 0.5 + 0.5) * window.innerWidth;
              const sy = (-this.acquisitionTestVec.y * 0.5 + 0.5) * window.innerHeight;
              const dx = Math.abs(sx - cx);
              const dy = Math.abs(sy - cy);
              if (
                dx <= outerHalf &&
                dy <= outerHalf &&
                !this.isTargetOccludedByTerrain(remote.mesh.position)
              ) {
                newLockedId = sid;
                newGuaranteed = dx <= ACQUISITION_INNER_HALF && dy <= ACQUISITION_INNER_HALF;
                break;
              }
            }
            if (newLockedId !== this.acquisitionLockedTargetId) {
              if (this.acquisitionLockedTargetId !== null) {
                this.remotePlayers.get(this.acquisitionLockedTargetId)?.setAcquired(false);
              }
              this.acquisitionLockedTargetId = newLockedId;
            }
            if (newLockedId !== null) {
              this.acquisitionIsGuaranteed = newGuaranteed;
              this.remotePlayers.get(newLockedId)?.setAcquired(true, newGuaranteed);
            }
            this.combatHud.showAcquisitionOverlay(
              holdProgress,
              this.acquisitionLockedTargetId !== null,
              this.acquisitionIsGuaranteed,
            );
          }
        } else if (!rawFire && this.fireHoldStartMs === null) {
          this.camera.setFovScale(1.0);
          this.combatHud.hideAcquisitionOverlay();
        }
      } else if (equippedDef.behavior === "chargedHitscan") {
        if (rawFire && this.fireHoldStartMs === null) {
          this.fireHoldStartMs = now;
        }

        if (fireJustReleased && this.fireHoldStartMs !== null) {
          keyBits |= InputKey.Fire;
          const sniperHoldMs = now - this.fireHoldStartMs;
          chargeProgress =
            sniperHoldMs >= SNIPER_HOLD_THRESHOLD_MS
              ? Math.min(1, (sniperHoldMs - SNIPER_HOLD_THRESHOLD_MS) / SNIPER_CHARGE_MS)
              : 0;
          this.fireHoldStartMs = null;
          this.camera.setFovScale(1.0);
          this.combatHud.hideSniperScope();
        } else if (rawFire && this.fireHoldStartMs !== null) {
          keyBits &= ~InputKey.Fire;
          const holdMs = now - this.fireHoldStartMs;
          if (holdMs >= SNIPER_HOLD_THRESHOLD_MS) {
            this.camera.setFovScale(SNIPER_FOV_SCALE);
            const chargeProgress = Math.min(
              1,
              (holdMs - SNIPER_HOLD_THRESHOLD_MS) / SNIPER_CHARGE_MS,
            );
            this.combatHud.showSniperScope(chargeProgress);
          }
        } else if (!rawFire && this.fireHoldStartMs === null) {
          this.camera.setFovScale(1.0);
          this.combatHud.hideSniperScope();
        }
      } else if (this.fireHoldStartMs !== null) {
        this.fireHoldStartMs = null;
        this.acquisitionLockedTargetId = null;
        this.acquisitionIsGuaranteed = false;
        this.camera.setFovScale(1.0);
        this.combatHud.hideAcquisitionOverlay();
        this.combatHud.hideSniperScope();
        for (const remote of this.remotePlayers.values()) remote.setAcquired(false);
      }

      if (keyBits & InputKey.Fire) {
        const { fireCooldownMs } = getWeaponDefinition(localState.equippedWeaponId);
        this.sound.playSfx(getLocalFireSoundKey(localState.equippedWeaponId), {
          cooldownMs: fireCooldownMs,
        });
      }

      const input = {
        seq: ++inputSeq,
        keys: keyBits,
        pressedKeys,
        aimDir,
        aimPoint: { x: aimPoint.x, y: aimPoint.y, z: aimPoint.z },
        dt,
        lockedTargetId,
        guaranteedHoming,
        chargeProgress,
      };
      this.connection.sendInput(input);
      this.runtime.recordLocalInput(input, this.planetPaint);

      const predictedLocalState = this.runtime.getLocalPlayerState();
      if (predictedLocalState) {
        const isNowAirborne = predictedLocalState.movementState === PlayerMovementState.Airborne;
        const isNowSki = predictedLocalState.surfState !== PlayerSurfState.None;
        this.input.setSubmergeActive(isNowSki);

        const { vel } = predictedLocalState;
        const velMag = Math.hypot(vel.x, vel.y, vel.z);
        const justLaunched =
          this.lastWasCarving &&
          !this.lastWasAirborne &&
          isNowAirborne &&
          isNowSki &&
          velMag > GAME_CONFIG.movement.jumpImpulse;
        if (justLaunched) {
          this.localPlayer?.triggerSkiLaunch();
          this.sound.playSfx("skiLaunch");
        }
        this.lastWasAirborne = isNowAirborne;
        this.lastWasCarving = isNowSki && predictedLocalState.isCarving && !isNowAirborne;
      }
      if (predictedLocalState && this.localPlayer) {
        const visualRotation =
          predictedLocalState.movementState === PlayerMovementState.Airborne
            ? this.input.getLocalRotation()
            : undefined;
        this.localPlayer.update(
          predictedLocalState,
          dt,
          visualRotation,
          new THREE.Vector3(aimDir.x, aimDir.y, aimDir.z),
        );
        if (this.localTrail) {
          this.localTrail.update(predictedLocalState, planetCenter, predictedLocalState.slimeColor);
        }
        this.lastAimDir = this.camera.update(
          predictedLocalState.pos,
          predictedLocalState.vel,
          yawForward,
          this.input.getPitch(),
          planetCenter,
          predictedLocalState.movementState === PlayerMovementState.Airborne,
          dt,
        );
      }

      if (predictedLocalState) {
        if (this.lastLocalHealth !== null && predictedLocalState.health < this.lastLocalHealth) {
          this.combatHud.flashDamage();
        }
        this.lastLocalHealth = predictedLocalState.health;
        const equippedDef = getWeaponDefinition(predictedLocalState.equippedWeaponId);
        const disposableTotal = equippedDef.disposableShots ?? 0;
        const weaponLabel =
          disposableTotal > 0
            ? `${getWeaponDefinition(DEFAULT_WEAPON_ID).displayName} / ${equippedDef.displayName}`
            : equippedDef.displayName;
        this.combatHud.update(
          weaponLabel,
          predictedLocalState.health,
          GAME_CONFIG.player.maxHealth,
          predictedLocalState.slimeLevel,
          GAME_CONFIG.slime.maxLevel,
          predictedLocalState.respawnTimer,
          predictedLocalState.disposableShotsRemaining,
          disposableTotal,
        );
      } else {
        this.lastLocalHealth = null;
        this.combatHud.clear();
      }

      if (predictedLocalState) {
        const { vel, pos } = predictedLocalState;
        const isSki = predictedLocalState.surfState !== PlayerSurfState.None;
        const speed = Math.hypot(vel.x, vel.y, vel.z);
        const pLen = Math.hypot(pos.x, pos.y, pos.z);
        const gravDirX = pLen > 1e-6 ? pos.x / pLen : 0;
        const gravDirY = pLen > 1e-6 ? pos.y / pLen : 1;
        const gravDirZ = pLen > 1e-6 ? pos.z / pLen : 0;
        const velLen = speed > 1e-6 ? speed : 1;
        const travelX = vel.x / velLen;
        const travelY = vel.y / velLen;
        const travelZ = vel.z / velLen;
        const slopeAccel =
          -(gravDirX * travelX + gravDirY * travelY + gravDirZ * travelZ) *
          GAME_CONFIG.movement.gravityAcceleration;
        const baseSpeed =
          GAME_CONFIG.movement.moveSpeed * GAME_CONFIG.movement.waterSkiSpeedMultiplier;
        const dynamicMaxSpeed = Math.max(
          baseSpeed * 0.5,
          baseSpeed + Math.max(0, slopeAccel) * 0.6,
        );
        this.skiDebugHud.update(
          speed,
          slopeAccel,
          dynamicMaxSpeed,
          predictedLocalState.isCarving,
          isSki,
        );
      }

      for (const [sessionId, remotePlayer] of this.remotePlayers) {
        if (sessionId === localSessionId) continue;
        const remoteState = this.runtime.getRemotePlayerState(sessionId, now);
        if (remoteState) {
          remotePlayer.update(remoteState, dt);
          const remotePos = new THREE.Vector3(
            remoteState.pos.x,
            remoteState.pos.y,
            remoteState.pos.z,
          );
          this.remoteTrails
            .get(sessionId)
            ?.update(remoteState, nearestPlanetCenter(remotePos), remoteState.slimeColor);
        }
      }

      this.pickups.update(now);
      this.portal?.update(now, playerPos);
      this.projectiles.update(now);
      this.rails.update(this.connection.roomState);
      this.syncCenterCountdown(predictedLocalState?.respawnTimer ?? 0);
      this.leaderboard.tick(now);
      this.trickText.update(dt * 1000, this.camera.camera, (sessionId) =>
        this.getPlayerMesh(sessionId),
      );
      this.emoteBubbles.update(dt * 1000, this.camera.camera, (sessionId) =>
        this.getPlayerMesh(sessionId),
      );
      this.sound.updateListener(this.camera.camera);
      this.render.render(this.camera.camera);
    };

    animate();
  }
}
