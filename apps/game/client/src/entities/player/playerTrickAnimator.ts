import * as THREE from "three";
import { getAirTrickDefinition } from "@splat/content/tricks/airTrickDefs.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";
import type { PlayerPosePart, PlayerPoseRig } from "./playerMesh.ts";

const TRICK_DURATION_SECONDS = 0.78;
const BOARD_BASE_Y = -0.58;
const FRONT_BINDING_Z = 0.27;
const REAR_BINDING_Z = -0.23;
const WALK_CYCLE_SPEED = 9;
const OUTLINE_SCALE = 1.18;

interface PlayerAnimatorState {
  movementState: number;
  surfState: number;
  isCarving: boolean;
  vel?: { x: number; y: number; z: number };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeInOut(value: number): number {
  return 0.5 - Math.cos(clamp01(value) * Math.PI) * 0.5;
}

function speedOf(state: PlayerAnimatorState): number {
  if (!state.vel) return 0;
  return Math.hypot(state.vel.x, state.vel.y, state.vel.z);
}

function setPart(
  part: PlayerPosePart,
  x: number,
  y: number,
  z: number,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
): void {
  part.mesh.position.set(x, y, z);
  part.mesh.scale.set(scaleX, scaleY, scaleZ);

  part.jsrOutline.position.copy(part.mesh.position);
  part.jsrOutline.scale.copy(part.mesh.scale);

  part.outline.position.copy(part.mesh.position);
  part.outline.scale.set(scaleX * OUTLINE_SCALE, scaleY * OUTLINE_SCALE, scaleZ * OUTLINE_SCALE);
}

function syncPoseRigOutlines(rig: PlayerPoseRig): void {
  for (const part of Object.values(rig)) {
    part.jsrOutline.position.copy(part.mesh.position);
    part.jsrOutline.scale.copy(part.mesh.scale);
    part.outline.position.copy(part.mesh.position);
    part.outline.scale.set(
      part.mesh.scale.x * OUTLINE_SCALE,
      part.mesh.scale.y * OUTLINE_SCALE,
      part.mesh.scale.z * OUTLINE_SCALE,
    );
  }
}

export class PlayerTrickAnimator {
  private trickId: string | null = null;
  private timer = 0;
  private walkTime = 0;

  trigger(trickId: string): void {
    this.trickId = trickId;
    this.timer = TRICK_DURATION_SECONDS;
  }

  update(
    liveMesh: THREE.Group,
    snowboardMesh: THREE.Group,
    poseRig: PlayerPoseRig,
    state: PlayerAnimatorState,
    dt: number,
  ): void {
    const speed = speedOf(state);
    this.walkTime += dt * Math.max(0.65, Math.min(1.85, speed * 0.12));

    liveMesh.rotation.set(0, 0, 0);
    snowboardMesh.rotation.set(0, 0, 0);
    snowboardMesh.position.set(0, BOARD_BASE_Y, 0);

    const surfing = state.surfState !== PlayerSurfState.None;
    const airborne = state.movementState === PlayerMovementState.Airborne;

    if (surfing) {
      this.applySurfPose(poseRig, snowboardMesh, state, airborne);
    } else {
      this.applyGroundPose(poseRig, speed);
    }

    if (airborne && surfing) this.applyAirTuck(poseRig, speed);
    this.applyTrickOverlay(liveMesh, snowboardMesh, poseRig, dt);
    syncPoseRigOutlines(poseRig);
  }

  private applyGroundPose(poseRig: PlayerPoseRig, speed: number): void {
    const walk = clamp01(speed / 8);
    const phase = this.walkTime * WALK_CYCLE_SPEED;
    const step = Math.sin(phase) * walk;
    const lift = Math.max(0, Math.sin(phase)) * walk;
    const oppositeLift = Math.max(0, -Math.sin(phase)) * walk;

    setPart(poseRig.leftArm, -0.47, -0.04, -0.02 - step * 0.1);
    setPart(poseRig.rightArm, 0.47, -0.04, -0.02 + step * 0.1);
    setPart(poseRig.frontFoot, -0.19, -0.43 + lift * 0.08, 0.16 + step * 0.16, 1.08, 0.9, 1);
    setPart(poseRig.rearFoot, 0.19, -0.43 + oppositeLift * 0.08, 0.16 - step * 0.16, 1.08, 0.9, 1);
  }

  private applySurfPose(
    poseRig: PlayerPoseRig,
    snowboardMesh: THREE.Group,
    state: PlayerAnimatorState,
    airborne: boolean,
  ): void {
    const carve = state.isCarving ? 1 : 0;
    const balance = Math.sin(this.walkTime * 5) * 0.025;
    const footY = airborne ? -0.36 : -0.39;

    setPart(poseRig.leftArm, -0.52, 0.1 + balance, -0.12 - carve * 0.08, 1.12, 0.9, 1.05);
    setPart(poseRig.rightArm, 0.52, 0.08 - balance, 0.12 + carve * 0.08, 1.12, 0.9, 1.05);
    setPart(poseRig.frontFoot, -0.12, footY, FRONT_BINDING_Z, 1.18, 0.72, 1.34);
    setPart(poseRig.rearFoot, 0.12, footY, REAR_BINDING_Z, 1.18, 0.72, 1.34);

    if (state.isCarving) {
      snowboardMesh.rotation.z = 0.16;
      snowboardMesh.rotation.x = -0.08;
    }
  }

  private applyAirTuck(poseRig: PlayerPoseRig, speed: number): void {
    const tuck = 0.45 + clamp01(speed / 25) * 0.2;
    poseRig.leftArm.mesh.position.y += tuck * 0.16;
    poseRig.leftArm.mesh.position.z -= tuck * 0.08;
    poseRig.rightArm.mesh.position.y += tuck * 0.14;
    poseRig.rightArm.mesh.position.z += tuck * 0.08;
    poseRig.frontFoot.mesh.position.y += tuck * 0.08;
    poseRig.rearFoot.mesh.position.y += tuck * 0.08;
  }

  private applyTrickOverlay(
    liveMesh: THREE.Group,
    snowboardMesh: THREE.Group,
    poseRig: PlayerPoseRig,
    dt: number,
  ): void {
    if (!this.trickId || this.timer <= 0) return;

    this.timer = Math.max(0, this.timer - dt);
    const trick = getAirTrickDefinition(this.trickId);
    const progress = 1 - this.timer / TRICK_DURATION_SECONDS;
    const eased = easeInOut(progress);
    const arc = Math.sin(progress * Math.PI);

    if (trick.animation === "yawSpin") {
      const rotations = Math.max(1, (trick.degrees ?? 360) / 360);
      liveMesh.rotation.y = eased * Math.PI * 2 * rotations;
      snowboardMesh.rotation.z += arc * 0.28;
      poseRig.leftArm.mesh.position.x -= arc * 0.12;
      poseRig.rightArm.mesh.position.x += arc * 0.12;
    } else if (trick.animation === "boardRoll") {
      snowboardMesh.rotation.z += eased * Math.PI * 2;
      snowboardMesh.rotation.x += arc * 0.28;
      liveMesh.rotation.z = arc * -0.18;
      poseRig.frontFoot.mesh.position.x -= arc * 0.18;
      poseRig.frontFoot.mesh.position.y += arc * 0.16;
      poseRig.rearFoot.mesh.position.y += arc * 0.08;
    } else if (trick.animation === "boardFlip") {
      snowboardMesh.rotation.x += eased * Math.PI * 2;
      snowboardMesh.position.y = BOARD_BASE_Y + arc * 0.16;
      liveMesh.rotation.x = arc * 0.16;
      poseRig.rightArm.mesh.position.set(0.38, -0.08 + arc * 0.2, REAR_BINDING_Z - arc * 0.18);
      poseRig.leftArm.mesh.position.set(-0.5, 0.14 + arc * 0.1, 0.12);
      poseRig.frontFoot.mesh.position.y += arc * 0.1;
    } else if (trick.animation === "frontFlip" || trick.animation === "backFlip") {
      const direction = trick.animation === "frontFlip" ? 1 : -1;
      const rotations = Math.max(1, Math.abs(trick.degrees ?? 360) / 360);
      liveMesh.rotation.x = direction * eased * Math.PI * 2 * rotations;
      snowboardMesh.rotation.x += direction * eased * Math.PI * 2 * rotations;
      snowboardMesh.position.y = BOARD_BASE_Y + arc * 0.2;
      poseRig.leftArm.mesh.position.y += arc * 0.16;
      poseRig.rightArm.mesh.position.y += arc * 0.16;
      poseRig.frontFoot.mesh.position.z += direction * arc * 0.08;
      poseRig.rearFoot.mesh.position.z -= direction * arc * 0.08;
    } else {
      snowboardMesh.rotation.x += eased * Math.PI * 2;
      snowboardMesh.position.y = BOARD_BASE_Y + arc * 0.18;
      liveMesh.rotation.x = arc * 0.18;
    }

    if (this.timer === 0) {
      this.trickId = null;
    }
  }
}
