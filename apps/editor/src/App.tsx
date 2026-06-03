import { useCallback, useEffect, useRef, useState } from "react";
import { validateRuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import { BlastPadsPanel } from "./panels/BlastPadsPanel.tsx";
import { PerformancePanel } from "./panels/PerformancePanel.tsx";
import { PlanetPanel } from "./panels/PlanetPanel.tsx";
import { PropsPanel } from "./panels/PropsPanel.tsx";
import { ShadersPanel } from "./panels/ShadersPanel.tsx";
import { SpawnsPanel } from "./panels/SpawnsPanel.tsx";
import { TerrainPanel } from "./panels/TerrainPanel.tsx";
import { RailsPanel } from "./panels/RailsPanel.tsx";
import { PlanetPreview } from "./preview/PlanetPreview.tsx";
import type { EditorScene } from "./preview/EditorScene.ts";
import {
  createDefaultRailState,
  type RailState,
  type RailToolState,
} from "./tools/rails/RailTypes.ts";
import type { BlastPadToolState } from "./tools/blastPads/BlastPadTypes.ts";
import type { TerrainStampState } from "./tools/terrain/TerrainStampTypes.ts";
import {
  defaultEditorPlanet,
  GEOMETRY_TERRAIN_KEYS,
  type BrushState,
  type EditorBlastPad,
  type EditorConfig,
  type EditorPlanet,
  type EditorSculptState,
  type EditorTerrainFeature,
  type PerformanceStats,
  type PreviewSpawnState,
  type PropBrushState,
  type TerrainFeatureToolState,
} from "./types.ts";
import { editorStateToRuntimeMap } from "./export.ts";
import { scalePlanetForRadius } from "./terrainScaling.ts";
import {
  clearEditorState,
  createInitialEditorState,
  nextPlanetId,
  saveEditorState,
  type InitialEditorState,
} from "./editorPersistence.ts";
import { getLayerTitle, LayerNavigator, type LayerSelection } from "./LayerNavigator.tsx";

const REBUILD_DELAY_MS = 160;
type PublishStatus = "idle" | "publishing" | "published" | "invalid" | "error";

export function App() {
  const initialState = useRef<InitialEditorState>(createInitialEditorState()).current;
  const [config, setConfig] = useState<EditorConfig>(initialState.config);
  const [rails, setRails] = useState<RailState[]>(initialState.rails);
  const [activeRailId, setActiveRailId] = useState(initialState.activeRailId);
  const [previewSpawn, setPreviewSpawn] = useState<PreviewSpawnState>(initialState.previewSpawn);
  const [mapName, setMapName] = useState(initialState.mapName);
  const [spawnPlacementActive, setSpawnPlacementActive] = useState(false);
  const [selectedRailPointId, setSelectedRailPointId] = useState<string | null>(null);
  const [selectedTerrainFeaturePointId, setSelectedTerrainFeaturePointId] = useState<string | null>(
    null,
  );
  const [selectedBlastPadId, setSelectedBlastPadId] = useState<string | null>(null);
  const [pickBlastPadTargetForId, setPickBlastPadTargetForId] = useState<string | null>(null);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "cleared" | "error">("idle");
  const [publishStatus, setPublishStatus] = useState<PublishStatus>("idle");
  const [previewActive, setPreviewActive] = useState(false);
  const [activePlanetId, setActivePlanetId] = useState(
    () => initialState.config.planets[0]?.id ?? "planet-0",
  );
  const [selectedLayer, setSelectedLayer] = useState<LayerSelection>(() => ({
    kind: "planet",
    planetId: initialState.config.planets[0]?.id ?? "planet-0",
    panel: "terrain",
  }));
  const configRef = useRef<EditorConfig>(config);
  const railsRef = useRef<RailState[]>(rails);
  const activeRailIdRef = useRef(activeRailId);
  const previewSpawnRef = useRef<PreviewSpawnState>(previewSpawn);
  const selectedRailPointIdRef = useRef<string | null>(selectedRailPointId);
  const selectedTerrainFeaturePointIdRef = useRef<string | null>(selectedTerrainFeaturePointId);
  const previewActiveRef = useRef(false);
  const activePlanetIdRef = useRef(activePlanetId);
  const sceneRef = useRef<EditorScene | null>(null);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDirty = useCallback(() => {
    setSaveStatus("idle");
    setPublishStatus("idle");
  }, []);

  const cancelScheduledRebuild = useCallback(() => {
    if (!rebuildTimerRef.current) return;
    clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = null;
  }, []);

  const rebuildPlanetNow = useCallback(() => {
    cancelScheduledRebuild();
    sceneRef.current?.rebuildPlanet(configRef.current);
  }, [cancelScheduledRebuild]);

  const scheduleRebuild = useCallback(() => {
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(() => {
      rebuildTimerRef.current = null;
      sceneRef.current?.rebuildPlanet(configRef.current);
    }, REBUILD_DELAY_MS);
  }, []);

  useEffect(() => cancelScheduledRebuild, [cancelScheduledRebuild]);

  const handleScene = useCallback((scene: EditorScene) => {
    sceneRef.current = scene;
    scene.setRails(railsRef.current);
    scene.setPreviewSpawn(previewSpawnRef.current);
    scene.setPreviewActive(previewActiveRef.current);
    const activeRail = railsRef.current.find((rail) => rail.id === activeRailIdRef.current);
    if (activeRail) {
      scene.setRailToolState({
        mode: null,
        rail: activeRail,
        selectedPointId: selectedRailPointIdRef.current,
      });
    }
  }, []);

  const handleBrushChange = useCallback((state: BrushState | null) => {
    sceneRef.current?.setBrushState(state);
  }, []);

  const handleTerrainStampChange = useCallback((state: TerrainStampState | null) => {
    sceneRef.current?.setTerrainStampState(state);
  }, []);

  const handleTerrainFeatureToolChange = useCallback((state: TerrainFeatureToolState | null) => {
    sceneRef.current?.setTerrainFeatureToolState(state);
  }, []);

  const handlePropBrushChange = useCallback((state: PropBrushState | null) => {
    sceneRef.current?.setPropBrushState(state);
  }, []);

  const handleRailChange = useCallback(
    (nextRail: RailState) => {
      markDirty();
      const nextRails = railsRef.current.map((rail) => (rail.id === nextRail.id ? nextRail : rail));
      railsRef.current = nextRails;
      sceneRef.current?.setRails(nextRails);
      setRails(nextRails);
    },
    [markDirty],
  );

  const handleRailToolChange = useCallback((state: RailToolState) => {
    sceneRef.current?.setRailToolState(state);
  }, []);

  const handleBlastPadsChange = useCallback(
    (pads: EditorBlastPad[]) => {
      markDirty();
      const next = { ...configRef.current, blastPads: pads };
      configRef.current = next;
      setConfig(next);
      sceneRef.current?.setBlastPads(pads);
    },
    [markDirty],
  );

  const handleBlastPadSelectionChange = useCallback((padId: string | null) => {
    setSelectedBlastPadId(padId);
    if (padId === null) setPickBlastPadTargetForId(null);
  }, []);

  const handleBlastPadToolChange = useCallback((state: BlastPadToolState) => {
    sceneRef.current?.setBlastPadToolState(state);
  }, []);

  const handleBlastPadPickTargetForId = useCallback((padId: string | null) => {
    setPickBlastPadTargetForId(padId);
  }, []);

  const handleBlastPadPickTargetComplete = useCallback(
    (_padId: string, _targetPlanetId: string) => {
      setPickBlastPadTargetForId(null);
    },
    [],
  );

  const handleRailPointSelectionChange = useCallback((pointId: string | null) => {
    selectedRailPointIdRef.current = pointId;
    setSelectedRailPointId(pointId);
  }, []);

  const handleTerrainFeaturePointSelectionChange = useCallback((pointId: string | null) => {
    selectedTerrainFeaturePointIdRef.current = pointId;
    setSelectedTerrainFeaturePointId(pointId);
  }, []);

  const handleTerrainFeatureChange = useCallback(
    (nextFeature: EditorTerrainFeature) => {
      markDirty();
      const activeId = activePlanetIdRef.current;
      const next = {
        ...configRef.current,
        planets: configRef.current.planets.map((planet) =>
          planet.id === activeId
            ? {
                ...planet,
                terrainFeatures: planet.terrainFeatures.map((feature) =>
                  feature.id === nextFeature.id ? nextFeature : feature,
                ),
              }
            : planet,
        ),
      };
      configRef.current = next;
      setConfig(next);
      sceneRef.current?.updateUniforms(next);
      scheduleRebuild();
    },
    [markDirty, scheduleRebuild],
  );

  const handleSculptChange = useCallback(
    (planetId: string, sculpt: EditorSculptState) => {
      markDirty();
      const next = {
        ...configRef.current,
        planets: configRef.current.planets.map((planet) =>
          planet.id === planetId ? { ...planet, sculpt } : planet,
        ),
      };
      configRef.current = next;
      setConfig(next);
      sceneRef.current?.updateUniforms(next);
    },
    [markDirty],
  );

  const handlePreviewSpawnChange = useCallback(
    (spawn: PreviewSpawnState) => {
      markDirty();
      previewSpawnRef.current = spawn;
      setPreviewSpawn(spawn);
    },
    [markDirty],
  );

  const handleSpawnPlacementActiveChange = useCallback((active: boolean) => {
    setSpawnPlacementActive(active);
    sceneRef.current?.setSpawnPlacementActive(active);
  }, []);

  const resetPreviewSpawn = useCallback(() => {
    const spawn: PreviewSpawnState = {
      planetId: configRef.current.planets[0]?.id ?? "planet-0",
      normal: [0, 1, 0],
    };
    handlePreviewSpawnChange(spawn);
    sceneRef.current?.setPreviewSpawn(spawn);
  }, [handlePreviewSpawnChange]);

  const togglePreview = useCallback(() => {
    const next = !previewActiveRef.current;
    previewActiveRef.current = next;
    if (next) setSpawnPlacementActive(false);
    setPreviewActive(next);
    sceneRef.current?.setPreviewActive(next);
  }, []);

  const togglePreviewFromSpawn = useCallback(() => {
    if (previewActiveRef.current) {
      togglePreview();
      return;
    }
    sceneRef.current?.setPreviewSpawn(previewSpawnRef.current);
    togglePreview();
  }, [togglePreview]);

  const ensureActiveRailForPlanet = useCallback(
    (planetId: string) => {
      let nextRails = railsRef.current;
      let activeRail = nextRails.find((rail) => rail.planetId === planetId);
      if (!activeRail) {
        activeRail = createDefaultRailState(undefined, planetId);
        nextRails = [...nextRails, activeRail];
        railsRef.current = nextRails;
        setRails(nextRails);
        sceneRef.current?.setRails(nextRails);
        markDirty();
      }

      if (activeRailIdRef.current !== activeRail.id) {
        activeRailIdRef.current = activeRail.id;
        selectedRailPointIdRef.current = null;
        setActiveRailId(activeRail.id);
        setSelectedRailPointId(null);
        sceneRef.current?.setRailToolState({
          mode: null,
          rail: activeRail,
          selectedPointId: null,
        });
      }
    },
    [markDirty],
  );

  const clearTransientTools = useCallback((nextLayer: LayerSelection) => {
    if (nextLayer.kind !== "planet" || nextLayer.panel !== "terrain") {
      sceneRef.current?.setBrushState(null);
      sceneRef.current?.setTerrainStampState(null);
      sceneRef.current?.setTerrainFeatureToolState(null);
    }
    if (nextLayer.kind !== "planet" || nextLayer.panel !== "props") {
      sceneRef.current?.setPropBrushState(null);
    }
    if (nextLayer.kind !== "global" || nextLayer.panel !== "spawns") {
      setSpawnPlacementActive(false);
      sceneRef.current?.setSpawnPlacementActive(false);
    }
    if (nextLayer.kind !== "planet" || nextLayer.panel !== "rails") {
      const activeRail = railsRef.current.find((rail) => rail.id === activeRailIdRef.current);
      if (activeRail) {
        sceneRef.current?.setRailToolState({
          mode: null,
          rail: activeRail,
          selectedPointId: selectedRailPointIdRef.current,
        });
      }
    }
    if (nextLayer.kind !== "planet" || nextLayer.panel !== "blastPads") {
      sceneRef.current?.setBlastPadToolState(null);
      setPickBlastPadTargetForId(null);
    }
  }, []);

  const setActiveRail = useCallback(
    (railId: string) => {
      markDirty();
      activeRailIdRef.current = railId;
      selectedRailPointIdRef.current = null;
      setActiveRailId(railId);
      setSelectedRailPointId(null);
      const activeRail = railsRef.current.find((rail) => rail.id === railId);
      if (activeRail) {
        sceneRef.current?.setRailToolState({
          mode: null,
          rail: activeRail,
          selectedPointId: null,
        });
      }
    },
    [markDirty],
  );

  const handleRailsChange = useCallback(
    (nextRails: RailState[], nextActiveRailId: string, nextSelectedPointId: string | null) => {
      markDirty();
      railsRef.current = nextRails;
      activeRailIdRef.current = nextActiveRailId;
      selectedRailPointIdRef.current = nextSelectedPointId;
      sceneRef.current?.setRails(nextRails);
      setRails(nextRails);
      setActiveRailId(nextActiveRailId);
      setSelectedRailPointId(nextSelectedPointId);
    },
    [markDirty],
  );

  const handleActivePlanetChange = useCallback(
    (id: string) => {
      activePlanetIdRef.current = id;
      setActivePlanetId(id);
      ensureActiveRailForPlanet(id);
      const planet = configRef.current.planets.find((p) => p.id === id);
      if (planet) sceneRef.current?.setActivePlanet(id, planet.center);
    },
    [ensureActiveRailForPlanet],
  );

  const selectLayer = useCallback(
    (nextLayer: LayerSelection) => {
      clearTransientTools(nextLayer);
      if (nextLayer.kind === "planet") {
        handleActivePlanetChange(nextLayer.planetId);
        if (nextLayer.panel === "rails") ensureActiveRailForPlanet(nextLayer.planetId);
      }
      setSelectedLayer(nextLayer);
    },
    [clearTransientTools, ensureActiveRailForPlanet, handleActivePlanetChange],
  );

  const handlePreviewPlanetSelected = useCallback(
    (planetId: string) => {
      const panel = selectedLayer.kind === "planet" ? selectedLayer.panel : "planet";
      selectLayer({ kind: "planet", planetId, panel });
    },
    [selectLayer, selectedLayer],
  );

  const addPlanet = useCallback(() => {
    markDirty();
    const planets = configRef.current.planets;
    const id = nextPlanetId(planets);
    const centerOffset = 400 * planets.length;
    const base = defaultEditorPlanet(id, { x: centerOffset, y: 0, z: 0 });
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const nextPlanet = {
      ...base,
      terrain: { ...base.terrain, seed },
      props: { ...base.props, seed },
    };
    const nextConfig = { ...configRef.current, planets: [...planets, nextPlanet] };
    configRef.current = nextConfig;
    setConfig(nextConfig);
    sceneRef.current?.updateUniforms(nextConfig);
    handleActivePlanetChange(id);
    setSelectedLayer({ kind: "planet", planetId: id, panel: "planet" });
  }, [handleActivePlanetChange, markDirty]);

  function handlePlanetsChange(planets: EditorPlanet[]) {
    markDirty();
    const prev = configRef.current;
    // When the active planet's radius changes, scale its absolute-unit terrain
    // bands and feature heights proportionally. Otherwise shrinking past the
    // mountain amplitude inverts the terrain through the core, and growing
    // leaves a paper-thin landscape.
    const activeId = activePlanetIdRef.current;
    const prevActive = prev.planets.find((p) => p.id === activeId);
    const nextActive = planets.find((p) => p.id === activeId);
    let scaledPlanets = planets;
    if (
      prevActive &&
      nextActive &&
      prevActive.radius > 0 &&
      nextActive.radius !== prevActive.radius
    ) {
      const scale = nextActive.radius / prevActive.radius;
      const scaled = scalePlanetForRadius(nextActive, scale);
      scaledPlanets = planets.map((p) => (p.id === activeId ? scaled : p));
    }
    const next = { ...prev, planets: scaledPlanets };
    configRef.current = next;

    if (!scaledPlanets.find((p) => p.id === activePlanetIdRef.current)) {
      const firstId = scaledPlanets[0]?.id ?? "";
      activePlanetIdRef.current = firstId;
      setActivePlanetId(firstId);
      setSelectedLayer({ kind: "planet", planetId: firstId, panel: "planet" });
    }

    const planetIds = new Set(scaledPlanets.map((planet) => planet.id));
    const nextRails = railsRef.current.filter((rail) => planetIds.has(rail.planetId));
    if (nextRails.length !== railsRef.current.length) {
      railsRef.current = nextRails;
      setRails(nextRails);
      sceneRef.current?.setRails(nextRails);
    }
    const nextBlastPads = (configRef.current.blastPads ?? []).filter(
      (pad) =>
        planetIds.has(pad.planetId) &&
        planetIds.has(pad.targetPlanetId) &&
        pad.planetId !== pad.targetPlanetId,
    );
    if (nextBlastPads.length !== (configRef.current.blastPads ?? []).length) {
      next.blastPads = nextBlastPads;
      configRef.current = next;
      if (selectedBlastPadId && !nextBlastPads.some((p) => p.id === selectedBlastPadId)) {
        setSelectedBlastPadId(null);
        setPickBlastPadTargetForId(null);
      }
    }

    setConfig(next);
    sceneRef.current?.updateUniforms(next);

    const activeRadiusChanged = prevActive?.radius !== nextActive?.radius;
    if (activeRadiusChanged) {
      rebuildPlanetNow();
      sceneRef.current?.rebuildWater(next);
    }
  }

  function handleResetActivePlanet() {
    const activeId = activePlanetIdRef.current;
    const currentPlanet = configRef.current.planets.find((planet) => planet.id === activeId);
    if (!currentPlanet) return;
    const confirmed = window.confirm(
      `Reset ${activeId} to default terrain, colors, atmosphere, lighting, props, and clear its rails?`,
    );
    if (!confirmed) return;

    markDirty();
    const baseDefault = defaultEditorPlanet(activeId, currentPlanet.center);
    // Preserve the user's chosen radius and scale the default terrain to fit;
    // the confirm dialog promises to reset bands/colors/props, not size.
    const sized = { ...baseDefault, radius: currentPlanet.radius };
    const resetPlanet = {
      ...scalePlanetForRadius(sized, currentPlanet.radius / baseDefault.radius),
      id: activeId,
    };
    const nextConfig = {
      ...configRef.current,
      planets: configRef.current.planets.map((planet) =>
        planet.id === activeId ? resetPlanet : planet,
      ),
    };
    const resetRail = createDefaultRailState(undefined, activeId);
    const nextRails = [...railsRef.current.filter((rail) => rail.planetId !== activeId), resetRail];

    configRef.current = nextConfig;
    railsRef.current = nextRails;
    activeRailIdRef.current = resetRail.id;
    selectedRailPointIdRef.current = null;
    selectedTerrainFeaturePointIdRef.current = null;
    setConfig(nextConfig);
    setRails(nextRails);
    setActiveRailId(resetRail.id);
    setSelectedRailPointId(null);
    setSelectedTerrainFeaturePointId(null);
    sceneRef.current?.setRails(nextRails);
    sceneRef.current?.setActivePlanet(activeId, resetPlanet.center);
    sceneRef.current?.setRailToolState({
      mode: null,
      rail: resetRail,
      selectedPointId: null,
    });
    sceneRef.current?.updateUniforms(nextConfig);
    rebuildPlanetNow();
    sceneRef.current?.rebuildWater(nextConfig);
  }

  function handleTerrainChange(terrain: EditorPlanet["terrain"]) {
    markDirty();
    const activeId = activePlanetIdRef.current;
    const prevPlanet =
      configRef.current.planets.find((p) => p.id === activeId) ?? configRef.current.planets[0]!;
    const detailChanged = terrain.icosahedronDetail !== prevPlanet.terrain.icosahedronDetail;
    const planets = configRef.current.planets.map((p) =>
      p.id === activeId
        ? {
            ...p,
            terrain,
            sculpt: detailChanged
              ? { detail: terrain.icosahedronDetail, vertexCount: 0, samples: [] }
              : p.sculpt,
          }
        : p,
    );
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);

    if (terrain.waterLevel !== prevPlanet.terrain.waterLevel) {
      sceneRef.current?.rebuildWater(next);
    }

    const needsRebuild = (Object.keys(terrain) as (keyof typeof terrain)[]).some(
      (k) => GEOMETRY_TERRAIN_KEYS.has(k) && terrain[k] !== prevPlanet.terrain[k],
    );
    if (needsRebuild) {
      if (detailChanged) rebuildPlanetNow();
      else scheduleRebuild();
    }
  }

  function handleColorsChange(colors: EditorPlanet["colors"]) {
    markDirty();
    const activeId = activePlanetIdRef.current;
    const planets = configRef.current.planets.map((p) =>
      p.id === activeId ? { ...p, colors } : p,
    );
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handleTerrainFeaturesChange(terrainFeatures: EditorTerrainFeature[]) {
    markDirty();
    const activeId = activePlanetIdRef.current;
    const planets = configRef.current.planets.map((p) =>
      p.id === activeId ? { ...p, terrainFeatures } : p,
    );
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
    scheduleRebuild();
  }

  function handlePlanetChange(planet: EditorPlanet) {
    markDirty();
    const activeId = activePlanetIdRef.current;
    const planets = configRef.current.planets.map((p) => (p.id === activeId ? planet : p));
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handleShadersChange(shaders: EditorConfig["shaders"]) {
    markDirty();
    const next = { ...configRef.current, shaders };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  const handleSaveLocal = useCallback(() => {
    const saved = saveEditorState(
      configRef.current,
      railsRef.current,
      activeRailIdRef.current,
      previewSpawnRef.current,
      mapName,
    );
    setSaveStatus(saved ? "saved" : "error");
  }, [mapName]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      handleSaveLocal();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveLocal]);

  const handlePublishRuntimeMap = useCallback(async () => {
    const map = editorStateToRuntimeMap(
      configRef.current,
      railsRef.current,
      previewSpawnRef.current,
      mapName || "Untitled Map",
    );
    const result = validateRuntimeMapData(map);
    if (!result.valid) {
      setPublishStatus("invalid");
      alert(`Publish failed:\n${result.errors.map((e) => `${e.field}: ${e.message}`).join("\n")}`);
      return;
    }

    setPublishStatus("publishing");
    try {
      const response = await fetch("/__editor/publish-runtime-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(map),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        errors?: { field: string; message: string }[];
      } | null;
      if (!response.ok) {
        setPublishStatus(payload?.errors ? "invalid" : "error");
        const details = payload?.errors?.map((e) => `${e.field}: ${e.message}`).join("\n");
        alert(`Publish failed:\n${details || payload?.error || response.statusText}`);
        return;
      }
      setPublishStatus("published");
    } catch (error) {
      setPublishStatus("error");
      alert(
        `Publish failed:\n${error instanceof Error ? error.message : "Could not reach editor dev server"}`,
      );
    }
  }, [mapName]);

  function handleClearLocalSave() {
    const cleared = clearEditorState();
    setSaveStatus(cleared ? "cleared" : "error");
    if (cleared) window.location.reload();
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      <aside className="w-56 border-r border-zinc-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <h1 className="text-sm font-bold tracking-widest uppercase text-cyan-400">
            World Editor
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Slime Surfers</p>
        </div>
        <LayerNavigator
          config={config}
          selectedLayer={selectedLayer}
          activePlanetId={activePlanetId}
          onSelectLayer={selectLayer}
          onAddPlanet={addPlanet}
        />
        <div className="border-t border-zinc-700 p-3 overflow-y-auto max-h-[55vh]">
          <PerformancePanel stats={performanceStats} />
        </div>
      </aside>

      <main className="flex-1 relative bg-zinc-950 min-w-0">
        <PlanetPreview
          initialConfig={config}
          initialRails={rails}
          initialPreviewSpawn={previewSpawn}
          onScene={handleScene}
          onRailChange={handleRailChange}
          onRailPointSelectionChange={handleRailPointSelectionChange}
          onTerrainFeatureChange={handleTerrainFeatureChange}
          onTerrainFeaturePointSelectionChange={handleTerrainFeaturePointSelectionChange}
          onSculptChange={handleSculptChange}
          onPreviewSpawnChange={handlePreviewSpawnChange}
          onPerformanceStats={setPerformanceStats}
          onPlanetSelected={handlePreviewPlanetSelected}
          onBlastPadsChange={handleBlastPadsChange}
          onBlastPadSelectionChange={handleBlastPadSelectionChange}
          onBlastPadPickTargetComplete={handleBlastPadPickTargetComplete}
        />
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <button
            onClick={togglePreview}
            title={previewActive ? "Stop preview" : "Play preview"}
            className={`min-w-24 px-3 py-2 flex items-center justify-center gap-1.5 border rounded font-semibold text-xs transition-colors ${
              previewActive
                ? "bg-amber-400 hover:bg-amber-300 border-amber-300 text-black"
                : "bg-emerald-500/90 hover:bg-emerald-400 border-emerald-400 text-black"
            }`}
          >
            {previewActive ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
            {previewActive ? "Stop" : "Play"}
          </button>
          <button
            onClick={handleSaveLocal}
            title="Save to this browser (Cmd/Ctrl+S)"
            className="min-w-24 px-3 py-2 flex items-center justify-center gap-1.5 bg-cyan-500/90 hover:bg-cyan-400 border border-cyan-400 rounded text-black font-semibold text-xs transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {saveStatus === "saved"
              ? "Saved"
              : saveStatus === "cleared"
                ? "Cleared"
                : saveStatus === "error"
                  ? "Save failed"
                  : "Save"}
          </button>
          <button
            onClick={handleClearLocalSave}
            title="Clear saved data"
            className="px-2 py-2 flex items-center justify-center bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-600 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
          <button
            onClick={() => sceneRef.current?.resetCamera()}
            title="Reset camera"
            className="px-2 py-2 flex items-center gap-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-600 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </main>

      <aside className="w-72 border-l border-zinc-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300">{getLayerTitle(selectedLayer)}</h2>
          {selectedLayer.kind === "planet" && config.planets.length > 1 && (
            <p className="text-xs text-cyan-500 mt-0.5">{selectedLayer.planetId}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {selectedLayer.kind === "planet" && selectedLayer.panel === "planet" && (
            <PlanetPanel
              config={config}
              activePlanetId={selectedLayer.planetId}
              onPlanetsChange={handlePlanetsChange}
              onActivePlanetChange={handleActivePlanetChange}
              onResetActivePlanet={handleResetActivePlanet}
              showPlanetList={false}
            />
          )}
          {selectedLayer.kind === "planet" && selectedLayer.panel === "terrain" && (
            <TerrainPanel
              planet={
                config.planets.find((p) => p.id === selectedLayer.planetId) ?? config.planets[0]!
              }
              onTerrainChange={handleTerrainChange}
              onColorsChange={handleColorsChange}
              onTerrainFeaturesChange={handleTerrainFeaturesChange}
              selectedFeaturePointId={selectedTerrainFeaturePointId}
              onTerrainFeatureToolChange={handleTerrainFeatureToolChange}
              onTerrainFeaturePointSelectionChange={handleTerrainFeaturePointSelectionChange}
              onBrushChange={handleBrushChange}
              onTerrainStampChange={handleTerrainStampChange}
            />
          )}
          {selectedLayer.kind === "global" && selectedLayer.panel === "cel" && (
            <ShadersPanel
              planet={config.planets.find((p) => p.id === activePlanetId) ?? config.planets[0]!}
              shaders={config.shaders}
              onPlanetChange={handlePlanetChange}
              onShadersChange={handleShadersChange}
              mode="cel"
            />
          )}
          {selectedLayer.kind === "planet" &&
            (selectedLayer.panel === "atmosphere" || selectedLayer.panel === "lighting") && (
              <ShadersPanel
                planet={
                  config.planets.find((p) => p.id === selectedLayer.planetId) ?? config.planets[0]!
                }
                shaders={config.shaders}
                onPlanetChange={handlePlanetChange}
                onShadersChange={handleShadersChange}
                mode={selectedLayer.panel}
              />
            )}
          {selectedLayer.kind === "planet" && selectedLayer.panel === "props" && (
            <PropsPanel onPropBrushChange={handlePropBrushChange} />
          )}
          {selectedLayer.kind === "planet" && selectedLayer.panel === "rails" && (
            <RailsPanel
              rails={rails}
              planetId={selectedLayer.planetId}
              activeRailId={activeRailId}
              selectedPointId={selectedRailPointId}
              onActiveRailChange={setActiveRail}
              onRailsChange={handleRailsChange}
              onRailChange={handleRailChange}
              onRailToolChange={handleRailToolChange}
              onPointSelectionChange={handleRailPointSelectionChange}
            />
          )}
          {selectedLayer.kind === "planet" && selectedLayer.panel === "blastPads" && (
            <BlastPadsPanel
              config={config}
              planetId={selectedLayer.planetId}
              selectedPadId={selectedBlastPadId}
              pickTargetForPadId={pickBlastPadTargetForId}
              onPadsChange={handleBlastPadsChange}
              onSelectionChange={handleBlastPadSelectionChange}
              onToolChange={handleBlastPadToolChange}
              onPickTargetForPadId={handleBlastPadPickTargetForId}
            />
          )}
          {selectedLayer.kind === "global" && selectedLayer.panel === "spawns" && (
            <SpawnsPanel
              spawn={previewSpawn}
              placementActive={spawnPlacementActive}
              previewActive={previewActive}
              onPlacementActiveChange={handleSpawnPlacementActiveChange}
              onPreview={togglePreviewFromSpawn}
              onReset={resetPreviewSpawn}
            />
          )}
        </div>
        <div className="p-4 border-t border-zinc-700 space-y-2">
          <input
            value={mapName}
            onChange={(e) => {
              markDirty();
              setMapName(e.target.value);
            }}
            placeholder="Map name"
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handlePublishRuntimeMap}
            disabled={publishStatus === "publishing"}
            className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-sm transition-colors"
          >
            {publishStatus === "publishing"
              ? "Publishing..."
              : publishStatus === "published"
                ? "Published"
                : publishStatus === "invalid"
                  ? "Invalid Map"
                  : publishStatus === "error"
                    ? "Publish Failed"
                    : "Publish Map"}
          </button>
          <button
            onClick={() =>
              exportMap(configRef.current, railsRef.current, previewSpawnRef.current, mapName)
            }
            className="w-full px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs transition-colors"
          >
            Download Runtime Map
          </button>
          <button
            onClick={() =>
              exportConfig(configRef.current, railsRef.current, previewSpawnRef.current)
            }
            className="w-full px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs transition-colors"
          >
            Export Editor Config
          </button>
        </div>
      </aside>
    </div>
  );
}

function exportConfig(config: EditorConfig, rails: RailState[], previewSpawn: PreviewSpawnState) {
  const payload = {
    ...config,
    rails: {
      version: 1,
      rails,
    },
    previewSpawn,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "slime-surfers-editor-config.json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportMap(
  config: EditorConfig,
  rails: RailState[],
  previewSpawn: PreviewSpawnState,
  mapName: string,
) {
  const map = editorStateToRuntimeMap(config, rails, previewSpawn, mapName || "Untitled Map");
  const result = validateRuntimeMapData(map);
  if (!result.valid) {
    alert(`Export failed:\n${result.errors.map((e) => `${e.field}: ${e.message}`).join("\n")}`);
    return;
  }
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${map.mapId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
