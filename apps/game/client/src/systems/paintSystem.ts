import * as THREE from "three";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import type { PaintStampMessage } from "@splat/protocol/network/serverMessages.ts";
import { stampVertexShader, stampFragmentShader } from "../shaders/stampShader.ts";

export class PaintSystem {
  private readonly renderTargets = new Map<string, THREE.WebGLRenderTarget>();
  private readonly brushScene = new THREE.Scene();
  private readonly brushCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly brushMesh: THREE.Mesh;
  private readonly brushMaterial: THREE.ShaderMaterial;
  private readonly seenStamps = new Set<string>();

  private readonly stampHistory = new Map<string, PaintStampMessage[]>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.brushMaterial = new THREE.ShaderMaterial({
      uniforms: {
        brushColor: { value: new THREE.Color(0xffffff) },
        patternId: { value: 0 },
        stampNormal: { value: new THREE.Vector3(0, 1, 0) },
        stampRadius: { value: 0.1 },
        brushSoftness: { value: GAME_CONFIG.paint.brushSoftness },
        edgeNoiseScale: { value: GAME_CONFIG.paint.edgeNoiseScale },
        edgeNoiseStrength: { value: GAME_CONFIG.paint.edgeNoiseStrength },
      },
      vertexShader: stampVertexShader,
      fragmentShader: stampFragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.brushMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.brushMaterial);
    this.brushScene.add(this.brushMesh);

    for (const p of PLANET_POSITIONS) {
      const rt = new THREE.WebGLRenderTarget(
        GAME_CONFIG.paint.maskResolution,
        GAME_CONFIG.paint.maskResolution,
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          wrapS: THREE.RepeatWrapping,
          wrapT: THREE.ClampToEdgeWrapping,
        },
      );
      this.renderTargets.set(p.id, rt);
    }
  }

  getRenderTarget(planetId: string): THREE.WebGLRenderTarget | undefined {
    return this.renderTargets.get(planetId);
  }

  getStampHistory(planetId: string): readonly PaintStampMessage[] {
    return this.stampHistory.get(planetId) ?? [];
  }

  addStamp(stamp: PaintStampMessage): void {
    const stampKey = `${stamp.planetId}:${stamp.seq}`;
    if (this.seenStamps.has(stampKey)) return;
    this.seenStamps.add(stampKey);

    const history = this.stampHistory.get(stamp.planetId) ?? [];
    history.push(stamp);
    if (history.length > GAME_CONFIG.paint.maxVisualStampsPerPlanet) {
      history.shift();
    }
    this.stampHistory.set(stamp.planetId, history);

    const rt = this.renderTargets.get(stamp.planetId);
    if (!rt) return;

    this.brushMaterial.uniforms.brushColor.value.set(stamp.color);
    this.brushMaterial.uniforms.patternId.value = stamp.patternId;
    this.brushMaterial.uniforms.stampNormal.value.set(stamp.nx, stamp.ny, stamp.nz);
    // Radius adjusted for visual presence
    this.brushMaterial.uniforms.stampRadius.value =
      stamp.radius * GAME_CONFIG.paint.projectileStampRadiusMultiplier;

    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentAutoClear = this.renderer.autoClear;
    this.renderer.setRenderTarget(rt);
    this.renderer.autoClear = false;

    this.renderer.render(this.brushScene, this.brushCamera);

    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.autoClear = currentAutoClear;
  }

  clear(): void {
    this.seenStamps.clear();
    this.stampHistory.clear();
    const currentRenderTarget = this.renderer.getRenderTarget();
    const savedColor = new THREE.Color();
    this.renderer.getClearColor(savedColor);
    const savedAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    for (const rt of this.renderTargets.values()) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
    }
    this.renderer.setClearColor(savedColor, savedAlpha);
    this.renderer.setRenderTarget(currentRenderTarget);
  }
}
