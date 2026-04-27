import * as THREE from "three";
import { PlayerSurfState } from "@splat/simulation/match/simState.ts";
import type { RuntimePlayerState } from "../network/runtimeState.ts";

const TRAIL_MAX_POINTS = 40;
const TRAIL_EMIT_DISTANCE = 0.12;
const TRAIL_HALF_WIDTH = 0.3;
const TRAIL_HALF_WIDTH_WATER = 0.44;
const WATER_TRAIL_COLOR = 0xc8ecff;
const TRAIL_FADE_SPEED = 6.0;
const TRAIL_SURFACE_OFFSET = 0.9;

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
    const uCoords = new Float32Array(vertexCount);

    // uCoord is static: 0 = left vertex, 1 = right vertex across the ribbon.
    for (let i = 0; i < TRAIL_MAX_POINTS; i++) {
      uCoords[i * 2] = 0.0;
      uCoords[i * 2 + 1] = 1.0;
    }

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1);
    const uAttr = new THREE.BufferAttribute(uCoords, 1);
    this.geometry.setAttribute("position", this.posAttr);
    this.geometry.setAttribute("alpha", this.alphaAttr);
    this.geometry.setAttribute("uCoord", uAttr);

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
        attribute float uCoord;
        varying float vAlpha;
        varying float vU;
        void main() {
          vAlpha = alpha;
          vU = uCoord;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 trailColor;
        varying float vAlpha;
        varying float vU;
        void main() {
          float centerDist = abs(vU - 0.5) * 2.0;
          float mask = 0.5 + 0.5 * smoothstep(0.4, 0.9, centerDist);
          gl_FragColor = vec4(trailColor, vAlpha * vAlpha * mask);
        }
      `,
      uniforms: {
        trailColor: { value: new THREE.Color(slimeColor) },
      },
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
    const surfState = state?.surfState ?? PlayerSurfState.None;
    const isSkiing =
      surfState === PlayerSurfState.SkiVisible ||
      surfState === PlayerSurfState.SkiWater ||
      surfState === PlayerSurfState.SurfmingMoving ||
      surfState === PlayerSurfState.SurfmingHidden;

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
      // Offset the point down toward the surface so the trail sits at board level.
      const toPlanetX = x - planetCenter.x;
      const toPlanetY = y - planetCenter.y;
      const toPlanetZ = z - planetCenter.z;
      const radLen = Math.sqrt(
        toPlanetX * toPlanetX + toPlanetY * toPlanetY + toPlanetZ * toPlanetZ,
      );
      const invLen = radLen > 1e-8 ? 1 / radLen : 0;
      this.trailHead = (this.trailHead + 1) % TRAIL_MAX_POINTS;
      this.trailPosX[this.trailHead] = x - toPlanetX * invLen * TRAIL_SURFACE_OFFSET;
      this.trailPosY[this.trailHead] = y - toPlanetY * invLen * TRAIL_SURFACE_OFFSET;
      this.trailPosZ[this.trailHead] = z - toPlanetZ * invLen * TRAIL_SURFACE_OFFSET;
      if (this.trailCount < TRAIL_MAX_POINTS) this.trailCount++;
      this.lastEmitX = x;
      this.lastEmitY = y;
      this.lastEmitZ = z;
    }

    if (this.trailCount < 2) {
      this.mesh.visible = false;
      return;
    }

    const trailHex = surfState === PlayerSurfState.SkiWater ? WATER_TRAIL_COLOR : slimeColor;
    this.material.uniforms.trailColor.value.setHex(trailHex);

    // Surface up direction at current position (radial out from planet).
    this._up.set(x, y, z).sub(planetCenter).normalize();

    const speed = Math.sqrt(
      state.vel.x * state.vel.x + state.vel.y * state.vel.y + state.vel.z * state.vel.z,
    );
    // Quadratic ramp so the trail only becomes visible once moving meaningfully.
    const speedScale =
      Math.min(1, speed / (TRAIL_FADE_SPEED * 2)) * Math.min(1, speed / TRAIL_FADE_SPEED);

    const halfWidth =
      surfState === PlayerSurfState.SkiWater ? TRAIL_HALF_WIDTH_WATER : TRAIL_HALF_WIDTH;

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

      // Alpha: fades in from the head over the first few points, fades out at the tail.
      const tailFade = (N - 1 - i) / (N - 1);
      const headFade = Math.min(1, i / 4);
      const alpha = tailFade * headFade * speedScale;

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
