import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { createAtmosphereMaterial } from "../rendering/atmosphereMaterial.ts";
import { createOutlineMaterial } from "../rendering/outlineMaterial.ts";
import { buildPlanetGeometry, buildWaterGeometry } from "../rendering/planetGeometry.ts";
import { createPlanetMaterial } from "../rendering/planetMaterial.ts";
import { createWaterMaterial } from "../rendering/waterMaterial.ts";
import { BrushTool } from "../tools/brush/BrushTool.ts";
import { PropPaintTool } from "../tools/props/PropPaintTool.ts";
import { TrackTool } from "../tools/tracks/TrackTool.ts";
import type { TrackState, TrackToolState } from "../tools/tracks/TrackTypes.ts";
import type { BrushState, EditorConfig, PropBrushState } from "../types.ts";

function hexToVec3(hex: number): THREE.Vector3 {
  return new THREE.Vector3(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  );
}

export class EditorScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly planetMaterial: THREE.ShaderMaterial;
  private waterMaterial: THREE.ShaderMaterial | null = null;
  private atmosphereMaterial: THREE.ShaderMaterial | null = null;
  private readonly planetMeshes: THREE.Mesh[];
  private waterMesh: THREE.Mesh | null = null;
  private animFrameId = 0;

  private currentConfig: EditorConfig;
  private readonly brushTool: BrushTool;
  private readonly propPaintTool: PropPaintTool;
  private readonly trackTool: TrackTool;
  private isSpaceHeld = false;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    config: EditorConfig,
    onTrackChange: (track: TrackState) => void,
    onTrackPointSelectionChange: (pointId: string | null) => void,
  ) {
    this.currentConfig = config;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080818);
    this.scene.fog = new THREE.Fog(0x080818, 400, 1200);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(200, 300, 100);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
    this.camera.position.set(0, 40, 230);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 115;
    this.controls.maxDistance = 600;
    this.controls.target.set(0, 0, 0);

    // Phase 1: init sculpt data before planet build
    this.brushTool = new BrushTool(config);
    this.propPaintTool = new PropPaintTool();
    this.trackTool = new TrackTool();

    const waterRadius = config.planet.radius + config.terrain.waterLevel;
    const atmosphereRadius = config.planet.radius + GAME_CONFIG.shaders.atmosphere.height;

    const planetGeo = buildPlanetGeometry(config, this.brushTool.getDisplacements());
    this.planetMaterial = createPlanetMaterial({
      paintMask: null,
      planetCenter: new THREE.Vector3(0, 0, 0),
      waterRadius,
    });

    const outlineMat = createOutlineMaterial();
    const terrainMesh = new THREE.Mesh(planetGeo, this.planetMaterial);
    const outlineMesh = new THREE.Mesh(planetGeo, outlineMat);
    this.planetMeshes = [terrainMesh, outlineMesh];
    this.scene.add(terrainMesh, outlineMesh);

    if (GAME_CONFIG.shaders.atmosphere.enabled) {
      this.atmosphereMaterial = createAtmosphereMaterial();
      const atmoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(atmosphereRadius, 48, 48),
        this.atmosphereMaterial,
      );
      atmoMesh.renderOrder = 2;
      this.scene.add(atmoMesh);
    }

    if (GAME_CONFIG.shaders.water.enabled) {
      this.waterMaterial = createWaterMaterial();
      this.waterMesh = new THREE.Mesh(buildWaterGeometry(waterRadius, config), this.waterMaterial);
      this.waterMesh.renderOrder = 1;
      this.scene.add(this.waterMesh);
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // Phase 2: connect brush tool now that the scene and meshes exist
    this.brushTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMeshes: this.planetMeshes,
      onStrokeEnd: () => this.rebuildPlanetMeshes(),
      shouldOrbit: () => this.isSpaceHeld,
    });
    this.propPaintTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: terrainMesh,
      shouldOrbit: () => this.isSpaceHeld,
    });
    this.trackTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: terrainMesh,
      shouldOrbit: () => this.isSpaceHeld,
      onTrackChange,
      onPointSelectionChange: onTrackPointSelectionChange,
    });

    this.updateUniforms(config);
    this.start();
  }

  setBrushState(state: BrushState | null): void {
    this.brushTool.setBrushState(state);
  }

  setPropBrushState(state: PropBrushState | null): void {
    this.propPaintTool.setBrushState(state);
  }

  setTrackToolState(state: TrackToolState | null): void {
    this.trackTool.setTrackToolState(state);
  }

  rebuildPlanet(config: EditorConfig): void {
    this.currentConfig = config;
    this.brushTool.syncDetail(config);
    this.rebuildPlanetMeshes();
    this.rebuildWater(config);
    this.updateUniforms(config);
  }

  rebuildWater(config: EditorConfig): void {
    if (!this.waterMesh) return;
    const waterRadius = config.planet.radius + config.terrain.waterLevel;
    const newGeo = buildWaterGeometry(waterRadius, config);
    this.waterMesh.geometry.dispose();
    this.waterMesh.geometry = newGeo;
  }

  updateUniforms(config: EditorConfig): void {
    this.currentConfig = config;
    const u = this.planetMaterial.uniforms;
    const waterRadius = config.planet.radius + config.terrain.waterLevel;

    u.waterLevel.value = config.terrain.waterLevel;
    u.sandBand.value = config.terrain.sandBand;
    u.rockLevel.value = config.terrain.rockLevel;
    u.snowLevel.value = config.terrain.snowLevel;
    u.waterRadius.value = waterRadius;

    u.sandColor.value = new THREE.Color(config.colors.sand);
    u.grassColor.value = new THREE.Color(config.colors.grass);
    u.rockColor.value = new THREE.Color(config.colors.rock);
    u.snowColor.value = new THREE.Color(config.colors.snow);
    u.waterDeepColor.value = hexToVec3(config.colors.waterDeep);

    u.celBands.value = config.shaders.cel.bands;
    u.celSoftness.value = config.shaders.cel.softness;
    u.celHatchStrength.value = config.shaders.cel.hatchStrength;
    u.celHatchScale.value = config.shaders.cel.hatchScale;

    if (this.waterMaterial) {
      this.waterMaterial.uniforms.celBands.value = config.shaders.cel.bands;
      this.waterMaterial.uniforms.celSoftness.value = config.shaders.cel.softness;
      this.waterMaterial.uniforms.celHatchStrength.value = config.shaders.cel.hatchStrength;
      this.waterMaterial.uniforms.celHatchScale.value = config.shaders.cel.hatchScale;
    }

    const { lighting } = config.shaders;
    const azRad = (lighting.sunAzimuth * Math.PI) / 180;
    const elRad = (lighting.sunElevation * Math.PI) / 180;
    u.sunDirection.value = new THREE.Vector3(
      Math.cos(elRad) * Math.sin(azRad),
      Math.sin(elRad),
      Math.cos(elRad) * Math.cos(azRad),
    );
    u.sunIntensity.value = lighting.sunIntensity;
    u.ambientIntensity.value = lighting.ambientIntensity;
    u.rimColor.value = new THREE.Color(lighting.rimColor);
    u.rimStrength.value = lighting.rimStrength;
    u.rimPower.value = lighting.rimPower;

    if (this.atmosphereMaterial) {
      const au = this.atmosphereMaterial.uniforms;
      au.atmosphereColor.value = new THREE.Color(config.shaders.atmosphere.color);
      au.intensity.value = config.shaders.atmosphere.intensity;
      au.opacity.value = config.shaders.atmosphere.opacity;
      au.fresnelPower.value = config.shaders.atmosphere.fresnelPower;
      au.falloffPower.value = config.shaders.atmosphere.falloffPower;
    }
  }

  resetCamera(): void {
    this.camera.position.set(0, 40, 230);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.controls.dispose();
    this.renderer.dispose();
    this.brushTool.dispose();
    this.propPaintTool.dispose();
    this.trackTool.dispose();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private rebuildPlanetMeshes(): void {
    const newGeo = buildPlanetGeometry(this.currentConfig, this.brushTool.getDisplacements());
    for (const mesh of this.planetMeshes) {
      mesh.geometry.dispose();
      mesh.geometry = newGeo;
    }
    this.trackTool.syncSurface();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.isSpaceHeld = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.isSpaceHeld = false;
  };

  private start(): void {
    const tick = (): void => {
      this.animFrameId = requestAnimationFrame(tick);
      const t = performance.now() / 1000;
      this.planetMaterial.uniforms.time.value = t;
      if (this.waterMaterial) this.waterMaterial.uniforms.time.value = t;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
}
