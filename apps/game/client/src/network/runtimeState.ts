import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { DEFAULT_WEAPON_ID } from "@splat/content/combat/weaponDefs.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import type { InputMessage } from "@splat/protocol/network/clientMessages.ts";
import type { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import type { MapDataMessage, PlayerSnapshot } from "@splat/protocol/network/serverMessages.ts";
import {
  stepPlayer,
  type PlanetData,
  type PlayerPhysics,
  type StepConfig,
} from "@splat/simulation/movement/simulatedMovement.ts";
import { buildComputedRail, type ComputedRail } from "@splat/simulation/movement/railSpline.ts";
import { createTerrainConfig } from "@splat/simulation/terrain/planetTerrain.ts";
import type { SimPlanetSlimeState } from "@splat/simulation/match/simState.ts";

const MAX_PENDING_INPUTS = 60;

export interface RuntimePlayerState extends PlayerPhysics {
  isShooting: boolean;
  equippedWeaponId: WeaponId;
  disposableShotsRemaining: number;
  health: number;
  slimeLevel: number;
  inputSeq: number;
  respawnTimer: number;
  isOnFriendlySlime: boolean;
  sessionId: string;
  slimeColor: number;
  patternId: number;
}

interface BufferedSnapshot {
  receivedAtMs: number;
  snapshot: RuntimePlayerState;
}

function cloneVec3(vec: { x: number; y: number; z: number }) {
  return { x: vec.x, y: vec.y, z: vec.z };
}

function cloneQuat(quat: { x: number; y: number; z: number; w: number }) {
  return { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
}

function cloneRuntimeState(state: RuntimePlayerState): RuntimePlayerState {
  return {
    sessionId: state.sessionId,
    pos: cloneVec3(state.pos),
    vel: cloneVec3(state.vel),
    rot: cloneQuat(state.rot),
    planetId: state.planetId,
    slimeGroupId: state.slimeGroupId,
    movementState: state.movementState,
    surfState: state.surfState,
    isCarving: state.isCarving,
    skiJumpCharge: state.skiJumpCharge,
    grindRailId: state.grindRailId,
    grindT: state.grindT,
    lastGrindT: state.lastGrindT,
    grindSpeed: state.grindSpeed,
    grindCooldownMs: state.grindCooldownMs,
    isShooting: state.isShooting,
    equippedWeaponId: state.equippedWeaponId,
    disposableShotsRemaining: state.disposableShotsRemaining,
    health: state.health,
    slimeLevel: state.slimeLevel,
    inputSeq: state.inputSeq,
    respawnTimer: state.respawnTimer,
    isOnFriendlySlime: state.isOnFriendlySlime,
    slimeColor: state.slimeColor,
    patternId: state.patternId,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function snapshotToRuntimeState(snapshot: PlayerSnapshot): RuntimePlayerState {
  return {
    sessionId: snapshot.sessionId,
    pos: cloneVec3(snapshot.pos),
    vel: cloneVec3(snapshot.vel),
    rot: cloneQuat(snapshot.rot),
    planetId: snapshot.planetId,
    slimeGroupId: snapshot.slimeGroupId,
    movementState: snapshot.movementState,
    surfState: snapshot.surfState,
    isCarving: snapshot.isCarving,
    skiJumpCharge: snapshot.skiJumpCharge ?? 0,
    grindRailId: snapshot.grindRailId,
    grindT: snapshot.grindT,
    lastGrindT: snapshot.lastGrindT,
    grindSpeed: snapshot.grindSpeed,
    grindCooldownMs: snapshot.grindCooldownMs,
    isShooting: snapshot.isShooting,
    equippedWeaponId: snapshot.equippedWeaponId ?? DEFAULT_WEAPON_ID,
    disposableShotsRemaining: snapshot.disposableShotsRemaining ?? 0,
    health: snapshot.health,
    slimeLevel: snapshot.slimeLevel,
    inputSeq: snapshot.inputSeq,
    respawnTimer: snapshot.respawnTimer,
    isOnFriendlySlime: snapshot.isOnFriendlySlime,
    slimeColor: snapshot.slimeColor,
    patternId: snapshot.patternId,
  };
}

function interpolateState(
  older: RuntimePlayerState,
  newer: RuntimePlayerState,
  t: number,
): RuntimePlayerState {
  return {
    sessionId: newer.sessionId,
    pos: {
      x: lerp(older.pos.x, newer.pos.x, t),
      y: lerp(older.pos.y, newer.pos.y, t),
      z: lerp(older.pos.z, newer.pos.z, t),
    },
    vel: {
      x: lerp(older.vel.x, newer.vel.x, t),
      y: lerp(older.vel.y, newer.vel.y, t),
      z: lerp(older.vel.z, newer.vel.z, t),
    },
    rot: {
      x: lerp(older.rot.x, newer.rot.x, t),
      y: lerp(older.rot.y, newer.rot.y, t),
      z: lerp(older.rot.z, newer.rot.z, t),
      w: lerp(older.rot.w, newer.rot.w, t),
    },
    planetId: newer.planetId,
    slimeGroupId: newer.slimeGroupId,
    movementState: newer.movementState,
    surfState: newer.surfState,
    isCarving: newer.isCarving,
    skiJumpCharge: lerp(older.skiJumpCharge, newer.skiJumpCharge, t),
    grindRailId: newer.grindRailId,
    grindT: lerp(older.grindT, newer.grindT, t),
    lastGrindT: lerp(older.lastGrindT, newer.lastGrindT, t),
    grindSpeed: lerp(older.grindSpeed, newer.grindSpeed, t),
    grindCooldownMs: newer.grindCooldownMs,
    isShooting: newer.isShooting,
    equippedWeaponId: newer.equippedWeaponId,
    disposableShotsRemaining: newer.disposableShotsRemaining,
    health: newer.health,
    slimeLevel: newer.slimeLevel,
    inputSeq: newer.inputSeq,
    respawnTimer: newer.respawnTimer,
    isOnFriendlySlime: newer.isOnFriendlySlime,
    slimeColor: newer.slimeColor,
    patternId: newer.patternId,
  };
}

export class ClientRuntimeState {
  private localPlayer: RuntimePlayerState | null = null;
  private readonly pendingInputs: InputMessage[] = [];
  private readonly remoteSnapshots = new Map<string, BufferedSnapshot[]>();
  private stepCfg: StepConfig = GAME_CONFIG;
  private readonly stepCfgs = new Map<string, StepConfig>();
  private planets: PlanetData[] = [];
  private computedRails: ComputedRail[] = [];

  setMapData(msg: MapDataMessage): void {
    this.planets = msg.planets.map((p) => ({
      id: p.id,
      center: { x: p.center.x, y: p.center.y, z: p.center.z },
      radius: p.radius,
    }));
    this.computedRails = msg.rails.map((def) => {
      const planet = msg.planets.find((p) => p.id === def.planetId) ?? msg.planets[0]!;
      return buildComputedRail(def, planet.center, createTerrainConfig(planet));
    });
    this.stepCfgs.clear();
    for (const planet of msg.planets) {
      this.stepCfgs.set(planet.id, {
        ...createTerrainConfig(planet),
        movement: GAME_CONFIG.movement,
        rail: GAME_CONFIG.rail,
      });
    }
    const p0 = msg.planets[0]!;
    this.stepCfg = {
      ...createTerrainConfig(p0),
      movement: GAME_CONFIG.movement,
      rail: GAME_CONFIG.rail,
    };
  }

  private getStepConfig(planetId: string): StepConfig {
    return this.stepCfgs.get(planetId) ?? this.stepCfg;
  }

  removePlayer(sessionId: string): void {
    this.remoteSnapshots.delete(sessionId);
    if (this.localPlayer?.sessionId === sessionId) {
      this.localPlayer = null;
      this.pendingInputs.length = 0;
    }
  }

  clear(): void {
    this.localPlayer = null;
    this.pendingInputs.length = 0;
    this.remoteSnapshots.clear();
  }

  recordLocalInput(input: InputMessage, planetSlime: Map<string, SimPlanetSlimeState>): void {
    if (!this.localPlayer) return;
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) {
      this.pendingInputs.splice(0, this.pendingInputs.length - MAX_PENDING_INPUTS);
    }
    stepPlayer(
      this.localPlayer,
      input,
      input.dt,
      this.planets,
      this.getStepConfig(this.localPlayer.planetId),
      planetSlime,
      this.computedRails,
    );
  }

  applySnapshot(
    snapshot: PlayerSnapshot,
    isLocal: boolean,
    receivedAtMs: number,
    planetSlime: Map<string, SimPlanetSlimeState>,
  ): void {
    const runtime = snapshotToRuntimeState(snapshot);
    if (isLocal) {
      this.reconcileLocalPlayer(runtime, planetSlime);
      return;
    }

    const buffer = this.remoteSnapshots.get(snapshot.sessionId) ?? [];
    buffer.push({ receivedAtMs, snapshot: runtime });
    if (buffer.length > 10) buffer.splice(0, buffer.length - 10);
    this.remoteSnapshots.set(snapshot.sessionId, buffer);
  }

  setLocalSlimeGroupId(groupId: number): void {
    if (this.localPlayer) {
      this.localPlayer.slimeGroupId = groupId;
    }
  }

  getLocalPlayerState(): RuntimePlayerState | null {
    return this.localPlayer ? cloneRuntimeState(this.localPlayer) : null;
  }

  getRemotePlayerState(sessionId: string, nowMs: number): RuntimePlayerState | null {
    const buffer = this.remoteSnapshots.get(sessionId);
    if (!buffer || buffer.length === 0) return null;

    const targetTime = nowMs - NETWORK_CONFIG.reconciliation.remoteInterpolationBackTimeMs;
    let older = buffer[0]!;
    let newer = buffer[buffer.length - 1]!;

    for (const item of buffer) {
      if (item.receivedAtMs <= targetTime) older = item;
      if (item.receivedAtMs >= targetTime) {
        newer = item;
        break;
      }
    }

    if (older === newer || newer.receivedAtMs <= older.receivedAtMs) {
      return cloneRuntimeState(newer.snapshot);
    }

    const t = (targetTime - older.receivedAtMs) / (newer.receivedAtMs - older.receivedAtMs);
    return interpolateState(older.snapshot, newer.snapshot, Math.max(0, Math.min(1, t)));
  }

  private reconcileLocalPlayer(
    authoritative: RuntimePlayerState,
    planetSlime: Map<string, SimPlanetSlimeState>,
  ): void {
    const nextPendingIndex = this.pendingInputs.findIndex(
      (input) => input.seq > authoritative.inputSeq,
    );
    if (nextPendingIndex === -1) this.pendingInputs.length = 0;
    else this.pendingInputs.splice(0, nextPendingIndex);

    this.localPlayer = cloneRuntimeState(authoritative);
    for (const input of this.pendingInputs) {
      stepPlayer(
        this.localPlayer,
        input,
        input.dt,
        this.planets,
        this.getStepConfig(this.localPlayer.planetId),
        planetSlime,
        this.computedRails,
      );
    }
  }
}
