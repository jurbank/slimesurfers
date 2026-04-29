import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { RAIL_DEFS } from "@splat/content/config/railDefs.ts";
import { DEFAULT_WEAPON_ID } from "@splat/content/combat/weaponDefs.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import type { InputMessage } from "@splat/protocol/network/clientMessages.ts";
import type { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import type { PlayerSnapshot } from "@splat/protocol/network/serverMessages.ts";
import { stepPlayer, type PlayerPhysics } from "@splat/simulation/movement/simulatedMovement.ts";
import { buildComputedRail } from "@splat/simulation/movement/railSpline.ts";
import type { SimPlanetPaintState } from "@splat/simulation/match/simState.ts";

const PLANETS = PLANET_POSITIONS.map((planet) => ({
  id: planet.id,
  center: { x: planet.x, y: planet.y, z: planet.z },
  radius: GAME_CONFIG.planet.radius,
}));
const RAILS = RAIL_DEFS.map((def) => {
  const planet =
    PLANET_POSITIONS.find((entry) => entry.id === def.planetId) ?? PLANET_POSITIONS[0]!;
  return buildComputedRail(def, { x: planet.x, y: planet.y, z: planet.z }, GAME_CONFIG);
});

const MAX_PENDING_INPUTS = 60;

export interface RuntimePlayerState extends PlayerPhysics {
  isShooting: boolean;
  equippedWeaponId: WeaponId;
  disposableShotsRemaining: number;
  health: number;
  slimeLevel: number;
  inputSeq: number;
  respawnTimer: number;
  isOnFriendlyPaint: boolean;
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
    paintGroupId: state.paintGroupId,
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
    isOnFriendlyPaint: state.isOnFriendlyPaint,
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
    paintGroupId: snapshot.paintGroupId,
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
    isOnFriendlyPaint: snapshot.isOnFriendlyPaint,
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
    paintGroupId: newer.paintGroupId,
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
    isOnFriendlyPaint: newer.isOnFriendlyPaint,
    slimeColor: newer.slimeColor,
    patternId: newer.patternId,
  };
}

export class ClientRuntimeState {
  private localPlayer: RuntimePlayerState | null = null;
  private readonly pendingInputs: InputMessage[] = [];
  private readonly remoteSnapshots = new Map<string, BufferedSnapshot[]>();

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

  recordLocalInput(input: InputMessage, planetPaint: Map<string, SimPlanetPaintState>): void {
    if (!this.localPlayer) return;
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) {
      this.pendingInputs.splice(0, this.pendingInputs.length - MAX_PENDING_INPUTS);
    }
    stepPlayer(this.localPlayer, input, input.dt, PLANETS, GAME_CONFIG, planetPaint, RAILS);
  }

  applySnapshot(
    snapshot: PlayerSnapshot,
    isLocal: boolean,
    receivedAtMs: number,
    planetPaint: Map<string, SimPlanetPaintState>,
  ): void {
    const runtime = snapshotToRuntimeState(snapshot);
    if (isLocal) {
      this.reconcileLocalPlayer(runtime, planetPaint);
      return;
    }

    const buffer = this.remoteSnapshots.get(snapshot.sessionId) ?? [];
    buffer.push({ receivedAtMs, snapshot: runtime });
    if (buffer.length > 10) buffer.splice(0, buffer.length - 10);
    this.remoteSnapshots.set(snapshot.sessionId, buffer);
  }

  setLocalPaintGroupId(groupId: number): void {
    if (this.localPlayer) {
      this.localPlayer.paintGroupId = groupId;
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
    planetPaint: Map<string, SimPlanetPaintState>,
  ): void {
    const nextPendingIndex = this.pendingInputs.findIndex(
      (input) => input.seq > authoritative.inputSeq,
    );
    if (nextPendingIndex === -1) this.pendingInputs.length = 0;
    else this.pendingInputs.splice(0, nextPendingIndex);

    this.localPlayer = cloneRuntimeState(authoritative);
    for (const input of this.pendingInputs) {
      stepPlayer(this.localPlayer, input, input.dt, PLANETS, GAME_CONFIG, planetPaint, RAILS);
    }
  }
}
