import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
import type {
  BrushState,
  EditorConfig,
  EditorPlanet,
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

interface PlanetRenderState {
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  outlineMesh: THREE.Mesh;
  waterMesh: THREE.Mesh | null;
  atmosphereMesh: THREE.Mesh | null;
  planetMaterial: THREE.ShaderMaterial;
  waterMaterial: THREE.ShaderMaterial | null;
  atmosphereMaterial: THREE.ShaderMaterial | null;
}

export class EditorScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly outlineMaterial: THREE.ShaderMaterial;
  private readonly planetRenders = new Map<string, PlanetRenderState>();
  private activePlanetId: string;
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
  private readonly selectRaycaster = new THREE.Raycaster();
  private tracks: TrackState[];
  private trackCarveSamples: TrackCarveSample[] = [];
  private trackSurfaceSamples: TrackSurfaceSample[] = [];
  private previewSpawn: PreviewSpawnState;
  private spawnPlacementActive = false;
  private isSpaceHeld = false;
  private isPreviewActive = false;
  private lastFrameTime = 0;
  private hasBrush = false;
  private hasPropBrush = false;
  private hasTrackMode = false;
  private selectionPointerStart: { x: number; y: number } | null = null;

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
    private readonly onPlanetSelected: ((id: string) => void) | null = null,
  ) {
    this.canvas = canvas;
    this.currentConfig = config;
    this.tracks = tracks;
    this.previewSpawn = previewSpawn;
    this.activePlanetId = config.planets[0]!.id;

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

    // Phase 1: init sculpt data and tool instances before planet build
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
    this.trackPreviewVisuals = new TrackPreviewVisuals(this.scene, config, tracks, (nx, ny, nz) => {
      const planet = this.getPlanetById(this.activePlanetId);
      return (
        getTerrainRadius(nx, ny, nz, {
          planet: { radius: planet.radius },
          terrain: planet.terrain,
        }) + this.brushTool.getDisplacementAtNormal(nx, ny, nz)
      );
    });

    this.outlineMaterial = createOutlineMaterial();

    // Build render groups for all planets
    this.syncPlanetRenders(config);
    const activeRender = this.planetRenders.get(this.activePlanetId)!;

    this.createSpawnMarker();
    this.updateSpawnMarker();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("pointerdown", this.onSpawnPointerDown, true);
    canvas.addEventListener("pointerdown", this.onSelectionPointerDown);
    canvas.addEventListener("pointerup", this.onSelectionPointerUp);

    // Phase 2: connect tools to active planet meshes
    this.rebuildTrackCarveSamples();
    this.brushTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMeshes: [activeRender.terrainMesh, activeRender.outlineMesh],
      onStrokeEnd: () => this.rebuildPlanetMeshes(),
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
    });
    this.propPaintTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: activeRender.terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
    });
    this.trackTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: activeRender.terrainMesh,
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
    this.hasBrush = state !== null;
    this.brushTool.setBrushState(state);
  }

  setPropBrushState(state: PropBrushState | null): void {
    if (this.isPreviewActive && state) return;
    this.hasPropBrush = state !== null;
    this.propPaintTool.setBrushState(state);
  }

  setTrackToolState(state: TrackToolState | null): void {
    if (this.isPreviewActive) return;
    this.hasTrackMode = state?.mode != null;
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

  setActivePlanet(id: string, center: { x: number; y: number; z: number }): void {
    if (this.activePlanetId === id) return;
    this.activePlanetId = id;
    const render = this.planetRenders.get(id);
    if (render) {
      this.brushTool.setPlanetMeshes([render.terrainMesh, render.outlineMesh]);
      this.propPaintTool.setPlanetMesh(render.terrainMesh);
      this.trackTool.setPlanetMesh(render.terrainMesh);
      this.brushTool.resetSculptBase(this.getPlanetById(id));
    }
    const prevTarget = this.controls.target.clone();
    const camOffset = this.camera.position.clone().sub(prevTarget);
    const newTarget = new THREE.Vector3(center.x, center.y, center.z);
    this.controls.target.copy(newTarget);
    this.camera.position.copy(newTarget).add(camOffset);
    this.controls.update();
    this.updateSpawnMarker();
  }

  rebuildPlanet(config: EditorConfig): void {
    this.currentConfig = config;
    this.brushTool.syncDetailForPlanet(this.getPlanetById(this.activePlanetId));
    this.playerPreview.setConfig(config);
    this.syncPlanetRenders(config);
    this.rebuildPlanetMeshes();
    this.trackPreviewVisuals.setConfig(config);
    this.rebuildWater(config);
    this.updateUniforms(config);
  }

  rebuildWater(_config: EditorConfig): void {
    const activeRender = this.planetRenders.get(this.activePlanetId);
    if (!activeRender?.waterMesh) return;
    this.rebuildTrackCarveSamples();
    const planet = this.getPlanetById(this.activePlanetId);
    const terrainCfg = { planet: { radius: planet.radius }, terrain: planet.terrain };
    const waterRadius = planet.radius + planet.terrain.waterLevel;
    const newGeo = buildWaterGeometry(waterRadius, terrainCfg);
    activeRender.waterMesh.geometry.dispose();
    activeRender.waterMesh.geometry = newGeo;
  }

  updateUniforms(config: EditorConfig): void {
    this.currentConfig = config;
    this.playerPreview.setConfig(config);
    this.syncPlanetRenders(config);
    for (const planet of config.planets) {
      const render = this.planetRenders.get(planet.id);
      if (render) this.updateUniformsForPlanet(planet, render, config.shaders.cel);
    }
    this.updateSpawnMarker();
  }

  resetCamera(): void {
    const planet = this.getPlanetById(this.activePlanetId);
    const cx = planet.center.x;
    const cy = planet.center.y;
    const cz = planet.center.z;
    this.camera.position.set(cx, cy + 40, cz + 230);
    this.controls.target.set(cx, cy, cz);
    this.controls.update();
  }

  getPerformanceStats(): PerformanceStats {
    const terrainMeshes: (THREE.Mesh | null)[] = [];
    const waterMeshes: (THREE.Mesh | null)[] = [];
    const atmoMeshes: (THREE.Mesh | null)[] = [];
    for (const render of this.planetRenders.values()) {
      terrainMeshes.push(render.terrainMesh, render.outlineMesh);
      waterMeshes.push(render.waterMesh);
      atmoMeshes.push(render.atmosphereMesh);
    }
    const groups = [
      createMetricGroup(
        "planet",
        "Planet Terrain",
        terrainMeshes,
        "Terrain shader and outline pass both render the planet geometry",
      ),
      createMetricGroup("water", "Water", waterMeshes, "Animated transparent shader pass"),
      createMetricGroup(
        "atmosphere",
        "Atmosphere",
        atmoMeshes,
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
    for (const render of this.planetRenders.values()) {
      this.disposePlanetRender(render);
      this.scene.remove(render.group);
    }
    this.planetRenders.clear();
    this.outlineMaterial.dispose();
    this.renderer.dispose();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onSpawnPointerDown, true);
    this.canvas.removeEventListener("pointerdown", this.onSelectionPointerDown);
    this.canvas.removeEventListener("pointerup", this.onSelectionPointerUp);
  }

  private getPlanetById(id: string): EditorPlanet {
    return this.currentConfig.planets.find((p) => p.id === id) ?? this.currentConfig.planets[0]!;
  }

  private buildPlanetRender(planet: EditorPlanet): PlanetRenderState {
    const group = new THREE.Group();
    group.position.set(planet.center.x, planet.center.y, planet.center.z);

    const waterRadius = planet.radius + planet.terrain.waterLevel;
    const atmosphereRadius = planet.radius + planet.atmosphere.height;
    const terrainCfg = { planet: { radius: planet.radius }, terrain: planet.terrain };

    const displacements =
      planet.id === this.activePlanetId ? this.brushTool.getDisplacements() : new Float32Array(0);
    const planetGeo = buildPlanetGeometry(
      terrainCfg,
      planet.terrain.icosahedronDetail,
      displacements,
    );
    const planetMaterial = createPlanetMaterial({
      paintMask: null,
      planetCenter: new THREE.Vector3(0, 0, 0),
      planetRadius: planet.radius,
      waterRadius,
      waterLevel: planet.terrain.waterLevel,
      sandBand: planet.terrain.sandBand,
      snowLevel: planet.terrain.snowLevel,
      rockLevel: planet.terrain.rockLevel,
    });

    const terrainMesh = new THREE.Mesh(planetGeo, planetMaterial);
    const outlineMesh = new THREE.Mesh(planetGeo, this.outlineMaterial);
    group.add(terrainMesh, outlineMesh);

    let waterMesh: THREE.Mesh | null = null;
    let waterMaterial: THREE.ShaderMaterial | null = null;
    if (planet.hasWater) {
      waterMaterial = createWaterMaterial();
      waterMesh = new THREE.Mesh(buildWaterGeometry(waterRadius, terrainCfg), waterMaterial);
      waterMesh.renderOrder = 1;
      group.add(waterMesh);
    }

    let atmosphereMesh: THREE.Mesh | null = null;
    let atmosphereMaterial: THREE.ShaderMaterial | null = null;
    if (planet.atmosphere.enabled) {
      atmosphereMaterial = createAtmosphereMaterial();
      atmosphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(atmosphereRadius, 48, 48),
        atmosphereMaterial,
      );
      atmosphereMesh.renderOrder = 2;
      group.add(atmosphereMesh);
    }

    return {
      group,
      terrainMesh,
      outlineMesh,
      waterMesh,
      atmosphereMesh,
      planetMaterial,
      waterMaterial,
      atmosphereMaterial,
    };
  }

  private disposePlanetRender(render: PlanetRenderState): void {
    render.terrainMesh.geometry.dispose();
    render.planetMaterial.dispose();
    render.waterMesh?.geometry.dispose();
    render.waterMaterial?.dispose();
    render.atmosphereMesh?.geometry.dispose();
    render.atmosphereMaterial?.dispose();
  }

  private syncPlanetRenders(config: EditorConfig): void {
    for (const planet of config.planets) {
      if (!this.planetRenders.has(planet.id)) {
        const render = this.buildPlanetRender(planet);
        this.planetRenders.set(planet.id, render);
        this.scene.add(render.group);
      }
      const render = this.planetRenders.get(planet.id)!;
      render.group.position.set(planet.center.x, planet.center.y, planet.center.z);
    }

    const configIds = new Set(config.planets.map((p) => p.id));
    for (const [id, render] of this.planetRenders) {
      if (!configIds.has(id)) {
        this.disposePlanetRender(render);
        this.scene.remove(render.group);
        this.planetRenders.delete(id);
      }
    }
  }

  private updateUniformsForPlanet(
    planet: EditorPlanet,
    render: PlanetRenderState,
    cel: EditorConfig["shaders"]["cel"],
  ): void {
    const u = render.planetMaterial.uniforms;
    const waterRadius = planet.radius + planet.terrain.waterLevel;

    u.waterLevel.value = planet.terrain.waterLevel;
    u.sandBand.value = planet.terrain.sandBand;
    u.rockLevel.value = planet.terrain.rockLevel;
    u.snowLevel.value = planet.terrain.snowLevel;
    u.waterRadius.value = waterRadius;

    u.sandColor.value = new THREE.Color(planet.colors.sand);
    u.grassColor.value = new THREE.Color(planet.colors.grass);
    u.rockColor.value = new THREE.Color(planet.colors.rock);
    u.snowColor.value = new THREE.Color(planet.colors.snow);
    u.waterDeepColor.value = hexToVec3(planet.colors.waterDeep);

    u.celBands.value = cel.bands;
    u.celSoftness.value = cel.softness;
    u.celHatchStrength.value = cel.hatchStrength;
    u.celHatchScale.value = cel.hatchScale;

    if (render.waterMaterial) {
      render.waterMaterial.uniforms.celBands.value = cel.bands;
      render.waterMaterial.uniforms.celSoftness.value = cel.softness;
      render.waterMaterial.uniforms.celHatchStrength.value = cel.hatchStrength;
      render.waterMaterial.uniforms.celHatchScale.value = cel.hatchScale;
    }

    const { lighting } = planet;
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

    if (render.atmosphereMaterial) {
      const au = render.atmosphereMaterial.uniforms;
      au.atmosphereColor.value = new THREE.Color(planet.atmosphere.color);
      au.intensity.value = planet.atmosphere.intensity;
      au.opacity.value = planet.atmosphere.opacity;
      au.fresnelPower.value = planet.atmosphere.fresnelPower;
      au.falloffPower.value = planet.atmosphere.falloffPower;
    }
  }

  private rebuildPlanetMeshes(): void {
    const activeRender = this.planetRenders.get(this.activePlanetId);
    if (!activeRender) return;
    this.rebuildTrackCarveSamples();
    const planet = this.getPlanetById(this.activePlanetId);
    const cfg = { planet: { radius: planet.radius }, terrain: planet.terrain };
    const newGeo = buildPlanetGeometry(
      cfg,
      planet.terrain.icosahedronDetail,
      this.brushTool.getDisplacements(),
    );
    const oldGeo = activeRender.terrainMesh.geometry;
    activeRender.terrainMesh.geometry = newGeo;
    activeRender.outlineMesh.geometry = newGeo;
    oldGeo.dispose();
    this.trackPreviewVisuals.setConfig(this.currentConfig);
    this.trackTool.syncSurface();
  }

  private rebuildTrackCarveSamples(): void {
    const getRadiusAtNormal = (nx: number, ny: number, nz: number) => {
      const planet = this.getPlanetById(this.activePlanetId);
      return (
        getTerrainRadius(nx, ny, nz, {
          planet: { radius: planet.radius },
          terrain: planet.terrain,
        }) + this.brushTool.getDisplacementAtNormal(nx, ny, nz)
      );
    };
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
    const planet = this.getPlanetById(this.activePlanetId);
    const radius = this.previewTerrainProvider.getRadius(
      normal.x,
      normal.y,
      normal.z,
      { planet: { radius: planet.radius }, terrain: planet.terrain },
      planet.id,
    );
    const center = new THREE.Vector3(planet.center.x, planet.center.y, planet.center.z);
    this.spawnMarker.position.copy(center).addScaledVector(normal, radius + 1.3);
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
    const activeRender = this.planetRenders.get(this.activePlanetId);
    if (!activeRender) return;
    const hit = this.spawnRaycaster.intersectObject(activeRender.terrainMesh)[0];
    if (!hit) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    const planet = this.getPlanetById(this.activePlanetId);
    const center = new THREE.Vector3(planet.center.x, planet.center.y, planet.center.z);
    const normal = hit.point.clone().sub(center).normalize();
    const spawn: PreviewSpawnState = { normal: [normal.x, normal.y, normal.z] };
    this.setPreviewSpawn(spawn);
    this.onPreviewSpawnChange(spawn);
  };

  private readonly onSelectionPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.selectionPointerStart = { x: e.clientX, y: e.clientY };
  };

  private readonly onSelectionPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.selectionPointerStart) return;
    const dx = e.clientX - this.selectionPointerStart.x;
    const dy = e.clientY - this.selectionPointerStart.y;
    this.selectionPointerStart = null;

    if (dx * dx + dy * dy > 25) return; // orbit drag, not a click
    if (!this.onPlanetSelected || this.isPreviewActive || this.spawnPlacementActive) return;
    if (this.hasBrush || this.hasPropBrush || this.hasTrackMode) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.selectRaycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

    for (const [planetId, render] of this.planetRenders) {
      if (this.selectRaycaster.intersectObject(render.terrainMesh).length > 0) {
        this.onPlanetSelected(planetId);
        return;
      }
    }
  };

  private start(): void {
    const tick = (): void => {
      this.animFrameId = requestAnimationFrame(tick);
      const t = performance.now() / 1000;
      const now = performance.now();
      const dt = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60;
      this.lastFrameTime = now;
      for (const render of this.planetRenders.values()) {
        render.planetMaterial.uniforms.time.value = t;
        if (render.waterMaterial) render.waterMaterial.uniforms.time.value = t;
      }
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
