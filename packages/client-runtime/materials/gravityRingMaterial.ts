import * as THREE from "three";
import {
  gravityRingVertexShader,
  gravityRingFragmentShader,
} from "@splat/client-runtime/shaders/gravityRingShader.ts";

export interface GravityRingConfig {
  color: number;
  intensity: number;
  opacity: number;
  ringPower: number;
}

export const DEFAULT_GRAVITY_RING: GravityRingConfig = {
  color: 0x6fb6ff,
  intensity: 1.1,
  opacity: 0.55,
  ringPower: 4.0,
};

export function createGravityRingMaterial(
  cfg: GravityRingConfig = DEFAULT_GRAVITY_RING,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ringColor: { value: new THREE.Color(cfg.color) },
      intensity: { value: cfg.intensity },
      opacity: { value: cfg.opacity },
      ringPower: { value: cfg.ringPower },
    },
    vertexShader: gravityRingVertexShader,
    fragmentShader: gravityRingFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
}

// Default capture-radius multiplier used when a planet doesn't specify one. Mirrors
// the simulation default in simulatedMovement.ts (getGravityRadius). Keep these in
// sync — they're load-bearing for both physics and the visualisation.
export const DEFAULT_GRAVITY_RADIUS_MULTIPLIER = 1.8;

export function resolveGravityRadius(planet: { radius: number; gravityRadius?: number }): number {
  return planet.gravityRadius ?? planet.radius * DEFAULT_GRAVITY_RADIUS_MULTIPLIER;
}
