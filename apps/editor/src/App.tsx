import { useCallback, useEffect, useRef, useState } from "react";
import { validateRuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import { PerformancePanel } from "./panels/PerformancePanel.tsx";
import { PlanetPanel } from "./panels/PlanetPanel.tsx";
import { PropsPanel } from "./panels/PropsPanel.tsx";
import { ShadersPanel } from "./panels/ShadersPanel.tsx";
import { SpawnsPanel } from "./panels/SpawnsPanel.tsx";
import { TerrainPanel } from "./panels/TerrainPanel.tsx";
import { TracksPanel } from "./panels/TracksPanel.tsx";
import { PlanetPreview } from "./preview/PlanetPreview.tsx";
import type { EditorScene } from "./preview/EditorScene.ts";
import {
  createDefaultTrackState,
  type TrackState,
  type TrackToolState,
} from "./tools/tracks/TrackTypes.ts";
import type { TerrainStampState } from "./tools/terrain/TerrainStampTypes.ts";
import {
  defaultEditorConfig,
  defaultEditorPlanet,
  GEOMETRY_TERRAIN_KEYS,
  type BrushState,
  type EditorConfig,
  type EditorPlanet,
  type EditorSculptState,
  type PerformanceStats,
  type PreviewSpawnState,
  type PropBrushState,
} from "./types.ts";
import { editorStateToRuntimeMap } from "./export.ts";

type LayerSelection =
  | { kind: "global"; panel: "cel" | "spawns" }
  | {
      kind: "planet";
      planetId: string;
      panel: "planet" | "terrain" | "props" | "tracks" | "atmosphere" | "lighting";
    };

const REBUILD_DELAY_MS = 600;
const LOCAL_SAVE_KEY = "slime-surfers-editor-save";

interface EditorSaveState {
  version: 1;
  savedAt: string;
  config: EditorConfig;
  tracks: {
    version: 1;
    tracks: TrackState[];
  };
  activeTrackId: string;
  previewSpawn?: PreviewSpawnState;
  mapName?: string;
}

interface InitialEditorState {
  config: EditorConfig;
  tracks: TrackState[];
  activeTrackId: string;
  previewSpawn: PreviewSpawnState;
  mapName: string;
}

export function App() {
  const initialState = useRef<InitialEditorState>(createInitialEditorState()).current;
  const [config, setConfig] = useState<EditorConfig>(initialState.config);
  const [tracks, setTracks] = useState<TrackState[]>(initialState.tracks);
  const [activeTrackId, setActiveTrackId] = useState(initialState.activeTrackId);
  const [previewSpawn, setPreviewSpawn] = useState<PreviewSpawnState>(initialState.previewSpawn);
  const [mapName, setMapName] = useState(initialState.mapName);
  const [spawnPlacementActive, setSpawnPlacementActive] = useState(false);
  const [selectedTrackPointId, setSelectedTrackPointId] = useState<string | null>(null);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "cleared" | "error">("idle");
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
  const tracksRef = useRef<TrackState[]>(tracks);
  const activeTrackIdRef = useRef(activeTrackId);
  const previewSpawnRef = useRef<PreviewSpawnState>(previewSpawn);
  const selectedTrackPointIdRef = useRef<string | null>(selectedTrackPointId);
  const previewActiveRef = useRef(false);
  const activePlanetIdRef = useRef(activePlanetId);
  const sceneRef = useRef<EditorScene | null>(null);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScene = useCallback((scene: EditorScene) => {
    sceneRef.current = scene;
    scene.setTracks(tracksRef.current);
    scene.setPreviewSpawn(previewSpawnRef.current);
    scene.setPreviewActive(previewActiveRef.current);
    const activeTrack = tracksRef.current.find((track) => track.id === activeTrackIdRef.current);
    if (activeTrack) {
      scene.setTrackToolState({
        mode: null,
        track: activeTrack,
        selectedPointId: selectedTrackPointIdRef.current,
      });
    }
  }, []);

  const handleBrushChange = useCallback((state: BrushState | null) => {
    sceneRef.current?.setBrushState(state);
  }, []);

  const handleTerrainStampChange = useCallback((state: TerrainStampState | null) => {
    sceneRef.current?.setTerrainStampState(state);
  }, []);

  const handlePropBrushChange = useCallback((state: PropBrushState | null) => {
    sceneRef.current?.setPropBrushState(state);
  }, []);

  const handleTrackChange = useCallback((nextTrack: TrackState) => {
    setSaveStatus("idle");
    const nextTracks = tracksRef.current.map((track) =>
      track.id === nextTrack.id ? nextTrack : track,
    );
    tracksRef.current = nextTracks;
    sceneRef.current?.setTracks(nextTracks);
    setTracks(nextTracks);
  }, []);

  const handleTrackToolChange = useCallback((state: TrackToolState) => {
    sceneRef.current?.setTrackToolState(state);
  }, []);

  const handleTrackPointSelectionChange = useCallback((pointId: string | null) => {
    selectedTrackPointIdRef.current = pointId;
    setSelectedTrackPointId(pointId);
  }, []);

  const handleSculptChange = useCallback((planetId: string, sculpt: EditorSculptState) => {
    setSaveStatus("idle");
    const next = {
      ...configRef.current,
      planets: configRef.current.planets.map((planet) =>
        planet.id === planetId ? { ...planet, sculpt } : planet,
      ),
    };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }, []);

  const handlePreviewSpawnChange = useCallback((spawn: PreviewSpawnState) => {
    setSaveStatus("idle");
    previewSpawnRef.current = spawn;
    setPreviewSpawn(spawn);
  }, []);

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

  const ensureActiveTrackForPlanet = useCallback((planetId: string) => {
    let nextTracks = tracksRef.current;
    let activeTrack = nextTracks.find((track) => track.planetId === planetId);
    if (!activeTrack) {
      activeTrack = createDefaultTrackState(undefined, planetId);
      nextTracks = [...nextTracks, activeTrack];
      tracksRef.current = nextTracks;
      setTracks(nextTracks);
      sceneRef.current?.setTracks(nextTracks);
      setSaveStatus("idle");
    }

    if (activeTrackIdRef.current !== activeTrack.id) {
      activeTrackIdRef.current = activeTrack.id;
      selectedTrackPointIdRef.current = null;
      setActiveTrackId(activeTrack.id);
      setSelectedTrackPointId(null);
      sceneRef.current?.setTrackToolState({
        mode: null,
        track: activeTrack,
        selectedPointId: null,
      });
    }
  }, []);

  const clearTransientTools = useCallback((nextLayer: LayerSelection) => {
    if (nextLayer.kind !== "planet" || nextLayer.panel !== "terrain") {
      sceneRef.current?.setBrushState(null);
      sceneRef.current?.setTerrainStampState(null);
    }
    if (nextLayer.kind !== "planet" || nextLayer.panel !== "props") {
      sceneRef.current?.setPropBrushState(null);
    }
    if (nextLayer.kind !== "global" || nextLayer.panel !== "spawns") {
      setSpawnPlacementActive(false);
      sceneRef.current?.setSpawnPlacementActive(false);
    }
    if (nextLayer.kind !== "planet" || nextLayer.panel !== "tracks") {
      const activeTrack = tracksRef.current.find((track) => track.id === activeTrackIdRef.current);
      if (activeTrack) {
        sceneRef.current?.setTrackToolState({
          mode: null,
          track: activeTrack,
          selectedPointId: selectedTrackPointIdRef.current,
        });
      }
    }
  }, []);

  const setActiveTrack = useCallback((trackId: string) => {
    setSaveStatus("idle");
    activeTrackIdRef.current = trackId;
    selectedTrackPointIdRef.current = null;
    setActiveTrackId(trackId);
    setSelectedTrackPointId(null);
    const activeTrack = tracksRef.current.find((track) => track.id === trackId);
    if (activeTrack) {
      sceneRef.current?.setTrackToolState({
        mode: null,
        track: activeTrack,
        selectedPointId: null,
      });
    }
  }, []);

  const handleTracksChange = useCallback(
    (nextTracks: TrackState[], nextActiveTrackId: string, nextSelectedPointId: string | null) => {
      setSaveStatus("idle");
      tracksRef.current = nextTracks;
      activeTrackIdRef.current = nextActiveTrackId;
      selectedTrackPointIdRef.current = nextSelectedPointId;
      sceneRef.current?.setTracks(nextTracks);
      setTracks(nextTracks);
      setActiveTrackId(nextActiveTrackId);
      setSelectedTrackPointId(nextSelectedPointId);
    },
    [],
  );

  const scheduleRebuild = useCallback(() => {
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(() => {
      sceneRef.current?.rebuildPlanet(configRef.current);
    }, REBUILD_DELAY_MS);
  }, []);

  const handleActivePlanetChange = useCallback(
    (id: string) => {
      activePlanetIdRef.current = id;
      setActivePlanetId(id);
      ensureActiveTrackForPlanet(id);
      const planet = configRef.current.planets.find((p) => p.id === id);
      if (planet) sceneRef.current?.setActivePlanet(id, planet.center);
    },
    [ensureActiveTrackForPlanet],
  );

  const selectLayer = useCallback(
    (nextLayer: LayerSelection) => {
      clearTransientTools(nextLayer);
      if (nextLayer.kind === "planet") {
        handleActivePlanetChange(nextLayer.planetId);
        if (nextLayer.panel === "tracks") ensureActiveTrackForPlanet(nextLayer.planetId);
      }
      setSelectedLayer(nextLayer);
    },
    [clearTransientTools, ensureActiveTrackForPlanet, handleActivePlanetChange],
  );

  const handlePreviewPlanetSelected = useCallback(
    (planetId: string) => {
      const panel = selectedLayer.kind === "planet" ? selectedLayer.panel : "planet";
      selectLayer({ kind: "planet", planetId, panel });
    },
    [selectLayer, selectedLayer],
  );

  const addPlanet = useCallback(() => {
    setSaveStatus("idle");
    const planets = configRef.current.planets;
    const id = nextPlanetId(planets);
    const centerOffset = 400 * planets.length;
    const nextPlanet = defaultEditorPlanet(id, { x: centerOffset, y: 0, z: 0 });
    const nextConfig = { ...configRef.current, planets: [...planets, nextPlanet] };
    configRef.current = nextConfig;
    setConfig(nextConfig);
    sceneRef.current?.updateUniforms(nextConfig);
    handleActivePlanetChange(id);
    setSelectedLayer({ kind: "planet", planetId: id, panel: "planet" });
  }, [handleActivePlanetChange]);

  function handlePlanetsChange(planets: EditorPlanet[]) {
    setSaveStatus("idle");
    const prev = configRef.current;
    const next = { ...prev, planets };
    configRef.current = next;

    if (!planets.find((p) => p.id === activePlanetIdRef.current)) {
      const firstId = planets[0]?.id ?? "";
      activePlanetIdRef.current = firstId;
      setActivePlanetId(firstId);
      setSelectedLayer({ kind: "planet", planetId: firstId, panel: "planet" });
    }

    const planetIds = new Set(planets.map((planet) => planet.id));
    const nextTracks = tracksRef.current.filter((track) => planetIds.has(track.planetId));
    if (nextTracks.length !== tracksRef.current.length) {
      tracksRef.current = nextTracks;
      setTracks(nextTracks);
      sceneRef.current?.setTracks(nextTracks);
    }

    setConfig(next);
    sceneRef.current?.updateUniforms(next);

    const activeId = activePlanetIdRef.current;
    const activeRadiusChanged =
      planets.find((p) => p.id === activeId)?.radius !==
      prev.planets.find((p) => p.id === activeId)?.radius;
    if (activeRadiusChanged) {
      sceneRef.current?.rebuildPlanet(next);
      sceneRef.current?.rebuildWater(next);
    }
  }

  function handleTerrainChange(terrain: EditorPlanet["terrain"]) {
    setSaveStatus("idle");
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
    if (needsRebuild) scheduleRebuild();
  }

  function handleColorsChange(colors: EditorPlanet["colors"]) {
    setSaveStatus("idle");
    const activeId = activePlanetIdRef.current;
    const planets = configRef.current.planets.map((p) =>
      p.id === activeId ? { ...p, colors } : p,
    );
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handlePlanetChange(planet: EditorPlanet) {
    setSaveStatus("idle");
    const activeId = activePlanetIdRef.current;
    const planets = configRef.current.planets.map((p) => (p.id === activeId ? planet : p));
    const next = { ...configRef.current, planets };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handleShadersChange(shaders: EditorConfig["shaders"]) {
    setSaveStatus("idle");
    const next = { ...configRef.current, shaders };
    configRef.current = next;
    setConfig(next);
    sceneRef.current?.updateUniforms(next);
  }

  function handleSaveLocal() {
    const saved = saveEditorState(
      configRef.current,
      tracksRef.current,
      activeTrackIdRef.current,
      previewSpawnRef.current,
      mapName,
    );
    setSaveStatus(saved ? "saved" : "error");
  }

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
          initialTracks={tracks}
          initialPreviewSpawn={previewSpawn}
          onScene={handleScene}
          onTrackChange={handleTrackChange}
          onTrackPointSelectionChange={handleTrackPointSelectionChange}
          onSculptChange={handleSculptChange}
          onPreviewSpawnChange={handlePreviewSpawnChange}
          onPerformanceStats={setPerformanceStats}
          onPlanetSelected={handlePreviewPlanetSelected}
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
            title="Save to this browser"
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
          {selectedLayer.kind === "planet" && selectedLayer.panel === "tracks" && (
            <TracksPanel
              tracks={tracks}
              planetId={selectedLayer.planetId}
              activeTrackId={activeTrackId}
              selectedPointId={selectedTrackPointId}
              onActiveTrackChange={setActiveTrack}
              onTracksChange={handleTracksChange}
              onTrackChange={handleTrackChange}
              onTrackToolChange={handleTrackToolChange}
              onPointSelectionChange={handleTrackPointSelectionChange}
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
            onChange={(e) => setMapName(e.target.value)}
            placeholder="Map name"
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() =>
              exportMap(configRef.current, tracksRef.current, previewSpawnRef.current, mapName)
            }
            className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-sm transition-colors"
          >
            Export Map
          </button>
          <button
            onClick={() =>
              exportConfig(configRef.current, tracksRef.current, previewSpawnRef.current)
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

function exportConfig(config: EditorConfig, tracks: TrackState[], previewSpawn: PreviewSpawnState) {
  const payload = {
    ...config,
    tracks: {
      version: 1,
      tracks,
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
  tracks: TrackState[],
  previewSpawn: PreviewSpawnState,
  mapName: string,
) {
  const map = editorStateToRuntimeMap(config, tracks, previewSpawn, mapName || "Untitled Map");
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

function createInitialEditorState(): InitialEditorState {
  const saved = loadEditorState();
  if (saved) {
    return {
      config: saved.config,
      tracks: saved.tracks.tracks,
      activeTrackId: saved.activeTrackId,
      previewSpawn: saved.previewSpawn ?? {
        planetId: saved.config.planets[0]?.id,
        normal: [0, 1, 0],
      },
      mapName: saved.mapName ?? "My Map",
    };
  }

  const track = createDefaultTrackState();
  return {
    config: defaultEditorConfig(),
    tracks: [track],
    activeTrackId: track.id,
    previewSpawn: { planetId: "planet-0", normal: [0, 1, 0] },
    mapName: "My Map",
  };
}

function createEditorSaveState(
  config: EditorConfig,
  tracks: TrackState[],
  activeTrackId: string,
  previewSpawn: PreviewSpawnState,
  mapName: string,
): EditorSaveState {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    config,
    tracks: {
      version: 1,
      tracks,
    },
    activeTrackId,
    previewSpawn,
    mapName,
  };
}

function saveEditorState(
  config: EditorConfig,
  tracks: TrackState[],
  activeTrackId: string,
  previewSpawn: PreviewSpawnState,
  mapName: string,
): boolean {
  try {
    localStorage.setItem(
      LOCAL_SAVE_KEY,
      JSON.stringify(createEditorSaveState(config, tracks, activeTrackId, previewSpawn, mapName)),
    );
    return true;
  } catch {
    return false;
  }
}

function clearEditorState(): boolean {
  try {
    localStorage.removeItem(LOCAL_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

function loadEditorState(): EditorSaveState | null {
  const raw = localStorage.getItem(LOCAL_SAVE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<EditorSaveState>;
    if (parsed.version !== 1) return null;
    if (!parsed.config || !parsed.tracks || parsed.tracks.version !== 1) return null;
    if (!Array.isArray(parsed.tracks.tracks) || parsed.tracks.tracks.length === 0) return null;

    const cfg = parsed.config as unknown as Record<string, unknown>;
    if (!Array.isArray(cfg.planets)) {
      const legacyPlanet = (
        typeof cfg.planet === "object" && cfg.planet !== null ? cfg.planet : {}
      ) as Record<string, unknown>;
      const base = defaultEditorPlanet("planet-0");
      cfg.planets = [{ ...base, ...legacyPlanet, id: "planet-0" }];
      delete cfg.planet;
    }
    parsed.config = normalizeEditorConfig(parsed.config as EditorConfig);

    const planetIds = new Set(parsed.config.planets.map((planet) => planet.id));
    const fallbackPlanetId = parsed.config.planets[0]?.id ?? "planet-0";
    const migratedTracks = parsed.tracks.tracks.map((track) => ({
      ...track,
      planetId:
        typeof track.planetId === "string" && planetIds.has(track.planetId)
          ? track.planetId
          : fallbackPlanetId,
    }));

    const activeTrackId =
      typeof parsed.activeTrackId === "string" &&
      migratedTracks.some((track) => track.id === parsed.activeTrackId)
        ? parsed.activeTrackId
        : migratedTracks[0].id;

    return {
      version: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      config: parsed.config,
      tracks: {
        version: 1,
        tracks: migratedTracks,
      },
      activeTrackId,
      previewSpawn: parsed.previewSpawn,
      mapName: typeof parsed.mapName === "string" ? parsed.mapName : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeEditorConfig(config: EditorConfig): EditorConfig {
  const baseConfig = defaultEditorConfig();
  return {
    ...config,
    shaders: {
      ...baseConfig.shaders,
      ...config.shaders,
      cel: {
        ...baseConfig.shaders.cel,
        ...config.shaders?.cel,
      },
    },
    planets: config.planets.map((planet, index) => {
      const id = typeof planet.id === "string" ? planet.id : `planet-${index}`;
      const base = defaultEditorPlanet(id);
      const savedPuffs = planet.atmosphere?.clouds?.puffs;
      const puffsWereOldDefaults =
        (savedPuffs?.density === 0.38 &&
          savedPuffs.opacity === 0.58 &&
          savedPuffs.thickness === 6) ||
        (savedPuffs?.density === 0.68 && savedPuffs.height === 10 && savedPuffs.size === 6);
      return {
        ...base,
        ...planet,
        id,
        terrain: { ...base.terrain, ...planet.terrain },
        colors: { ...base.colors, ...planet.colors },
        atmosphere: {
          ...base.atmosphere,
          ...planet.atmosphere,
          blendMode: planet.atmosphere?.blendMode ?? base.atmosphere.blendMode,
          clouds: {
            ...base.atmosphere.clouds,
            ...planet.atmosphere?.clouds,
            blendMode: planet.atmosphere?.clouds?.blendMode ?? base.atmosphere.clouds.blendMode,
            puffs: {
              ...base.atmosphere.clouds.puffs,
              ...planet.atmosphere?.clouds?.puffs,
              ...(puffsWereOldDefaults ? base.atmosphere.clouds.puffs : {}),
              blendMode:
                planet.atmosphere?.clouds?.puffs?.blendMode ??
                base.atmosphere.clouds.puffs.blendMode,
            },
          },
        },
        lighting: { ...base.lighting, ...planet.lighting },
        props: { ...base.props, ...planet.props },
        sculpt: normalizeSculptState(
          planet.sculpt,
          planet.terrain?.icosahedronDetail ?? base.sculpt.detail,
        ),
      };
    }),
  };
}

function normalizeSculptState(
  sculpt: EditorSculptState | undefined,
  detail: number,
): EditorSculptState {
  if (!sculpt || !Array.isArray(sculpt.samples)) {
    return { detail, vertexCount: 0, samples: [] };
  }

  return {
    detail: Number.isFinite(sculpt.detail) ? sculpt.detail : detail,
    vertexCount: Number.isFinite(sculpt.vertexCount) ? sculpt.vertexCount : 0,
    samples: sculpt.samples
      .filter((sample) => Number.isInteger(sample.index) && Number.isFinite(sample.value))
      .map((sample) => ({ index: sample.index, value: sample.value })),
  };
}

function nextPlanetId(planets: EditorPlanet[]): string {
  const ids = new Set(planets.map((p) => p.id));
  for (let i = 0; ; i++) {
    const candidate = `planet-${i}`;
    if (!ids.has(candidate)) return candidate;
  }
}

function getLayerTitle(layer: LayerSelection): string {
  if (layer.kind === "global") {
    return layer.panel === "cel" ? "Cel Shading" : "Spawns";
  }
  if (layer.panel === "planet") return "Planet";
  if (layer.panel === "atmosphere") return "Atmosphere";
  return layer.panel[0].toUpperCase() + layer.panel.slice(1);
}

function isLayerSelected(current: LayerSelection, target: LayerSelection): boolean {
  if (current.kind !== target.kind) return false;
  if (current.kind === "global" && target.kind === "global") return current.panel === target.panel;
  if (current.kind === "planet" && target.kind === "planet") {
    return current.planetId === target.planetId && current.panel === target.panel;
  }
  return false;
}

function LayerNavigator({
  config,
  selectedLayer,
  activePlanetId,
  onSelectLayer,
  onAddPlanet,
}: {
  config: EditorConfig;
  selectedLayer: LayerSelection;
  activePlanetId: string;
  onSelectLayer: (layer: LayerSelection) => void;
  onAddPlanet: () => void;
}) {
  const [expandedPlanets, setExpandedPlanets] = useState<Set<string>>(
    () => new Set([config.planets[0]?.id ?? "planet-0"]),
  );
  const [expandedAtmospheres, setExpandedAtmospheres] = useState<Set<string>>(
    () => new Set([config.planets[0]?.id ?? "planet-0"]),
  );

  useEffect(() => {
    if (selectedLayer.kind !== "planet") return;
    setExpandedPlanets((current) => {
      if (current.has(selectedLayer.planetId)) return current;
      return new Set(current).add(selectedLayer.planetId);
    });
    if (selectedLayer.panel === "atmosphere" || selectedLayer.panel === "lighting") {
      setExpandedAtmospheres((current) => {
        if (current.has(selectedLayer.planetId)) return current;
        return new Set(current).add(selectedLayer.planetId);
      });
    }
  }, [selectedLayer]);

  function togglePlanet(planetId: string) {
    setExpandedPlanets((current) => toggleSetValue(current, planetId));
  }

  function toggleAtmosphere(planetId: string) {
    setExpandedAtmospheres((current) => toggleSetValue(current, planetId));
  }

  return (
    <nav className="flex-1 p-2 overflow-y-auto">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Map
      </div>
      <div className="space-y-0.5">
        <LayerButton
          label="Solar System"
          active={false}
          depth={0}
          onClick={() => onSelectLayer({ kind: "global", panel: "cel" })}
        />
        <LayerButton
          label="Cel Shading"
          active={isLayerSelected(selectedLayer, { kind: "global", panel: "cel" })}
          depth={1}
          onClick={() => onSelectLayer({ kind: "global", panel: "cel" })}
        />
        <LayerButton
          label="Spawns"
          active={isLayerSelected(selectedLayer, { kind: "global", panel: "spawns" })}
          depth={1}
          onClick={() => onSelectLayer({ kind: "global", panel: "spawns" })}
        />
      </div>

      <div className="mt-3 space-y-2">
        {config.planets.map((planet, index) => (
          <div key={planet.id} className="space-y-0.5">
            <LayerGroupButton
              label={`${planet.id}${index === 0 ? " (default)" : ""}`}
              active={
                expandedPlanets.has(planet.id) ||
                isLayerSelected(selectedLayer, {
                  kind: "planet",
                  planetId: planet.id,
                  panel: "planet",
                })
              }
              depth={0}
              accent={planet.id === activePlanetId}
              open={expandedPlanets.has(planet.id)}
              onToggle={() => togglePlanet(planet.id)}
            />
            {expandedPlanets.has(planet.id) && (
              <>
                <LayerButton
                  label="Terrain"
                  active={isLayerSelected(selectedLayer, {
                    kind: "planet",
                    planetId: planet.id,
                    panel: "terrain",
                  })}
                  depth={1}
                  onClick={() =>
                    onSelectLayer({ kind: "planet", planetId: planet.id, panel: "terrain" })
                  }
                />
                <LayerButton
                  label="Props"
                  active={isLayerSelected(selectedLayer, {
                    kind: "planet",
                    planetId: planet.id,
                    panel: "props",
                  })}
                  depth={1}
                  onClick={() =>
                    onSelectLayer({ kind: "planet", planetId: planet.id, panel: "props" })
                  }
                />
                <LayerButton
                  label="Tracks"
                  active={isLayerSelected(selectedLayer, {
                    kind: "planet",
                    planetId: planet.id,
                    panel: "tracks",
                  })}
                  depth={1}
                  onClick={() =>
                    onSelectLayer({ kind: "planet", planetId: planet.id, panel: "tracks" })
                  }
                />
                <LayerGroupButton
                  label="Atmosphere"
                  active={
                    expandedAtmospheres.has(planet.id) ||
                    isLayerSelected(selectedLayer, {
                      kind: "planet",
                      planetId: planet.id,
                      panel: "atmosphere",
                    })
                  }
                  depth={1}
                  open={expandedAtmospheres.has(planet.id)}
                  onToggle={() => toggleAtmosphere(planet.id)}
                />
                {expandedAtmospheres.has(planet.id) && (
                  <>
                    <LayerButton
                      label="Atmosphere Shader"
                      active={isLayerSelected(selectedLayer, {
                        kind: "planet",
                        planetId: planet.id,
                        panel: "atmosphere",
                      })}
                      depth={2}
                      onClick={() =>
                        onSelectLayer({
                          kind: "planet",
                          planetId: planet.id,
                          panel: "atmosphere",
                        })
                      }
                    />
                    <LayerButton
                      label="Lighting"
                      active={isLayerSelected(selectedLayer, {
                        kind: "planet",
                        planetId: planet.id,
                        panel: "lighting",
                      })}
                      depth={2}
                      onClick={() =>
                        onSelectLayer({ kind: "planet", planetId: planet.id, panel: "lighting" })
                      }
                    />
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onAddPlanet}
        className="mt-3 w-full px-3 py-2 rounded border border-zinc-700 bg-zinc-800 text-left text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
      >
        + Planet
      </button>
    </nav>
  );
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function LayerGroupButton({
  label,
  active,
  depth,
  open,
  accent = false,
  onToggle,
}: {
  label: string;
  active: boolean;
  depth: 0 | 1 | 2;
  open: boolean;
  accent?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center rounded transition-colors ${
        active
          ? "bg-cyan-900/45 text-cyan-200"
          : accent
            ? "text-cyan-400 hover:bg-zinc-800"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      }`}
      title={open ? "Collapse" : "Expand"}
    >
      <span
        className={`py-1.5 text-zinc-500 transition-colors ${
          depth === 0 ? "pl-2" : depth === 1 ? "pl-5" : "pl-8"
        }`}
      >
        <span
          className={`inline-block transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </span>
      <span className="min-w-0 flex-1 py-1.5 pr-2 text-left text-xs">{label}</span>
    </button>
  );
}

function LayerButton({
  label,
  active,
  depth,
  accent = false,
  onClick,
}: {
  label: string;
  active: boolean;
  depth: 0 | 1 | 2;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left py-1.5 rounded text-xs transition-colors ${
        depth === 0 ? "pl-2 pr-2" : depth === 1 ? "pl-5 pr-2" : "pl-8 pr-2"
      } ${
        active
          ? "bg-cyan-900/45 text-cyan-200"
          : accent
            ? "text-cyan-400 hover:bg-zinc-800"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
