import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { PlayerMovementState } from "@splat/simulation/match/simState.ts";

const AIR_CHARGE_DECAY_PER_SECOND = 0.12;
const GROUND_CHARGE_DECAY_PER_SECOND = 3.4;
const CHARGE_LERP_IN_SPEED = 9;
const CHARGE_LERP_OUT_SPEED = 5;
const LANDING_BURST_DECAY_PER_SECOND = 3.2;

interface TrickChargeState {
  movementState: number;
}

export class PlayerTrickChargeEffect {
  private readonly emissiveColor: THREE.Color;
  private readonly auraMaterials: THREE.MeshBasicMaterial[] = [];
  private targetCharge = 0;
  private visualCharge = 0;
  private landingBurst = 0;
  private wasAirborne = false;

  constructor(
    private readonly auraMesh: THREE.Group,
    private readonly slimeMaterials: THREE.ShaderMaterial[],
    slimeColor: number,
  ) {
    this.emissiveColor = new THREE.Color(slimeColor);
    this.auraMesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const { material } = child;
      if (material instanceof THREE.MeshBasicMaterial) {
        this.auraMaterials.push(material);
      }
    });
    this.applyVisuals(0, 0);
  }

  registerTrick(combo = 1): void {
    const comboCharge = Math.max(0.18, Math.min(1, combo / GAME_CONFIG.tricks.maxCombo));
    this.targetCharge = Math.max(this.targetCharge, comboCharge);
  }

  update(state: TrickChargeState, dt: number): void {
    const airborne = state.movementState === PlayerMovementState.Airborne;
    if (state.movementState === PlayerMovementState.Dead) {
      this.targetCharge = 0;
      this.visualCharge = 0;
      this.landingBurst = 0;
      this.wasAirborne = false;
      this.applyVisuals(0, 0);
      return;
    }

    if (this.wasAirborne && !airborne && this.visualCharge > 0.16) {
      this.landingBurst = Math.max(this.landingBurst, Math.min(1, this.visualCharge * 1.35));
      this.targetCharge = 0;
    }
    this.wasAirborne = airborne;

    const decayRate = airborne ? AIR_CHARGE_DECAY_PER_SECOND : GROUND_CHARGE_DECAY_PER_SECOND;
    this.targetCharge = Math.max(0, this.targetCharge - dt * decayRate);
    const lerpSpeed =
      this.targetCharge >= this.visualCharge ? CHARGE_LERP_IN_SPEED : CHARGE_LERP_OUT_SPEED;
    this.visualCharge += (this.targetCharge - this.visualCharge) * Math.min(1, dt * lerpSpeed);
    this.landingBurst = Math.max(0, this.landingBurst - dt * LANDING_BURST_DECAY_PER_SECOND);

    this.applyVisuals(this.visualCharge, this.landingBurst);
  }

  private applyVisuals(charge: number, landingBurst: number): void {
    const t = performance.now() * 0.001;
    const pulse = 0.7 + Math.sin(t * (8 + charge * 7)) * 0.3;
    const auraStrength = Math.max(charge * pulse, landingBurst);

    this.auraMesh.visible = auraStrength > 0.02;
    this.auraMesh.rotation.y = t * (1.5 + charge * 2.5);
    this.auraMesh.rotation.z = Math.sin(t * 2.2) * 0.12;
    this.auraMesh.scale.setScalar(1 + auraStrength * 0.85 + landingBurst * 0.35);

    for (let index = 0; index < this.auraMaterials.length; index++) {
      const material = this.auraMaterials[index];
      const band = index === 0 ? 1 : index === 1 ? 0.8 : 0.65;
      material.opacity = auraStrength * band * 0.6 + landingBurst * band * 0.35;
    }

    const emissiveIntensity = auraStrength <= 0.01 ? 0 : 0.22 + auraStrength * 0.95;
    for (const material of this.slimeMaterials) {
      material.uniforms["emissive"].value.copy(this.emissiveColor);
      material.uniforms["emissiveIntensity"].value = emissiveIntensity;
    }
  }
}
