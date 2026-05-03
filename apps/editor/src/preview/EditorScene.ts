import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import {
  getTerrainHeight,
  getTerrainRadius,
  type TerrainSurfaceProvider,
} from "@splat/simulation/terrain/planetTerrain.ts";
import { createAtmosphereMaterial } from "@splat/client-runtime/materials/atmosphereMaterial.ts";
import { createOutlineMaterial } from "@splat/client-runtime/materials/outlineMaterial.ts";
import { buildPlanetGeometry, buildWaterGeometry } from "../rendering/planetGeometry.ts";
import { createPlanetMaterial } from "@splat/client-runtime/materials/planetMaterial.ts";
import { createWaterMaterial } from "@splat/client-runtime/materials/waterMaterial.ts";
import { createMetricGroup } from "../performance/geometryStats.ts";
import { BrushTool } from "../tools/brush/BrushTool.ts";
import { PropPaintTool } from "../tools/props/PropPaintTool.ts";
import { TrackTool } from "../tools/tracks/TrackTool.ts";
import { TrackPreviewVisuals } from "../tools/tracks/TrackPreviewVisuals.ts";
import {
  buildTrackCarveSamples,
  buildTrackSurfaceSamples,
  getTrackCarvedRadius,
  getTrackRaisedRadius,
  type TrackCarveSample,
  type TrackSurfaceSample,
} from "../tools/tracks/trackCarving.ts";
import type { TrackState, TrackToolState } from "../tools/tracks/TrackTypes.ts";
import { primaryTerrainConfig } from "../types.ts";
import type {
  BrushState,
  EditorConfig,
  PerformanceStats,
  PreviewSpawnState,
  PropBrushState,
} from "../types.ts";
import { PlayerPreviewController } from "./PlayerPreviewController.ts";

function hexToVec3(hex: number): THREE.Vector3 {
  return new THREE.Vector3(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  );
}

export class EditorScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly planetMaterial: THREE.ShaderMaterial;
  private readonly outlineMaterial: THREE.ShaderMaterial;
  private waterMaterial: THREE.ShaderMaterial | null = null;
  private atmosphereMaterial: THREE.ShaderMaterial | null = null;
  private readonly planetMeshes: THREE.Mesh[];
  private waterMesh: THREE.Mesh | null = null;
  private atmosphereMesh: THREE.Mesh | null = null;
  private animFrameId = 0;
  private lastPerformanceEmit = Number.NEGATIVE_INFINITY;
  private lastPerformanceSignature = "";

  private currentConfig: EditorConfig;
  private readonly brushTool: BrushTool;
  private readonly propPaintTool: PropPaintTool;
  private readonly trackTool: TrackTool;
  private readonly trackPreviewVisuals: TrackPreviewVisuals;
  private readonly baseTerrainProvider: TerrainSurfaceProvider;
  private readonly previewTerrainProvider: TerrainSurfaceProvider;
  private readonly playerPreview: PlayerPreviewController;
  private readonly spawnMarker = new THREE.Group();
  private readonly spawnMarkerMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    depthTest: false,
  });
  private readonly spawnMarkerAccentMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    depthTest: false,
  });
  private readonly spawnRaycaster = new THREE.Raycaster();
  private tracks: TrackState[];
  private trackCarveSamples: TrackCarveSample[] = [];
  private trackSurfaceSamples: TrackSurfaceSample[] = [];
  private previewSpawn: PreviewSpawnState;
  private spawnPlacementActive = false;
  private isSpaceHeld = false;
  private isPreviewActive = false;
  private lastFrameTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    config: EditorConfig,
    tracks: TrackState[],
    previewSpawn: PreviewSpawnState,
    onTrackChange: (track: TrackState) => void,
    onTrackPointSelectionChange: (pointId: string | null) => void,
    private readonly onPreviewSpawnChange: (spawn: PreviewSpawnState) => void,
    private readonly onPerformanceStats: (stats: PerformanceStats) => void,
  ) {
    this.canvas = canvas;
    this.currentConfig = config;
    this.tracks = tracks;
    this.previewSpawn = previewSpawn;

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
    this.baseTerrainProvider = {
      getHeight: (nx, ny, nz, cfg) => getTerrainHeight(nx, ny, nz, cfg),
      getRadius: (nx, ny, nz, cfg) => getTerrainRadius(nx, ny, nz, cfg),
    };
    this.previewTerrainProvider = {
      getHeight: (nx, ny, nz, cfg) =>
        this.getPreviewTerrainRadius(nx, ny, nz, cfg) - cfg.planet.radius,
      getRadius: (nx, ny, nz, cfg) => this.getPreviewTerrainRadius(nx, ny, nz, cfg),
    };
    this.playerPreview = new PlayerPreviewController(
      canvas,
      this.scene,
      this.camera,
      config,
      this.previewTerrainProvider,
    );
    this.trackPreviewVisuals = new TrackPreviewVisuals(
      this.scene,
      config,
      tracks,
      (nx, ny, nz) =>
        getTerrainRadius(nx, ny, nz, primaryTerrainConfig(this.currentConfig)) +
        this.brushTool.getDisplacementAtNormal(nx, ny, nz),
    );

    const terrainCfg = primaryTerrainConfig(config);
    const waterRadius = terrainCfg.planet.radius + config.terrain.waterLevel;
    const atmosphereRadius = terrainCfg.planet.radius + GAME_CONFIG.shaders.atmosphere.height;

    this.rebuildTrackCarveSamples();
    const planetGeo = buildPlanetGeometry(
      terrainCfg,
      config.terrain.icosahedronDetail,
      this.brushTool.getDisplacements(),
    );
    this.planetMaterial = createPlanetMaterial({
      paintMask: null,
      planetCenter: new THREE.Vector3(0, 0, 0),
      waterRadius,
    });

    this.outlineMaterial = createOutlineMaterial();
    const terrainMesh = new THREE.Mesh(planetGeo, this.planetMaterial);
    const outlineMesh = new THREE.Mesh(planetGeo, this.outlineMaterial);
    this.planetMeshes = [terrainMesh, outlineMesh];
    this.scene.add(terrainMesh, outlineMesh);
    this.createSpawnMarker();
    this.updateSpawnMarker();

    if (GAME_CONFIG.shaders.atmosphere.enabled) {
      this.atmosphereMaterial = createAtmosphereMaterial();
      this.atmosphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(atmosphereRadius, 48, 48),
        this.atmosphereMaterial,
      );
      this.atmosphereMesh.renderOrder = 2;
      this.scene.add(this.atmosphereMesh);
    }

    if (GAME_CONFIG.shaders.water.enabled) {
      this.waterMaterial = createWaterMaterial();
      this.waterMesh = new THREE.Mesh(
        buildWaterGeometry(waterRadius, terrainCfg),
        this.waterMaterial,
      );
      this.waterMesh.renderOrder = 1;
      this.scene.add(this.waterMesh);
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("pointerdown", this.onSpawnPointerDown, true);

    // Phase 2: connect brush tool now that the scene and meshes exist
    this.brushTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMeshes: this.planetMeshes,
      onStrokeEnd: () => this.rebuildPlanetMeshes(),
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
    });
    this.propPaintTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
    });
    this.trackTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
      onTrackChange,
      onPointSelectionChange: onTrackPointSelectionChange,
      onGizmoDragChange: (dragging) => {
        this.controls.enabled = !dragging;
      },
      config,
      terrainProvider: this.baseTerrainProvider,
    });

    this.updateUniforms(config);
    this.playerPreview.setSpawn(previewSpawn);
    this.start();
  }

  setBrushState(state: BrushState | null): void {
    if (this.isPreviewActive && state) return;
    this.brushTool.setBrushState(state);
  }

  setPropBrushState(state: PropBrushState | null): void {
    if (this.isPreviewActive && state) return;
    this.propPaintTool.setBrushState(state);
  }

  setTrackToolState(state: TrackToolState | null): void {
    if (this.isPreviewActive) return;
    this.trackTool.setTrackToolState(state);
  }

  setSpawnPlacementActive(active: boolean): void {
    this.spawnPlacementActive = active && !this.isPreviewActive;
    if (this.spawnPlacementActive) {
      this.brushTool.setBrushState(null);
      this.propPaintTool.setBrushState(null);
      this.trackTool.setTrackToolState(null);
      this.canvas.style.cursor = "crosshair";
    } else if (!this.isPreviewActive) {
      this.canvas.style.cursor = "";
    }
  }

  setPreviewSpawn(spawn: PreviewSpawnState): void {
    this.previewSpawn = spawn;
    this.playerPreview.setSpawn(spawn);
    this.updateSpawnMarker();
  }

  setTracks(tracks: TrackState[]): void {
    this.tracks = tracks;
    this.rebuildTrackCarveSamples();
    this.trackPreviewVisuals.setTracks(tracks);
    this.playerPreview.setConfig(this.currentConfig);
  }

  setPreviewActive(active: boolean): void {
    if (this.isPreviewActive === active) return;
    this.isPreviewActive = active;
    this.controls.enabled = !active;
    this.setSpawnPlacementActive(false);
    this.brushTool.setBrushState(null);
    this.propPaintTool.setBrushState(null);
    if (active) this.trackTool.setTrackToolState(null);
    this.trackPreviewVisuals.setActive(active);
    this.playerPreview.setActive(active);
  }

  rebuildPlanet(config: EditorConfig): void {
    this.currentConfig = config;
    this.brushTool.syncDetail(config);
    this.playerPreview.setConfig(config);
    this.rebuildPlanetMeshes();
    this.trackPreviewVisuals.setConfig(config);
    this.rebuildWater(config);
    this.updateUniforms(config);
  }

  rebuildWater(config: EditorConfig): void {
    if (!this.waterMesh) return;
    this.rebuildTrackCarveSamples();
    const terrainCfg = primaryTerrainConfig(config);
    const waterRadius = terrainCfg.planet.radius + config.terrain.waterLevel;
    const newGeo = buildWaterGeometry(waterRadius, terrainCfg);
    this.waterMesh.geometry.dispose();
    this.waterMesh.geometry = newGeo;
  }

  updateUniforms(config: EditorConfig): void {
    this.currentConfig = config;
    this.playerPreview.setConfig(config);
    const u = this.planetMaterial.uniforms;
    const waterRadius = (config.planets[0]?.radius ?? 100) + config.terrain.waterLevel;

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

    this.updateSpawnMarker();
  }

  resetCamera(): void {
    this.camera.position.set(0, 40, 230);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  getPerformanceStats(): PerformanceStats {
    const groups = [
      createMetricGroup(
        "planet",
        "Planet Terrain",
        this.planetMeshes,
        "Terrain shader and outline pass both render the planet geometry",
      ),
      createMetricGroup("water", "Water", [this.waterMesh], "Animated transparent shader pass"),
      createMetricGroup(
        "atmosphere",
        "Atmosphere",
        [this.atmosphereMesh],
        "Transparent fresnel shell around the planet",
      ),
      ...this.propPaintTool.getPerformanceStats(),
      ...this.trackTool.getPerformanceStats(),
    ];

    const materialStats = this.getMaterialStats();
    const rendererInfo = this.renderer.info;
    return {
      updatedAt: performance.now(),
      totals: {
        triangles: rendererInfo.render.triangles,
        drawCalls: rendererInfo.render.calls,
        meshes: materialStats.meshes,
        instancedMeshes: materialStats.instancedMeshes,
        instances: groups.reduce((sum, group) => sum + (group.instances ?? 0), 0),
        shaderMaterials: materialStats.shaderMaterials,
        transparentObjects: materialStats.transparentObjects,
        geometries: rendererInfo.memory.geometries,
        textures: rendererInfo.memory.textures,
      },
      groups,
    };
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.controls.dispose();
    this.brushTool.dispose();
    this.propPaintTool.dispose();
    this.trackTool.dispose();
    this.trackPreviewVisuals.dispose();
    this.playerPreview.dispose();
    this.disposeSpawnMarker();
    this.disposeEditorSceneResources();
    this.renderer.dispose();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onSpawnPointerDown, true);
  }

  private rebuildPlanetMeshes(): void {
    this.rebuildTrackCarveSamples();
    const cfg = primaryTerrainConfig(this.currentConfig);
    const newGeo = buildPlanetGeometry(
      cfg,
      this.currentConfig.terrain.icosahedronDetail,
      this.brushTool.getDisplacements(),
    );
    const oldGeometries = new Set(this.planetMeshes.map((mesh) => mesh.geometry));
    for (const mesh of this.planetMeshes) {
      mesh.geometry = newGeo;
    }
    oldGeometries.forEach((geometry) => geometry.dispose());
    this.trackPreviewVisuals.setConfig(this.currentConfig);
    this.trackTool.syncSurface();
  }

  private rebuildTrackCarveSamples(): void {
    const getRadiusAtNormal = (nx: number, ny: number, nz: number) =>
      getTerrainRadius(nx, ny, nz, primaryTerrainConfig(this.currentConfig)) +
      this.brushTool.getDisplacementAtNormal(nx, ny, nz);
    this.trackCarveSamples = buildTrackCarveSamples(
      this.tracks,
      this.currentConfig,
      getRadiusAtNormal,
    );
    this.trackSurfaceSamples = buildTrackSurfaceSamples(
      this.tracks,
      this.currentConfig,
      getRadiusAtNormal,
    );
  }

  private getPreviewTerrainRadius(
    nx: number,
    ny: number,
    nz: number,
    config: Parameters<TerrainSurfaceProvider["getRadius"]>[3],
  ): number {
    const baseRadius =
      getTerrainRadius(nx, ny, nz, config) + this.brushTool.getDisplacementAtNormal(nx, ny, nz);
    const carvedRadius = getTrackCarvedRadius(nx, ny, nz, baseRadius, this.trackCarveSamples);
    // Track ribbons are playable floors. Apply them after tunnel carving so tunnel
    // entrances stay hollow around the track without dropping the player to water.
    return getTrackRaisedRadius(nx, ny, nz, carvedRadius, this.trackSurfaceSamples);
  }

  private createSpawnMarker(): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.12, 8, 32),
      this.spawnMarkerMaterial,
    );
    ring.renderOrder = 20;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 2.2, 16),
      this.spawnMarkerAccentMaterial,
    );
    arrow.position.y = 2.2;
    arrow.renderOrder = 21;
    this.spawnMarker.add(ring, arrow);
    this.scene.add(this.spawnMarker);
  }

  private updateSpawnMarker(): void {
    const normal = new THREE.Vector3(...this.previewSpawn.normal);
    if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
    normal.normalize();
    const radius = this.previewTerrainProvider.getRadius(
      normal.x,
      normal.y,
      normal.z,
      primaryTerrainConfig(this.currentConfig),
      "planet-0",
    );
    this.spawnMarker.position.copy(normal).multiplyScalar(radius + 1.3);
    this.spawnMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  }

  private disposeSpawnMarker(): void {
    this.scene.remove(this.spawnMarker);
    this.spawnMarker.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.spawnMarkerMaterial.dispose();
    this.spawnMarkerAccentMaterial.dispose();
  }

  private getMaterialStats(): {
    meshes: number;
    instancedMeshes: number;
    shaderMaterials: number;
    transparentObjects: number;
  } {
    let meshes = 0;
    let instancedMeshes = 0;
    let shaderMaterials = 0;
    let transparentObjects = 0;

    this.scene.traverse((object) => {
      if (!object.visible || !(object instanceof THREE.Mesh)) return;
      meshes++;
      if (object instanceof THREE.InstancedMesh) instancedMeshes++;

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material instanceof THREE.ShaderMaterial)) shaderMaterials++;
      if (materials.some((material) => material.transparent)) transparentObjects++;
    });

    return { meshes, instancedMeshes, shaderMaterials, transparentObjects };
  }

  private emitPerformanceStats(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastPerformanceEmit < 500) return;

    const stats = this.getPerformanceStats();
    const signature = JSON.stringify({
      totals: stats.totals,
      groups: stats.groups.map(({ id, triangles, drawCalls, meshes, instances }) => ({
        id,
        triangles,
        drawCalls,
        meshes,
        instances,
      })),
    });
    if (!force && signature === this.lastPerformanceSignature) return;

    this.lastPerformanceEmit = now;
    this.lastPerformanceSignature = signature;
    this.onPerformanceStats(stats);
  }

  private disposeEditorSceneResources(): void {
    const planetGeometries = new Set(this.planetMeshes.map((mesh) => mesh.geometry));
    planetGeometries.forEach((geometry) => geometry.dispose());
    this.planetMaterial.dispose();
    this.outlineMaterial.dispose();

    if (this.waterMesh) this.waterMesh.geometry.dispose();
    this.waterMaterial?.dispose();

    if (this.atmosphereMesh) this.atmosphereMesh.geometry.dispose();
    this.atmosphereMaterial?.dispose();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.isSpaceHeld = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.isSpaceHeld = false;
  };

  private readonly onSpawnPointerDown = (e: PointerEvent): void => {
    if (!this.spawnPlacementActive || this.isPreviewActive || e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.spawnRaycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = this.spawnRaycaster.intersectObject(this.planetMeshes[0])[0];
    if (!hit) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    const normal = hit.point.clone().normalize();
    const spawn: PreviewSpawnState = { normal: [normal.x, normal.y, normal.z] };
    this.setPreviewSpawn(spawn);
    this.onPreviewSpawnChange(spawn);
  };

  private start(): void {
    const tick = (): void => {
      this.animFrameId = requestAnimationFrame(tick);
      const t = performance.now() / 1000;
      const now = performance.now();
      const dt = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60;
      this.lastFrameTime = now;
      this.planetMaterial.uniforms.time.value = t;
      if (this.waterMaterial) this.waterMaterial.uniforms.time.value = t;
      if (this.isPreviewActive) {
        this.playerPreview.update(dt);
      } else {
        this.controls.update();
      }
      this.renderer.render(this.scene, this.camera);
      this.emitPerformanceStats();
    };
    tick();
  }
}
