import * as THREE from "three";
import { getAirTrickDefinition } from "@splat/content/tricks/airTrickDefs.ts";

const TRICK_DURATION_SECONDS = 0.72;

export class PlayerTrickAnimator {
  private trickId: string | null = null;
  private timer = 0;

  trigger(trickId: string): void {
    this.trickId = trickId;
    this.timer = TRICK_DURATION_SECONDS;
  }

  update(liveMesh: THREE.Group, snowboardMesh: THREE.Group, dt: number): void {
    liveMesh.rotation.set(0, 0, 0);
    snowboardMesh.rotation.set(0, 0, 0);
    snowboardMesh.position.set(0, -0.58, 0);

    if (!this.trickId || this.timer <= 0) return;

    this.timer = Math.max(0, this.timer - dt);
    const trick = getAirTrickDefinition(this.trickId);
    const progress = 1 - this.timer / TRICK_DURATION_SECONDS;
    const eased = Math.sin(progress * Math.PI * 0.5);

    if (trick.animation === "yawSpin") {
      const rotations = Math.max(1, (trick.degrees ?? 360) / 360);
      liveMesh.rotation.y = eased * Math.PI * 2 * rotations;
      snowboardMesh.rotation.z = Math.sin(progress * Math.PI) * 0.35;
    } else if (trick.animation === "boardRoll") {
      snowboardMesh.rotation.z = eased * Math.PI * 2;
      snowboardMesh.rotation.x = Math.sin(progress * Math.PI) * 0.35;
      liveMesh.rotation.z = Math.sin(progress * Math.PI) * -0.22;
    } else if (trick.animation === "frontFlip" || trick.animation === "backFlip") {
      const direction = trick.animation === "frontFlip" ? 1 : -1;
      const rotations = Math.max(1, Math.abs(trick.degrees ?? 360) / 360);
      liveMesh.rotation.x = direction * eased * Math.PI * 2 * rotations;
      snowboardMesh.rotation.x = direction * eased * Math.PI * 2 * rotations;
      snowboardMesh.position.y = -0.58 + Math.sin(progress * Math.PI) * 0.18;
    } else {
      snowboardMesh.rotation.x = eased * Math.PI * 2;
      snowboardMesh.position.y = -0.58 + Math.sin(progress * Math.PI) * 0.18;
      liveMesh.rotation.x = Math.sin(progress * Math.PI) * 0.18;
    }

    if (this.timer === 0) {
      this.trickId = null;
    }
  }
}
