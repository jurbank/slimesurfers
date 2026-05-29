import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import type { SlimeStampMessage } from "@splat/protocol/network/serverMessages.ts";
import { stampVertexShader, stampFragmentShader } from "../shaders/stampShader.ts";

const FRAME_MS = 1000 / 60;
const TAU = Math.PI * 2;

interface AnimatedSplat {
  planetId: string;
  color: number;
  patternId: number;
  normal: THREE.Vector3;
  radius: number;
  startMs: number;
  delayMs: number;
  edgeNoiseOffset: THREE.Vector3;
}

interface PlanetHeightMapEntry {
  texture: THREE.Texture;
  /** Half of the smallest occludable feature, in world units — used as a
   * permissive tolerance on the height comparison so noise/sphere-curvature
   * don't accidentally clip ordinary splats. */
  tolerance: number;
}

export class SlimeSystem {
  private readonly renderTargets = new Map<string, THREE.WebGLRenderTarget>();
  private readonly permanentRenderTargets = new Map<string, THREE.WebGLRenderTarget>();
  private readonly brushScene = new THREE.Scene();
  private readonly brushCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly brushMesh: THREE.Mesh;
  private readonly brushMaterial: THREE.ShaderMaterial;
  private readonly copyMaterial: THREE.ShaderMaterial;
  private readonly seenStamps = new Set<string>();
  private readonly activeSplats: AnimatedSplat[] = [];
  private readonly planetHeightMaps = new Map<string, PlanetHeightMapEntry>();
  /** Placeholder bound when a planet hasn't registered a heightmap yet; with
   * `occlusionEnabled = false` the shader ignores it entirely. */
  private readonly placeholderHeightMap: THREE.DataTexture;

  private readonly stampHistory = new Map<string, SlimeStampMessage[]>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.placeholderHeightMap = new THREE.DataTexture(
      new Float32Array([1]),
      1,
      1,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.placeholderHeightMap.needsUpdate = true;

    this.brushMaterial = new THREE.ShaderMaterial({
      uniforms: {
        brushColor: { value: new THREE.Color(0xffffff) },
        patternId: { value: 0 },
        stampNormal: { value: new THREE.Vector3(0, 1, 0) },
        stampRadius: { value: 0.1 },
        bloomProgress: { value: 1 },
        bloomStartScale: { value: GAME_CONFIG.slimeStamp.splatBloomStartScale },
        bloomOvershootScale: { value: GAME_CONFIG.slimeStamp.splatBloomOvershootScale },
        brushSoftness: { value: GAME_CONFIG.slimeStamp.brushSoftness },
        edgeNoiseScale: { value: GAME_CONFIG.slimeStamp.edgeNoiseScale },
        edgeNoiseStrength: { value: GAME_CONFIG.slimeStamp.edgeNoiseStrength },
        edgeNoiseOffset: { value: new THREE.Vector3() },
        heightMap: { value: this.placeholderHeightMap },
        occlusionEnabled: { value: false },
        occlusionTolerance: { value: 0 },
      },
      vertexShader: stampVertexShader,
      fragmentShader: stampFragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sourceTexture: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D sourceTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(sourceTexture, vUv);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.brushMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.brushMaterial);
    this.brushScene.add(this.brushMesh);
  }

  getRenderTarget(planetId: string): THREE.WebGLRenderTarget {
    if (!this.renderTargets.has(planetId)) {
      this.renderTargets.set(planetId, this.createSlimeRenderTarget());
      this.permanentRenderTargets.set(planetId, this.createSlimeRenderTarget());
    }
    return this.renderTargets.get(planetId)!;
  }

  /** Register a per-planet heightmap so the stamp shader can reject pixels
   * whose line-of-sight from the impact is occluded by terrain. */
  setPlanetHeightMap(planetId: string, texture: THREE.Texture, tolerance: number): void {
    const previous = this.planetHeightMaps.get(planetId);
    if (previous && previous.texture !== texture) {
      previous.texture.dispose();
    }
    this.planetHeightMaps.set(planetId, { texture, tolerance });
  }

  getStampHistory(planetId: string): readonly SlimeStampMessage[] {
    return this.stampHistory.get(planetId) ?? [];
  }

  addStamp(stamp: SlimeStampMessage): boolean {
    const stampKey = `${stamp.planetId}:${stamp.seq}`;
    if (this.seenStamps.has(stampKey)) return false;
    this.seenStamps.add(stampKey);

    const history = this.stampHistory.get(stamp.planetId) ?? [];
    history.push(stamp);
    if (history.length > GAME_CONFIG.slimeStamp.maxVisualStampsPerPlanet) {
      history.shift();
    }
    this.stampHistory.set(stamp.planetId, history);

    const rt = this.renderTargets.get(stamp.planetId);
    if (!rt) return true;

    this.enqueueStampSplats(stamp, performance.now());
    return true;
  }

  update(nowMs: number): void {
    if (this.activeSplats.length === 0) return;

    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;

    const activePlanetIds = new Set<string>();
    const bloomMs = GAME_CONFIG.slimeStamp.splatBloomFrames * FRAME_MS;

    for (let i = this.activeSplats.length - 1; i >= 0; i--) {
      const splat = this.activeSplats[i]!;
      const progress = this.getBloomProgress(splat, nowMs, bloomMs);
      activePlanetIds.add(splat.planetId);
      if (progress < 1) continue;

      const permanentRenderTarget = this.permanentRenderTargets.get(splat.planetId);
      if (permanentRenderTarget) {
        this.renderSplat(permanentRenderTarget, splat, 1);
      }
      this.activeSplats.splice(i, 1);
    }

    for (const planetId of activePlanetIds) {
      const visibleRenderTarget = this.renderTargets.get(planetId);
      const permanentRenderTarget = this.permanentRenderTargets.get(planetId);
      if (!visibleRenderTarget || !permanentRenderTarget) continue;

      this.copyRenderTarget(permanentRenderTarget, visibleRenderTarget);

      for (const splat of this.activeSplats) {
        if (splat.planetId !== planetId) continue;
        if (nowMs < splat.startMs + splat.delayMs) continue;
        const progress = this.getBloomProgress(splat, nowMs, bloomMs);
        this.renderSplat(visibleRenderTarget, splat, progress);
      }
    }

    this.brushMesh.material = this.brushMaterial;

    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.autoClear = currentAutoClear;
  }

  clear(): void {
    this.seenStamps.clear();
    this.stampHistory.clear();
    this.activeSplats.length = 0;
    const currentRenderTarget = this.renderer.getRenderTarget();
    const savedColor = new THREE.Color();
    this.renderer.getClearColor(savedColor);
    const savedAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    for (const rt of this.renderTargets.values()) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
    }
    for (const rt of this.permanentRenderTargets.values()) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
    }
    this.renderer.setClearColor(savedColor, savedAlpha);
    this.renderer.setRenderTarget(currentRenderTarget);
  }

  private createSlimeRenderTarget(): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(
      GAME_CONFIG.slimeStamp.maskResolution,
      GAME_CONFIG.slimeStamp.maskResolution,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
      },
    );
  }

  private enqueueStampSplats(stamp: SlimeStampMessage, startMs: number): void {
    const rng = createSeededRandom(`${stamp.planetId}:${stamp.seq}`);
    const normal = new THREE.Vector3(stamp.nx, stamp.ny, stamp.nz).normalize();
    const radius = stamp.radius * GAME_CONFIG.slimeStamp.projectileStampRadiusMultiplier;
    const tangentA = this.getStableTangent(normal);
    const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
    const impactDirection = this.getTangentDirection(tangentA, tangentB, rng() * TAU);

    const mainSplat = {
      planetId: stamp.planetId,
      color: stamp.color,
      patternId: stamp.patternId,
      normal,
      radius,
      startMs,
      delayMs: 0,
      edgeNoiseOffset: this.createEdgeNoiseOffset(rng),
    };
    this.enqueueOrSettleSplat(mainSplat);

    const dropletCount = randomInt(
      rng,
      GAME_CONFIG.slimeStamp.secondaryDropletMinCount,
      GAME_CONFIG.slimeStamp.secondaryDropletMaxCount,
    );
    for (let i = 0; i < dropletCount; i++) {
      const angle = (rng() - 0.5) * Math.PI;
      const sideDirection = this.getTangentDirection(tangentA, tangentB, angle);
      const direction = impactDirection
        .clone()
        .multiplyScalar(0.55 + rng() * 0.45)
        .add(sideDirection.multiplyScalar((rng() - 0.5) * 0.7))
        .normalize();
      const distance =
        Math.sqrt(rng()) * radius * GAME_CONFIG.slimeStamp.secondaryDropletSpreadRadiusMultiplier;
      const dropletNormal = normal.clone().add(direction.multiplyScalar(distance)).normalize();
      const dropletRadius =
        radius *
        lerp(
          GAME_CONFIG.slimeStamp.secondaryDropletMinRadiusMultiplier,
          GAME_CONFIG.slimeStamp.secondaryDropletMaxRadiusMultiplier,
          rng(),
        );

      const dropletSplat = {
        planetId: stamp.planetId,
        color: stamp.color,
        patternId: stamp.patternId,
        normal: dropletNormal,
        radius: dropletRadius,
        startMs,
        delayMs:
          randomInt(rng, 0, GAME_CONFIG.slimeStamp.secondaryDropletMaxDelayFrames) * FRAME_MS,
        edgeNoiseOffset: this.createEdgeNoiseOffset(rng),
      };
      if (i < GAME_CONFIG.slimeStamp.secondaryDropletMaxAnimatedPerStamp) {
        this.enqueueOrSettleSplat(dropletSplat);
      } else {
        this.settleSplatImmediately(dropletSplat);
      }
    }
  }

  private enqueueOrSettleSplat(splat: AnimatedSplat): void {
    if (this.activeSplats.length >= GAME_CONFIG.slimeStamp.maxActiveAnimatedSplats) {
      this.settleSplatImmediately(splat);
      return;
    }
    this.activeSplats.push(splat);
  }

  private settleSplatImmediately(splat: AnimatedSplat): void {
    const permanentRenderTarget = this.permanentRenderTargets.get(splat.planetId);
    const visibleRenderTarget = this.renderTargets.get(splat.planetId);
    if (!permanentRenderTarget || !visibleRenderTarget) return;

    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;

    this.renderSplat(permanentRenderTarget, splat, 1);
    this.renderSplat(visibleRenderTarget, splat, 1);

    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.autoClear = currentAutoClear;
  }

  private copyRenderTarget(
    source: THREE.WebGLRenderTarget,
    destination: THREE.WebGLRenderTarget,
  ): void {
    this.brushMesh.material = this.copyMaterial;
    this.copyMaterial.uniforms.sourceTexture.value = source.texture;
    this.renderer.setRenderTarget(destination);
    this.renderer.clear();
    this.renderer.render(this.brushScene, this.brushCamera);
  }

  private renderSplat(
    renderTarget: THREE.WebGLRenderTarget,
    splat: AnimatedSplat,
    bloomProgress: number,
  ): void {
    this.brushMesh.material = this.brushMaterial;
    this.brushMaterial.uniforms.brushColor.value.set(splat.color);
    this.brushMaterial.uniforms.patternId.value = splat.patternId;
    this.brushMaterial.uniforms.stampNormal.value.copy(splat.normal);
    this.brushMaterial.uniforms.stampRadius.value = splat.radius;
    this.brushMaterial.uniforms.bloomProgress.value = bloomProgress;
    this.brushMaterial.uniforms.edgeNoiseOffset.value.copy(splat.edgeNoiseOffset);

    const heightMap = this.planetHeightMaps.get(splat.planetId);
    if (heightMap) {
      this.brushMaterial.uniforms.heightMap.value = heightMap.texture;
      this.brushMaterial.uniforms.occlusionEnabled.value = true;
      this.brushMaterial.uniforms.occlusionTolerance.value = heightMap.tolerance;
    } else {
      // No heightmap registered yet — fall back to the chord-only behaviour.
      this.brushMaterial.uniforms.heightMap.value = this.placeholderHeightMap;
      this.brushMaterial.uniforms.occlusionEnabled.value = false;
      this.brushMaterial.uniforms.occlusionTolerance.value = 0;
    }

    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.brushScene, this.brushCamera);
  }

  private getBloomProgress(splat: AnimatedSplat, nowMs: number, bloomMs: number): number {
    return Math.max(0, Math.min(1, (nowMs - splat.startMs - splat.delayMs) / bloomMs));
  }

  private getStableTangent(normal: THREE.Vector3): THREE.Vector3 {
    const axis = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3().crossVectors(axis, normal).normalize();
  }

  private getTangentDirection(
    tangentA: THREE.Vector3,
    tangentB: THREE.Vector3,
    angle: number,
  ): THREE.Vector3 {
    return tangentA
      .clone()
      .multiplyScalar(Math.cos(angle))
      .add(tangentB.clone().multiplyScalar(Math.sin(angle)))
      .normalize();
  }

  private createEdgeNoiseOffset(rng: () => number): THREE.Vector3 {
    return new THREE.Vector3(rng() * 64, rng() * 64, rng() * 64);
  }
}

function createSeededRandom(key: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < key.length; i++) {
    seed ^= key.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(lerp(min, max + 1, rng()));
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}
