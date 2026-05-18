import * as THREE from "three";
import { DEFAULT_WEAPON_ID, getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
import { getAirTrickDefinition } from "@splat/content/tricks/airTrickDefs.ts";
import type { MatchModeId } from "@splat/protocol/network/clientMessages.ts";
import { GAME_CONFIG, getSlimeTerritoryDimensions } from "@splat/content/config/gameConfig.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type {
  EmoteEventMessage,
  KillEventMessage,
  LeaderboardMessage,
  MapDataMessage,
  SlimeStampMessage,
  SnapshotMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { WeaponAimSystem } from "../systems/weaponAimSystem.ts";
import { RenderSystem } from "../systems/renderSystem.ts";
import { CameraSystem } from "../systems/cameraSystem.ts";
import { InputSystem } from "../systems/inputSystem.ts";
import { SlimeSystem } from "../systems/slimeSystem.ts";
import { CloudSystem } from "../systems/cloudSystem.ts";
import { PropSystem } from "../systems/propSystem.ts";
import { PickupSystem } from "../systems/pickup/pickupSystem.ts";
import { HealthPickupSystem } from "../systems/pickup/healthPickupSystem.ts";
import { PortalSystem } from "../systems/portalSystem.ts";
import { ProjectileSystem } from "../systems/projectileSystem.ts";
import { SurfTrailSystem } from "../systems/surfTrailSystem.ts";
import { TrickTextSystem } from "../systems/trickTextSystem.ts";
import { EmoteBubbleSystem } from "../systems/emoteBubbleSystem.ts";
import { RailSystem } from "../systems/railSystem.ts";
import { MatchAudioSystem } from "../systems/sound/matchAudioSystem.ts";
import { SoundSystem } from "../systems/sound/soundSystem.ts";
import { AUDIO } from "../assets/audioConfig.ts";
import { RoomConnection } from "../network/roomConnection.ts";
import { LocalPlayer } from "../entities/player/player.ts";
import { RemotePlayer } from "../entities/player/remotePlayer.ts";
import { ClientRuntimeState } from "../network/runtimeState.ts";
import { CombatHud } from "../ui/CombatHud.ts";
import { SurfDebugHud } from "../ui/SurfDebugHud.ts";
import { CountdownOverlay } from "../ui/CountdownOverlay.ts";
import { LeaderboardOverlay } from "../ui/LeaderboardOverlay.ts";
import { MatchEndOverlay } from "../ui/MatchEndOverlay.ts";
import { PauseMenuOverlay } from "../ui/PauseMenuOverlay.ts";
import { EmoteMenuOverlay } from "../ui/EmoteMenuOverlay.ts";
import { HintToast } from "../ui/HintToast.ts";
import { PlanetRenderer } from "./planetRenderer.ts";

import {
  appendSlimeStamp,
  createStampBuckets,
  getSlimeCollisionDistance,
} from "@splat/simulation/slime/slimeDetection.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type SimPlanetSlimeState,
} from "@splat/simulation/match/simState.ts";

export class MatchScene {
  private readonly render: RenderSystem;
  private readonly camera: CameraSystem;
  private readonly input: InputSystem;
  private readonly slime: SlimeSystem;
  private readonly clouds: CloudSystem;
  private readonly props: PropSystem;
  private readonly pickups: PickupSystem;
  private readonly healthPickups: HealthPickupSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly trickText: TrickTextSystem;
  private readonly emoteBubbles: EmoteBubbleSystem;
  private readonly rails: RailSystem;
  private readonly sound: SoundSystem;
  private readonly matchAudio: MatchAudioSystem;
  private readonly connection: RoomConnection;
  private readonly runtime: ClientRuntimeState;
  private readonly combatHud: CombatHud;
  private readonly surfDebugHud: SurfDebugHud;
  private readonly leaderboard: LeaderboardOverlay;
  private readonly countdown: CountdownOverlay;
  private readonly matchEnd: MatchEndOverlay;
  private readonly pauseMenu: PauseMenuOverlay;
  private readonly emoteMenu: EmoteMenuOverlay;
  private readonly hintToast: HintToast;
  private readonly weaponAim: WeaponAimSystem;
  private readonly planetRenderer: PlanetRenderer;
  private lastLeaderboard: LeaderboardMessage | null = null;
  private currentPhase: MatchPhase = MatchPhase.Lobby;
  private connectParams: {
    name: string;
    colorIndex: number;
    playerUuid: string | null;
    matchMode: MatchModeId;
    teamId?: number;
  } | null = null;
  private reconnecting = false;

  private localPlayer: LocalPlayer | null = null;
  private localPlayerColor = -1;
  private localPlayerPatternId = -1;
  private localTrail: SurfTrailSystem | null = null;
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private readonly remoteTrails = new Map<string, SurfTrailSystem>();
  private readonly playerColors = new Map<string, number>();
  private readonly playerPatterns = new Map<string, number>();
  private readonly removedSessions = new Set<string>();
  private readonly planetSlime = new Map<string, SimPlanetSlimeState>();
  private lastLocalHealth: number | null = null;
  private lastWasCarving = false;
  private lastWasAirborne = false;
  private portal: PortalSystem | null = null;

  private onDisconnectCb: (() => void) | null = null;

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

  private updateDebugLines(): void {
    if (!GAME_CONFIG.debug.showSlimeColliders) {
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
    for (const planet of this.planetRenderer.mapPlanets) {
      const history = this.slime.getStampHistory(planet.id);
      const planetCenter = new THREE.Vector3(planet.center.x, planet.center.y, planet.center.z);

      for (const s of history) {
        const thresholdDist = getSlimeCollisionDistance(s);
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
            .multiplyScalar(planet.radius + 1.0)
            .add(planetCenter);

          const p2 = new THREE.Vector3()
            .copy(normal)
            .multiplyScalar(cosTheta)
            .addScaledVector(tangent, Math.cos(a2) * sinTheta)
            .addScaledVector(bitangent, Math.sin(a2) * sinTheta)
            .multiplyScalar(planet.radius + 1.0)
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

  private syncLeaderboard(message: LeaderboardMessage): void {
    const timer =
      this.currentPhase === MatchPhase.Active || this.currentPhase === MatchPhase.Countdown
        ? this.connection.matchTimer
        : 0;
    const teamColors = Array.from(this.connection.roomState?.teamColors ?? []);
    this.leaderboard.update(
      message,
      this.connection.sessionId,
      timer,
      teamColors,
      this.currentPhase,
    );
  }

  constructor() {
    this.render = new RenderSystem();
    this.camera = new CameraSystem();
    this.input = new InputSystem(this.render.renderer.domElement);
    this.slime = new SlimeSystem(this.render.renderer);
    this.planetRenderer = new PlanetRenderer(this.render.scene, this.slime);
    this.clouds = new CloudSystem(this.render.scene);
    this.props = new PropSystem(this.render.scene);
    this.pickups = new PickupSystem(this.render.scene);
    this.healthPickups = new HealthPickupSystem(this.render.scene);
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
    this.surfDebugHud = new SurfDebugHud();
    this.surfDebugHud.setVisible(import.meta.env.VITE_DEV_MODE === "true");
    this.leaderboard = new LeaderboardOverlay();
    this.countdown = new CountdownOverlay();
    this.matchEnd = new MatchEndOverlay(
      () => this.reconnect(),
      () => window.location.reload(),
    );
    this.pauseMenu = new PauseMenuOverlay(this.sound);
    this.emoteMenu = new EmoteMenuOverlay();
    this.hintToast = new HintToast();
    this.weaponAim = new WeaponAimSystem(this.camera, this.combatHud, this.sound);
    this.pauseMenu.onResume(() => this.setPaused(false));
    this.pauseMenu.onToggle(() => this.setPaused(!this.pauseMenu.isVisible()));
    this.emoteMenu.onPost((emoteIds) => this.connection.sendEmotePost(emoteIds));
    this.input.onPointerLockExit(() => this.setPaused(true));
    this.render.renderer.domElement.addEventListener("pointerdown", () => this.sound.resume(), {
      once: true,
    });
    for (const p of this.planetRenderer.mapPlanets) {
      const { rows, cols } = getSlimeTerritoryDimensions(p.radius);
      this.planetSlime.set(p.id, {
        planetId: p.id,
        territoryRows: rows,
        territoryCols: cols,
        cells: [],
        stamps: [],
        stampBuckets: createStampBuckets(rows, cols),
      });
    }
  }

  private playMatchMusic(): void {
    const key = "surfMusic";
    if (this.sound.isLoaded(key)) {
      this.sound.playMusic(key);
    } else {
      void this.preloadMatchAssets().then(() => {
        if (this.currentPhase === MatchPhase.Active) {
          this.sound.playMusic(key);
        }
      });
    }
  }

  async preload(onProgress?: (progress: number) => void): Promise<void> {
    const initialAudioEntries = Object.entries(AUDIO).filter(
      ([, asset]) => !asset.context || asset.context === "initial",
    );
    const totalSteps = initialAudioEntries.length + 1; // audio + sky
    let completedSteps = 0;

    const increment = (): void => {
      completedSteps++;
      onProgress?.(Math.floor((completedSteps / totalSteps) * 100));
    };

    // 1. Initial Audio
    await Promise.all(
      initialAudioEntries.map(async ([key, { url, category, volume }]) => {
        await this.sound.preload(key, url, category, volume);
        increment();
      }),
    );

    // 2. Sky
    this.buildSkyReference();
    increment();
  }

  private async preloadMatchAssets(): Promise<void> {
    const matchAudioEntries = Object.entries(AUDIO).filter(
      ([, asset]) => asset.context === "match",
    );
    await Promise.all(
      matchAudioEntries.map(([key, { url, category, volume }]) =>
        this.sound.preload(key, url, category, volume),
      ),
    );
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

  applyMapData(msg: MapDataMessage): void {
    const firstBuild = this.planetRenderer.applyMapData(msg);

    for (const p of msg.planets) {
      const { rows, cols } = getSlimeTerritoryDimensions(p.radius);
      if (!this.planetSlime.has(p.id)) {
        this.planetSlime.set(p.id, {
          planetId: p.id,
          territoryRows: rows,
          territoryCols: cols,
          cells: [],
          stamps: [],
          stampBuckets: createStampBuckets(rows, cols),
        });
      }
    }

    this.runtime.setMapData(msg);
    this.weaponAim.setMapData(msg);
    this.rails.setMapData(msg);
    this.projectiles.setMapPlanets(msg.planets);

    if (firstBuild) {
      for (const p of msg.planets) {
        if (GAME_CONFIG.shaders.clouds.enabled) {
          this.clouds.addPlanetClouds({
            id: p.id,
            x: p.center.x,
            y: p.center.y,
            z: p.center.z,
            radius: p.radius,
          });
        }
        this.props.addPlanetProps({
          id: p.id,
          x: p.center.x,
          y: p.center.y,
          z: p.center.z,
          radius: p.radius,
          terrain: p.terrain,
          props: p.props,
        });
      }
      const firstPlanet = msg.planets[0];
      if (firstPlanet && !this.portal) {
        this.portal = new PortalSystem(
          this.render.scene,
          performance.now(),
          this.planetRenderer.getTerrainCfg(firstPlanet.id),
        );
      }
    }
  }

  private clearPlanetSlime(): void {
    for (const planet of this.planetSlime.values()) {
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
    this.localTrail = new SurfTrailSystem(this.render.scene, slimeColor);
    this.localPlayerColor = slimeColor;
    this.localPlayerPatternId = patternId;
  }

  private resolveTeamVisual(
    sessionId: string,
    fallbackColor: number,
    fallbackPatternId: number,
  ): { slimeColor: number; patternId: number } {
    const roomState = this.connection.roomState;
    if (!roomState?.isTeamBased) {
      return { slimeColor: fallbackColor, patternId: fallbackPatternId };
    }
    const teamId = roomState.players.get(sessionId)?.teamId;
    const teamColor = teamId === undefined ? undefined : roomState.teamColors[teamId];
    return { slimeColor: teamColor ?? fallbackColor, patternId: 0 };
  }

  private resolveSlimeGroupVisual(
    slimeGroupId: number,
    fallbackColor: number,
    fallbackPatternId: number,
  ): { slimeColor: number; patternId: number } {
    const roomState = this.connection.roomState;
    if (!roomState?.isTeamBased) {
      return { slimeColor: fallbackColor, patternId: fallbackPatternId };
    }
    return { slimeColor: roomState.teamColors[slimeGroupId] ?? fallbackColor, patternId: 0 };
  }

  private ensureRemotePlayer(
    sessionId: string,
    slimeColor: number,
    patternId: number,
    name = "",
  ): void {
    const existing = this.remotePlayers.get(sessionId);
    if (
      existing &&
      this.playerPatterns.get(sessionId) === patternId &&
      this.playerColors.get(sessionId) === slimeColor
    ) {
      if (name) existing.setName(name);
      return;
    }
    // Don't recreate a mesh for a session that was explicitly removed.
    if (!existing && this.removedSessions.has(sessionId)) return;
    existing?.dispose(this.render.scene);
    this.remoteTrails.get(sessionId)?.dispose();
    this.remotePlayers.set(
      sessionId,
      new RemotePlayer(this.render.scene, slimeColor, patternId, name),
    );
    this.remoteTrails.set(sessionId, new SurfTrailSystem(this.render.scene, slimeColor));
    this.playerColors.set(sessionId, slimeColor);
    this.playerPatterns.set(sessionId, patternId);
  }

  private applyTeamRelation(sessionId: string): void {
    const remotePlayer = this.remotePlayers.get(sessionId);
    if (!remotePlayer) return;
    const roomState = this.connection.roomState;
    if (!roomState?.isTeamBased) {
      remotePlayer.setTeamRelation("ffa");
      return;
    }
    const localId = this.connection.sessionId;
    const localSchema = localId ? roomState.players.get(localId) : undefined;
    const remoteSchema = roomState.players.get(sessionId);
    if (!localSchema || !remoteSchema) {
      remotePlayer.setTeamRelation("ffa");
      return;
    }
    const teamColor = roomState.teamColors[remoteSchema.teamId] ?? 0xffffff;
    const relation = localSchema.teamId === remoteSchema.teamId ? "ally" : "enemy";
    remotePlayer.setTeamRelation(relation, teamColor);
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
      const visual = this.resolveSlimeGroupVisual(
        projectile.slimeGroupId,
        projectile.slimeColor,
        projectile.patternId,
      );
      const visualProjectile =
        visual.slimeColor === projectile.slimeColor && visual.patternId === projectile.patternId
          ? projectile
          : { ...projectile, slimeColor: visual.slimeColor, patternId: visual.patternId };
      const isNew = this.projectiles.syncProjectile(
        projectile.id,
        visualProjectile,
        visual.slimeColor,
        receivedAtMs,
      );
      this.matchAudio.handleProjectileSync(visualProjectile, isNew);
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

    const liveHealthPickupIds = new Set<string>();
    for (const pickup of snapshot.healthPickups ?? []) {
      liveHealthPickupIds.add(pickup.id);
      this.healthPickups.syncPickup(pickup, receivedAtMs);
    }
    for (const removed of this.healthPickups.removeMissing(liveHealthPickupIds)) {
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

  private handlePlayerJoined(
    sessionId: string,
    name: string,
    slimeColor: number,
    patternId: number,
    slimeGroupId: number,
  ): void {
    const visual = this.resolveTeamVisual(sessionId, slimeColor, patternId);
    this.playerColors.set(sessionId, visual.slimeColor);
    this.playerPatterns.set(sessionId, visual.patternId);
    if (sessionId === this.connection.sessionId) {
      this.ensureLocalPlayer(visual.slimeColor, visual.patternId);
      this.runtime.setLocalSlimeGroupId(slimeGroupId);
    } else {
      this.ensureRemotePlayer(sessionId, visual.slimeColor, visual.patternId, name);
      this.applyTeamRelation(sessionId);
    }
  }

  private handlePlayerRemoved(sessionId: string): void {
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
  }

  private handleSlimeStamps(stamps: SlimeStampMessage[]): void {
    this.matchAudio.handleSlimeStamps(stamps);
    for (const stamp of stamps) {
      const visual = this.resolveSlimeGroupVisual(stamp.slimeGroupId, stamp.color, stamp.patternId);
      const visualStamp =
        visual.slimeColor === stamp.color && visual.patternId === stamp.patternId
          ? stamp
          : { ...stamp, color: visual.slimeColor, patternId: visual.patternId };
      if (this.slime.addStamp(visualStamp)) {
        const planetState = this.planetSlime.get(stamp.planetId);
        if (planetState) appendSlimeStamp(planetState, visualStamp);
      }
    }
  }

  private handleSnapshot(snapshot: SnapshotMessage, receivedAtMs: number): void {
    const localSessionId = this.connection.sessionId;
    const liveRemoteIds = new Set<string>();
    this.matchAudio.handleSnapshotPlayers(snapshot.players);
    for (const player of snapshot.players) {
      const isLocal = player.sessionId === localSessionId;
      const visual = this.resolveTeamVisual(player.sessionId, player.slimeColor, player.patternId);
      const { slimeColor, patternId } = visual;
      if (isLocal) {
        this.ensureLocalPlayer(slimeColor, patternId);
      } else {
        liveRemoteIds.add(player.sessionId);
        const name = this.connection.roomState?.players.get(player.sessionId)?.name || "";
        this.ensureRemotePlayer(player.sessionId, slimeColor, patternId, name);
      }
      this.runtime.applySnapshot(player, isLocal, receivedAtMs, this.planetSlime);
    }
    this.removeRemotePlayers(liveRemoteIds);
    this.syncProjectiles(snapshot, receivedAtMs);
    this.syncPickups(snapshot, receivedAtMs);
  }

  private handleLeaderboard(message: LeaderboardMessage): void {
    this.lastLeaderboard = message;
    this.syncLeaderboard(message);
  }

  private handleMatchPhase(phase: MatchPhase, winningTeamId?: number): void {
    this.currentPhase = phase;
    if (this.lastLeaderboard) this.syncLeaderboard(this.lastLeaderboard);
    if (phase === MatchPhase.Countdown) {
      this.syncCenterCountdown(0);
    } else if (phase === MatchPhase.Active) {
      this.slime.clear();
      this.clearPlanetSlime();
      this.projectiles.clear();
      this.syncCenterCountdown(this.runtime.getLocalPlayerState()?.respawnTimer ?? 0);
      this.playMatchMusic();
    } else if (phase === MatchPhase.Ended) {
      this.countdown.hide();
      const teamColors = Array.from(this.connection.roomState?.teamColors ?? []);
      this.matchEnd.show(
        this.lastLeaderboard,
        this.connection.sessionId,
        winningTeamId ?? this.connection.winningTeamId,
        teamColors,
      );
      this.input.setEnabled(false);
      this.sound.stopMusic();
    }
  }

  private handleDisconnect(): void {
    this.clearPlayerEntities();
    this.runtime.clear();
    this.slime.clear();
    this.clearPlanetSlime();
    this.clouds.dispose();
    this.props.dispose();
    this.pickups.clear();
    this.healthPickups.clear();
    this.projectiles.clear();
    this.rails.dispose(this.render.scene);
    this.trickText.clear();
    this.emoteBubbles.clear();
    this.leaderboard.clear();
    this.matchAudio.clear();
    this.sound.stopMusic();
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
      const { name, colorIndex, playerUuid, matchMode, teamId } = this.connectParams!;
      void this.connect(name, colorIndex, playerUuid, matchMode, teamId);
    } else {
      this.onDisconnectCb?.();
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

  async connect(
    name: string,
    colorIndex: number,
    playerUuid: string | null,
    matchMode: MatchModeId = "ffa",
    teamId?: number,
  ): Promise<void> {
    this.connectParams = { name, colorIndex, playerUuid, matchMode, teamId };
    await this.connection.join(
      { name, colorIndex, playerUuid, matchMode, teamId },
      {
        onMapData: (msg) => this.applyMapData(msg),
        onPlayerInit: (sessionId, playerName, slimeColor, patternId, slimeGroupId) => {
          this.playMatchMusic();
          this.handlePlayerJoined(sessionId, playerName, slimeColor, patternId, slimeGroupId);
        },
        onPlayerAdded: (sessionId, playerName, slimeColor, patternId, slimeGroupId) => {
          this.removedSessions.delete(sessionId);
          this.handlePlayerJoined(sessionId, playerName, slimeColor, patternId, slimeGroupId);
        },
        onPlayerRemoved: (sessionId) => this.handlePlayerRemoved(sessionId),
        onSlimeStamps: (stamps) => this.handleSlimeStamps(stamps),
        onTrickEvents: (events) => this.handleTrickEvents(events),
        onEmoteEvents: (events) => this.handleEmoteEvents(events),
        onKillEvents: (events) => this.handleKillEvents(events),
        onSnapshot: (snapshot, receivedAtMs) => this.handleSnapshot(snapshot, receivedAtMs),
        onLeaderboard: (message) => this.handleLeaderboard(message),
        onMatchPhase: (phase, _timer, winningTeamId) => this.handleMatchPhase(phase, winningTeamId),
        onDisconnect: () => this.handleDisconnect(),
      },
    );
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

      this.planetRenderer.updateTimeUniforms(now / 1000);
      this.clouds.update(dt);
      this.slime.update(now);

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
      const planetCenter = this.weaponAim.nearestPlanetCenter(playerPos);

      // Update orientation (parallel transport + yaw); return value unused here.
      this.input.computeAimDir(playerPos, planetCenter);
      const yawForward = this.input.getYawForward();

      // aimDir for this frame comes from the previous frame's camera position.
      // Camera is updated after prediction so it always follows the latest state.
      const rawFire = this.input.isFireDown();
      const { keys: initialKeyBits, pressedKeys } = this.input.buildInputBits();
      const fireOutput = this.weaponAim.update(
        now,
        localSessionId,
        localState.equippedWeaponId,
        localState.slimeLevel,
        this.remotePlayers,
        playerPos,
        rawFire,
        initialKeyBits,
      );

      const input = {
        seq: ++inputSeq,
        keys: fireOutput.keyBits,
        pressedKeys,
        aimDir: fireOutput.aimDir,
        aimPoint: fireOutput.aimPoint,
        dt,
        lockedTargetId: fireOutput.lockedTargetId,
        guaranteedHoming: fireOutput.guaranteedHoming,
        chargeProgress: fireOutput.chargeProgress,
      };
      this.connection.sendInput(input);
      this.runtime.recordLocalInput(input, this.planetSlime);

      const predictedLocalState = this.runtime.getLocalPlayerState();
      if (predictedLocalState) {
        const isNowAirborne = predictedLocalState.movementState === PlayerMovementState.Airborne;
        const isNowSurfing = predictedLocalState.surfState !== PlayerSurfState.None;
        this.input.setSubmergeActive(isNowSurfing);

        const { vel } = predictedLocalState;
        const velMag = Math.hypot(vel.x, vel.y, vel.z);
        const justLaunched =
          this.lastWasCarving &&
          !this.lastWasAirborne &&
          isNowAirborne &&
          isNowSurfing &&
          velMag > GAME_CONFIG.movement.jumpImpulse;
        if (justLaunched) {
          this.localPlayer?.triggerSurfLaunch();
          this.sound.playSfx("surfLaunch");
        }
        this.lastWasAirborne = isNowAirborne;
        this.lastWasCarving = isNowSurfing && predictedLocalState.isCarving && !isNowAirborne;
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
          new THREE.Vector3(fireOutput.aimDir.x, fireOutput.aimDir.y, fireOutput.aimDir.z),
          fireOutput.dryFireGaugePulseSeq,
          fireOutput.gaugeActivityPulseSeq,
        );
        if (this.localTrail) {
          const visual = this.resolveTeamVisual(
            this.connection.sessionId ?? "",
            predictedLocalState.slimeColor,
            predictedLocalState.patternId,
          );
          this.localTrail.update(predictedLocalState, planetCenter, visual.slimeColor);
        }
        this.weaponAim.setLastAimDir(
          this.camera.update(
            predictedLocalState.pos,
            predictedLocalState.vel,
            yawForward,
            this.input.getPitch(),
            planetCenter,
            predictedLocalState.movementState === PlayerMovementState.Airborne,
            dt,
          ),
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
        const roomState = this.connection.roomState;
        const localSchemaPlayer = roomState?.players.get(this.connection.sessionId ?? "");
        const teamColor =
          roomState?.isTeamBased && localSchemaPlayer !== undefined
            ? roomState.teamColors[localSchemaPlayer.teamId]
            : undefined;
        const teamId =
          roomState?.isTeamBased && localSchemaPlayer !== undefined
            ? localSchemaPlayer.teamId
            : undefined;
        this.combatHud.update(
          weaponLabel,
          predictedLocalState.health,
          GAME_CONFIG.player.maxHealth,
          teamColor,
          teamId,
        );
      } else {
        this.lastLocalHealth = null;
        this.combatHud.clear();
      }

      if (predictedLocalState) {
        const { vel, pos } = predictedLocalState;
        const isSurfing = predictedLocalState.surfState !== PlayerSurfState.None;
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
        this.surfDebugHud.update(
          speed,
          slopeAccel,
          dynamicMaxSpeed,
          predictedLocalState.isCarving,
          isSurfing,
        );
      }

      for (const [sessionId, remotePlayer] of this.remotePlayers) {
        if (sessionId === localSessionId) continue;
        this.applyTeamRelation(sessionId);
        const remoteState = this.runtime.getRemotePlayerState(sessionId, now);
        if (remoteState) {
          remotePlayer.update(remoteState, dt, this.camera.camera);
          const remotePos = new THREE.Vector3(
            remoteState.pos.x,
            remoteState.pos.y,
            remoteState.pos.z,
          );
          this.remoteTrails
            .get(sessionId)
            ?.update(
              remoteState,
              this.weaponAim.nearestPlanetCenter(remotePos),
              this.resolveTeamVisual(sessionId, remoteState.slimeColor, remoteState.patternId)
                .slimeColor,
            );
        }
      }

      this.pickups.update(now);
      this.healthPickups.update(now);
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
