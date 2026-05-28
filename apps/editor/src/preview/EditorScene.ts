import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  getTerrainHeight,
  getTerrainRadius,
  type TerrainSurfaceProvider,
} from "@splat/simulation/terrain/planetTerrain.ts";
import { createOutlineMaterial } from "@splat/client-runtime/materials/outlineMaterial.ts";
import { buildPlanetGeometry, buildWaterGeometry } from "../rendering/planetGeometry.ts";
import { createPlanetMaterial } from "@splat/client-runtime/materials/planetMaterial.ts";
import { createWaterMaterial } from "@splat/client-runtime/materials/waterMaterial.ts";
import { createMetricGroup } from "../performance/geometryStats.ts";
import { BrushTool } from "../tools/brush/BrushTool.ts";
import { PropSlimeTool } from "../tools/props/PropSlimeTool.ts";
import { TerrainStampTool } from "../tools/terrain/TerrainStampTool.ts";
import type { TerrainStampState } from "../tools/terrain/TerrainStampTypes.ts";
import { JumpFeatureTool } from "../tools/terrain/JumpFeatureTool.ts";
import { SlopeFeatureTool } from "../tools/terrain/SlopeFeatureTool.ts";
import { RailTool } from "../tools/rails/RailTool.ts";
import { RailPreviewVisuals } from "../tools/rails/RailPreviewVisuals.ts";
import {
  buildRailCarveSamples,
  buildRailSurfaceSamples,
  getRailCarvedRadius,
  getRailRaisedRadius,
  type RailCarveSample,
  type RailSurfaceSample,
} from "../tools/rails/railCarving.ts";
import type { RailState, RailToolState } from "../tools/rails/RailTypes.ts";
import { BlastPadTool } from "../tools/blastPads/BlastPadTool.ts";
import { BlastPadPreviewVisuals } from "../tools/blastPads/BlastPadPreviewVisuals.ts";
import type { BlastPadToolState } from "../tools/blastPads/BlastPadTypes.ts";
import type {
  BrushState,
  EditorBlastPad,
  EditorConfig,
  EditorTerrainFeature,
  EditorPlanet,
  EditorSculptState,
  TerrainFeatureToolState,
  PerformanceStats,
  PreviewSpawnState,
  PropBrushState,
} from "../types.ts";
import { editorTerrainFeaturesToRuntime } from "../terrainFeatures.ts";
import { PlayerPreviewController } from "./PlayerPreviewController.ts";
import {
  createPlanetAtmosphereShells,
  disposePlanetAtmosphereShells,
  type PlanetAtmosphereShells,
  syncPlanetAtmosphereShells,
  updatePlanetAtmosphereTime,
  updatePlanetAtmosphereUniforms,
} from "./planetAtmosphereShells.ts";

function hexToVec3(hex: number): THREE.Vector3 {
  return new THREE.Vector3(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  );
}

function summarizeSculptSamples(sculpt: EditorSculptState): {
  editedVertices: number;
  maxAbsDisplacement: number;
} {
  let maxAbsDisplacement = 0;
  for (const sample of sculpt.samples) {
    maxAbsDisplacement = Math.max(maxAbsDisplacement, Math.abs(sample.value));
  }
  return { editedVertices: sculpt.samples.length, maxAbsDisplacement };
}

interface PlanetRenderState {
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  outlineMesh: THREE.Mesh;
  waterMesh: THREE.Mesh | null;
  atmosphere: PlanetAtmosphereShells;
  planetMaterial: THREE.ShaderMaterial;
  waterMaterial: THREE.ShaderMaterial | null;
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
  private readonly terrainStampTool: TerrainStampTool;
  private readonly jumpFeatureTool: JumpFeatureTool;
  private readonly slopeFeatureTool: SlopeFeatureTool;
  private readonly propSlimeTool: PropSlimeTool;
  private readonly railTool: RailTool;
  private readonly railPreviewVisuals: RailPreviewVisuals;
  private readonly blastPadTool: BlastPadTool;
  private readonly blastPadPreviewVisuals: BlastPadPreviewVisuals;
  private hasBlastPadMode = false;
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
  private rails: RailState[];
  private railCarveSamples: RailCarveSample[] = [];
  private railSurfaceSamples: RailSurfaceSample[] = [];
  private previewSpawn: PreviewSpawnState;
  private spawnPlacementActive = false;
  private isSpaceHeld = false;
  private isPreviewActive = false;
  private lastFrameTime = 0;
  private hasBrush = false;
  private hasTerrainStamp = false;
  private hasTerrainFeatureMode = false;
  private hasPropBrush = false;
  private hasRailMode = false;
  private selectionPointerStart: { x: number; y: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    config: EditorConfig,
    rails: RailState[],
    previewSpawn: PreviewSpawnState,
    onRailChange: (rail: RailState) => void,
    onRailPointSelectionChange: (pointId: string | null) => void,
    onTerrainFeatureChange: (feature: EditorTerrainFeature) => void,
    onTerrainFeaturePointSelectionChange: (pointId: string | null) => void,
    private readonly onSculptChange: (planetId: string, sculpt: EditorSculptState) => void,
    private readonly onPreviewSpawnChange: (spawn: PreviewSpawnState) => void,
    private readonly onPerformanceStats: (stats: PerformanceStats) => void,
    private readonly onPlanetSelected: ((id: string) => void) | null = null,
    private readonly onBlastPadsChange: ((pads: EditorBlastPad[]) => void) | null = null,
    private readonly onBlastPadSelectionChange: ((padId: string | null) => void) | null = null,
    private readonly onBlastPadPickTargetComplete:
      | ((padId: string, targetPlanetId: string) => void)
      | null = null,
  ) {
    this.canvas = canvas;
    this.currentConfig = config;
    this.rails = rails;
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
    this.terrainStampTool = new TerrainStampTool();
    this.jumpFeatureTool = new JumpFeatureTool();
    this.slopeFeatureTool = new SlopeFeatureTool();
    this.propSlimeTool = new PropSlimeTool();
    this.railTool = new RailTool();
    this.blastPadTool = new BlastPadTool();
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
    this.blastPadPreviewVisuals = new BlastPadPreviewVisuals(this.scene);
    this.blastPadPreviewVisuals.setPlanets(config.planets);
    this.blastPadPreviewVisuals.setPads(config.blastPads ?? []);
    this.railPreviewVisuals = new RailPreviewVisuals(
      this.scene,
      config,
      this.getActivePlanetRails(),
      (nx, ny, nz) => {
        const planet = this.getPlanetById(this.activePlanetId);
        return (
          getTerrainRadius(nx, ny, nz, {
            planet: { radius: planet.radius },
            terrain: planet.terrain,
            terrainFeatures: editorTerrainFeaturesToRuntime(planet.terrainFeatures),
          }) + this.brushTool.getDisplacementAtNormal(nx, ny, nz)
        );
      },
    );

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
    this.rebuildRailCarveSamples();
    this.brushTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMeshes: [activeRender.terrainMesh, activeRender.outlineMesh],
      onStrokeEnd: (sculpt) => {
        this.onSculptChange(this.activePlanetId, sculpt);
        this.rebuildPlanetMeshes();
      },
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
    });
    this.terrainStampTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: activeRender.terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
      onStamp: (hitPoint, state) => {
        const sculpt = this.brushTool.applyTerrainStamp(hitPoint, state);
        this.onSculptChange(this.activePlanetId, sculpt);
        this.rebuildPlanetMeshes();
      },
    });
    this.slopeFeatureTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: activeRender.terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
      onFeatureChange: onTerrainFeatureChange,
      onPointSelectionChange: onTerrainFeaturePointSelectionChange,
      onGizmoDragChange: (dragging) => {
        this.controls.enabled = !dragging;
      },
    });
    this.jumpFeatureTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: activeRender.terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
      onFeatureChange: onTerrainFeatureChange,
      onGizmoDragChange: (dragging) => {
        this.controls.enabled = !dragging;
      },
    });
    this.propSlimeTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: activeRender.terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
    });
    this.railTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      planetMesh: activeRender.terrainMesh,
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
      onRailChange,
      onPointSelectionChange: onRailPointSelectionChange,
      onGizmoDragChange: (dragging) => {
        this.controls.enabled = !dragging;
      },
      config,
      terrainProvider: this.baseTerrainProvider,
    });
    this.blastPadTool.connect({
      canvas,
      camera: this.camera,
      scene: this.scene,
      getPlanetMesh: (id) => this.planetRenders.get(id)?.terrainMesh ?? null,
      getPlanet: (id) => this.currentConfig.planets.find((p) => p.id === id) ?? null,
      getKnownPlanetIds: () => new Set(this.currentConfig.planets.map((p) => p.id)),
      shouldOrbit: () => this.isSpaceHeld || this.isPreviewActive,
      onPadsChange: (pads) => {
        this.blastPadPreviewVisuals.setPads(pads);
        this.onBlastPadsChange?.(pads);
      },
      onSelectionChange: (padId) => {
        this.blastPadPreviewVisuals.setSelectedPadId(padId);
        this.onBlastPadSelectionChange?.(padId);
      },
      onPickTargetComplete: (padId, targetPlanetId) => {
        this.onBlastPadPickTargetComplete?.(padId, targetPlanetId);
      },
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

  setTerrainStampState(state: TerrainStampState | null): void {
    if (this.isPreviewActive && state) return;
    this.hasTerrainStamp = state !== null;
    this.terrainStampTool.setStampState(state);
  }

  setTerrainFeatureToolState(state: TerrainFeatureToolState | null): void {
    if (this.isPreviewActive) return;
    this.hasTerrainFeatureMode = state?.mode != null;
    if (state?.feature.kind === "jump") {
      this.slopeFeatureTool.setToolState(null);
      this.jumpFeatureTool.setToolState(state);
    } else {
      this.jumpFeatureTool.setToolState(null);
      this.slopeFeatureTool.setToolState(state);
    }
  }

  setPropBrushState(state: PropBrushState | null): void {
    if (this.isPreviewActive && state) return;
    this.hasPropBrush = state !== null;
    this.propSlimeTool.setBrushState(state);
  }

  setRailToolState(state: RailToolState | null): void {
    if (this.isPreviewActive) return;
    this.hasRailMode = state?.mode != null;
    this.railTool.setRailToolState(state);
  }

  setBlastPads(pads: EditorBlastPad[]): void {
    this.blastPadPreviewVisuals.setPads(pads);
    this.blastPadTool.syncHandles();
  }

  setBlastPadToolState(state: BlastPadToolState | null): void {
    if (this.isPreviewActive) {
      this.blastPadTool.setToolState(null);
      this.hasBlastPadMode = false;
      return;
    }
    this.hasBlastPadMode = !!state && (state.mode != null || state.pickTargetForPadId != null);
    this.blastPadPreviewVisuals.setSelectedPadId(state?.selectedPadId ?? null);
    this.blastPadTool.setToolState(state);
  }

  setSpawnPlacementActive(active: boolean): void {
    this.spawnPlacementActive = active && !this.isPreviewActive;
    if (this.spawnPlacementActive) {
      this.brushTool.setBrushState(null);
      this.terrainStampTool.setStampState(null);
      this.slopeFeatureTool.setToolState(null);
      this.jumpFeatureTool.setToolState(null);
      this.propSlimeTool.setBrushState(null);
      this.railTool.setRailToolState(null);
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

  setRails(rails: RailState[]): void {
    this.rails = rails;
    this.rebuildRailCarveSamples();
    this.railPreviewVisuals.setRails(this.getActivePlanetRails());
    this.playerPreview.setConfig(this.currentConfig);
  }

  setPreviewActive(active: boolean): void {
    if (this.isPreviewActive === active) return;
    this.isPreviewActive = active;
    this.controls.enabled = !active;
    this.setSpawnPlacementActive(false);
    this.brushTool.setBrushState(null);
    this.terrainStampTool.setStampState(null);
    this.slopeFeatureTool.setToolState(null);
    this.jumpFeatureTool.setToolState(null);
    this.propSlimeTool.setBrushState(null);
    if (active) {
      this.railTool.setRailToolState(null);
      this.blastPadTool.setToolState(null);
      this.hasBlastPadMode = false;
    }
    this.railPreviewVisuals.setActive(active);
    this.playerPreview.setActive(active);
  }

  setActivePlanet(id: string, center: { x: number; y: number; z: number }): void {
    if (this.activePlanetId === id) return;
    this.activePlanetId = id;
    const render = this.planetRenders.get(id);
    if (render) {
      this.brushTool.setPlanetMeshes([render.terrainMesh, render.outlineMesh]);
      this.terrainStampTool.setPlanetMesh(render.terrainMesh);
      this.slopeFeatureTool.setPlanetMesh(render.terrainMesh);
      this.jumpFeatureTool.setPlanetMesh(render.terrainMesh);
      this.propSlimeTool.setPlanetMesh(render.terrainMesh);
      this.railTool.setPlanetMesh(render.terrainMesh);
      this.brushTool.resetSculptBase(this.getPlanetById(id));
      this.railPreviewVisuals.setRails(this.getActivePlanetRails());
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
    this.railPreviewVisuals.setConfig(config);
    this.blastPadPreviewVisuals.setPlanets(config.planets);
    this.blastPadPreviewVisuals.setPads(config.blastPads ?? []);
    this.blastPadTool.syncHandles();
    this.rebuildWater(config);
    this.updateUniforms(config);
  }

  rebuildWater(_config: EditorConfig): void {
    const activeRender = this.planetRenders.get(this.activePlanetId);
    if (!activeRender?.waterMesh) return;
    this.rebuildRailCarveSamples();
    const planet = this.getPlanetById(this.activePlanetId);
    const terrainCfg = {
      planet: { radius: planet.radius },
      terrain: planet.terrain,
      terrainFeatures: editorTerrainFeaturesToRuntime(planet.terrainFeatures),
    };
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
    this.blastPadPreviewVisuals.setPlanets(config.planets);
    this.blastPadPreviewVisuals.setPads(config.blastPads ?? []);
    this.blastPadTool.syncHandles();
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
    let sculptedVertices = 0;
    let maxSculptDisplacement = 0;
    for (const render of this.planetRenders.values()) {
      terrainMeshes.push(render.terrainMesh, render.outlineMesh);
      waterMeshes.push(render.waterMesh);
      atmoMeshes.push(render.atmosphere.atmosphereMesh);
    }
    for (const planet of this.currentConfig.planets) {
      const summary =
        planet.id === this.activePlanetId
          ? this.brushTool.getSculptSummary()
          : summarizeSculptSamples(planet.sculpt);
      sculptedVertices += summary.editedVertices;
      maxSculptDisplacement = Math.max(maxSculptDisplacement, summary.maxAbsDisplacement);
    }
    const sculptNote =
      sculptedVertices > 0
        ? `Terrain shader and outline pass both render the planet geometry; ${sculptedVertices.toLocaleString()} sculpted vertices, max displacement ${maxSculptDisplacement.toFixed(1)}`
        : "Terrain shader and outline pass both render the planet geometry";
    const groups = [
      createMetricGroup("planet", "Planet Terrain", terrainMeshes, sculptNote),
      createMetricGroup("water", "Water", waterMeshes, "Animated transparent shader pass"),
      createMetricGroup(
        "atmosphere",
        "Atmosphere",
        atmoMeshes,
        "Transparent fresnel shell around the planet",
      ),
      ...this.propSlimeTool.getPerformanceStats(),
      ...this.railTool.getPerformanceStats(),
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
    this.terrainStampTool.dispose();
    this.jumpFeatureTool.dispose();
    this.slopeFeatureTool.dispose();
    this.propSlimeTool.dispose();
    this.railTool.dispose();
    this.blastPadTool.dispose();
    this.blastPadPreviewVisuals.dispose();
    this.railPreviewVisuals.dispose();
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

  private getActivePlanetRails(): RailState[] {
    return this.rails.filter((rail) => rail.planetId === this.activePlanetId);
  }

  private buildPlanetRender(planet: EditorPlanet): PlanetRenderState {
    const group = new THREE.Group();
    group.position.set(planet.center.x, planet.center.y, planet.center.z);

    const waterRadius = planet.radius + planet.terrain.waterLevel;
    const terrainCfg = {
      planet: { radius: planet.radius },
      terrain: planet.terrain,
      terrainFeatures: editorTerrainFeaturesToRuntime(planet.terrainFeatures),
    };

    const displacements =
      planet.id === this.activePlanetId ? this.brushTool.getDisplacements() : new Float32Array(0);
    const planetGeo = buildPlanetGeometry(
      terrainCfg,
      planet.terrain.icosahedronDetail,
      displacements,
    );
    const planetMaterial = createPlanetMaterial({
      slimeMask: null,
      planetCenter: new THREE.Vector3(0, 0, 0),
      planetRadius: planet.radius,
      waterRadius,
      waterLevel: planet.terrain.waterLevel,
      sandBand: planet.terrain.sandBand,
      snowLevel: planet.terrain.snowLevel,
      rockLevel: planet.terrain.rockLevel,
      colors: planet.colors,
      cel: this.currentConfig.shaders.cel,
      lighting: planet.lighting,
      puffyCloudShadows: {
        enabled: planet.atmosphere.clouds.puffs.enabled,
        density: planet.atmosphere.clouds.puffs.density,
        height: planet.atmosphere.clouds.puffs.height,
        size: planet.atmosphere.clouds.puffs.size,
        strength: planet.atmosphere.clouds.puffs.shadowStrength,
        movementSpeed: planet.atmosphere.clouds.puffs.movementSpeed,
      },
    });

    const terrainMesh = new THREE.Mesh(planetGeo, planetMaterial);
    const outlineMesh = new THREE.Mesh(planetGeo, this.outlineMaterial);
    group.add(terrainMesh, outlineMesh);

    let waterMesh: THREE.Mesh | null = null;
    let waterMaterial: THREE.ShaderMaterial | null = null;
    if (planet.hasWater) {
      waterMaterial = createWaterMaterial({
        deepColor: planet.colors.waterDeep,
        cel: this.currentConfig.shaders.cel,
        planetRadius: planet.radius,
        puffyCloudShadows: {
          enabled: planet.atmosphere.clouds.puffs.enabled,
          density: planet.atmosphere.clouds.puffs.density,
          height: planet.atmosphere.clouds.puffs.height,
          size: planet.atmosphere.clouds.puffs.size,
          strength: planet.atmosphere.clouds.puffs.shadowStrength,
          movementSpeed: planet.atmosphere.clouds.puffs.movementSpeed,
        },
      });
      waterMesh = new THREE.Mesh(buildWaterGeometry(waterRadius, terrainCfg), waterMaterial);
      waterMesh.renderOrder = 1;
      group.add(waterMesh);
    }

    const atmosphere = createPlanetAtmosphereShells(group, planet);

    return {
      group,
      terrainMesh,
      outlineMesh,
      waterMesh,
      atmosphere,
      planetMaterial,
      waterMaterial,
    };
  }

  private disposePlanetRender(render: PlanetRenderState): void {
    render.terrainMesh.geometry.dispose();
    render.planetMaterial.dispose();
    render.waterMesh?.geometry.dispose();
    render.waterMaterial?.dispose();
    disposePlanetAtmosphereShells(render.atmosphere);
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
      syncPlanetAtmosphereShells(render.group, planet, render.atmosphere);
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

    u.celEnabled.value = cel.enabled ? 1 : 0;
    u.celBands.value = cel.bands;
    u.celSoftness.value = cel.softness;
    u.celHatchStrength.value = cel.hatchStrength;
    u.celHatchScale.value = cel.hatchScale;

    if (render.waterMaterial) {
      render.waterMaterial.uniforms.deepColor.value = hexToVec3(planet.colors.waterDeep);
      render.waterMaterial.uniforms.celEnabled.value = cel.enabled ? 1 : 0;
      render.waterMaterial.uniforms.celBands.value = cel.bands;
      render.waterMaterial.uniforms.celSoftness.value = cel.softness;
      render.waterMaterial.uniforms.celHatchStrength.value = cel.hatchStrength;
      render.waterMaterial.uniforms.celHatchScale.value = cel.hatchScale;
      render.waterMaterial.uniforms.planetRadius.value = planet.radius;
      render.waterMaterial.uniforms.puffyCloudShadowStrength.value = planet.atmosphere.clouds.puffs
        .enabled
        ? planet.atmosphere.clouds.puffs.shadowStrength
        : 0;
      render.waterMaterial.uniforms.puffyCloudShadowDensity.value =
        planet.atmosphere.clouds.puffs.density;
      render.waterMaterial.uniforms.puffyCloudShadowHeight.value =
        planet.atmosphere.clouds.puffs.height;
      render.waterMaterial.uniforms.puffyCloudShadowSize.value =
        planet.atmosphere.clouds.puffs.size;
      render.waterMaterial.uniforms.puffyCloudShadowMovementSpeed.value =
        planet.atmosphere.clouds.puffs.movementSpeed;
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
    if (render.waterMaterial)
      render.waterMaterial.uniforms.sunDirection.value.copy(u.sunDirection.value);
    u.puffyCloudShadowStrength.value = planet.atmosphere.clouds.puffs.enabled
      ? planet.atmosphere.clouds.puffs.shadowStrength
      : 0;
    u.puffyCloudShadowDensity.value = planet.atmosphere.clouds.puffs.density;
    u.puffyCloudShadowHeight.value = planet.atmosphere.clouds.puffs.height;
    u.puffyCloudShadowSize.value = planet.atmosphere.clouds.puffs.size;
    u.puffyCloudShadowMovementSpeed.value = planet.atmosphere.clouds.puffs.movementSpeed;

    updatePlanetAtmosphereUniforms(planet, render.atmosphere, u.sunDirection.value);
  }

  private rebuildPlanetMeshes(): void {
    const activeRender = this.planetRenders.get(this.activePlanetId);
    if (!activeRender) return;
    this.rebuildRailCarveSamples();
    const planet = this.getPlanetById(this.activePlanetId);
    const cfg = {
      planet: { radius: planet.radius },
      terrain: planet.terrain,
      terrainFeatures: editorTerrainFeaturesToRuntime(planet.terrainFeatures),
    };
    const newGeo = buildPlanetGeometry(
      cfg,
      planet.terrain.icosahedronDetail,
      this.brushTool.getDisplacements(),
    );
    const oldGeo = activeRender.terrainMesh.geometry;
    activeRender.terrainMesh.geometry = newGeo;
    activeRender.outlineMesh.geometry = newGeo;
    oldGeo.dispose();
    this.railPreviewVisuals.setConfig(this.currentConfig);
    this.railTool.syncSurface();
    this.slopeFeatureTool.syncSurface();
    this.jumpFeatureTool.syncSurface();
    this.emitPerformanceStats(true);
  }

  private rebuildRailCarveSamples(): void {
    const getRadiusAtNormal = (nx: number, ny: number, nz: number) => {
      const planet = this.getPlanetById(this.activePlanetId);
      return (
        getTerrainRadius(nx, ny, nz, {
          planet: { radius: planet.radius },
          terrain: planet.terrain,
          terrainFeatures: editorTerrainFeaturesToRuntime(planet.terrainFeatures),
        }) + this.brushTool.getDisplacementAtNormal(nx, ny, nz)
      );
    };
    this.railCarveSamples = buildRailCarveSamples(
      this.getActivePlanetRails(),
      this.currentConfig,
      getRadiusAtNormal,
    );
    this.railSurfaceSamples = buildRailSurfaceSamples(
      this.getActivePlanetRails(),
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
    const carvedRadius = getRailCarvedRadius(nx, ny, nz, baseRadius, this.railCarveSamples);
    // Rail ribbons are playable floors. Apply them after tunnel carving so tunnel
    // entrances stay hollow around the rail without dropping the player to water.
    return getRailRaisedRadius(nx, ny, nz, carvedRadius, this.railSurfaceSamples);
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
    const planet = this.getPlanetById(this.previewSpawn.planetId ?? this.activePlanetId);
    const radius = this.previewTerrainProvider.getRadius(
      normal.x,
      normal.y,
      normal.z,
      {
        planet: { radius: planet.radius },
        terrain: planet.terrain,
        terrainFeatures: editorTerrainFeaturesToRuntime(planet.terrainFeatures),
      },
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
      groups: stats.groups.map(({ id, triangles, drawCalls, meshes, instances, notes }) => ({
        id,
        triangles,
        drawCalls,
        meshes,
        instances,
        notes,
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
    const spawn: PreviewSpawnState = {
      planetId: planet.id,
      normal: [normal.x, normal.y, normal.z],
    };
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
    if (
      this.hasBrush ||
      this.hasTerrainStamp ||
      this.hasTerrainFeatureMode ||
      this.hasPropBrush ||
      this.hasRailMode ||
      this.hasBlastPadMode
    ) {
      return;
    }

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
        updatePlanetAtmosphereTime(render.atmosphere, t);
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
