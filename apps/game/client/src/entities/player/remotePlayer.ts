import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { RENDER_CONFIG } from "@splat/content/config/renderConfig.ts";
import { HealthBar } from "./healthBar.ts";
import { Nameplate, type TeamRelation } from "./nameplate.ts";
import {
  isPlayerEffectivelySubmerged,
  PlayerVisualRig,
  type PlayerVisualState,
} from "./playerVisualRig.ts";

const HELD_WEAPON_MODEL_SIZE = 1.95;

interface PlayerTransformState extends PlayerVisualState {
  health: number;
}

/** A remote player's mesh — position updated from server snapshots. */
export class RemotePlayer {
  readonly mesh: THREE.Group;
  private readonly visual: PlayerVisualRig;
  private readonly healthBar: HealthBar;
  private readonly nameplate: Nameplate;

  constructor(scene: THREE.Scene, slimeColor: number, patternId = 0, name = "") {
    this.visual = new PlayerVisualRig(slimeColor, patternId, {
      weaponModelSize: HELD_WEAPON_MODEL_SIZE,
    });
    this.mesh = this.visual.group;
    this.healthBar = new HealthBar(GAME_CONFIG.player.maxHealth);
    this.nameplate = new Nameplate(name, slimeColor);
    this.mesh.add(this.healthBar.sprite);
    this.mesh.add(this.nameplate.sprite);
    // Detach disturbance from group so it stays visible when the player mesh is hidden.
    this.mesh.remove(this.visual.disturbanceMesh);
    scene.add(this.visual.disturbanceMesh);
    scene.add(this.mesh);
  }

  update(state: PlayerTransformState, dt: number, camera?: THREE.Camera): void {
    this.visual.setTransform(state);

    if (this.visual.updateDeath(state, dt)) {
      this.mesh.visible = true;
      this.healthBar.update(state, dt, GAME_CONFIG.player.maxHealth);
      this.nameplate.update(false, dt, camera);
      return;
    }

    this.visual.updateAlivePose(state, dt);
    this.visual.updateWeapon(state.equippedWeaponId);

    const effectivelySubmerged = isPlayerEffectivelySubmerged(state);
    this.mesh.visible = !effectivelySubmerged;
    this.visual.updateDisturbance(state, true);

    this.healthBar.update(state, dt, GAME_CONFIG.player.maxHealth);
    this.nameplate.update(!effectivelySubmerged, dt, camera);
  }

  setName(name: string): void {
    this.nameplate.setName(name);
  }

  setTeamRelation(relation: TeamRelation, teamColor?: number): void {
    this.nameplate.setTeamRelation(relation, teamColor);
  }

  dispose(scene: THREE.Scene): void {
    this.visual.dispose();
    this.healthBar.dispose();
    this.nameplate.dispose();
    scene.remove(this.mesh);
    scene.remove(this.visual.disturbanceMesh);
  }

  isAimTargetVisible(): boolean {
    return this.mesh.visible && this.visual.liveMesh.visible;
  }

  setAcquired(acquired: boolean, guaranteed = false): void {
    this.visual.jsrOutline.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material;
      if (!(mat instanceof THREE.ShaderMaterial)) return;
      const uniform = mat.uniforms["outlineColor"];
      if (!uniform) return;
      const v = uniform.value as THREE.Vector3;
      if (acquired) {
        if (guaranteed) {
          v.set(1.0, 0.55, 0.0);
        } else {
          v.set(1.0, 0.08, 0.08);
        }
      } else {
        const [r, g, b] = RENDER_CONFIG.celOutline.color;
        v.set(r ?? 0, g ?? 0, b ?? 0);
      }
    });
  }

  triggerTrick(trickId: string, combo?: number): void {
    this.visual.triggerTrick(trickId, combo);
  }
}
