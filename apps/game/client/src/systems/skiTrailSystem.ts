import * as THREE from "three";
import { PlayerSwimState } from "@splat/simulation/match/simState.ts";
import type { RuntimePlayerState } from "../network/runtimeState.ts";

const TRAIL_MAX_POINTS = 20;
const TRAIL_EMIT_DISTANCE = 0.15;
const TRAIL_HALF_WIDTH = 0.28;
const TRAIL_HALF_WIDTH_WATER = 0.42;
const WATER_TRAIL_COLOR = 0xc0e8ff;
// Trail fades to 0 below this speed (wu/s). Ramp is linear from 0 → full at 2× this value.
const TRAIL_FADE_SPEED = 3.0;

export class SkiTrailSystem {
  private readonly scene: THREE.Scene;
  private readonly geometry: THREE.BufferGeometry;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  // Ring buffer: trailHead is the index of the most recently written point.
  private readonly trailPosX = new Float32Array(TRAIL_MAX_POINTS);
  private readonly trailPosY = new Float32Array(TRAIL_MAX_POINTS);
  private readonly trailPosZ = new Float32Array(TRAIL_MAX_POINTS);
  private trailHead = -1;
  private trailCount = 0;

  private lastEmitX = 0;
  private lastEmitY = 0;
  private lastEmitZ = 0;

  // Scratch vectors — reused each frame to avoid GC pressure.
  private readonly _up = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();

  constructor(scene: THREE.Scene, slimeColor: number) {
    this.scene = scene;

    const vertexCount = TRAIL_MAX_POINTS * 2;
    const positions = new Float32Array(vertexCount * 3);
    const alphas = new Float32Array(vertexCount);

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1);
    this.geometry.setAttribute("position", this.posAttr);
    this.geometry.setAttribute("alpha", this.alphaAttr);

    const indices: number[] = [];
    for (let i = 0; i < TRAIL_MAX_POINTS - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = i * 2 + 2;
      const d = i * 2 + 3;
      indices.push(a, b, c, b, d, c);
    }
    this.geometry.setIndex(indices);

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 trailColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(trailColor, vAlpha * vAlpha);
        }
      `,
      uniforms: { trailColor: { value: new THREE.Color(slimeColor) } },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(state: RuntimePlayerState | null, planetCenter: THREE.Vector3, slimeColor: number): void {
    const swimState = state?.swimState ?? PlayerSwimState.None;
    const isSkiing =
      swimState === PlayerSwimState.SkiVisible ||
      swimState === PlayerSwimState.SkiWater ||
      swimState === PlayerSwimState.SwimmingMoving ||
      swimState === PlayerSwimState.SwimmingHidden;

    if (!isSkiing || !state) {
      this.clear();
      return;
    }

    // Emit a new trail point when the player has moved far enough.
    const { x, y, z } = state.pos;
    const dx = x - this.lastEmitX;
    const dy = y - this.lastEmitY;
    const dz = z - this.lastEmitZ;

    if (
      this.trailCount === 0 ||
      dx * dx + dy * dy + dz * dz >= TRAIL_EMIT_DISTANCE * TRAIL_EMIT_DISTANCE
    ) {
      this.trailHead = (this.trailHead + 1) % TRAIL_MAX_POINTS;
      this.trailPosX[this.trailHead] = x;
      this.trailPosY[this.trailHead] = y;
      this.trailPosZ[this.trailHead] = z;
      if (this.trailCount < TRAIL_MAX_POINTS) this.trailCount++;
      this.lastEmitX = x;
      this.lastEmitY = y;
      this.lastEmitZ = z;
    }

    if (this.trailCount < 2) {
      this.mesh.visible = false;
      return;
    }

    // Set trail color: light blue-white for water, slime color for paint.
    const trailHex = swimState === PlayerSwimState.SkiWater ? WATER_TRAIL_COLOR : slimeColor;
    this.material.uniforms.trailColor.value.setHex(trailHex);

    const halfWidth =
      swimState === PlayerSwimState.SkiWater ? TRAIL_HALF_WIDTH_WATER : TRAIL_HALF_WIDTH;

    // Surface up direction at current position (radial out from planet).
    this._up.set(x, y, z).sub(planetCenter).normalize();

    // Scale the whole trail down when the player is barely moving so the head fades to 0 at rest.
    const speed = Math.sqrt(
      state.vel.x * state.vel.x + state.vel.y * state.vel.y + state.vel.z * state.vel.z,
    );
    const speedScale =
      Math.min(1, speed / (TRAIL_FADE_SPEED * 2)) * Math.min(1, speed / TRAIL_FADE_SPEED);

    const N = this.trailCount;
    const posArr = this.posAttr.array as Float32Array;
    const alphaArr = this.alphaAttr.array as Float32Array;

    for (let i = 0; i < N; i++) {
      const idx = (((this.trailHead - i) % TRAIL_MAX_POINTS) + TRAIL_MAX_POINTS) % TRAIL_MAX_POINTS;
      const px = this.trailPosX[idx];
      const py = this.trailPosY[idx];
      const pz = this.trailPosZ[idx];

      // Trail direction: from this point toward the next older point.
      if (i < N - 1) {
        const nextIdx =
          (((this.trailHead - (i + 1)) % TRAIL_MAX_POINTS) + TRAIL_MAX_POINTS) % TRAIL_MAX_POINTS;
        this._dir.set(
          px - this.trailPosX[nextIdx],
          py - this.trailPosY[nextIdx],
          pz - this.trailPosZ[nextIdx],
        );
      }
      if (this._dir.lengthSq() < 1e-8) this._dir.copy(this._up);
      this._dir.normalize();

      this._side.crossVectors(this._dir, this._up).normalize();

      // Alpha: 1 at head, 0 at tail — scaled down when the player is barely moving.
      const alpha = ((N - 1 - i) / (N - 1)) * speedScale;

      const vi = i * 2;
      posArr[vi * 3] = px - this._side.x * halfWidth;
      posArr[vi * 3 + 1] = py - this._side.y * halfWidth;
      posArr[vi * 3 + 2] = pz - this._side.z * halfWidth;
      posArr[(vi + 1) * 3] = px + this._side.x * halfWidth;
      posArr[(vi + 1) * 3 + 1] = py + this._side.y * halfWidth;
      posArr[(vi + 1) * 3 + 2] = pz + this._side.z * halfWidth;

      alphaArr[vi] = alpha;
      alphaArr[vi + 1] = alpha;
    }

    // Zero out unused vertices at the tail so old geometry doesn't bleed through.
    for (let i = N; i < TRAIL_MAX_POINTS; i++) {
      posArr[i * 2 * 3] =
        posArr[i * 2 * 3 + 1] =
        posArr[i * 2 * 3 + 2] =
        posArr[(i * 2 + 1) * 3] =
        posArr[(i * 2 + 1) * 3 + 1] =
        posArr[(i * 2 + 1) * 3 + 2] =
          0;
      alphaArr[i * 2] = alphaArr[i * 2 + 1] = 0;
    }

    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.mesh.visible = true;
  }

  clear(): void {
    this.trailHead = -1;
    this.trailCount = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
